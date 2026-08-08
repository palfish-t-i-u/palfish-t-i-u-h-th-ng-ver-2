# Ngày tiền về đơn thẻ = ngày quẹt, ép UTC tường minh

**Related files:** `backend/revenue_routes.py`, `backend/gateway_routes.py`

**Problem:** Đơn thẻ/trả góp ghi doanh thu theo NGÀY BÁO ĐƠN (ngày sale tạo AR ở B3), lệch với NGÀY QUẸT thẻ chị Hiền đối chiếu ở BC02 — 2 ngày (03/8, 04/8) sai số dòng.

**Trap:** Lấy `gateway_transactions.paid_at` rồi đẩy qua helper `_parse_datetime` sẵn có để ra `date`. Helper đó coi datetime naive là giờ VN (Asia/Ho_Chi_Minh) rồi convert → `paid_at` vốn đã UTC bị dịch thêm 7h = **double-shift**, quẹt lúc 23h VN nhảy sang ngày hôm sau.

**Insight:** `paid_at` từ cổng (mPOS/Payoo) là timestamptz đã chuẩn UTC. Ngày quẹt đúng = `(paid_at AT TIME ZONE 'UTC')::date`, KHÔNG convert timezone. `stamp_net_fee(..., paid_at=...)` (`revenue_routes.py:193`, khối `if paid_at is not None` ~line 218-225) ép UTC tường minh: `dt.astimezone(timezone.utc).date()` rồi set `ngay_tien_ve` + `pay_time`, bỏ qua rule booking-time 22h. Đơn CK vẫn giữ ngày xác nhận (không truyền `paid_at`). Chống trùng re-sync: `stamp_net_fee` update có guard `.is_("gateway_txn_id", "null")` (idempotent theo txn) + phía sync CRM guard `crm_order_id`.

**Rule:** Bất kỳ chỗ nào biến timestamptz đã-là-UTC thành `date`/`datetime` VN, KHÔNG dùng `_parse_datetime`/`_parse_date` (chúng giả định naive = VN). Ép `astimezone(timezone.utc)` trước khi `.date()`. Ngược lại: chuỗi ngày do người VN gõ tay mới dùng helper naive-là-VN.

**Verify:** `grep -Fn "astimezone(timezone.utc)" backend/revenue_routes.py` — phải thấy dòng ép UTC trong `stamp_net_fee` (~line 223).
