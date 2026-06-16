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

// Payoo gửi JSON OrderList (không phải file) → endpoint riêng
const GATEWAY_ORDERS_URLS = [
  "http://localhost:8000/api/v1/gateway-sync/ingest-orders",
  "https://palfish-gmv-api.onrender.com/api/v1/gateway-sync/ingest-orders",
  "https://palfish-gmv-api-sandbox.onrender.com/api/v1/gateway-sync/ingest-orders",
];

// ── Cấu hình kéo data gateway ──
// Payoo: endpoint JSON đã soi thật (DevTools 16/6) — chắc chắn.
const PAYOO_ORDER_API = "https://portal.payoo.vn/api/ecom/order/";
const PAYOO_SHOP_ID = "8971"; // PALFISH
const PAYOO_PAGE_SIZE = 100;

// mPOS: export GET (reverse-engineer). ⚠️ start/end + withdrawGroup là param đã biết;
// các field khác (withdrawStatus/money/...) có thể cần bổ sung — kiểm tra với phiên đăng nhập thật.
const MPOS_EXPORT_BASE = "https://export.mpos.vn";
const MPOS_EXPORTS = [
  {
    kind: "detail",
    path: "/merchant/transfer/export-withdraw-transaction",
    filename: "mpos-detail.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    kind: "settlement",
    path: "/merchant/transfer/transfer-list/exportCSV",
    filename: "mpos-settlement.csv",
    contentType: "text/csv",
  },
];

const GATEWAY_SYNC_WINDOW_DAYS = 14; // cửa sổ trượt (mPOS/Payoo giới hạn tìm ≤31 ngày)
const GATEWAY_ALARM = "palfish-gateway-sync";

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

/* ─────────────────────────────────────────────────────────────────────────
 * ĐỒNG BỘ GATEWAY (mPOS / Payoo) — kéo giao dịch thẻ về backend
 *
 * Dùng phiên đăng nhập sẵn của kế toán (credentials:'include'). KHÔNG lưu mật khẩu.
 *  - Payoo: gọi JSON GET /api/ecom/order/ rồi lật trang → POST mảng OrderList.
 *  - mPOS : GET export.mpos.vn (file .xlsx/.csv) → POST bytes (multipart).
 *
 * ⚠️ Cần token gateway ở popup (storage `gatewayIngestToken`).
 * ⚠️ Params export mPOS reverse-engineer — cần kiểm tra với phiên đăng nhập thật.
 * ───────────────────────────────────────────────────────────────────────── */

function _gatewayWindow() {
  const to = new Date();
  const from = new Date(to.getTime() - GATEWAY_SYNC_WINDOW_DAYS * 24 * 3600 * 1000);
  return { from, to };
}

function _epochSec(d) {
  return Math.floor(d.getTime() / 1000);
}

function _ddmmyyyy(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

async function _fetchJsonCreds(url) {
  const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function _fetchBase64Creds(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function _pushGatewayOrders(orders, source, kind) {
  const ingestToken = await _getGatewayIngestToken();
  if (!ingestToken) return { ok: false, error: "Chưa cấu hình gateway ingest token" };
  for (const baseUrl of GATEWAY_ORDERS_URLS) {
    const url = `${baseUrl}?source=${encodeURIComponent(source)}&kind=${encodeURIComponent(kind)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-GATEWAY-EXT-TOKEN": ingestToken },
        body: JSON.stringify({ orders }),
      });
      if (res.ok) return { ok: true, data: await res.json() };
      console.warn("[PalFish Sync] payoo ingest status:", res.status, await res.text());
    } catch (e) {
      console.warn("[PalFish Sync] payoo ingest failed:", e);
    }
  }
  return { ok: false, error: "Không gửi được orders về backend" };
}

// Payoo: lật trang /api/ecom/order/ theo TotalItem, gom OrderList, đẩy JSON về backend.
async function syncPayoo() {
  const { from, to } = _gatewayWindow();
  const fromSec = _epochSec(from);
  const toSec = _epochSec(to);
  const orders = [];
  let pageNo = 0;
  let total = Infinity;
  while (pageNo * PAYOO_PAGE_SIZE < total) {
    const url =
      `${PAYOO_ORDER_API}?PageNo=${pageNo}&PageSize=${PAYOO_PAGE_SIZE}` +
      `&From=${fromSec}&To=${toSec}&ShopID=${PAYOO_SHOP_ID}&Query=${PAYOO_SHOP_ID}&isSearch=1`;
    const json = await _fetchJsonCreds(url);
    const data = (json && json.data) || {};
    const list = Array.isArray(data.OrderList) ? data.OrderList : [];
    orders.push(...list);
    total = Number(data.TotalItem || 0);
    if (!list.length) break;
    pageNo += 1;
    if (pageNo > 100) break; // chặn vòng lặp vô hạn
  }
  if (!orders.length) return { ok: true, pulled: 0, inserted: 0 };
  const result = await _pushGatewayOrders(orders, "payoo", "online");
  return { ok: result.ok, pulled: orders.length, inserted: result.data?.inserted || 0, error: result.error };
}

// mPOS: tải 2 file export (chi tiết + danh sách phiếu chi) rồi đẩy bytes về backend.
async function syncMpos() {
  const { from, to } = _gatewayWindow();
  const params = new URLSearchParams({
    formSession: "false",
    start: _ddmmyyyy(from),
    end: _ddmmyyyy(to),
    withdrawGroup: "NORMALY",
  });
  const results = [];
  for (const exp of MPOS_EXPORTS) {
    try {
      const url = `${MPOS_EXPORT_BASE}${exp.path}?${params.toString()}`;
      const contentBase64 = await _fetchBase64Creds(url);
      const r = await _pushGatewayFile({
        source: "mpos",
        kind: exp.kind,
        filename: exp.filename,
        contentBase64,
        contentType: exp.contentType,
      });
      results.push({ kind: exp.kind, ok: r.ok, inserted: r.data?.inserted || 0, error: r.error });
    } catch (e) {
      results.push({ kind: exp.kind, ok: false, error: String(e) });
    }
  }
  return results;
}

async function runGatewaySync(trigger = "alarm") {
  _saveState("idle", `Đang đồng bộ mPOS/Payoo… (${trigger})`);
  const summary = [];
  let pulled = 0;
  try {
    const payoo = await syncPayoo();
    pulled += payoo.inserted || 0;
    summary.push(payoo.ok ? `Payoo: ${payoo.pulled} GD` : `Payoo lỗi: ${payoo.error || "?"}`);
  } catch (e) {
    summary.push(`Payoo lỗi: ${e}`);
  }
  try {
    const mpos = await syncMpos();
    summary.push(`mPOS: ${mpos.map((r) => r.kind + (r.ok ? "✓" : "✗")).join(" ")}`);
  } catch (e) {
    summary.push(`mPOS lỗi: ${e}`);
  }
  _saveState("ok", `Đồng bộ ${new Date().toLocaleTimeString("vi-VN")} — ${summary.join(" · ")}`);
  return { pulled, summary };
}

// Tự đồng bộ định kỳ (cron NẰM TRONG extension, không phải server cron)
chrome.alarms.create(GATEWAY_ALARM, { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === GATEWAY_ALARM) runGatewaySync("alarm");
});

// Nút "Đồng bộ ngay" (popup hoặc app) gửi message này
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "gateway-sync-now") return false;
  runGatewaySync("manual").then(sendResponse);
  return true;
});
