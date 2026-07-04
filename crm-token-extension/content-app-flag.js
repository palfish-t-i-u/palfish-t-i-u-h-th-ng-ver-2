/**
 * Nhét cờ "đã cài tiện ích" vào trang app GMV (PalFish GMV Manager).
 *
 * FE check localStorage["gw_ext_installed"] === "1" để biết extension đã cài.
 * (xem frontend/src/components/card-recon/mockGatewayTxns.ts → isExtInstalled)
 *
 * Chạy trên các domain app trong manifest content_scripts.matches.
 */
(function () {
  try {
    localStorage.setItem("gw_ext_installed", "1");
    localStorage.setItem("gw_ext_version", chrome.runtime.getManifest().version);
  } catch (e) {
    // ignore (private mode / storage disabled)
  }

  // Nhận lệnh "Đồng bộ ngay" từ app → forward về background service worker
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "gateway-sync-now") {
      if (!chrome.runtime?.id) {
        window.postMessage({
          type: "gateway-sync-now-result",
          resp: { ok: false, error: "Extension đã reload — hãy refresh trang (F5) rồi thử lại." },
        }, "*");
        return;
      }
      chrome.runtime.sendMessage({ type: "gateway-sync-now" }, (resp) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            type: "gateway-sync-now-result",
            resp: { ok: false, error: "Lỗi giao tiếp extension: " + chrome.runtime.lastError.message },
          }, "*");
          return;
        }
        window.postMessage({ type: "gateway-sync-now-result", resp }, "*");
      });
    }
  });
})();
