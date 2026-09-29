# PLAN: Payoo funded_date — retry điền từ CẢ HAI chiều (idempotent) — 2026-09-29

> **ĐỌC TRƯỚC KHI LÀM** (dành cho agent thực thi, kể cả sau compaction / agent mới):
> - Mở lại & VERIFY khớp "Hiện trạng" (mục 4) TRƯỚC khi sửa:
>   `backend/sepay_routes.py:330-397` (`_try_fill_payoo_funded_date`),
>   `backend/sepay_routes.py:~828-835` (call site webhook),
>   `backend/gateway_routes.py:348-376` (`ingest_gateway_orders`).
> - Invariant top KHÔNG được phá: **guard khớp tuyệt đối `round(Σnet)==round(cục)` per-settlement** (chốt chống gán nhầm lô); **`funded_date` VN naive (không convert tz)**; **chỉ fill đơn `funded_date IS NULL`**.
> - Gặp STOP condition (mục cuối) → DỪNG, hỏi user, KHÔNG tự quyết.
> - Module ref: skill `mpos-payoo-reconciliation`; learnings `payoo-funded-date-autofill-multi-txn-lumps.md`, `2026-09-24-payoo-funded-date-batch-range.md`.

## 1. Vấn đề & bằng chứng
- **Triệu chứng:** Cục payout Payoo ~32,3tr về TK 28/09, nhưng "Đối soát · Quẹt thẻ" lọc **Ngày tiền về = 28/09** tab Payoo ra **0 kết quả** — dù 3 đơn cấu thành đã ghép PR đủ.
- **Root cause (đã xác minh):** `funded_date` của đơn Payoo chỉ được điền **một lần, đồng bộ**, đúng khoảnh khắc cục settlement về qua webhook SePay:
  - `_try_fill_payoo_funded_date` (`backend/sepay_routes.py:330-397`), call site chỉ khi `is_payoo_settlement(content)` (`sepay_routes.py:~828-835`).
  - Parser `parse_payoo_orders` (`backend/mpos_import.py:522-566`) luôn set `funded_date=None`.
  - Nếu lúc cục về, các đơn thành phần **CHƯA sync** vào `gateway_transactions` (extension Payoo sync chu kỳ `chrome.alarms` 360′ hoặc bấm tay) → `Σnet != cục` → hàm bỏ qua (`Σnet != cục — bỏ qua, soát tay`) → **không có cơ chế chạy lại** → đơn sync vào sau vẫn NULL vĩnh viễn → biến mất khỏi bộ lọc "Ngày tiền về" + thiếu ở BC04 (`report_routes.py:537-567`).
- **Bằng chứng:** settlement `sepay_id=85273153`, nội dung "Payoo CT DS N25.9 27.9.2026", 32.320.081đ, về 28/09 15:18. 3 đơn (`txn_code` 8971260925150439375 / …180532751 / …111445915, quẹt 25/09, Σnet=32.320.081) sync muộn → funded_date kẹt NULL. Các cục nội dung 1 ngày khớp ngay lúc về nên OK — chỉ cục sync-muộn lỡ. **KHÔNG phải bug parse dải** (chạy lại logic đó hôm nay khớp tuyệt đối); thuần lỡ nhịp thời điểm.
- **Chốt cấu trúc:** `gateway_transactions` KHÔNG có `created_at`/`synced_at` → không "detect đơn sync muộn" từ data được → fix phải là **retry**, không phải detect.
- **Case prod đã vá tay** (3 dòng đã có funded_date) — **KHÔNG đụng lại**; task = sửa cơ chế để không tái diễn.

