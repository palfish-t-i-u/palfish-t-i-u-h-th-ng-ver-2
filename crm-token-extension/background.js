/**
 * PalFish CRM Token Sync — background service worker (Manifest V3)
 *
 * Thu thập auth theo 2 cách:
 *  1. chrome.cookies.getAll({ url }) — đủ cookie gửi kèm request
 *  2. webRequest — bắt header + body thật khi user export trên CRM
 */

const CRM_ENCRYPT_KEY = "pZ8wV+X5b23d9W/X5fV8l6M+qT+5hZ7kK9XwU4Z7m2A=";
const SUPABASE_URL = "https://jozcvbbypwvzaefteoxn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvemN2YmJ5cHd2emFlZnRlb3huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjM4NzEsImV4cCI6MjA5NDgzOTg3MX0.DlXwhPzx4hQCyzJOOtt65WBFT6WtSTmfbHRUfjjNLHU";

const BACKEND_URLS = [
  "http://localhost:8000/system/update-crm-token",
  "https://palfish-gmv-api.onrender.com/system/update-crm-token",
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

function _base64ToUint8Array(base64) {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

function _arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function encryptToken(text) {
  const keyBuffer = _base64ToUint8Array(CRM_ENCRYPT_KEY);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedText
  );
  return `${_arrayBufferToBase64(iv)}:${_arrayBufferToBase64(ciphertext)}`;
}

async function _pushToken(bundle) {
  const payload = await encryptToken(JSON.stringify(bundle));

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        id: 1,
        cookie_value: payload,
        updated_at: new Date().toISOString(),
      }),
    });
    if (res.ok || res.status === 201) {
      _syncCount++;
      const hasPayload = bundle.download_payload ? " + dept prefs" : "";
      _saveState("ok", `Đã đồng bộ lúc ${new Date().toLocaleTimeString("vi-VN")}${hasPayload}`);
      console.log("[PalFish Sync] auth bundle → Supabase OK", bundle);
      fetch(BACKEND_URLS[0], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie_str: payload }),
      }).catch(() => {});
      return;
    }
    console.warn("[PalFish Sync] Supabase status:", res.status, await res.text());
  } catch (err) {
    console.warn("[PalFish Sync] Supabase push failed:", err.message);
  }

  for (const url of BACKEND_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie_str: payload }),
      });
      if (res.ok) {
        _syncCount++;
        _saveState("ok", `Đã đồng bộ (backend) lúc ${new Date().toLocaleTimeString("vi-VN")}`);
        return;
      }
    } catch (_) {}
  }
  _saveState("error", "Lỗi: không gửi được token về Supabase hay backend");
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
console.log("[PalFish Sync] service worker started (cookies + webRequest capture)");
