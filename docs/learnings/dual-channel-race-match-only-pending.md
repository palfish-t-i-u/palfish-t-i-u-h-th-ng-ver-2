# Khớp CK chỉ tìm status=pending = mồ côi khi 2 kênh xác nhận cùng đua

**Related files:** `backend/sepay_routes.py`, `backend/payment_request_routes.py`

**Problem:** Bank txn SePay kẹt `match_status=pending` lẫn vào tab "CK ngoài chờ ghép" dù lần thanh toán ĐÃ xác nhận + đã báo Zalo (PR-2026-0022, 11/7). Quét lại ra 16 dòng cùng bệnh từ 16/6.

**Trap:** Nghĩ "PayOS tắt rồi" nghĩa là hết đường xác nhận song song. Sai 2 lần: (1) `USE_PAYOS=false` chỉ chặn TẠO link mới — webhook `/webhook/payos` vẫn mount (cố ý, QR cũ ngoài thị trường) và PayOS vẫn theo dõi order cũ chưa đóng, khách trả muộn cả tháng vẫn callback; (2) kể cả hết sạch PayOS, kế toán confirm tay trước lúc SePay về vẫn gây đúng bệnh — nguồn race là "line paid trước khi bank txn tới", không phải riêng PayOS.

**Insight:** Hàm khớp `_match_transfer_code_in_content` chỉ query `payment_lines status='pending'` → line vừa bị kênh khác mark paid là tàng hình với SePay. Fix = khớp muộn (`_match_paid_line_late`): miss pending → dò lines đã paid với 3 chốt chống ghép nhầm (mã trong NDCK + `.eq(amount)` exact ngay trong query để khỏi kéo cả lịch sử + line chưa có txn link — chốt 3 giữ được CK lặp thật của khách cho kế toán). Link-only: KHÔNG update payment_lines → trigger Zalo/DingTalk không bắn lại. Chiều ngược (SePay trước, PayOS sau) đã an toàn sẵn nhờ `_mark_line_paid` early-return khi paid.

**Rule:** Mọi hàm auto-match theo trạng thái "đang chờ" trong hệ có ≥2 kênh xác nhận (webhook A, webhook B, confirm tay) PHẢI có nhánh xử lý "đối tượng đã được kênh khác xử lý xong" — nếu không, kẻ thua race tạo bản ghi mồ côi. Kiểm tra: mô phỏng thứ tự đảo (xác nhận trước, txn tới sau) và xem bản ghi có bị kẹt ở trạng thái chờ không. Lỗi DB thoáng qua ở 1 candidate không được chặn cả vòng dò — từ redesign 24/7 (fold matching), scan mã là in-memory thuần (không thể lỗi DB), linked-check chỉ chạy trên winner duy nhất sau unique guard; lỗi ở đó → fail-closed về pending (xem `fold-ambiguous-chars-transfer-code-match.md`).

**Verify:** `grep -n "_match_paid_line_late" backend/sepay_routes.py` — hàm tồn tại + được gọi ở nhánh miss; `python -m pytest backend/tests/test_sepay_webhook.py -q -k LateMatch` — 6 test pass.
