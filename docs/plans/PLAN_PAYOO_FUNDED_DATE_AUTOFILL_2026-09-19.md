# PLAN: Auto-fill Payoo funded_date từ SePay settlement — 2026-09-19

> **ĐỌC TRƯỚC KHI LÀM** (dành cho agent thực thi, kể cả sau compaction / agent mới):
> - Mở lại: `backend/sepay_routes.py:564` (`_process_sepay_transaction`), `backend/report_routes.py:536` (`_load_bc04_card_rows`), `backend/report_routes.py:581` (`_load_bc04_bank_rows`), `backend/activation_routes.py:552` (`_tien_ve_map`).
> - VERIFY snippet "Hiện trạng" (mục 4) khớp code thật TRƯỚC khi sửa.
> - Invariant top KHÔNG được phá:
>   1. `funded_date` = `timestamp without time zone` (giờ VN naive), KHÔNG convert timezone — sai = off-by-one-day.
>   2. BC04 tổng tiền KHÔNG được đếm 2 lần (gateway per-đơn + bank settlement cùng cục = double-count).
>   3. `_tien_ve_map` chỉ đọc `funded_date` từ gateway_transactions — đã tự hoạt động đúng khi funded_date có giá trị, KHÔNG cần sửa.
> - Gặp STOP condition (mục cuối) → DỪNG, hỏi user, KHÔNG tự quyết.

## 1. Vấn đề & bằng chứng

- **Triệu chứng**: Kế toán (chị Sương Mai) báo BC04 có đơn Payoo 18.422.580đ ngày 18/09, nhưng B3 (Tạo gói học) lọc theo "tiền về" không thấy đơn. Pattern lặp lại với mọi đơn Payoo.
- **Root cause** (đã xác minh): Payoo gateway_transactions có `funded_date=NULL` (17/17 = 100%). `_tien_ve_map()` đọc `funded_date` → NULL → AR không có ngày tiền về → bị loại khỏi filter B3.
  - mPOS có đủ funded_date 168/168 (từ settlement report "Ngày nhận tiền" per-txn).
  - Payoo KHÔNG cung cấp ngày tiền về per-giao dịch ở bất kỳ đâu trên portal (đã soi 4 tab — xem learning `2026-09-15-payoo-no-funded-date-source.md`).
  - Ngày tiền về Payoo chỉ tồn tại ở **sao kê SePay** (bank_transactions) — dòng "Payoo CT DS N..." match_status=ignored.
- **Bằng chứng DB** (prod `jozcvbbypwvzaefteoxn`):
  - `SELECT source, count(*)-count(funded_date) FROM gateway_transactions GROUP BY source;` → payoo=17 null / mpos=0 null
  - Đơn cụ thể: gateway `a8db6872`, gross=18.820.000, net=18.422.580, PR-2026-1785, AR-2026-1025 "Chờ tạo gói học"
  - Bank settlement: content "Payoo CT DS...", amount=18.422.580, sepay_id có, match_status=ignored, payment_line_id=NULL
  - 3 Payoo settlements tháng 9 đều 1-to-1 (1 bank txn = 1 gateway txn, net_amount = bank_amount)

## 2. Approach chọn + 5-criteria

**Approach: Auto-fill funded_date từ SePay bank settlement + BC04 dedup**

Khi SePay webhook nhận Payoo settlement → match gateway_transactions by net_amount → fill funded_date + settlement_code. Mở rộng BC04 dedup cho Payoo (hiện chỉ dedup mPOS via PC).

