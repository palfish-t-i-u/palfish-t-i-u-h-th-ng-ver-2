# SePay minute-rounding làm trigger suppress nhầm tin báo tiền

**Problem:** PR-2026-0603 lần #2 + PR-2026-0604 (27/7/2026): SePay auto-match
thành công nhưng không có tin Zalo "ĐÃ VÀO TK". `fn_payment_paid_zalo_notify`
suppress vì `bank_transactions.transaction_date < payment_lines.created_at`.

**Trap:** SePay trả `transaction_date` làm tròn về đầu phút (`15:13:00`),
`payment_lines.created_at` chính xác microsecond (`15:13:18`). So sánh 2
timestamp khác độ phân giải → KH chuyển trong cùng phút với lúc tạo lần TT
nhìn như "tiền về trước khi tạo" → suppress nhầm. Bug chỉ xuất hiện khi KH
chuyển QR trong <60s — càng nhanh càng dễ mất tin, nên khó tái hiện khi test tay.

**Insight:** Suppress "tiền cũ ghép sau thì đừng báo" là rule đúng, nhưng dùng
timestamp để đoán "cũ/mới" là sai công cụ — hệ thống đã biết chắc nguồn xác
nhận. `confirmed_source='sepay'` chỉ set từ SePay webhook = tiền vừa về
real-time (transfer_code sinh ra cùng lần TT, không thể chuyển đúng mã trước
khi lần TT tồn tại) → không cần đoán. Timestamp check chỉ còn nghĩa cho ghép
tay (manual), nơi lệch hàng giờ/ngày nên làm tròn phút vô hại.

**Rule:** So sánh timestamp từ 2 hệ thống khác nhau → phải kiểm tra độ phân
giải của TỪNG nguồn trước (SePay = phút). Khi cần phân loại sự kiện
(cũ/mới, tự động/thủ công), ưu tiên metadata rõ ràng (`confirmed_source`,
`matched_by`...) thay vì suy diễn từ thời gian. Fix:
`backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql`.

**Phụ (drift sandbox↔prod):** khi verify phát hiện prod có CHECK constraint
`bank_txn_gateway_check` (gateway ∈ sepay_webhook|sepay_poll|mpos_import|manual)
mà sandbox thiếu → test INSERT `gateway='sepay'` lọt sandbox nhưng fail prod.
Bài học: test script chạy 2 env phải dùng giá trị hợp lệ theo constraint CHẶT
NHẤT (prod), đừng tin sandbox pass là prod pass.
