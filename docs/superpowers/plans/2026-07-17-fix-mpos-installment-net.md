# Fix mPOS Installment Net (thực nhận trả góp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa parser mPOS để "thực nhận (sau phí)" của giao dịch trả góp trừ đủ CẢ 2 phí (MDR + phí trả góp), và backfill 8 dòng prod đang sai.

**Architecture:** Bug ở `backend/mpos_import.py`: (1) đọc phí trả góp từ cột `"Phí trả góp"` (mPOS để rỗng) thay vì `"Phí TG hiện tại"` (giá trị thật); (2) tin cột `"Số tiền thực nhận"` của mPOS — cột này chỉ trừ MDR. Fix: đọc đúng cột phí, và với trả góp thì tự tính `net = số tiền − MDR − phí trả góp`. Backfill dữ liệu cũ bằng SQL idempotent recompute từ `raw`.

**Tech Stack:** Python (pandas parser), pytest, Supabase Postgres (prod `jozcvbbypwvzaefteoxn`), Render (BE deploy thủ công).

---

## Bối cảnh & bằng chứng (đã điều tra 2026-07-17)

Giao dịch mẫu `MPL_MP13691506` (NGUYEN LE ANH TRAM), raw từ export chi tiết mPOS:

```
"Số tiền":            "10,028,000"
"Phí giao dịch":      "250,700"      ← MDR (parser ĐANG đọc đúng)
"Phí trả góp":        null           ← parser đọc cột này → 0 (SAI)
"Phí TG hiện tại":    "250,700"      ← phí trả góp THẬT (parser bỏ qua)
"Số tiền thực nhận":  "9,777,300"    ← chỉ trừ MDR (parser ĐANG lưu — SAI)
"Số tiền thực nhận.1":"9,526,600"    ← TRAP: tổng lũy kế phiếu chi, KHÔNG phải net từng GD
```

`_first()` (mpos_import.py:202) trả cột **đầu tiên tồn tại** kể cả null → `"Phí trả góp"` rỗng nuốt mất `"Phí TG hiện tại"`.

**Phạm vi ảnh hưởng (query prod):** đúng **8/8 giao dịch trả góp mPOS** (25/06–16/07) đều sai; mỗi cái net bị thổi lên **đúng bằng phí trả góp**. Tổng chênh ~**4.036.610 đ**. 1 dòng đã `matched` (Le Thi Thanh Huyen).

**Đã loại trừ:** Payoo (5 GD, 0 trả góp), quẹt thẻ thường (39 GD, `Phí TG hiện tại`=0), settlement (đã cộng đủ phí). Không nguồn nào khác dính.

**Trap đã xác nhận:** cột `"Số tiền thực nhận.1"` KHÔNG dùng được — 3 GD khác nhau cùng trả `59.302.950` (tổng lũy kế phiếu chi). Fix phải **tự tính**, không lấy cột đó.

---

## File Structure

| File | Trách nhiệm | Thao tác |
|------|-------------|----------|
| `backend/mpos_import.py` | Parser detail — alias phí + logic net | Modify (2 chỗ: alias line ~44, net line ~283-285) |
| `backend/tests/test_mpos_import.py` | Regression test net trả góp | Modify (thêm class `TestInstallmentNet`) |
| `docs/migrations/2026-07-17-backfill-mpos-installment-net.sql` | Backfill 8 dòng prod + query giám sát | Create |

**Không đụng:** `fee` (không hiển thị ở đâu, matching dùng gross; đổi sẽ risk double-count với field `installment_fee` riêng). FE không đổi (chỉ hiển thị `net_amount`, tự đúng sau backfill). Không thêm bảng/endpoint/cron → **zero infra burden**.

---

## Tiêu chí đánh giá (4 criteria)

1. **Triệt để:** sửa đúng gốc (cột phí sai + logic net sai), phủ 100% dòng dính (8/8) qua backfill, chặn tái diễn bằng parser fix + regression test. Payoo/settlement đã kiểm, không dính.
2. **Không lỗi con:** đổi alias an toàn (39 GD non-install có `Phí TG hiện tại`=0, đã verify); logic net mới chỉ nhánh `is_installment`, non-install giữ nguyên `explicit_net`; `fee` không đụng → không double-count; matching dùng gross → ghép cũ không vỡ. Có test cho cả 3 nhánh.
3. **Không tăng gánh hạ tầng / giảm hiệu năng:** parser cùng chi phí; backfill 1 lần 8 dòng; query giám sát chạy tay. Không bảng/endpoint/job mới.
4. **Tiết kiệm quota:** fix gọn 2 dòng code + 1 SQL, không fan-out subagent.

---

