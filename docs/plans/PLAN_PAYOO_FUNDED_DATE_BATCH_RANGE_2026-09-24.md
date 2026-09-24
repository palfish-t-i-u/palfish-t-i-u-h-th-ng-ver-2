# PLAN — Payoo funded_date theo LÔ (batch-range) từ SePay settlement — 2026-09-24

> **Supersedes** `docs/plans/PLAN_PAYOO_FUNDED_DATE_AUTOFILL_2026-09-19.md` (hướng 1-to-1 net-match — SAI/THIẾU, xem §2).
> **Trạng thái:** CHỜ anh Hiếu/Giang duyệt. Chưa code. Backfill 23/9 đã chạy tay (§6) để cứu nghiệp vụ hôm nay.
> **Owner đề xuất:** Giang (SePay webhook). **FE:** không. **Migration:** không (dùng cột `funded_date`, `settlement_code` sẵn có).

---

## 1. Vấn đề & bối cảnh nghiệp vụ

Kế toán (chị Sương Mai) đối soát **mỗi ngày**: lọc "tiền về" ở tab **Tạo gói học (B3)** rồi khớp với tiền thực vào MB ở **BC04** → khớp mới xuất hoá đơn ngày đó.

- Đơn **thẻ Payoo** phải mang **ngày tiền THỰC vào TK MB** (`funded_date`), KHÔNG phải ngày quẹt.
- Payoo **không cấp ngày tiền về per-đơn** ở bất cứ đâu (đã soi 4 tab portal — learning `2026-09-15-payoo-no-funded-date-source.md`). Ngày tiền về chỉ tồn tại ở **sao kê MB**: Payoo **gộp nhiều đơn 1 cục**, net phí, chi 1 lần (T+1), nội dung:
  `Payoo CT DS N23.9.2026 cho TK ECOM. PY3 PALFISH EC- Ma GD ACSP/ 99680746`
- Khi `funded_date=NULL` → B3 lùi về ngày quẹt → đơn nằm sai ngày → không khớp BC04 → không xuất được HĐ. Chị Mai đã báo lặp lại: 11/9, 18/9, 23/9.

## 2. Root cause (2 lỗi, đã verify trên prod)

**Lỗi A — thuật toán chỉ khớp 1-to-1 (thiếu):** `_try_fill_payoo_funded_date` (`sepay_routes.py:288`) tìm gateway có `net_amount == bank_amount`, chỉ fill khi **đúng 1 dòng**. Cục Payoo là **tổng nhiều đơn** ⇒ không đơn nào bằng cục ⇒ bỏ qua. Cũng chết khi **2 đơn cùng net** (23/9: Nhung + Tú Ngọc cùng 9.376.620).

**Lỗi B — update sai cột (hỏng hoàn toàn):** hàm update `"updated_at": _iso_now()` (`sepay_routes.py:322`) nhưng **`gateway_transactions` KHÔNG có cột `updated_at`** ⇒ PostgREST ném lỗi ⇒ `except` ⇒ return 0. **Auto-fill CHƯA BAO GIỜ chạy được qua webhook.** 15/24 dòng Payoo có funded_date hiện nay là do **backfill SQL tay** (omit `updated_at`), không phải webhook.

## 3. Bằng chứng: thuật toán LÔ khớp 13/13 lịch sử

Bất biến: **mỗi cục settlement = Σ `net_amount` các đơn Payoo quẹt trong DẢI ngày ghi ở nội dung**. Đối soát toàn bộ 13 cục Payoo trên prod (`jozcvbbypwvzaefteoxn`): **chênh = 0đ ở cả 13**, gồm dải nhiều ngày & vắt tháng.

| Ngày về MB | Nhãn nội dung | Tiền về MB | ΣNet đơn | Số đơn | Chênh |
|---|---|---:|---:|:--:|:--:|
| 17/06 | N16.6 | 17.443.580 | 17.443.580 | 1 | 0 |
| 01/07 | N30.6 | 15.563.900 | 15.563.900 | 1 | 0 |
| 13/07 | N10.7→12.7 | 12.254.880 | 12.254.880 | 1 | 0 |
| 27/07 | N24.7→26.7 | 26.330.700 | 26.330.700 | 2 | 0 |
| 30/07 | N29.7 | 50.823.080 | 50.823.080 | 3 | 0 |
| 06/08 | N5.8 | 8.984.778 | 8.984.778 | 1 | 0 |
| 07/08 | N6.8 | 17.130.300 | 17.130.300 | 1 | 0 |
| 10/08 | N7.8→9.8 | 17.443.580 | 17.443.580 | 1 | 0 |
| 24/08 | N22.8→23.8 | 17.443.580 | 17.443.580 | 1 | 0 |
| 03/09 | N28.8→2.9 (vắt tháng) | 17.639.380 | 17.639.380 | 1 | 0 |
| 14/09 | N11.9→13.9 | 17.443.580 | 17.443.580 | 1 | 0 |
| 18/09 | N17.9 | 18.422.580 | 18.422.580 | 1 | 0 |
| 24/09 | N23.9 | 80.172.466 | 80.172.466 | 7 | 0 |

