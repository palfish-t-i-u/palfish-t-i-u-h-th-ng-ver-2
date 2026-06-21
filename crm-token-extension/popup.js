const STATUS_LABELS = {
  idle: "Đang chờ tiện ích kết nối CRM…",
  ok: "Tiện ích đã kết nối thành công",
  error: "Tiện ích chưa kết nối được CRM",
};

chrome.storage.local.get(["status", "msg", "syncCount", "ingestToken"], (data) => {
  const status = data.status || "idle";
  const dot = document.getElementById("dot");
  const title = document.getElementById("status-title");
  const msg = document.getElementById("status-msg");
  const count = document.getElementById("sync-count");
  const tokenInput = document.getElementById("ingest-token");

  dot.className = `dot ${status}`;
  title.textContent = STATUS_LABELS[status] || status;
  msg.textContent = data.msg || "";
  count.textContent = data.syncCount || 0;
  tokenInput.value = data.ingestToken || "";
});

document.getElementById("save-token").addEventListener("click", () => {
  const tokenInput = document.getElementById("ingest-token");
  const token = tokenInput.value.trim();
  chrome.storage.local.set({ ingestToken: token }, () => {
    const msg = document.getElementById("status-msg");
    const title = document.getElementById("status-title");
    const dot = document.getElementById("dot");
    dot.className = "dot idle";
    title.textContent = token ? "Bạn đã lưu mã bí mật" : "Bạn đã xóa mã bí mật";
    msg.textContent = token
      ? "Bạn mở lại trang CRM để tiện ích gửi token mới về ứng dụng."
      : "Bạn cần dán lại mã bí mật để tiện ích tiếp tục đồng bộ.";
  });
});
