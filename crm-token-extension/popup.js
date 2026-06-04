const STATUS_LABELS = {
  idle: "Đang chờ…",
  ok: "Đã kết nối",
  error: "Lỗi kết nối",
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
    title.textContent = token ? "Đã lưu secret" : "Đã xóa secret";
    msg.textContent = token
      ? "Mở lại CRM để extension gửi token mới."
      : "Cần dán lại secret để tiếp tục đồng bộ.";
  });
});
