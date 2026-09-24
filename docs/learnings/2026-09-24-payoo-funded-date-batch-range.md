# Payoo funded_date = lô theo DẢI ngày trong nội dung settlement

**Related files:** `backend/sepay_routes.py` (`_parse_payoo_settle_range`, `_try_fill_payoo_funded_date`), `backend/tests/test_payoo_funded_date.py`, `backend/report_routes.py` (`_load_bc04_card_rows`/`_load_bc04_bank_rows` dedup), `docs/plans/PLAN_PAYOO_FUNDED_DATE_BATCH_RANGE_2026-09-24.md`

**Problem:** Đơn thẻ Payoo hiện ngày quẹt thay vì ngày tiền về TK ở B3/BC04/xuất HĐ vì `funded_date`=NULL — Payoo không cấp ngày tiền về per-đơn ở đâu (learning `2026-09-15-payoo-no-funded-date-source.md`).

**Trap:** Gán `funded_date` bằng khớp **1-to-1** (`net_amount == số tiền cục bank`). Sai vì Payoo **gộp NHIỀU đơn của 1 DẢI ngày quẹt** vào 1 cục net phí chi về TK (T+1) — không đơn lẻ nào bằng cục; và ≥2 đơn cùng net (23/9: Nhung + Tú Ngọc cùng 9.376.620) làm 1-to-1 nhập nhằng luôn. Cũng đừng tưởng dải chỉ 1 ngày: 6/13 cục lịch sử là **dải nhiều ngày, có vắt tháng** — nội dung `Payoo CT DS N10.7 12.7.2026` = 10→12/7, `N28.8 2.9.2026` = 28/8→2/9.

**Insight:** Bất biến khớp 100% (verify 13/13 cục lịch sử, chênh 0đ): **số tiền cục settlement == Σ `net_amount` MỌI đơn Payoo quẹt trong DẢI ngày ghi ở nội dung**. Nên: parse dải từ `N<d.m>[ <d.m>].yyyy` (năm ở ngày cuối; tháng đầu > tháng cuối = vắt năm) → cộng net các đơn `paid_at::date` trong dải → nếu == cục thì stamp cả lô. `funded_date` = **ngày cục THỰC về TK** (`bank_transactions.transaction_date`, VN naive), KHÔNG phải ngày "N" (đó là ngày quẹt). Lọc `paid_at` (VN dán nhãn +00) bằng cửa sổ UTC `[start 00:00, end 23:59:59]` = đúng ngày quẹt VN. BẮT BUỘC set kèm `settlement_code='PAYOO-{sepay_id}'` — nếu không, BC04 đếm đôi (card per-đơn + cục bank), vì dedup `_load_bc04_bank_rows` chỉ bỏ cục khi `PAYOO-{sepay_id}` có trong settlement_code của gateway.

**Rule:** Điền ngày tiền về cho cổng gộp-lô: parse dải ngày từ nội dung sao kê → khớp **tuyệt đối Σnet == cục** (lệch → skip, soát tay, KHÔNG đoán) → stamp cả lô `funded_date`(ngày về, VN naive) + `settlement_code`. Doanh thu/Sổ vẫn giữ ngày quẹt riêng — 2 khái niệm ngày, không gộp.

**Verify:** `cd backend && python -m pytest tests/test_payoo_funded_date.py -q` (21 passed). Đối soát prod: mỗi cục `Payoo CT DS N…` trong `bank_transactions`, `amount` == Σ `net_amount` đơn Payoo `paid_at` trong dải (SQL đầy đủ ở plan §3).
