/**
 * PalFish CRM Token Sync — background service worker (Manifest V3)
 *
 * Thu thập auth theo 2 cách:
 *  1. chrome.cookies.getAll({ url }) — đủ cookie gửi kèm request
 *  2. webRequest — bắt header + body thật khi user export trên CRM
 */

const BACKEND_URLS = [
  "http://localhost:8000/system/update-crm-token/extension",
  "https://palfish-gmv-api.onrender.com/system/update-crm-token/extension",
  "https://palfish-gmv-api-sandbox.onrender.com/system/update-crm-token/extension",
];

const GATEWAY_INGEST_URLS = [
  "http://localhost:8000/api/v1/gateway-sync/ingest",
  "https://palfish-gmv-api.onrender.com/api/v1/gateway-sync/ingest",
  "https://palfish-gmv-api-sandbox.onrender.com/api/v1/gateway-sync/ingest",
];

const CRM_URL = "https://sea.pri.ibanyu.com/";
const CRM_HOST = "sea.pri.ibanyu.com";
const DEBOUNCE_MS = 15_000;

const CAPTURE_HEADER_NAMES = new Set([
  "token", "authorization", "uid", "opuid", "opname", "h-account",
  "x-token", "x-uid", "x-request-id", "lang", "locale",
]);

let _lastBundleKey = "";
let _lastSentAt = 0;
let _syncCount = 0;
let _authBundle = { cookie: "", headers: {}, download_payload: null };

function _saveState(status, msg) {
  chrome.storage.local.set({ status, msg, lastSentAt: _lastSentAt, syncCount: _syncCount });
}

function _bundleKey(bundle) {
  return JSON.stringify({
    cookie: bundle.cookie?.slice(0, 80),
    headers: bundle.headers,
    payload: bundle.download_payload,
  });
}

function _storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

async function _getIngestToken() {
  const data = await _storageGet(["ingestToken"]);
  return String(data.ingestToken || "").trim();
}

async function _getGatewayIngestToken() {
  const data = await _storageGet(["gatewayIngestToken", "ingestToken"]);
  return String(data.gatewayIngestToken || data.ingestToken || "").trim();
}

async function _pushToken(bundle) {
  const payload = JSON.stringify(bundle);
  const ingestToken = await _getIngestToken();
  if (!ingestToken) {
    _saveState("error", "Chưa cấu hình Extension Secret trong popup.");
    return;
  }

  for (const url of BACKEND_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CRM-EXT-TOKEN": ingestToken,
        },
        body: JSON.stringify({ cookie_str: payload }),
      });
      if (res.ok) {
        _syncCount++;
        const hasPayload = bundle.download_payload ? " + dept prefs" : "";
        _saveState("ok", `Đã đồng bộ lúc ${new Date().toLocaleTimeString("vi-VN")}${hasPayload}`);
        return;
      }
      console.warn("[PalFish Sync] backend status:", res.status, await res.text());
    } catch (_) {}
  }
  _saveState("error", "Lỗi: không gửi được token về backend");
}