## Task 1: Regression test cho net trả góp (TDD — viết test trước)

**Files:**
- Test: `backend/tests/test_mpos_import.py` (thêm class mới ở cuối, trước dòng cuối file)

- [ ] **Step 1: Viết failing test**

Thêm vào cuối `backend/tests/test_mpos_import.py`:

```python
class TestInstallmentNet:
    """Regression: net trả góp phải trừ CẢ 2 phí — MDR + phí trả góp (bug 2026-07-17).

    Dùng pd.Series tự dựng (không phụ thuộc transaction.xls) để test deterministic.
    """

    def _row(self, **overrides):
        import pandas as pd

        base = {
            "Ngày khởi tạo": "2026-07-16T10:51:43",
            "Số giao dịch": "MPL_MP13691506",
            "Chi tiết giao dịch": "MPL_MP13691506",
            "Trạng thái giao dịch": "Đã thanh toán",
            "TK thanh toán": "palfish35lvt",
            "Số tiền": "10,028,000",
            "Phí giao dịch": "250,700",
            "Phí trả góp": None,          # mPOS để rỗng
            "Phí TG hiện tại": "250,700", # phí trả góp thật
            "Số tiền thực nhận": "9,777,300",  # mPOS chỉ trừ MDR
            "Kỳ hạn": "3",
        }
        base.update(overrides)
        return pd.Series(base)

    def test_installment_net_subtracts_both_fees(self):
        from mpos_import import _mpos_transaction_from_row

        rec = _mpos_transaction_from_row(self._row(), 0)
        assert rec["is_installment"] is True
        assert rec["installment_fee"] == 250_700
        # 10.028.000 − 250.700 (MDR) − 250.700 (trả góp) = 9.526.600
        assert rec["net_amount"] == 9_526_600

    def test_installment_ignores_cumulative_dup_column(self):
        """Cột trùng tên '.1' (tổng lũy kế phiếu chi) KHÔNG được dùng làm net."""
        from mpos_import import _mpos_transaction_from_row

        row = self._row(**{"Số tiền thực nhận.1": "59,302,950"})
        rec = _mpos_transaction_from_row(row, 0)
        assert rec["net_amount"] == 9_526_600

    def test_normal_swipe_keeps_mpos_explicit_net(self):
        """Quẹt thẻ thường (1 phí): giữ nguyên 'Số tiền thực nhận' của mPOS."""
        from mpos_import import _mpos_transaction_from_row

        row = self._row(**{
            "Kỳ hạn": None,
            "Phí TG hiện tại": "0",
            "Phí trả góp": None,
            "Số tiền": "10,000,000",
            "Phí giao dịch": "250,000",
            "Số tiền thực nhận": "9,750,000",
        })
        rec = _mpos_transaction_from_row(row, 0)
        assert rec["is_installment"] is False
        assert rec["net_amount"] == 9_750_000
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `cd backend && python -m pytest tests/test_mpos_import.py::TestInstallmentNet -v`
Expected: `test_installment_net_subtracts_both_fees` và `test_installment_ignores_cumulative_dup_column` **FAIL** (net_amount = 9_777_300 thay vì 9_526_600); `test_normal_swipe_keeps_mpos_explicit_net` PASS.

- [ ] **Step 3: Commit test**

```bash
git add backend/tests/test_mpos_import.py
git commit -m "test(mpos): regression cho net trả góp trừ đủ 2 phí (bug thực nhận sai)"
```

---

## Task 2: Fix parser — đọc đúng cột phí + tự tính net trả góp

**Files:**
- Modify: `backend/mpos_import.py:44` (alias `installment_fee`)
- Modify: `backend/mpos_import.py:283-285` (logic net)

- [ ] **Step 1: Sửa alias `installment_fee`**

`backend/mpos_import.py` dòng 44, trong `DETAIL_ALIASES`. Đổi:

```python
    "installment_fee": ("Phí trả góp",),
```

thành:

```python
    # mPOS để giá trị phí trả góp THẬT ở "Phí TG hiện tại"; cột "Phí trả góp" thường rỗng.
    # _first() trả cột đầu tiên TỒN TẠI (kể cả null) → "Phí TG hiện tại" phải đứng trước.
    "installment_fee": ("Phí TG hiện tại", "Phí trả góp"),
```

- [ ] **Step 2: Sửa logic net**

`backend/mpos_import.py` dòng 283-285. Đổi:

```python
    is_installment = bool(term or installment_fee > 0)
    category = "Trả góp" if is_installment else "Quẹt thẻ"
    net_amount = explicit_net if explicit_net else amount - fee - installment_fee