## 2. Approach chọn + 5-criteria
**Approach: Tách lõi khớp (đã có) làm hàm dùng-lại + thêm driver chiều-ngược trigger-tại-ingest.**
Lõi `_try_fill_payoo_funded_date` VỐN đã nhận params-1-cục (amount/txn_date/sepay_id/content) → tái dùng nguyên vẹn, không đụng logic khớp. Thêm `retry_fill_payoo_funded_date_from_bank(sb, since_date)` quét cục Payoo đã nằm trong `bank_transactions` rồi gọi lại lõi cho từng cục. Nối vào cuối `ingest_gateway_orders`.
```
TC1 Triệt để:      ✅ đóng cả 2 chiều lỡ nhịp (cục về trước / đơn về trước); idempotent
TC2 Không lỗi con:  ✅ tái dùng lõi + guard tuyệt đối per-settlement → không gán nhầm; chỉ fill NULL; try-bọc non-blocking không chặn ingest
TC3 Hạ tầng/perf:   ✅ 0 infra mới (KHÔNG worker/cron); 1 query bank bound theo since_date mỗi lần ingest (tần suất thấp)
TC4 Token economy:  ✅ làm inline, 0 subagent; sửa 2 file + 1 test
TC5 Task-model:     ✅ single-module backend logic, đủ cho Opus/Sonnet effort cao; đã làm inline
→ Recommend (5/5)
```
(Đã loại: **Background worker quét N ngày định kỳ** — TC3 fail: thêm cron/infra + gánh quét lặp; task đánh dấu tuỳ chọn, trigger-tại-ingest đã đủ đóng bug. Đã loại: **Backfill parser tính funded_date lúc ingest** — TC1 fail: parser không biết cục nào đã về, vẫn cần đối chiếu bank.)

## 3. GUARDRAILS — invariant PHẢI GIỮ
| # | Quy tắc không được phá | Nguồn | Cách kiểm |
|---|------------------------|-------|-----------|
| G1 | Guard khớp tuyệt đối `round(Σnet)==round(bank_amount)` — KHÔNG nới lỏng | learning batch-range; `sepay_routes.py:373` | test `test_sum_mismatch_no_fill` |
| G2 | `funded_date` lưu **VN naive** (`.replace(tzinfo=None)`), KHÔNG convert tz | learning; task | test `test_order_synced_after_settlement_gets_filled` assert không có `+`/`Z` |
| G3 | `settlement_code = PAYOO-{sepay_id}` (BC04 dedup) | learning multi-txn-lumps | test assert settlement_code |
| G4 | Chỉ fill đơn `funded_date IS NULL`, KHÔNG ghi đè | task | test `test_idempotent_second_run_fills_nothing` |
| G5 | Nhiều settlement dải chồng → khớp **per-settlement**, KHÔNG gộp union | task | test `test_multiple_settlements_matched_per_settlement` |
| G6 | Parse dải giữ đúng: 1 ngày / dải / vắt tháng / vắt năm — không regress | test cũ `TestParsePayooSettleRange` | pytest cũ xanh |
| G7 | Chỉ đụng cục Payoo (mPOS/CK bỏ qua) | `is_payoo_settlement` | test `test_non_payoo_bank_rows_ignored` |
| G8 | Retry non-blocking — lỗi retry KHÔNG làm hỏng ingest đơn | conv | try/except bọc call site trong ingest |

## 4. Hiện trạng (ground truth snapshot)
```
# sepay_routes.py:330-397 — lõi (nhận params-1-cục, guard tuyệt đối, fill NULL, VN naive, settlement_code)
def _try_fill_payoo_funded_date(sb, bank_amount, bank_txn_date, bank_sepay_id, content) -> int:
    ... parse range → query payoo trong [lo,hi] → if round(total_net)!=round(bank_amount): return 0
    ... to_fill = [r NULL] ; funded_naive = bank_txn_date.replace(tzinfo=None).isoformat()
    ... settlement_code=f"PAYOO-{bank_sepay_id}" ; update in_(to_fill)

# sepay_routes.py:~828-835 — chiều xuôi (webhook)
if is_new and match_status=="ignored" and is_payoo_settlement(content) and txn_date:
    filled = _try_fill_payoo_funded_date(sb, amount, txn_date, sepay_id, content)

# gateway_routes.py:360-376 — ingest_gateway_orders (upsert đơn, TRƯỚC fix chưa có retry)
parsed = parse_payoo_orders(body.orders)
txn_rows = [_txn_insert_row(row) ...]
inserted, skipped = _upsert_rows(sb, "gateway_transactions", txn_rows, "txn_code")

# bank_transactions cột dùng: gateway='sepay_webhook', sepay_id, amount, content, transaction_date
```

## 5. Tasks (nguyên tử, có checklist tiến độ)
- [x] **T1 — Thêm driver chiều ngược `retry_fill_payoo_funded_date_from_bank`**
  - File: `backend/sepay_routes.py` (ngay sau `_try_fill_payoo_funded_date`, trước `classify_cash_in`)
  - Đổi chính xác: query `bank_transactions` `.eq("gateway","sepay_webhook")` (+ `.gte("transaction_date", since_date)` nếu có) → mỗi row: `if not is_payoo_settlement(content): continue`; parse `transaction_date` bằng `datetime.fromisoformat`; gọi `_try_fill_payoo_funded_date(sb, amount, txn_date, sepay_id, content)`; cộng dồn trả tổng.
  - Vì sao: chạy lại lõi cho cục đã về nhưng đơn về sau → đóng lỡ nhịp; idempotent nhờ guard + fill-NULL.
  - Guardrail liên quan: G1,G2,G3,G4,G5,G7
  - Verify: pytest test mới (mục 6) xanh
  - Ai làm: inline · Opus
