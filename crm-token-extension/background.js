/**
 * PalFish CRM Token Sync — background service worker (Manifest V3)
 *
 * Luồng hoạt động:
 *  1. Lắng nghe mọi request tới sea.pri.ibanyu.com/api/*
 *  2. Trích xuất Cookie header (chứa token= và id=)
 *  3. Debounce 30 giây để tránh spam
 *  4. POST cookie_str về backend /system/update-crm-token
 */

const BACKEND_URLS = [
  "http://localhost:8000/system/update-crm-token",
  // Khi deploy production, thêm URL Render vào đây nếu cần
];
const DEBOUNCE_MS = 30_000; // 30 giây

let _lastCookie = "";
let _lastSentAt = 0;
let _syncCount = 0;
let _lastStatus = "idle"; // "idle" | "ok" | "error"

// Lưu trạng thái vào storage để popup đọc được
function _saveState(status, msg) {
  _lastStatus = status;
  chrome.storage.local.set({
    status,
    msg,
    lastSentAt: _lastSentAt,
    syncCount: _syncCount,
  });
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
        return; // Thành công → dừng
      } else {
        errors.push(`${url}: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }
  const errMsg = errors.join("; ");
  _saveState("error", `Lỗi: ${errMsg}`);
  console.warn("[PalFish Sync] push failed:", errMsg);
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const headers = details.requestHeaders || [];
    const cookieHeader = headers.find(
      (h) => h.name.toLowerCase() === "cookie"
    );
    if (!cookieHeader?.value) return;

    const cookie = cookieHeader.value;

    // Chỉ xử lý cookie có chứa token= hoặc id= (token CRM PalFish)
    const hasToken = cookie.includes("token=") || cookie.includes("id=");
    if (!hasToken) return;

    const now = Date.now();

    // Debounce: bỏ qua nếu cùng cookie và chưa đủ 30s
    if (cookie === _lastCookie && now - _lastSentAt < DEBOUNCE_MS) return;

    _lastCookie = cookie;
    _lastSentAt = now;

    // Push bất đồng bộ — không chặn request gốc
    _pushToken(cookie);
  },
  { urls: ["*://sea.pri.ibanyu.com/api/*"] },
  ["requestHeaders", "extraHeaders"]
);

// Khởi tạo state
_saveState("idle", "Đang chờ request từ CRM PalFish…");
console.log("[PalFish Sync] service worker started");