function _bytesFromBase64(base64) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function _pushGatewayFile({ source, kind, filename, contentBase64, contentType }) {
  const ingestToken = await _getGatewayIngestToken();
  if (!ingestToken) {
    return { ok: false, error: "Chua cau hinh gateway ingest token" };
  }
  if (!source || !kind || !contentBase64) {
    return { ok: false, error: "Thieu source/kind/file" };
  }

  const file = new File(
    [_bytesFromBase64(contentBase64)],
    filename || `${source}-${kind}.csv`,
    { type: contentType || "text/csv" }
  );
  const form = new FormData();
  form.append("file", file);

  for (const baseUrl of GATEWAY_INGEST_URLS) {
    const url = `${baseUrl}?source=${encodeURIComponent(source)}&kind=${encodeURIComponent(kind)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "X-GATEWAY-EXT-TOKEN": ingestToken },
        body: form,
      });
      if (res.ok) {
        return { ok: true, data: await res.json() };
      }
      console.warn("[PalFish Sync] gateway ingest status:", res.status, await res.text());
    } catch (e) {
      console.warn("[PalFish Sync] gateway ingest failed:", e);
    }
  }
  return { ok: false, error: "Khong gui duoc file gateway ve backend" };
}

async function _sendIfChanged() {
  const key = _bundleKey(_authBundle);
  const now = Date.now();
  if (!key) return;
  if (key === _lastBundleKey && now - _lastSentAt < DEBOUNCE_MS) return;

  _lastBundleKey = key;
  _lastSentAt = now;
  _saveState("idle", "Đang gửi token…");
  await _pushToken(_authBundle);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "gateway-ingest-file") return false;
  _pushGatewayFile(message.payload || {}).then(sendResponse);
  return true;
});

async function grabCookiesFromUrl() {
  let cookies = [];
  try {
    cookies = await chrome.cookies.getAll({ url: CRM_URL });
  } catch (e) {
    console.warn("[PalFish Sync] cookies.getAll failed:", e);
    return;
  }

  if (!cookies.length) {
    _saveState("idle", "Chưa có cookie — hãy đăng nhập CRM trước.");
    return;
  }

  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  if (!cookieStr.includes("token=") && !cookieStr.includes("id=")) {
    _saveState("idle", "Cookie chưa có token — thử đăng nhập lại.");
    return;
  }

  _authBundle.cookie = cookieStr;

  // Tự trích token từ cookie nếu CRM dùng header token
  const tokenMatch = cookieStr.match(/(?:^|;\s*)token=([^;]+)/);
  if (tokenMatch && !_authBundle.headers.token) {
    _authBundle.headers = { ..._authBundle.headers, token: tokenMatch[1] };
  }

  await _sendIfChanged();
}

function _mergeHeadersFromRequest(requestHeaders) {
  if (!requestHeaders?.length) return;
  const next = { ..._authBundle.headers };
  for (const h of requestHeaders) {
    const name = h.name?.toLowerCase();
    if (!name || name === "cookie") continue;
    if (CAPTURE_HEADER_NAMES.has(name)) {
      next[h.name] = h.value;
    }
  }
  _authBundle.headers = next;

  const cookieHeader = requestHeaders.find((h) => h.name.toLowerCase() === "cookie")?.value;
  if (cookieHeader) {
    _authBundle.cookie = cookieHeader;
  }
}

function _decodeRequestBody(requestBody) {
  if (!requestBody?.raw?.length) return null;
  try {
    const bytes = requestBody.raw[0].bytes;
    const text = new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(text);
  } catch (e) {
    console.warn("[PalFish Sync] decode body failed:", e);
    return null;
  }
}

// Bắt header thật từ mọi request opapi
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!details.url.includes("/opapi/")) return;
    _mergeHeadersFromRequest(details.requestHeaders);
    _sendIfChanged();
  },
  { urls: ["*://sea.pri.ibanyu.com/opapi/*"] },
  ["requestHeaders"]
);

// Bắt payload export khi user bấm tải trên CRM
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method !== "POST") return;
    if (!details.url.includes("/report/record/download")) return;
    const body = _decodeRequestBody(details.requestBody);
    if (body) {
      _authBundle.download_payload = body;
      console.log("[PalFish Sync] captured download payload:", body);
      _sendIfChanged();
    }
  },
  { urls: ["*://sea.pri.ibanyu.com/opapi/*/report/record/download*"] },
  ["requestBody"]
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.includes(CRM_HOST)) return;
  grabCookiesFromUrl();
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url?.includes(CRM_HOST)) return;
    grabCookiesFromUrl();
  } catch (_) {}
});

_saveState("idle", "Mở CRM → đăng nhập — extension tự lấy token (không cần Export)");
console.log("[PalFish Sync] service worker started (backend ingest mode)");