```
TC1 Triệt để:      ✅ Gán funded_date từ nguồn chính xác (sao kê bank), B3 tự hiện đúng (không cần sửa _tien_ve_map)
TC2 Không lỗi con:  ✅ Xử lý BC04 dedup cùng lúc, tránh double-count. _tien_ve_map đọc funded_date → tự đúng. Doanh thu/Sổ/BC01-03 KHÔNG đụng.
TC3 Hạ tầng/perf:   ✅ Thêm 1 query nhỏ (1-2 rows) trong webhook handler đã có. Không thêm cron/worker/storage.
TC4 Token economy:  ✅ 4 task, 3 Sonnet + 1 inline backfill SQL. Không subagent thừa.
TC5 Task-model:     ✅ Single-file logic rõ ràng → Sonnet đủ. Backfill = SQL thuần.
→ Recommend (5/5)
```

Đã loại:
- **Approach A (kế toán stamp thủ công)**: Chính xác nhưng tăng gánh nặng kế toán mỗi đơn Payoo — fail TC1 (không triệt để, vẫn manual).
- **Approach C (sửa _tien_ve_map fallback thêm bank)**: Phức tạp, thay đổi logic B3 core — rủi ro TC2.

## 3. GUARDRAILS — invariant PHẢI GIỮ

| # | Quy tắc không được phá | Nguồn | Cách kiểm |
|---|------------------------|-------|-----------|
| G1 | `funded_date` = `timestamp without time zone` (VN naive), KHÔNG convert tz | `timestamp-vs-date-funded-date-gateway.md` | `SELECT data_type FROM information_schema.columns WHERE table_name='gateway_transactions' AND column_name='funded_date'` = `timestamp without time zone` |
| G2 | BC04 tổng tiền KHÔNG double-count (gateway per-đơn + bank settlement cùng cục) | `report_routes.py:606` dedup logic | Test unit: cùng kỳ có Payoo card row + bank settlement → bank settlement bị loại |
| G3 | `_tien_ve_map` KHÔNG cần sửa — chỉ đọc funded_date, tự đúng khi có giá trị | `2026-09-04-b3-tien-ve-funded-not-quet.md` | Không sửa file `activation_routes.py` |
| G4 | Doanh thu (Sổ/BC01/BC02/BC03) vẫn dùng ngày quẹt, KHÔNG đụng | `2026-09-04-b3-tien-ve-funded-not-quet.md` Insight | Không sửa `revenue_routes.py` |
| G5 | Chỉ fill funded_date khi match 100% chắc chắn (net_amount = bank_amount exactly) — nếu không match → skip, log | Nguyên tắc | Test: amount lệch → không fill |
| G6 | Match Payoo specifically, KHÔNG match mPOS settlement (mPOS đã có funded_date từ report) | `_PAYOO_SETTLE_SIGNALS` vs `_MPOS_SETTLE_SIGNALS` | Test: mPOS content → không trigger fill |

## 4. Hiện trạng (ground truth snapshot)

### `backend/sepay_routes.py:604` — Payoo settlement → ignored, không xử lý thêm
```python
    if _is_mpos_settlement(content):
        match_status = "ignored"
    else:
        match_result = _match_transfer_code_in_content(sb, content, amount)
        ...
```
Sau INSERT (line 648-654), trả về. Không có logic fill funded_date.

### `backend/sepay_routes.py:60-63` — Payoo detection signals
```python
_PAYOO_SETTLE_SIGNALS: list[re.Pattern] = [
    re.compile(r"PAYOO\s*CT\s*DS", re.IGNORECASE),
    re.compile(r"PALFISH\s*EC|TK\s*\.?\s*ECOM|TKECOM|PY3", re.IGNORECASE),
]
```

### `backend/report_routes.py:548` — BC04 settlement_codes set
```python
settlement_codes = {str(t.get("settlement_code")) for t in txns if t.get("settlement_code")}
```

### `backend/report_routes.py:605-607` — BC04 dedup (chỉ PC, chưa xử lý Payoo)
```python
pc = extract_settlement_code(content)
if pc and pc in known_settlement_codes:
    continue  # đã tách per-đơn ở gateway — bỏ cục, tránh đếm 2 lần
```
Payoo content không có PC → `extract_settlement_code` trả None → không bao giờ dedup.