```

thành:

```python
    is_installment = bool(term or installment_fee > 0)
    category = "Trả góp" if is_installment else "Quẹt thẻ"
    # Trả góp có 2 phí: "Phí giao dịch" (MDR) + "Phí TG hiện tại" (phí trả góp).
    # mPOS's "Số tiền thực nhận" (col-1) CHỈ trừ MDR → cao hơn thực nhận thật.
    # Cột trùng tên ".1" là TỔNG LŨY KẾ phiếu chi (không phải net từng GD) — KHÔNG dùng.
    # → Trả góp: luôn tự tính. Quẹt thẻ thường: giữ "Số tiền thực nhận" của mPOS.
    computed_net = amount - fee - installment_fee
    net_amount = computed_net if is_installment else (explicit_net if explicit_net else computed_net)
```

- [ ] **Step 3: Chạy test mới — phải PASS**

Run: `cd backend && python -m pytest tests/test_mpos_import.py::TestInstallmentNet -v`
Expected: cả 3 test **PASS**.

- [ ] **Step 4: Chạy full suite parser — không regress**

Run: `cd backend && python -m pytest tests/test_mpos_import.py tests/test_mpos_payoo_parser_edges.py tests/test_gateway_routes.py -v 2>&1 | grep -E "PASSED|FAILED|ERROR|passed|failed"`
Expected: tất cả PASS. **Checkpoint quan trọng:** `TestParseTransactions` phải giữ nguyên `installment_count == 6`, `total_rows == 67`, `settled_count == 63`, `reversed_count == 4`. Nếu `installment_count` đổi → DỪNG, điều tra (nghĩa là file mẫu có dòng `Phí TG hiện tại`>0 mà không có `Kỳ hạn`, cần xem lại giả định phân loại).

- [ ] **Step 5: Commit fix**

```bash
git add backend/mpos_import.py
git commit -m "fix(mpos): net trả góp trừ đủ MDR + phí trả góp (đọc cột Phí TG hiện tại, tự tính net)"
```

---

## Task 3: Backfill 8 dòng prod đang sai

**Files:**
- Create: `docs/migrations/2026-07-17-backfill-mpos-installment-net.sql`

- [ ] **Step 1: Viết script backfill (idempotent, có preview + verify)**

Tạo `docs/migrations/2026-07-17-backfill-mpos-installment-net.sql`:

```sql
-- Backfill: sửa net_amount cho GD trả góp mPOS bị thiếu trừ phí trả góp (bug 2026-07-17).
-- Nguồn chân lý: raw JSON ("Phí giao dịch" + "Phí TG hiện tại"). Recompute, KHÔNG dùng cột ".1".
-- An toàn: idempotent (WHERE net <> computed → chạy lại lần 2 là no-op).
-- Phạm vi: chỉ source='mpos' AND category='Trả góp' (8 dòng).
-- Chạy trên PROD (jozcvbbypwvzaefteoxn). Xem preview trước; chạy trong transaction.

-- Helper: parse chuỗi tiền "250,700" hoặc "250.700" → numeric.
--   replace bỏ mọi ',' và '.' (cả 2 đều là dấu phân nhóm nghìn ở đây).

-- 1. PREVIEW — các dòng sẽ đổi (net cũ → net mới). Kiểm bằng mắt trước khi UPDATE.
SELECT txn_code, cardholder_name, paid_at::date, amount,
       net_amount AS net_cu,
       amount
         - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
         - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric AS net_moi,
       net_amount - (amount
         - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
         - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric) AS giam_di,
       match_status
FROM gateway_transactions
WHERE source = 'mpos' AND category = 'Trả góp'
  AND net_amount <> (amount
       - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
       - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric)
ORDER BY paid_at;

-- 2. UPDATE (chạy trong transaction).
BEGIN;

UPDATE gateway_transactions
SET net_amount = amount
      - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
      - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric
WHERE source = 'mpos' AND category = 'Trả góp'
  AND net_amount <> (amount
      - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
      - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric);
-- Kỳ vọng: UPDATE 8

-- 3. VERIFY — phải trả 0.
SELECT count(*) AS con_sai
FROM gateway_transactions
WHERE source = 'mpos' AND category = 'Trả góp'
  AND net_amount <> (amount
      - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
      - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric);

COMMIT;  -- Nếu con_sai <> 0 hoặc UPDATE khác 8 → ROLLBACK và báo lại.