6/13 cục là **DẢI NGÀY** → parser bắt buộc đọc được dải, không chỉ 1 ngày.

## 4. Bối cảnh code (ĐÃ verify — line refs trên nhánh hiện tại)

- `backend/sepay_routes.py:60-63` — `_PAYOO_SETTLE_SIGNALS` (nhận diện cục Payoo). Giữ nguyên.
- `backend/sepay_routes.py:283-285` — `is_payoo_settlement(content)`. Giữ nguyên.
- `backend/sepay_routes.py:288-328` — `_try_fill_payoo_funded_date(sb, bank_amount, bank_txn_date, bank_sepay_id)` → **VIẾT LẠI** (lõi §5). Chưa nhận `content`.
- `backend/sepay_routes.py:759-766` — call site trong `_process_sepay_transaction` (`is_new and match_status=="ignored" and is_payoo_settlement(content) and txn_date`) → **truyền thêm `content`**.
- `backend/report_routes.py:536-578` — `_load_bc04_card_rows` lấy đơn thẻ theo `funded_date`, gom `settlement_codes`.
- `backend/report_routes.py:581-636` — `_load_bc04_bank_rows`; **dedup Payoo ĐÃ CÓ** (dòng 608-611): bỏ cục bank nếu `PAYOO-{sepay_id}` ∈ `known_settlement_codes`. **KHÔNG cần sửa** — nhưng phải có test bảo vệ.
- Cột: `gateway_transactions.funded_date` = `timestamp without time zone` (VN naive); `settlement_code text`. **KHÔNG có `updated_at`.**

## 5. Thuật toán mới (viết lại `_try_fill_payoo_funded_date`)

Input thêm: `content: str`. Các bước:
1. **Parse dải ngày quẹt** từ `content`:
   - Range: `N\s*(\d{1,2})\.(\d{1,2})\s+(\d{1,2})\.(\d{1,2})\.(\d{4})` → `[d1.m1.(year), d2.m2.year]`. Ngày đầu kế thừa `year` của ngày cuối; nếu `m1 > m2` (vắt năm) → `year1 = year - 1`.
   - Single: `N\s*(\d{1,2})\.(\d{1,2})\.(\d{4})` → `[d.m.year, d.m.year]`.
   - Không parse được → return 0, log warning.
2. **ΣNet** mọi `gateway_transactions` `source='payoo'` có `(paid_at AT TIME ZONE 'UTC')::date` ∈ `[d_start, d_end]` (gồm cả matched & pending; KHÔNG lọc funded_date để tính tổng).
3. **Khớp tuyệt đối:** nếu `Σnet != bank_amount` → return 0 + log (để soát tay). (G-EXACT)
4. Nếu khớp → **UPDATE** các dòng trong dải có `funded_date IS NULL`:
   - `funded_date = bank_txn_date` VN-naive (`.replace(tzinfo=None)`) — **KHÔNG convert tz** (G1).
   - `settlement_code = f"PAYOO-{bank_sepay_id}"` — cho BC04 dedup (§4).
   - **BỎ `updated_at`** (cột không tồn tại — Lỗi B).
5. Return số dòng đã fill.

Call site: `filled = _try_fill_payoo_funded_date(sb, amount, txn_date, sepay_id, content)`.

## 6. Backfill (23/9 ĐÃ CHẠY TAY 2026-09-24)

Đã stamp 7 đơn Payoo quẹt 23/9 → `funded_date='2026-09-24 14:39:00'`, `settlement_code='PAYOO-84244968'`. Backup: **`gateway_transactions_funded_bak_20260924`** (7 dòng).
Hoàn tác: `UPDATE gateway_transactions SET funded_date=NULL, settlement_code=NULL WHERE settlement_code='PAYOO-84244968';`