- [x] **T2 — Nối driver vào cuối `ingest_gateway_orders` (non-blocking)**
  - File: `backend/gateway_routes.py:364` (sau `_upsert_rows`)
  - Đổi chính xác: `try: from sepay_routes import retry_fill_payoo_funded_date_from_bank; since_date=min(str(r["paid_at"])[:10] for r in txn_rows if r.get("paid_at")); retry_fill_payoo_funded_date_from_bank(sb, since_date) except Exception: print(...non-blocking)`.
  - Vì sao: trigger retry đúng lúc đơn Payoo vừa có mặt; bound `since_date` = ngày quẹt sớm nhất (settlement luôn về SAU ngày quẹt → cục cũ hơn không chứa đơn mới).
  - Guardrail liên quan: G8
  - Verify: `test_gateway_routes.py` xanh (ingest không hỏng)
  - Ai làm: inline · Opus
- [x] **T3 — Regression tests**
  - File: `backend/tests/test_payoo_funded_date.py` (class `TestRetryFillFromBank`)
  - Verify: pytest 3 file xanh
  - Ai làm: inline · Sonnet-đủ

## 6. Test plan
### Unit (mỗi guardrail 1 case regression)
- [x] `test_payoo_funded_date.py::TestRetryFillFromBank::test_order_synced_after_settlement_gets_filled` — **regression bug gốc**: cục 32,3tr về 28/9 nằm sẵn bank, 3 đơn quẹt 25/9 sync sau → retry fill đủ, funded_date=`2026-09-28T15:18:00` (VN naive, G2), settlement_code=`PAYOO-85273153` (G3)
- [x] `::test_idempotent_second_run_fills_nothing` — chạy lần 2 = 0, không ghi đè (G4)
- [x] `::test_sum_mismatch_no_fill` — Σnet != cục → 0 fill (G1)
- [x] `::test_non_payoo_bank_rows_ignored` — mPOS/CK bỏ qua (G7)
- [x] `::test_multiple_settlements_matched_per_settlement` — 2 cục dải chồng khớp riêng (G5)
- [x] Test cũ `TestParsePayooSettleRange` + chiều xuôi `TestTryFillPayooFundedDate` giữ xanh (G6, không regress)
### E2E/manual
- Không đụng UI (backend-only). Kiểm prod-sau-deploy: ingest lại đơn Payoo bất kỳ → cục lịch sử còn đơn NULL trong dải sẽ tự fill (đối chiếu tab "Ngày tiền về").
### Build/verify
- [x] `cd backend && python -m pytest tests/test_payoo_funded_date.py tests/test_tien_ve_map.py tests/test_gateway_routes.py -q` → **54 passed**
- [ ] `tsc -b`: N/A (không đụng FE)

## 7. Rollback
Revert 3 hunk (sepay_routes driver + gateway_routes call site + tests). Không migration, không schema change, không infra. Reset sandbox nếu đã deploy: theo `feedback_git_sandbox_disposable_workflow`.

## 8. Definition of Done
- [x] Tất cả G1–G8 còn giữ (đối chiếu mục 3, mỗi G có test canh)
- [x] Test mục 6 xanh, có test regression bug gốc (T-order-synced-after-settlement)
- [x] `tsc -b`: N/A (backend-only)
- [ ] Verify hành vi thật trên sandbox: ingest đơn Payoo → funded_date tự điền (chưa chạy sandbox — chờ user duyệt deploy)
- [ ] Learning note `payoo-funded-date-retry-on-ingest.md` (đã tạo)

## STOP conditions (dừng & hỏi user)
- Code thực tế lệch "Hiện trạng" mục 4 (đặc biệt lõi `_try_fill_payoo_funded_date` đã đổi chữ ký).
- Test đỏ không rõ nguyên nhân.
- Buộc phải nới guard G1 để làm xong.
- Phát sinh nhu cầu worker/cron (scope ngoài plan) — hỏi trước khi thêm infra.
- Đụng tới 3 dòng prod đã vá tay (sepay_id 85273153).
