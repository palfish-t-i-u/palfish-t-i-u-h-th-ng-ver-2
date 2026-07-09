# OOM từ per-request Supabase client — chẩn đoán bằng metrics shape

**Related files:** `backend/main.py`, `backend/rbac.py`

**Problem:** palfish-gmv-api (Render 512MB) OOM-crash mỗi ~3h trong giờ làm việc (2026-07-09).

**Trap:** Hai bẫy liên tiếp. (1) Đổ lỗi cho thứ nhìn thấy trong logs: dòng error `dingtalk_outbox` PGRST205 và `storage.objects` PGRST106 lặp liên tục — cả hai đều được catch gọn, vô hại. (2) Đổ lỗi cho background workers tạo client mỗi 30s — chỉ 2 client/phút, không đáng kể. Thủ phạm thật là `_supabase()` tạo client MỚI cho MỖI request handler (~5000 client/giờ cao điểm), mỗi client kéo theo httpx pools không bao giờ đóng. Bẫy phụ: skill backend-conventions thời điểm đó còn GHI THÀNH VĂN "new client per request, not a singleton" — convention sai được document hoá.

**Insight:** Hình dáng đường memory trên Render metrics phân loại nguyên nhân trước khi đọc code: leo dốc đều tỉ-lệ-thuận-traffic (~150MB/h, không plateau) = leak per-request allocation; spike đột ngột vài trăm MB = một request nặng (zip/export). Chẩn đoán từ logs không thay được metrics — logs chỉ hiện lỗi được print, leak thì im lặng.

**Rule:** Nghi OOM → kéo `mcp render get_metrics memory_usage` TRƯỚC khi đọc code. Leo đều theo traffic → grep chỗ tạo tài nguyên per-request (`grep -rn "create_client\|httpx.Client" backend/ --include="*.py"` — mọi hit ngoài `main.py:_supabase()` và `rbac.py:_http` là vi phạm singleton, trừ scripts/tests).

**Verify:** `grep -n "_sb_lock" backend/main.py` — phải có (singleton + lock tồn tại); `grep -c "create_client" backend/main.py` — expect 1.