Sau khi deploy code: chạy **backfill tổng quát** duyệt mọi cục Payoo trong `bank_transactions` (content ~ `Payoo CT DS`), áp §5 để fill nốt cục nhiều-đơn còn sót (hiện chỉ 23/9 đã tay; tương lai tự chạy qua webhook). 2 đơn tháng 6 (quẹt 4/6, 9/6, `pending`, không có cục payout) **giữ NULL** — đúng (tiền chưa/không về).

## 7. Guardrails (giữ nguyên)

| # | Bất biến | Kiểm |
|---|---|---|
| G1 | `funded_date` VN naive, KHÔNG convert tz | `information_schema` = `timestamp without time zone`; test không có tzinfo |
| G2 | BC04 không đếm đôi (per-đơn + cục bank) | test: card row `settlement_code=PAYOO-x` + bank cùng sepay_id → bank bị loại |
| G-EXACT | Chỉ fill khi Σnet == cục (tuyệt đối); lệch → skip + log | test amount lệch → 0 |
| G3 | Doanh thu/Sổ/BC01-03 = ngày quẹt, KHÔNG đụng | không sửa `revenue_routes.py` |
| G4 | `_tien_ve_map` chỉ đọc funded_date, tự đúng | không sửa `activation_routes.py` |

## 8. Đánh giá 3 tiêu chí

1. **Triệt để** ✅ — fill từ nguồn thật (sao kê), khớp cách Payoo gộp lô; B3/BC04 tự đúng; tương lai không tái phát.
2. **Không lỗi con** ✅ — chỉ sửa 1 hàm + call site; sửa luôn Lỗi B (updated_at). BC04 dedup sẵn có (có test bảo vệ). Không đụng doanh thu.
3. **Không tăng gánh hạ tầng** ✅ — thêm 1-2 query nhỏ trong webhook đã có; không cron/worker/cột mới.

## 9. Tasks

- [ ] **T1** — Viết lại `_try_fill_payoo_funded_date` theo §5 (parser dải + Σnet + khớp tuyệt đối + bỏ `updated_at`), thêm param `content`. `sepay_routes.py`.
- [ ] **T2** — Call site `sepay_routes.py:762` truyền `content`.
- [ ] **T3** — Unit test `backend/tests/test_payoo_funded_date.py`: parse single / range / vắt-tháng / vắt-năm; Σnet khớp → fill cả lô; lệch → skip; funded VN-naive (G1); regression Lỗi B (update KHÔNG có updated_at); BC04 dedup (G2).
- [ ] **T4** — Script/SQL backfill tổng quát (§6), chạy sau deploy; verify `SELECT source, count(*)-count(funded_date) FROM gateway_transactions GROUP BY source` → payoo chỉ còn các đơn không-có-payout.
- [ ] **T5** — Deploy BE (Render) + smoke: 1 cục Payoo mới về → log `filled N`, B3 hiện đúng ngày, BC04 không tăng tổng.

## 10. Acceptance criteria

1. Cục Payoo mới (nhiều đơn) về TK → cả lô được stamp `funded_date` = ngày về + `settlement_code`, **không cần tay**.
2. B3 lọc "tiền về" = ngày về → hiện đủ đơn của lô.
3. BC04 ngày đó: tổng tiền **không đổi** (per-đơn thay cục bank, cùng số).
4. Cục lệch tổng → KHÔNG fill, có log để soát tay.
5. `cd backend && python -m pytest tests/test_payoo_funded_date.py -v` PASS.
6. `cd frontend && npx tsc -b` PASS (FE không đụng — chỉ xác nhận không regress).

## 11. Anti-patterns (đừng làm)

1. **Đừng** giữ khớp 1-to-1 net (thiếu cục nhiều-đơn).
2. **Đừng** convert timezone cho `funded_date` (G1 — lệch 1 ngày).
3. **Đừng** stamp khi Σnet ≠ cục (đoán mò lô sai).
4. **Đừng** dùng ngày "N" trong nội dung làm `funded_date` — đó là ngày QUẸT; `funded_date` = ngày cục **về TK** (`transaction_date`).
5. **Đừng** đụng `revenue_routes.py` / doanh thu (ngày quẹt giữ nguyên — G3).
6. **Đừng** thêm cột `updated_at` vào update (không tồn tại — Lỗi B).

## 12. Rollback

- Revert commit (squash 1 commit).
- Backfill: `UPDATE gateway_transactions SET funded_date=NULL, settlement_code=NULL WHERE settlement_code LIKE 'PAYOO-%';` (hoặc restore từ `gateway_transactions_funded_bak_20260924`).
- Không migration schema.