-- ─────────────────────────────────────────────────────────────
-- GUARDRAIL (query giám sát, chạy tay định kỳ / sau mỗi lần import):
-- Trả > 0 nghĩa là parser lại đang lưu net trả góp sai → điều tra.
-- SELECT count(*) FROM gateway_transactions
-- WHERE source='mpos' AND category='Trả góp'
--   AND net_amount <> (amount
--     - replace(replace((raw->>'Phí giao dịch'),',',''),'.','')::numeric
--     - replace(replace((raw->>'Phí TG hiện tại'),',',''),'.','')::numeric);
```

- [ ] **Step 2: Chạy PREVIEW (mục 1) trên prod**

Chạy riêng phần SELECT preview (qua Supabase MCP / SQL editor). Xác nhận:
- Đúng **8 dòng**.
- `net_moi` < `net_cu`, `giam_di` = phí trả góp mỗi dòng.
- `NGUYEN LE ANH TRAM`: net_moi = **9.526.600**.
Nếu số dòng ≠ 8 hoặc net_moi vô lý → DỪNG, báo lại. Không chạy UPDATE.

- [ ] **Step 3: Chạy UPDATE + VERIFY (mục 2+3) trong transaction**

Kỳ vọng: `UPDATE 8`, `con_sai = 0` → `COMMIT`. Nếu khác → `ROLLBACK`.

- [ ] **Step 4: Commit script**

```bash
git add docs/migrations/2026-07-17-backfill-mpos-installment-net.sql
git commit -m "chore(migration): backfill net trả góp mPOS 8 dòng (thiếu phí trả góp)"
```

---

## Task 4: Deploy & xác minh cuối

- [ ] **Step 1: Deploy BE parser (auto-deploy OFF — deploy tay)**

Deploy sandbox trước rồi prod:
```bash
bash scripts/deploy.sh sandbox
# smoke test trên sandbox nếu có GD trả góp mẫu, rồi:
bash scripts/deploy.sh prod
```
(Hook trong file gitignored — xem memory [Render deploy hook].)

- [ ] **Step 2: Thứ tự an toàn**

Deploy parser (Task 4.1) **trước hoặc sau** backfill (Task 3) đều được vì import lại dùng `ON CONFLICT (txn_code) DO NOTHING` — không ghi đè dòng đã backfill. Khuyến nghị: **parser trước** (chặn dòng mới bị sai), **backfill sau**.

- [ ] **Step 3: Xác minh dữ liệu**

Chạy query GUARDRAIL (cuối file SQL) trên prod → phải trả **0**.
Kiểm lại `MPL_MP13691506` net_amount = 9.526.600.

- [ ] **Step 4: Việc kế toán (thủ công, ngoài app)**

- Dòng đã `matched` (Le Thi Thanh Huyen): ghép vẫn đúng (số gốc không đổi), nhưng nếu kế toán đã nhập "Thực nhận về công ty" của PR đó bằng số cũ (cao hơn) → soát lại field đó trong PR.
- Nếu 8 GD này đã được copy số "thực nhận" ra sổ ngoài / đối chiếu sao kê → cập nhật theo số mới (tổng giảm ~4.03tr).

- [ ] **Step 5: Extract learning**

Sau khi xong, chạy skill `extract-approach` → ghi note vào `docs/learnings/` (Problem: net trả góp mPOS sai / Trap: cột `Phí trả góp` rỗng + cột `.1` là tổng lũy kế / Rule: phí trả góp đọc `Phí TG hiện tại`, trả góp tự tính net). Cập nhật skill `mpos-payoo-reconciliation` mục Gotchas.

---

## Rollback

- **Code:** `git revert` commit Task 2. Parser trở lại hành vi cũ (net trả góp lại thổi lên) — chỉ ảnh hưởng import mới, dữ liệu backfill vẫn đúng.
- **Data:** backfill chỉ GIẢM net đúng bằng phí trả góp. Muốn hoàn tác: cộng lại phí trả góp — nhưng không nên (số cũ sai). Nếu bắt buộc, khôi phục từ `raw->>'Số tiền thực nhận'` (giá trị cũ mPOS): `net_amount = replace(replace(raw->>'Số tiền thực nhận',',',''),'.','')::numeric`.

---

## Self-Review

- **Spec coverage:** parser fix (Task 2) ✓, regression test (Task 1) ✓, backfill 8 dòng (Task 3) ✓, deploy + verify + accountant + learning (Task 4) ✓.
- **Placeholder scan:** không có TBD; mọi code/SQL/command đầy đủ.
- **Type consistency:** `_mpos_transaction_from_row`, `installment_fee`, `net_amount`, `DETAIL_ALIASES` khớp giữa test và fix; SQL parse `replace(replace(...,',',''),'.','')::numeric` dùng nhất quán ở preview/update/verify/guardrail.
- **Rủi ro còn lại đã nêu:** checkpoint `installment_count==6` ở Task 2.4 (bắt trường hợp file mẫu có `Phí TG hiện tại`>0 không kèm `Kỳ hạn`).
