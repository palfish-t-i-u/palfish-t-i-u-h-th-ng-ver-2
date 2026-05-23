/**
 * PalFish CRM Token Sync — background service worker (Manifest V3)
 *
 * Dùng chrome.cookies API thay vì webRequest header (tin cậy hơn trong MV3).
 * Kích hoạt khi user load/chuyển sang tab sea.pri.ibanyu.com.
 */

const BACKEND_URLS = [
  "http://localhost:8000/system/update-crm-token",
  "https://palfish-gmv-api.onrender.com/system/update-crm-token",
];
const CRM_HOST = "sea.pri.ibanyu.com";
const DEBOUNCE_MS = 30_000;

let _lastCookie = "";
let _lastSentAt = 0;
let _syncCount = 0;

function _saveState(status, msg) {
  chrome.storage.local.set({ status, msg, lastSentAt: _lastSentAt, syncCount: _syncCount });
}

async function _pushToken(cookieStr) {
  const errors = [];
  for (const url of BACKEND_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie_str: cookieStr }),
      });
      if (res.ok) {
        _syncCount++;
        _saveState("ok", `Đã đồng bộ lúc ${new Date().toLocaleTimeString("vi-VN")}`);
        console.log("[PalFish Sync] token pushed →", url);
        return;
      }
      errors.push(`${url}: HTTP ${res.status}`);
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }
  _saveState("error", `Lỗi backend: ${errors.join(" | ")}`);
  console.warn("[PalFish Sync] push failed:", errors);
}

async function grabAndSendCookies() {
  let cookies = [];
  try {
    cookies = await chrome.cookies.getAll({ domain: CRM_HOST });
  } catch (e) {
    console.warn("[PalFish Sync] cookies.getAll failed:", e);
    return;
  }

  if (!cookies.length) {
    _saveState("idle", "Chưa có cookie — hãy đăng nhập CRM trước.");
    return;
  }

  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const hasToken = cookieStr.includes("token=") || cookieStr.includes("id=");
  if (!hasToken) {
    _saveState("idle", "Cookie không có token — thử đăng nhập lại.");
    return;
  }

  const now = Date.now();
  // Debounce: bỏ qua nếu cùng cookie và chưa đủ 30s
  if (cookieStr === _lastCookie && now - _lastSentAt < DEBOUNCE_MS) return;

  _lastCookie = cookieStr;
  _lastSentAt = now;
  _saveState("idle", "Đang gửi token…");

  await _pushToken(cookieStr);
}

// Kích hoạt khi tab CRM load xong
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.includes(CRM_HOST)) return;
  grabAndSendCookies();
});

// Kích hoạt khi user chuyển sang tab CRM
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url?.includes(CRM_HOST)) return;
    grabAndSendCookies();
  } catch (_) {}
});

_saveState("idle", "Đang chờ — hãy mở tab CRM PalFish…");
console.log("[PalFish Sync] service worker started (cookies API mode)");
