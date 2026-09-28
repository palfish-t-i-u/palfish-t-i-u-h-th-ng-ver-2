# Hủy lần thanh toán KHÔNG tự nhả giao dịch ngân hàng → giao dịch mồ côi treo "đã ghép"

**Related files:** `backend/payment_request_routes.py:3534` (reject line), `backend/sepay_routes.py:1000` (`manual_match_bank_transaction`), `bank_transactions.payment_line_id` / `match_status`, `payment_lines.status`

**Sự cố (28/09/2026, PR-2026-1819 / PR-2026-2073):** Kế toán (chị Thu Hiền) ghép nhầm 1 giao dịch SePay 9.01tr (người CK: NGUYEN THI THU PHUONG) vào **PR-1819** (khách Vũ Thị Thúy — thực ra chưa CK). Trùng số tiền + cùng sale nên nhầm. Chị bấm **hủy** (reject) lần thanh toán trên PR-1819, rồi tạo **PR-2073** cho khách thật (Chị Phương / bé Phan Yến Đan) và confirm tay. Nhưng chị báo "k biết đúng chưa".

**Trap:**
1. **Reject chỉ lật nửa việc.** `PATCH .../transactions/{id}/status` khi `status=rejected` (payment_request_routes.py:3534) chỉ update `payment_lines` (status→rejected, paid_at→null). **Không hề chạm `bank_transactions`.** Giao dịch vẫn giữ `match_status='manual_matched'` + `payment_line_id` trỏ tới **line đã bị reject** → giao dịch mồ côi: tab Đối soát vẫn tưởng đã ghép, nhưng ghép vào 1 line "rejected".
2. **Không có đường đảo ghép.** Grep toàn backend: KHÔNG endpoint nào set `bank_transactions.payment_line_id=NULL` / `match_status='pending'` sau khi ghép. `manual_match_bank_transaction` (sepay_routes.py:1000) là 1 chiều: gắn txn + mark line paid cùng lúc, không có hàm ngược.
3. **"Ghép lại" của kế toán không ăn.** Vì txn còn kẹt ở line cũ, thao tác ghép lại của chị không lưu được (endpoint manual_match chặn `if current_status in (auto_matched, manual_matched): "Giao dịch đã được khớp"` — sepay_routes.py:1023). Chị confirm PR-2073 bằng **tay** (`confirmed_source=manual`) thay vì kéo txn thật vào → 2 sổ lệch: sổ PR ghi đã nhận, sổ ngân hàng giao dịch vẫn treo pending/mồ côi.

**Insight:** Ghép và hủy là cặp thao tác đối xứng nhưng code viết ở 2 module rời (recon bank txn ở `sepay_routes`, đổi status line ở `payment_request_routes`). Đường hủy được viết cho luồng sale-tự-hủy / kế toán-từ-chối-bill — mấy ca đó line thường confirm tay, KHÔNG gắn txn, nên "không có gì để nhả" → tác giả gốc không gặp bug. Bug chỉ cắn ở ca hiếm hơn: **line đã gắn txn SePay thật rồi mới hủy** (= ghép nhầm rồi sửa). Đây là **thiếu sót vô ý (gap), không phải quyết định thiết kế**: 0 comment biện minh, 0 endpoint đảo ghép, bất đối xứng "ghép 2 nửa / hủy 1 nửa" lộ liễu.

**Rule:**
1. Khi hủy (reject) 1 `payment_line`, PHẢI dọn luôn mọi `bank_transactions` đang trỏ tới line đó: set `payment_line_id=NULL`, `match_status='pending'`, `matched_by=NULL`, `matched_payment_id=NULL`. Ghép và hủy phải đối xứng — reverse ĐỦ cả 2 nửa.
2. Bất kỳ thao tác nào phá liên kết line↔txn phải soi cặp bảng `payment_lines` ↔ `bank_transactions` (và `gateway_transactions` cho thẻ/mPOS), không chỉ 1 bảng.
3. Khi kế toán confirm 1 line **bằng tay** trong khi giao dịch thật đã về SePay: đừng để giao dịch treo pending. Đúng nhất là kéo giao dịch SePay thật vào đúng line → 2 sổ (PR + ngân hàng) khép kín. Confirm tay = sổ PR đúng nhưng sổ ngân hàng vẫn hở.

**Fix DB thủ công (đã dùng cho sự cố này):**
```sql
-- 1. nhả giao dịch khỏi line đã reject
UPDATE bank_transactions SET match_status='pending', payment_line_id=NULL,
  matched_payment_id=NULL, matched_by=NULL, updated_at=now() WHERE txn_id='<uuid>';
-- 2. gắn lại vào đúng line của PR thật (line đã paid tay từ trước)
UPDATE bank_transactions SET match_status='manual_matched', payment_line_id='<line_uuid>',
  matched_by='<ketoan_email>', updated_at=now() WHERE txn_id='<uuid>';
```

**Verify:** Query `bank_transactions` sau fix: match_status='manual_matched', payment_line_id trỏ đúng line PR-2073 (paid). `payment_requests` PR-1819 received=0/pending (đúng — khách chưa CK), PR-2073 received=9.01tr/done. Guard trước khi gắn: line đích chưa dính txn khác (`count=0`) + txn còn pending.