### `backend/activation_routes.py:609-624` — _tien_ve_map card branch
```python
card_line_ids = [lid for lid, (_, m) in line_meta.items() if m in CREDIT_METHODS]
...
res = sb.table("gateway_transactions").select("payment_line_id, funded_date")
    .in_("payment_line_id", card_line_ids[i : i + CHUNK])
    .eq("match_status", "matched").execute()
...
d = _funded_vn_date(r.get("funded_date"))
if lid in line_meta and d:
    date_by_pr.setdefault(line_meta[lid][0], []).append(d)
```
Đọc funded_date → NULL cho Payoo → không đóng góp ngày → AR uncovered → fallback Sổ (cũng trống nếu chưa tạo gói).

## 5. Tasks (nguyên tử, có checklist tiến độ)

- [ ] **T1 — Thêm hàm `_try_fill_payoo_funded_date()` trong sepay_routes.py**
  - File: `backend/sepay_routes.py` (sau `_process_sepay_transaction`, ~line 717)
  - Thêm hàm mới:
    ```python
    def _is_payoo_settlement(content: str) -> bool:
        """Payoo settlement specifically (not mPOS)."""
        return all(p.search(content) for p in _PAYOO_SETTLE_SIGNALS)

    def _try_fill_payoo_funded_date(sb, bank_amount: float, bank_txn_date: datetime, bank_sepay_id: str) -> int:
        """Tìm Payoo gateway_transactions chưa có funded_date, net_amount = bank_amount.
        Nếu match exactly 1 → fill funded_date + settlement_code. Trả số rows đã fill."""
    ```
    Logic:
    1. Query `gateway_transactions` WHERE `source='payoo'` AND `funded_date IS NULL` AND `net_amount = bank_amount`
    2. Nếu kết quả != 1 row → return 0 (skip, log nếu >1)
    3. Nếu đúng 1 row → UPDATE `funded_date = bank_txn_date` (VN naive, KHÔNG tz), `settlement_code = f"PAYOO-{bank_sepay_id}"`
    4. Return 1
    - **funded_date format**: `bank_txn_date` đã là VN local datetime (SePay trả giờ VN). Cần strip tzinfo rồi gán (vì cột là `timestamp without time zone`). Dùng `.replace(tzinfo=None).isoformat()`.
  - Vì sao: Gốc fix — gán funded_date cho Payoo gateway_transactions
  - Guardrail: G1 (VN naive, no tz), G5 (exact match only), G6 (Payoo only)
  - Verify: Unit test (T3)
  - Ai làm: cavecrew-builder · Sonnet

- [ ] **T2 — Gọi `_try_fill_payoo_funded_date` trong `_process_sepay_transaction`**
  - File: `backend/sepay_routes.py:604` (block `if _is_mpos_settlement(content)`)
  - Đổi:
    ```python
    # TRƯỚC:
    if _is_mpos_settlement(content):
        match_status = "ignored"

    # SAU:
    if _is_mpos_settlement(content):
        match_status = "ignored"
        # Payoo settlement: try fill funded_date on matching gateway_transactions
        if is_new and _is_payoo_settlement(content) and txn_date:
            try:
                filled = _try_fill_payoo_funded_date(sb, amount, txn_date, sepay_id)
                if filled:
                    print(f"[sepay] Payoo settlement {sepay_id}: filled funded_date for {filled} gateway txn(s)")
            except Exception as exc:
                print(f"[sepay] Payoo funded_date fill failed (non-blocking): {exc}")
    ```
    Lưu ý: gọi SAU INSERT bank_transaction (line 648-654) để đảm bảo bank row tồn tại. Cần di chuyển block này xuống sau INSERT, nằm trước return (line 711). Hoặc thêm ở khu vực post-INSERT (line 662+).
  - Vì sao: Hook vào luồng webhook, best-effort (không fail webhook nếu fill lỗi)
  - Guardrail: G6 (chỉ Payoo, `_is_payoo_settlement` tách riêng mPOS)
  - Verify: Unit test (T3)
  - Ai làm: cavecrew-builder · Sonnet (cùng T1, sửa 1 file)

