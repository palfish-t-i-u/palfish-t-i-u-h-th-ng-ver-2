const STATUS_LABELS = {
  idle: "Đang chờ…",
  ok: "Đã kết nối",
  error: "Lỗi kết nối",
};

chrome.storage.local.get(["status", "msg", "syncCount"], (data) => {
  const status = data.status || "idle";
  const dot = document.getElementById("dot");
  const title = document.getElementById("status-title");
  const msg = document.getElementById("status-msg");
  const count = document.getElementById("sync-count");

  dot.className = `dot ${status}`;
  title.textContent = STATUS_LABELS[status] || status;
  msg.textContent = data.msg || "";
  count.textContent = data.syncCount || 0;
});
