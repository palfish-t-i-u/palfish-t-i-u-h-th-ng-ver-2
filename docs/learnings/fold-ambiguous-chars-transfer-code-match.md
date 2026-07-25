# Khách gõ tay mã TT nhầm I→l: fold-at-compare với guard bất đối xứng

**Related files:** `backend/sepay_routes.py`, `backend/payment_request_routes.py`, `backend/tests/test_sepay_fold_matching.py`

**Problem:** CK 8.48M của PR-2026-0457 (24/7) không auto-match dù mã + tiền đều "đúng" khi soi bill bằng mắt — rơi tab "CK ngoài chờ ghép".

**Trap:** Hai bẫy nối nhau. (1) Soi ảnh bill thấy mã "đúng" và kết luận lỗi cache/duplicate/dấu cách — thực ra là ký tự khác byte: code lưu `FI8ZP` (I hoa, ASCII 73), khách gõ tay NDCK `Fl8ZP` (l thường, ASCII 108) → `.upper()` = `FL8ZP` ≠ `FI8ZP`. Font ngân hàng render I/l giống hệt nhau — PHẢI verify bằng `ASCII(SUBSTRING(...))` trong DB, đừng tin mắt. (2) Fix "tận gốc" hiển nhiên = bỏ I/L/O/0/1 khỏi alphabet generator — SAI vì `_transfer_code_hint` không random: nó encode deterministic `yy+pr_seq+line_seq` → Base36; đổi sang base31 thì capacity 31^5≈28.6M < numeric `28999999` (năm 2028) → truncation wrap → collision thật sau 2 năm.

**Insight:** Fold lớp ký tự nhầm thị giác (`{I,L,1}→"1"`, `{O,0}→"0"`) TẠI LÚC SO, không đổi data lưu — và vì fold là bằng chứng YẾU hơn exact, điều kiện auto phải CHẶT hơn: chỉ khi duy nhất 1 candidate VÀ tiền khớp exact; exact pass luôn chạy trước và thắng; ≥2 hit (exact hay fold) → nhường kế toán ghép tay thay vì first-match-wins theo thứ tự DB (order-dependent = nondeterministic trên đường tiền). Mỗi fold-match ghi audit `matched_by=system:sepay_folded` / `system:sepay_late_folded` để soi lại từng ca.

**Rule:** (1) CK "mã đúng mà không match" → check byte bằng SQL `ASCII()` trước khi đoán nguyên nhân khác. (2) Thêm fuzzy/fold vào bất kỳ auto-matcher tiền nào: bắt buộc kèm unique-candidate guard + exact-amount guard + audit tag riêng — fuzzy không bao giờ được hưởng điều kiện lỏng ngang exact. (3) Đừng đổi alphabet `_transfer_code_hint` — deterministic encode, đổi base là đổi capacity.

**Verify:** `cd backend && python -m pytest tests/test_sepay_fold_matching.py -q` — 21 pass; `grep -n "_AMBIGUOUS_TRANS" backend/sepay_routes.py` — fold table tồn tại.