- [ ] **T3 — Unit tests cho T1+T2 + BC04 dedup**
  - File: `backend/tests/test_payoo_funded_date.py` (mới)
  - Cases:
    1. **Happy path**: Payoo settlement 18.422.580, 1 gateway txn net=18.422.580 funded_date=NULL → funded_date filled, settlement_code set
    2. **G5 — amount mismatch**: bank=18.000.000, gateway net=18.422.580 → không fill
    3. **G5 — nhiều gateway match**: 2 gateway txns cùng net_amount → không fill (ambiguous)
    4. **G6 — mPOS settlement**: content mPOS → không trigger fill
    5. **G1 — timezone**: funded_date stored as VN naive (no tzinfo)
    6. **G2 — BC04 dedup**: gateway có settlement_code="PAYOO-{sepay_id}" + bank Payoo cùng sepay_id → bank row bị loại khỏi BC04
    7. **Regression bug gốc**: Payoo gateway funded_date=NULL → B3 filter "tiền về" ngày X không thấy AR; sau fill → thấy
  - Verify: `cd backend && python -m pytest tests/test_payoo_funded_date.py -v`
  - Ai làm: cavecrew-builder · Sonnet

- [ ] **T4 — Mở rộng BC04 dedup cho Payoo**
  - File: `backend/report_routes.py:605-607`
  - Đổi:
    ```python
    # TRƯỚC:
    pc = extract_settlement_code(content)
    if pc and pc in known_settlement_codes:
        continue

    # SAU:
    pc = extract_settlement_code(content)
    if pc and pc in known_settlement_codes:
        continue
    # Payoo settlement dedup: gateway_transactions có settlement_code="PAYOO-{sepay_id}"
    # → bank settlement row với cùng sepay_id đã được tách per-đơn
    if _is_payoo_bank_dedup(r, known_settlement_codes):
        continue
    ```
    Hàm helper `_is_payoo_bank_dedup(bank_row, codes)`:
    ```python
    def _is_payoo_bank_dedup(bank_row: dict, known_settlement_codes: set[str]) -> bool:
        """Payoo settlement đã tách per-đơn (gateway có settlement_code PAYOO-xxx)."""
        content = bank_row.get("content") or bank_row.get("transfer_content") or ""
        if not all(p.search(content) for p in _PAYOO_SETTLE_SIGNALS):
            return False
        sepay_id = str(bank_row.get("sepay_id") or "")
        return bool(sepay_id) and f"PAYOO-{sepay_id}" in known_settlement_codes
    ```
    Import `_PAYOO_SETTLE_SIGNALS` từ `sepay_routes` (hoặc dùng `_is_payoo_settlement` nếu export).
  - Vì sao: Chống double-count BC04 khi Payoo có funded_date (G2)
  - Guardrail: G2
  - Verify: Test T3 case 6
  - Ai làm: cavecrew-builder · Sonnet

