/**
 * PalFish CRM Token Sync — background service worker (Manifest V3)
 *
 * Dùng chrome.cookies API thay vì webRequest header (tin cậy hơn trong MV3).
 * Kích hoạt khi user load/chuyển sang tab sea.pri.ibanyu.com.
 */

// Supabase — ghi token thẳng vào DB (không qua Render, luôn hoạt động)
const SUPABASE_URL = "https://jozcvbbypwvzaefteoxn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvemN2YmJ5cHd2emFlZnRlb3huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjM4NzEsImV4cCI6MjA5NDgzOTg3MX0.DlXwhPzx4hQCyzJOOtt65WBFT6WtSTmfbHRUfjjNLHU";

// Fallback: backend local/Render
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
  // Ưu tiên 1: ghi thẳng vào Supabase (luôn hoạt động, không cần Render)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        id: 1,
        cookie_value: cookieStr,
        updated_at: new Date().toISOString(),
      }),
    });
    if (res.ok || res.status === 201) {
      _syncCount++;
      _saveState("ok", `Đã đồng bộ lúc ${new Date().toLocaleTimeString("vi-VN")}`);
      console.log("[PalFish Sync] token → Supabase OK");
      // Cũng gửi về backend local nếu đang chạy (không block)
      fetch(BACKEND_URLS[0], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie_str: cookieStr }),
      }).catch(() => {});
      return;
    }
    console.warn("[PalFish Sync] Supabase status:", res.status, await res.text());
  } catch (err) {
    console.warn("[PalFish Sync] Supabase push failed:", err.message);
  }

  // Fallback: thử backend URLs
  for (const url of BACKEND_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie_str: cookieStr }),
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
