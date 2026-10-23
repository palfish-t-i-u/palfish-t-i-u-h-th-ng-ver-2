# Tiền về sớm/muộn ở B3: per-course, đổ dần theo SỐ TIỀN, sớm = ngày giao dịch làm bé đủ tiền

**Related files:** `backend/activation_routes.py` (`_pair_course_dates`, `_tien_ve_map`, `_bank_revenue_date`, `_swipe_vn_date`), `backend/tests/test_tien_ve_map.py`, `frontend/src/components/ActivationTab.tsx`, `frontend/src/components/activation/activationFlatList.ts`, `frontend/src/components/payment-flow/paymentFlowUtils.ts` (`invoiceDateFor`)

**Problem 1 (9/10, PR-2309):** 2 bé chung PR, Hồng Ngọc tiền về 08/10, Anh Đức 09/10 — B3 dán (min,max) cả PR lên mọi bé → bé hôm qua bị kéo sang hôm nay.

**Problem 2 (23/10, chị Sương Mai, PR-2548):** cọc 5tr 20/10 + 29,98tr 22/10, 2 bé × 17,49tr. Chị lọc ngày 22/10 chỉ thấy 1 bé — "app thiếu 17tr490" so với tiền về hôm qua; B4 cũng xếp bé 1 vào 20/10 → suýt xuất HĐ tay ngoài app (nguy cơ xuất trùng).

**Nghĩa 2 cột — QUY TẮC KẾ TOÁN (anh Minh + chị Sương Mai 9/10):** "doanh thu phát sinh hôm nào thì xuất HĐ hôm ấy, muộn nhất trong 1 ngày". "Tiền về **sớm nhất** là khi giao dịch phát sinh, **muộn nhất** là ngày tiền về tài khoản." → chị Mai lọc **sớm nhất** để xuất HĐ, KHÔNG dùng muộn nhất.
- **Sớm** = ngày GIAO DỊCH của line làm bé **đủ tiền** = ngày doanh thu. CK: ngày bank theo luật 22h (`ky_tu_gio_thuc`, như Sổ); thẻ: ngày quẹt (`paid_at` ép UTC).
- **Muộn** = ngày tiền về TK muộn nhất trong các line góp vào bé (CK: ngày bank giờ VN; thẻ: `funded_date`) → đối soát sao kê / cục settlement tín dụng (4/9).

**Trap (đã dính lần lượt):**
1. (min,max) cả PR dán lên mọi bé → Problem 1.
2. Ghép 1-1 theo **số lượng** line ↔ khoá → khoản cọc bị coi là tiền trọn 1 bé → Problem 2.
3. Đổ dần theo tiền nhưng lấy **"đồng đầu tiên"** làm sớm → bé có cọc vẫn sớm = ngày cọc, chị Mai lọc sớm vẫn hụt.
4. Lấy `funded_date` (tiền về TK) làm sớm cho đơn thẻ → lệch ngày doanh thu (All File ghi ngày quẹt).
5. Đề xuất "gộp 1 mốc ngày đủ tiền" hay "có tiền về trong khoảng" đều mâu thuẫn: B3 có 2 khái niệm (doanh thu vs tiền về TK); "trong khoảng" làm bé có cọc hiện 2 ngày với đủ tiền → cộng theo ngày sai (đúng lỗi 9/10).

**Insight:** `payment_lines` thuộc PR, không gắn course → suy bằng **số tiền**: sort line theo ngày giao dịch, đổ dần vào khoá theo thứ tự báo đơn (uids_data); line làm khoá đầy quyết định "sớm". Ngưỡng/ngoại lệ:
- Khoá 0đ (refer) → (min giao dịch, max tiền về) cả PR.
- Thiếu ≤ 2% (`PAIR_SHORTFALL_TOLERANCE`) → khoá chưa đầy coi như đủ ở line cuối; thiếu nhiều hơn → (min,max) cả PR.
- Tiền PR **dư** quá 2% so với AR → (min,max) cả PR (PR chia nhiều AR sẽ lấy tiền AR anh em — bẫy `2026-08-08-gateway-fee-doubled-multi-con.md`; prod 23/10: 0 PR nhiều AR).
- Chỉ line `pending`/`paid`; line chưa khớp giao dịch không tham gia; thẻ chưa có `funded_date` → tiền về TK tạm = ngày quẹt.

**Thước đo = All File chị Hiền** (mỗi bé 1 dòng trọn tiền, ngày doanh thu; không tách dòng cọc). Chạy `_tien_ve_map` thật trên prod 23/10, 1.721 bé từ 15/7: sớm trùng All File **96,5%** (code cũ 82,8%; đơn có cọc 45%→91%; đơn thẻ 22%→84%), 53 bé lệch 1 ngày, 7 lệch >1 ngày — đều do All File nhập tay không đồng nhất (ghi theo ngày bank báo / nhập bù / PR-1212 ghi ngày cọc / đơn thẻ chiều tối ghi hôm sau). ~13 bé code cũ vô tình khớp nay lệch 1 ngày (đơn thẻ chị Hiền ghi hôm sau, 2 CK sau 22h chị không áp luật 22h). Hiển thị: CK sau 22h có sớm (đã +1 ngày) > muộn — đúng nghĩa, không phải lỗi.

**Phạm vi:** `tien_ve_som/muon` chỉ hiển thị + lọc B3 và mốc ngày lọc B4 (`invoiceDateFor` dùng muộn). KHÔNG đụng Sổ/BQ/ECS/BC. BQ (view chị Chung), ECS `raw.gmv_all`, `gmv_ledger` đều đọc `so_doanh_thu.ngay_tien_ve`; gmv_ledger dedup app↔allfile theo (ngày, uid, tiền) → muốn đổi ngày Sổ phải đối chiếu All File trước.

**UI kèm theo:** ô Xuất HĐ ở list B3 là cấp AR (rowSpan) → AR xuất một phần hiện "Đã xuất x/y" + chip HĐ theo từng bé dưới tên gói (AR >1 khoá).

**Rule:** Đổi gì về mốc tiền về B3 phải trả lời 3 câu: (1) cấp PR hay cấp course? (2) ghép theo số lượng hay theo số tiền? (3) cột nào là ngày doanh thu (kế toán xuất HĐ) và cột nào là ngày tiền về TK? Rồi đo lại với All File trước khi ship.

**Verify:** `cd backend && python -m pytest tests/test_tien_ve_map.py -q` — 25 pass (PR-2548 cả 2 bé 22/10, 5 đợt cọc, PR-2309, PR-1383, thẻ quẹt≠tiền về, cọc CK + thẻ, luật 22h, ngưỡng 2%, khoá 0đ, PR nhiều AR, end-to-end).