- [ ] **T5 — Backfill SQL: fill funded_date cho 17 Payoo gateway_transactions hiện có**
  - Chạy trên prod (sau khi code T1-T4 deployed):
    ```sql
    -- Dry run: liệt kê matches
    WITH payoo_settle AS (
      SELECT id, sepay_id, amount, transaction_date,
             content
      FROM bank_transactions
      WHERE content ILIKE '%payoo%ct%ds%'
        AND amount > 0
    ),
    matches AS (
      SELECT g.id AS gateway_id, g.net_amount, g.source,
             ps.sepay_id, ps.transaction_date AS bank_date,
             ps.amount AS bank_amount
      FROM gateway_transactions g
      JOIN payoo_settle ps ON g.net_amount = ps.amount
      WHERE g.source = 'payoo'
        AND g.funded_date IS NULL
    )
    SELECT * FROM matches;

    -- Execute (sau khi verify dry run):
    WITH payoo_settle AS (
      SELECT sepay_id, amount,
             (transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::timestamp AS funded_vn
      FROM bank_transactions
      WHERE content ILIKE '%payoo%ct%ds%'
        AND amount > 0
    )
    UPDATE gateway_transactions g
    SET funded_date = ps.funded_vn,
        settlement_code = 'PAYOO-' || ps.sepay_id,
        updated_at = NOW()
    FROM payoo_settle ps
    WHERE g.source = 'payoo'
      AND g.funded_date IS NULL
      AND g.net_amount = ps.amount;
    ```
    Lưu ý: `AT TIME ZONE 'Asia/Ho_Chi_Minh'` chuyển timestamptz → timestamp (VN naive) — đúng G1.
  - Vì sao: 17 Payoo gateway_transactions hiện có cần funded_date
  - Guardrail: G1 (VN naive), G5 (exact amount match)
  - Verify: `SELECT source, count(*)-count(funded_date) FROM gateway_transactions WHERE source='payoo' GROUP BY source;` → 0 null (hoặc chỉ những cái multi-txn không match 1-1)
  - Ai làm: Minh chạy tay / inline SQL

## 6. Test plan

### Unit (mỗi guardrail 1 case regression)
- [ ] `test_payoo_funded_date.py::test_happy_path_1to1_match` — gateway net=bank_amount → fill funded_date + settlement_code
- [ ] `test_payoo_funded_date.py::test_amount_mismatch_no_fill` — G5: amount lệch → không fill
- [ ] `test_payoo_funded_date.py::test_multiple_matches_no_fill` — G5: >1 match → skip
- [ ] `test_payoo_funded_date.py::test_mpos_settlement_no_trigger` — G6: mPOS content → không chạy fill
- [ ] `test_payoo_funded_date.py::test_funded_date_vn_naive` — G1: stored datetime has no tzinfo
- [ ] `test_payoo_funded_date.py::test_bc04_dedup_payoo` — G2: Payoo card + bank settlement cùng kỳ → bank bị loại
- [ ] `test_payoo_funded_date.py::test_regression_b3_filter` — Payoo funded=NULL → B3 miss; sau fill → B3 hit

### Build/verify
- [ ] `cd frontend && npx tsc -b` xanh (FE không sửa → verify không regression)
- [ ] `cd backend && python -m pytest tests/ -v` xanh

## 7. Rollback

- Revert commit (single squash commit dự kiến).
- Backfill: `UPDATE gateway_transactions SET funded_date = NULL, settlement_code = NULL WHERE settlement_code LIKE 'PAYOO-%';`
- Không migration schema (không thêm cột mới). Không feature flag cần thiết (fill là best-effort, skip = giữ hành vi cũ).

## 8. Definition of Done

- [ ] Tất cả G1-G6 còn giữ (đối chiếu mục 3)
- [ ] Test mục 6 xanh, có test regression bug gốc (B3 filter)
- [ ] `tsc -b` pass
- [ ] Verify hành vi thật: B3 lọc "tiền về muộn nhất" = 18/09 → hiện AR-2026-1025 (sau backfill prod)
- [ ] BC04 18/09 tổng tiền KHÔNG tăng (Payoo card row thay thế bank settlement row, cùng số tiền)

## STOP conditions (dừng & hỏi user)

- Code thực tế lệch "Hiện trạng" mục 4.
- Test đỏ không rõ nguyên nhân.
- Buộc phải đụng `activation_routes.py` hoặc `revenue_routes.py` để làm xong (vi phạm G3/G4).
- Payoo settlement KHÔNG 1-to-1 (multi-txn lump) xuất hiện trong backfill dry run → cần thuật toán match phức tạp hơn, hỏi user.
- `_PAYOO_SETTLE_SIGNALS` import vào `report_routes.py` gây circular import → cần refactor, hỏi trước.
