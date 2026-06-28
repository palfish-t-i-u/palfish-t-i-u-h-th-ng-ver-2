# PR Stale Transfer Content Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau khi sale PATCH thông tin PR (name / phone / childName / country), drawer tự phát hiện các lần thanh toán PENDING có nội dung chuyển khoản (`transfer_content`) bị stale và hiện warning vàng + nút **"Cập nhật QR"** để sale chủ động rebuild content. KHÔNG auto-rebuild — tôn trọng lựa chọn `name_for_transfer` của sale.

**Architecture:**
- BE: thêm cột `name_for_transfer` vào `payment_lines` để lưu lựa chọn của sale lúc tạo line; helper `_is_payment_line_content_stale` so sánh stored content vs expected; serializer expose `is_content_stale`; endpoint `POST /api/v1/payment-lines/{line_id}/refresh-content` để rebuild.
- FE: thêm `isContentStale` vào `PaymentAttempt`; component `PrStaleContentWarning` render banner vàng + 2 nút (Cập nhật QR / Huỷ); drawer maintain `dismissedLineIds` session-state (sticky — hiện lại khi reopen drawer).
- Stale detection (BE): rebuild expected content theo PR row hiện tại + `line.name_for_transfer` (hoặc default `childName || name` nếu NULL) → so sánh với `line.transfer_content`. Khác → stale.

**Tech Stack:** Python 3 / FastAPI + Supabase (Postgres) + React 19 + Vite + TypeScript + Vitest + pytest

---

## Pre-flight checklist

- [ ] **Pre-1: Đứng đúng branch**

Run:
```bash
git checkout main && git pull origin main
git checkout -b feat/pr-stale-content-warning
```
Expected: Switched to a new branch `feat/pr-stale-content-warning`.

- [ ] **Pre-2: Xác nhận test infra đang xanh**

Run:
```bash
cd backend && python -m pytest tests/test_payos_transfer.py -q
cd ../frontend && npx vitest run --reporter=basic
cd ..
```
Expected:
- pytest: all pass (cụ thể `test_payos_transfer.py` ~13 tests).
- vitest: `PASS (205) FAIL (0)`.

Nếu KHÔNG đạt cả 2 baseline trên, dừng plan, báo user.

---

## Phase 1 — BE: Migration thêm cột `name_for_transfer`

### Task 1: Tạo migration SQL

**Files:**
- Create: `docs/migrations/2026-06-25-name-for-transfer.sql`

- [ ] **Step 1.1: Viết migration file**

Tạo file `docs/migrations/2026-06-25-name-for-transfer.sql` với nội dung CHÍNH XÁC sau:

```sql
-- 2026-06-25: thêm name_for_transfer vào payment_lines
-- Lưu lựa chọn tên (parent / child) sale chọn lúc tạo lần thanh toán,
-- để khi sale PATCH PR sau đó có thể rebuild transfer_content giữ đúng
-- lựa chọn ban đầu.
ALTER TABLE public.payment_lines
  ADD COLUMN IF NOT EXISTS name_for_transfer text;

COMMENT ON COLUMN public.payment_lines.name_for_transfer IS
  'Tên (parent name HOẶC child name) sale chọn lúc tạo line. NULL = chưa biết (line cũ trước migration). Refresh-content endpoint dùng làm input cho _build_payos_transfer_description.';
```

- [ ] **Step 1.2: Apply migration trên Supabase sandbox**

Migration cần apply thủ công qua Supabase dashboard SQL editor. Implementor phải:

1. Copy nội dung file SQL ở Step 1.1.
2. Login Supabase project sandbox `pxgybyfiwywksesyogti` → SQL Editor → paste → Run.
3. Verify cột tồn tại:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name='payment_lines' AND column_name='name_for_transfer';
```
Expected: trả về 1 row `(name_for_transfer, text)`.

Nếu KHÔNG có quyền apply migration sandbox, dừng và báo user.

- [ ] **Step 1.3: Commit migration file**

Run:
```bash
git add docs/migrations/2026-06-25-name-for-transfer.sql
git commit -m "chore(db): thêm migration name_for_transfer column"
```
Expected: 1 file changed, 11 insertions.

---

## Phase 2 — BE: Helper `_is_payment_line_content_stale`

### Task 2: Viết test cho helper

**Files:**
- Create: `backend/tests/test_payment_line_stale_detection.py`

- [ ] **Step 2.1: Tạo test file**

Tạo file `backend/tests/test_payment_line_stale_detection.py` với nội dung CHÍNH XÁC:

```python
"""Stale detection cho transfer_content của payment_lines.

Bối cảnh: sau khi sale PATCH PR (name/phone/childName/country),
content cũ lưu trên line PENDING không còn khớp với PR hiện tại.
Helper _is_payment_line_content_stale phát hiện điều này.
"""
from __future__ import annotations

import payment_request_routes as pr


def _line(**over):
    """Build line dict cho test. Default = PENDING qr line khớp PR fixture."""
    base = {
        "id": "line-1",
        "method": "qr",
        "status": "pending",
        "transfer_code": "FHETL",
        "transfer_content": "84985004656 Nguyen Thi Phuong Linh FHETL",
        "name_for_transfer": "Nguyễn Thị Phương Linh",
    }
    base.update(over)
    return base


def _pr(**over):
    base = {
        "id": "PR-2026-0066",
        "name": "Trần Xuân",
        "child_name": "Nguyễn Thị Phương Linh",
        "phone": "985004656",
        "country": "VN",
    }
    base.update(over)
    return base


class TestStaleDetection:
    def test_not_stale_when_pr_matches_stored_content(self):
        assert pr._is_payment_line_content_stale(_pr(), _line()) is False

    def test_stale_when_pr_phone_changed(self):
        assert pr._is_payment_line_content_stale(
            _pr(phone="906698067"), _line()
        ) is True

    def test_stale_when_pr_child_name_changed(self):
        assert pr._is_payment_line_content_stale(
            _pr(child_name="Tran Hoang Yen Nhi"), _line()
        ) is True

    def test_stale_when_pr_country_changed(self):
        # country đổi từ VN (dial 84) sang SG (dial 65) → phone prefix khác
        assert pr._is_payment_line_content_stale(
            _pr(country="SG"), _line()
        ) is True

    def test_stale_when_pr_name_changed_and_line_used_parent_name(self):
        line = _line(
            name_for_transfer="Trần Xuân",
            transfer_content="84985004656 Tran Xuan FHETL",
        )
        assert pr._is_payment_line_content_stale(
            _pr(name="Nguyễn Văn B"), line
        ) is True

    def test_not_stale_when_pr_name_changed_but_line_used_child_name(self):
        # Sale chọn child_name → đổi tên cha không ảnh hưởng
        assert pr._is_payment_line_content_stale(
            _pr(name="Đổi Tên Cha Mới"), _line()
        ) is False

    def test_not_stale_when_line_is_paid(self):
        # Line đã PAID không cần warning (sale không còn sửa được nữa)
        assert pr._is_payment_line_content_stale(
            _pr(phone="906698067"), _line(status="paid")
        ) is False

    def test_not_stale_when_line_is_cancelled(self):
        assert pr._is_payment_line_content_stale(
            _pr(phone="906698067"),
            _line(status="rejected", reject_reason="Sales huỷ lần thanh toán"),
        ) is False

    def test_not_stale_when_line_is_not_qr_method(self):
        # cash/card/installment không có QR → không cần stale check
        assert pr._is_payment_line_content_stale(
            _pr(phone="906698067"), _line(method="cash")
        ) is False

    def test_null_name_for_transfer_falls_back_to_child_then_name(self):
        # Line cũ trước migration → name_for_transfer = NULL → default childName
        line = _line(name_for_transfer=None)
        # PR khớp child_name → not stale
        assert pr._is_payment_line_content_stale(_pr(), line) is False
        # PR đổi child_name → stale
        assert pr._is_payment_line_content_stale(
            _pr(child_name="Đổi Tên Con"), line
        ) is True

    def test_null_name_and_no_child_name_falls_back_to_pr_name(self):
        line = _line(
            name_for_transfer=None,
            transfer_content="84985004656 Tran Xuan FHETL",
        )
        prow = _pr(child_name=None)
        assert pr._is_payment_line_content_stale(prow, line) is False
        assert pr._is_payment_line_content_stale(
            _pr(name="Khac", child_name=None), line
        ) is True
```

- [ ] **Step 2.2: Verify test FAIL trước khi implement**

Run:
```bash
cd backend && python -m pytest tests/test_payment_line_stale_detection.py -v
```
Expected: TẤT CẢ test FAIL với error `AttributeError: module 'payment_request_routes' has no attribute '_is_payment_line_content_stale'`.

Nếu test PASS hoặc fail vì lý do khác → STOP, debug.

- [ ] **Step 2.3: Implement helper**

Mở `backend/payment_request_routes.py`. Tìm dòng kết thúc của `_build_payos_transfer_description` (khoảng line 1059 — tìm dòng có content `return code[:_PAYOS_DESCRIPTION_MAX_LEN]` đầu tiên sau function này).

Insert NGAY SAU function `_build_payos_transfer_description`:

```python
def _is_payment_line_content_stale(
    pr_row: dict[str, Any],
    line: dict[str, Any],
) -> bool:
    """True nếu transfer_content lưu trên line không còn khớp với PR hiện tại.

    Quy tắc:
    - line không PENDING (paid/rejected/cancelled) → False (không cần warning).
    - line không phải method=qr → False (cash/card không có QR).
    - rebuild expected content từ pr_row + line.name_for_transfer + line.transfer_code.
    - Nếu line.name_for_transfer NULL (line cũ trước migration), fallback theo
      thứ tự: pr_row.child_name → pr_row.name.
    - So sánh expected vs line.transfer_content. Khác → stale.
    """
    status = _clean_text(line.get("status")).lower()
    if status != "pending":
        return False
    if _clean_text(line.get("method")).lower() != "qr":
        return False
    reject_reason = line.get("reject_reason")
    if reject_reason and "huy" in _ascii_transfer_name(reject_reason).lower():
        return False

    name_for_transfer = line.get("name_for_transfer")
    if not name_for_transfer:
        name_for_transfer = pr_row.get("child_name") or pr_row.get("name") or pr_row.get("ten_khach")

    transfer_code = _clean_text(line.get("transfer_code"))
    if not transfer_code:
        return False

    expected = _build_payos_transfer_description(pr_row, name_for_transfer, transfer_code)
    stored = _clean_text(line.get("transfer_content"))
    return expected.strip() != stored.strip()
```

- [ ] **Step 2.4: Verify test PASS**

Run:
```bash
cd backend && python -m pytest tests/test_payment_line_stale_detection.py -v
```
Expected: 11 tests PASS.

Nếu có FAIL → đọc message, FIX code (không sửa test) cho đến khi pass.

- [ ] **Step 2.5: Run full BE test suite (regression check)**

Run:
```bash
cd backend && python -m pytest -q
```
Expected: tất cả test pass (≥ baseline trước plan).

- [ ] **Step 2.6: Commit**

Run:
```bash
git add backend/tests/test_payment_line_stale_detection.py backend/payment_request_routes.py
git commit -m "feat(be): _is_payment_line_content_stale helper + 11 tests"
```

---

## Phase 3 — BE: Wire `is_content_stale` vào serializer

### Task 3: Test serializer expose flag

**Files:**
- Modify: `backend/tests/test_payment_line_stale_detection.py` (thêm test class)

- [ ] **Step 3.1: Thêm test class vào cuối file `backend/tests/test_payment_line_stale_detection.py`**

Append vào CUỐI file (sau class `TestStaleDetection`):

```python
class TestSerializerExposesIsContentStale:
    def test_list_serializer_includes_is_content_stale_true(self):
        pr_row = _pr(phone="906698067")  # đã đổi phone
        line = _line()
        out = pr._serialize_payment_for_list(line, idx=1, pr_row=pr_row)
        assert out["is_content_stale"] is True

    def test_list_serializer_includes_is_content_stale_false_when_match(self):
        out = pr._serialize_payment_for_list(_line(), idx=1, pr_row=_pr())
        assert out["is_content_stale"] is False

    def test_list_serializer_defaults_false_when_pr_row_missing(self):
        # Backward compat: nếu caller không truyền pr_row → False (safe default)
        out = pr._serialize_payment_for_list(_line(), idx=1)
        assert out["is_content_stale"] is False

    def test_detail_serializer_includes_is_content_stale_true(self):
        pr_row = _pr(child_name="Đổi Tên Con")
        out = pr._serialize_payment_line(_line(), pr_row=pr_row)
        assert out["is_content_stale"] is True

    def test_detail_serializer_defaults_false_when_pr_row_missing(self):
        out = pr._serialize_payment_line(_line())
        assert out["is_content_stale"] is False
```

- [ ] **Step 3.2: Verify test FAIL**

Run:
```bash
cd backend && python -m pytest tests/test_payment_line_stale_detection.py::TestSerializerExposesIsContentStale -v
```
Expected: tất cả FAIL với `TypeError: _serialize_payment_for_list() got an unexpected keyword argument 'pr_row'` (hoặc tương tự).

- [ ] **Step 3.3: Modify `_serialize_payment_line` signature**

Mở `backend/payment_request_routes.py` line ~629. Thay function signature + return dict thêm field:

```python
def _serialize_payment_line(
    row: dict[str, Any],
    bill_urls: dict[str, str] | None = None,
    bill_assets: dict[str, list[dict[str, str]]] | None = None,
    display_names: dict[str, str] | None = None,
    pr_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    confirmed_by = row.get("confirmed_by") or None
    return {
        "id": str(row.get("id") or ""),
        "payment_request_id": row.get("payment_request_id") or "",
        "method": row.get("method") or "",
        "amount": _parse_amount(row.get("amount")),
        "status": row.get("status") or "pending",
        "payos_order_code": row.get("payos_order_code") or "",
        "transfer_code": row.get("transfer_code") or "",
        "transfer_content": row.get("transfer_content") or "",
        "name_for_transfer": row.get("name_for_transfer"),
        "qr_code": row.get("qr_code") or "",
        "checkout_url": row.get("checkout_url") or "",
        "paid_at": row.get("paid_at") or "",
        "reject_reason": row.get("reject_reason") or "",
        "created_at": row.get("created_at") or "",
        "updated_at": row.get("updated_at") or "",
        "installment_platform": row.get("installment_platform") or None,
        "installment_total": row.get("installment_total") or None,
        "sale_received": row.get("sale_received") or None,
        "verified_total": row.get("verified_total") or None,
        "verified_received": row.get("verified_received") or None,
        "confirmed_by": confirmed_by,
        "confirmed_by_name": _resolve_confirmed_by_name(confirmed_by, display_names),
        "confirmed_at": row.get("confirmed_at") or None,
        "confirmed_source": row.get("confirmed_source") or None,
        "is_content_stale": _is_payment_line_content_stale(pr_row, row) if pr_row else False,
        **_bill_fields(row, bill_urls, bill_assets),
    }
```

- [ ] **Step 3.4: Modify `_serialize_payment_for_list`**

Mở `backend/payment_request_routes.py` line ~664. Thay signature + thêm field:

```python
def _serialize_payment_for_list(
    row: dict[str, Any],
    idx: int,
    bill_urls: dict[str, str] | None = None,
    bill_assets: dict[str, list[dict[str, str]]] | None = None,
    display_names: dict[str, str] | None = None,
    pr_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    reject = row.get("reject_reason")
    paid_at = row.get("paid_at")
    confirmed_by = row.get("confirmed_by") or None
    result = {
        "id": str(row.get("id") or ""),
        "idx": idx,
        "method": row.get("method") or "",
        "amount": _parse_amount(row.get("amount")),
        "status": row.get("status") or "pending",
        "transfer_code": row.get("transfer_code") or "",
        "transfer_content": row.get("transfer_content") or "",
        "name_for_transfer": row.get("name_for_transfer"),
        "qr_code": row.get("qr_code") or "",
        "checkout_url": row.get("checkout_url") or "",
        "paid_at": paid_at if paid_at else None,
        "created_at": row.get("created_at") or "",
        "reject_reason": reject if reject else None,
        "installment_platform": row.get("installment_platform") or None,
        "installment_total": row.get("installment_total") or None,
        "sale_received": row.get("sale_received") or None,
        "verified_total": row.get("verified_total") or None,
        "verified_received": row.get("verified_received") or None,
        "confirmed_by": confirmed_by,
        "confirmed_by_name": _resolve_confirmed_by_name(confirmed_by, display_names),
        "confirmed_at": row.get("confirmed_at") or None,
        "confirmed_source": row.get("confirmed_source") or None,
        "is_content_stale": _is_payment_line_content_stale(pr_row, row) if pr_row else False,
        **_bill_fields(row, bill_urls, bill_assets),
    }
    return result
```

- [ ] **Step 3.5: Pass pr_row tại các call site**

Tìm tất cả call site `_serialize_payment_for_list(` và `_serialize_payment_line(` trong `backend/payment_request_routes.py`. Run:
```bash
grep -n "_serialize_payment_line\|_serialize_payment_for_list" backend/payment_request_routes.py
```

Cho MỖI call site KHÔNG phải định nghĩa function (line 629, 664), nếu **có biến `pr_row` / `pr_res.data[0]` / `request_res.data[0]` / `updated_row` trong scope**, thêm `pr_row=<biến đó>` vào tham số gọi.

Ví dụ tại `_serialize_payment_request_list_item` (line ~701):
```python
sorted_lines = sorted(lines, key=lambda item: str(item.get("created_at") or ""))
payments = [
    _serialize_payment_for_list(line, idx, bill_urls, bill_assets, display_names, pr_row=row)
    for idx, line in enumerate(sorted_lines, start=1)
]
```

(Lưu ý: `row` là payment_request row được truyền vào `_serialize_payment_request_list_item`.)

Tại `patch_payment_line_amount` (line ~2014):
```python
return {
    "payment_line": _serialize_payment_line(
        updated_line,
        display_names=_build_display_names_for_lines(sb, [updated_line]),
        pr_row=pr_res.data[0],
    ),
    ...
}
```

Tại `_mark_line_paid` (line ~1138-1145), trong return dict: thêm `pr_row=existing` (line vừa fetch chứa `payment_request_id`, có thể không có PR data → để None hoặc fetch riêng). Default an toàn nhất là **không truyền pr_row** ở call site này → trả `is_content_stale=False` cho line đã paid (đúng nghiệp vụ).

QUY TẮC chung: call site nào KHÔNG có sẵn pr_row → giữ nguyên (không truyền) → default False (an toàn).

- [ ] **Step 3.6: Verify test PASS**

Run:
```bash
cd backend && python -m pytest tests/test_payment_line_stale_detection.py -v
```
Expected: 16 tests PASS (11 từ Task 2 + 5 từ Task 3).

- [ ] **Step 3.7: Verify full BE test suite không bị regression**

Run:
```bash
cd backend && python -m pytest -q
```
Expected: tất cả pass.

- [ ] **Step 3.8: Commit**

Run:
```bash
git add backend/payment_request_routes.py backend/tests/test_payment_line_stale_detection.py
git commit -m "feat(be): expose is_content_stale qua _serialize_payment_line/_for_list"
```

---

## Phase 4 — BE: Endpoint POST refresh-content

### Task 4: Test endpoint behaviors

**Files:**
- Create: `backend/tests/test_refresh_content_endpoint.py`

- [ ] **Step 4.1: Tạo test file**

Tạo file `backend/tests/test_refresh_content_endpoint.py` với CHÍNH XÁC nội dung:

```python
"""POST /api/v1/payment-lines/{line_id}/refresh-content.

Endpoint rebuild transfer_content cho line PENDING khi PR đã đổi
name/phone/childName/country. KHÔNG ảnh hưởng line PAID/cancelled.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import payment_request_routes as pr
from main import app


@pytest.fixture
def client():
    return TestClient(app)


PR_ROW = {
    "id": "PR-2026-0066",
    "name": "Trần Xuân",
    "child_name": "Nguyễn Thị Phương Linh",
    "phone": "985004656",
    "country": "VN",
    "state": "pending",
    "target": 17_650_000,
    "received": 0,
    "is_test": False,
    "sale_email": "dinhngochai5901@gmail.com",
}

LINE_ROW = {
    "id": "0c61d981-0f97-428e-b186-d3cbcf6d0fb0",
    "payment_request_id": "PR-2026-0066",
    "method": "qr",
    "status": "pending",
    "amount": 17_650_000,
    "transfer_code": "FHETL",
    "transfer_content": "84985004656 OLD NAME FHETL",
    "name_for_transfer": "OLD NAME",
    "is_test": False,
}


def _mock_sb_with(line_row, pr_row, updated_line=None):
    sb = MagicMock()
    tables = {}
    def _chain(table_name):
        if table_name not in tables:
            t = MagicMock()
            t.select.return_value = t
            t.update.return_value = t
            t.eq.return_value = t
            t.limit.return_value = t
            tables[table_name] = t
        return tables[table_name]
    sb.table.side_effect = _chain
    tables_init = {}
    sb.table("payment_lines").execute.return_value = MagicMock(data=[line_row])
    sb.table("payment_requests").execute.return_value = MagicMock(data=[pr_row])
    # update return
    sb.table("payment_lines").update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[updated_line or line_row]
    )
    return sb


class TestRefreshContentEndpoint:
    def test_rebuilds_content_using_current_pr_phone(self, client):
        sb = _mock_sb_with(LINE_ROW, {**PR_ROW, "phone": "999111222"})
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(
                f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content"
            )
        assert r.status_code == 200
        body = r.json()
        assert body["updated"] is True
        # Phone mới phải xuất hiện trong content mới
        assert "84999111222" in body["new_content"]
        assert body["old_content"] == LINE_ROW["transfer_content"]

    def test_returns_updated_false_when_content_already_matches(self, client):
        # Line đã sync — content khớp PR hiện tại
        line = {**LINE_ROW, "transfer_content": "84985004656 Nguyen Thi Phuong Linh FHETL",
                "name_for_transfer": "Nguyễn Thị Phương Linh"}
        sb = _mock_sb_with(line, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(f"/api/v1/payment-lines/{line['id']}/refresh-content")
        assert r.status_code == 200
        assert r.json()["updated"] is False

    def test_400_when_line_already_paid(self, client):
        sb = _mock_sb_with({**LINE_ROW, "status": "paid"}, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        assert r.status_code == 400
        assert "thanh toan" in r.json()["detail"].lower() or "paid" in r.json()["detail"].lower()

    def test_400_when_line_not_qr_method(self, client):
        sb = _mock_sb_with({**LINE_ROW, "method": "cash"}, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        assert r.status_code == 400

    def test_403_when_actor_no_access_to_pr(self, client):
        sb = _mock_sb_with(LINE_ROW, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=False):
            mock_actor.return_value = MagicMock(email="other@test.com")
            r = client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        assert r.status_code == 403

    def test_404_when_line_not_found(self, client):
        sb = MagicMock()
        t = MagicMock()
        t.select.return_value = t
        t.eq.return_value = t
        t.limit.return_value = t
        t.execute.return_value = MagicMock(data=[])
        sb.table.return_value = t
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post("/api/v1/payment-lines/nonexistent-id/refresh-content")
        assert r.status_code == 404

    def test_uses_explicit_name_for_transfer_from_body_when_provided(self, client):
        sb = _mock_sb_with(LINE_ROW, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(
                f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content",
                json={"name_for_transfer": "Trần Xuân"},
            )
        assert r.status_code == 200
        body = r.json()
        # Tên Trần Xuân (ascii: Tran Xuan) phải xuất hiện trong content mới
        assert "Tran Xuan" in body["new_content"]

    def test_preserves_transfer_code(self, client):
        sb = _mock_sb_with(LINE_ROW, {**PR_ROW, "phone": "999111222"})
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        assert r.status_code == 200
        # Mã FH KHÔNG đổi (để SePay tiếp tục match được giao dịch cũ)
        assert "FHETL" in r.json()["new_content"]

    def test_writes_audit_log(self, client):
        sb = _mock_sb_with(LINE_ROW, {**PR_ROW, "phone": "999111222"})
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit") as mock_audit:
            mock_actor.return_value = MagicMock(email="admin@test.com")
            client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        # log_audit phải được gọi với action chứa "refresh" hoặc "transfer_content"
        assert mock_audit.called
        call_args = mock_audit.call_args
        # log_audit(sb, actor.email, action, target_type, target_id, payload)
        action = call_args[0][2] if len(call_args[0]) >= 3 else ""
        assert "refresh" in action.lower() or "content" in action.lower()
```

- [ ] **Step 4.2: Verify test FAIL**

Run:
```bash
cd backend && python -m pytest tests/test_refresh_content_endpoint.py -v
```
Expected: 9 test FAIL với `404 Not Found` (endpoint chưa tồn tại).

- [ ] **Step 4.3: Thêm Pydantic body model**

Mở `backend/payment_request_routes.py`. Sau dòng `class PaymentLineAmountPatch(BaseModel): amount: int | str` (line ~178), insert NGAY DƯỚI:

```python
class PaymentLineRefreshContentBody(BaseModel):
    """Body optional cho refresh-content. Nếu name_for_transfer = None → dùng stored hoặc default child→parent."""
    name_for_transfer: str | None = None
```

- [ ] **Step 4.4: Thêm endpoint**

Tìm `@router.patch("/payment-lines/{line_id}/amount")` (line ~1956). NGAY SAU function `patch_payment_line_amount` (kết thúc khoảng line ~2022), insert endpoint mới:

```python
    @router.post("/payment-lines/{line_id}/refresh-content")
    def refresh_payment_line_content(
        line_id: str,
        body: PaymentLineRefreshContentBody | None = None,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "paymentRequests")

        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("id", line_id)
            .limit(1)
            .execute()
        )
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")
        line = line_res.data[0]

        if _clean_text(line.get("status")).lower() != "pending":
            raise HTTPException(400, "Chi rebuild duoc khi lan thanh toan chua thanh toan")
        if _clean_text(line.get("method")).lower() != "qr":
            raise HTTPException(400, "Chi rebuild duoc voi phuong thuc QR")
        reject_reason = line.get("reject_reason")
        if reject_reason and "huy" in _ascii_transfer_name(reject_reason).lower():
            raise HTTPException(400, "Lan thanh toan da bi huy")

        pr_id = str(line.get("payment_request_id") or "")
        if not pr_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")

        pr_res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
        if not pr_res.data:
            raise HTTPException(404, "Khong tim thay payment_request lien quan")
        pr_row = pr_res.data[0]
        if not _can_access_request(sb, actor, pr_row):
            raise HTTPException(403, "Khong co quyen rebuild payment_line nay")

        explicit_name = body.name_for_transfer if body else None
        name_for_transfer = explicit_name or line.get("name_for_transfer") or pr_row.get("child_name") or pr_row.get("name")
        transfer_code = _clean_text(line.get("transfer_code"))
        if not transfer_code:
            raise HTTPException(400, "payment_line thieu transfer_code")

        old_content = _clean_text(line.get("transfer_content"))
        new_content = _build_payos_transfer_description(pr_row, name_for_transfer, transfer_code)

        if new_content == old_content and (not explicit_name or explicit_name == line.get("name_for_transfer")):
            return {
                "payment_line": _serialize_payment_line(
                    line,
                    display_names=_build_display_names_for_lines(sb, [line]),
                    pr_row=pr_row,
                ),
                "updated": False,
                "old_content": old_content,
                "new_content": new_content,
            }

        update_payload: dict[str, Any] = {"transfer_content": new_content}
        if explicit_name is not None:
            update_payload["name_for_transfer"] = explicit_name
        try:
            updated_res = (
                sb.table("payment_lines")
                .update(update_payload)
                .eq("id", line_id)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat duoc transfer_content: {exc}") from exc

        updated_line = updated_res.data[0] if updated_res.data else {**line, **update_payload}

        from audit import log_audit
        log_audit(sb, actor.email, "payment_line.refresh_content", "payment_line", line_id, {
            "pr_id": pr_id,
            "old_content": old_content,
            "new_content": new_content,
            "name_for_transfer": name_for_transfer,
        })

        return {
            "payment_line": _serialize_payment_line(
                updated_line,
                display_names=_build_display_names_for_lines(sb, [updated_line]),
                pr_row=pr_row,
            ),
            "updated": True,
            "old_content": old_content,
            "new_content": new_content,
        }
```

- [ ] **Step 4.5: Verify test PASS**

Run:
```bash
cd backend && python -m pytest tests/test_refresh_content_endpoint.py -v
```
Expected: 9 tests PASS.

Nếu fail → đọc error, FIX endpoint (không sửa test) cho đến pass. KHÔNG được skip test hoặc weaken assertion.

- [ ] **Step 4.6: Full BE suite regression**

Run:
```bash
cd backend && python -m pytest -q
```
Expected: tất cả pass.

- [ ] **Step 4.7: Commit**

Run:
```bash
git add backend/payment_request_routes.py backend/tests/test_refresh_content_endpoint.py
git commit -m "feat(be): POST /payment-lines/{id}/refresh-content endpoint + 9 tests"
```

---

## Phase 5 — BE: Persist `name_for_transfer` khi tạo line

### Task 5: Store name choice in payment_lines.insert

- [ ] **Step 5.1: Thêm test trong `backend/tests/test_payment_line_stale_detection.py`**

Append vào CUỐI file:

```python
class TestNameForTransferPersistedAtCreate:
    """Verify khi tạo line, name_for_transfer được lưu vào DB."""

    def test_addPayment_qr_persists_name_for_transfer_from_body(self):
        # Mock add_payment_line endpoint hành vi: insert_row có name_for_transfer
        # khi method=qr và body.name_for_transfer được set.
        import payment_request_routes as pr_mod
        src = pr_mod
        # Đọc source: chỗ build insert_row trong add_payment_line
        import inspect
        source = inspect.getsource(src)
        # Quy ước hiện tại: nếu method qr, name_for_transfer ĐƯỢC truyền vào insert_row.
        assert '"name_for_transfer": body.name_for_transfer' in source or \
               "insert_row[\"name_for_transfer\"] = body.name_for_transfer" in source or \
               "name_for_transfer=body.name_for_transfer" in source, \
               "addPayment phải lưu body.name_for_transfer vào insert_row khi method=qr"
```

- [ ] **Step 5.2: Verify test FAIL**

Run:
```bash
cd backend && python -m pytest tests/test_payment_line_stale_detection.py::TestNameForTransferPersistedAtCreate -v
```
Expected: FAIL với AssertionError.

- [ ] **Step 5.3: Modify add_payment_line endpoint**

Mở `backend/payment_request_routes.py` ~line 1878-1913 (phần `if method == "qr":` trong add_payment_line). Tìm khối:

```python
            else:
                # SePay-only path — FE dựng VietQR tĩnh, SePay webhook match content.
                # payos_order_code = NULL (không "") để tránh duplicate unique constraint
                # khi nhiều lần TT trên cùng PR (Postgres UNIQUE cho phép multiple NULL).
                insert_row.update(
                    {
                        "payos_order_code": None,
                        "qr_code": "",
                        "checkout_url": "",
                        "transfer_content": description,
                    }
                )
```

Thay block `insert_row.update({...})` thành:

```python
                insert_row.update(
                    {
                        "payos_order_code": None,
                        "qr_code": "",
                        "checkout_url": "",
                        "transfer_content": description,
                        "name_for_transfer": body.name_for_transfer,
                    }
                )
```

VÀ ở block `if use_payos:` (line ~1894-1901) cũng update tương tự:

```python
                insert_row.update(
                    {
                        "payos_order_code": payos_payload["order_code"],
                        "qr_code": payos_payload.get("qr_code") or "",
                        "checkout_url": payos_payload.get("checkout_url") or "",
                        "transfer_content": payos_payload.get("transfer_content") or description,
                        "name_for_transfer": body.name_for_transfer,
                    }
                )
```

- [ ] **Step 5.4: Verify test PASS**

Run:
```bash
cd backend && python -m pytest tests/test_payment_line_stale_detection.py::TestNameForTransferPersistedAtCreate -v
cd backend && python -m pytest tests/ -q
```
Expected: tất cả pass.

- [ ] **Step 5.5: Commit**

Run:
```bash
git add backend/payment_request_routes.py backend/tests/test_payment_line_stale_detection.py
git commit -m "feat(be): persist name_for_transfer khi tạo payment_line qr"
```

---

## Phase 6 — FE: Types + API client

### Task 6: Thêm `isContentStale` vào PaymentAttempt + API endpoint

**Files:**
- Modify: `frontend/src/types/paymentRequest.ts`
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 6.1: Modify `PaymentAttempt` interface**

Mở `frontend/src/types/paymentRequest.ts`. Sau dòng `confirmedSource?: string | null;` (line ~37), insert TRƯỚC dòng `}`:

```typescript
  /** Tên dùng cho nội dung CK (parent name HOẶC child name) sale chọn lúc tạo line */
  nameForTransfer?: string | null;
  /** True khi PR đã đổi name/phone/childName/country và transfer_content lưu không còn khớp PR hiện tại */
  isContentStale?: boolean;
```

- [ ] **Step 6.2: Modify `fromApiAttempt` để map snake_case → camelCase**

Mở `frontend/src/components/payment-request/paymentRequestUtils.ts`. Tìm function `fromApiAttempt` (line ~55). Trong return object, NGAY SAU `confirmedSource: raw.confirmed_source ?? raw.confirmedSource ?? null,` (line ~99), thêm:

```typescript
    nameForTransfer: raw.name_for_transfer ?? raw.nameForTransfer ?? null,
    isContentStale: Boolean(raw.is_content_stale ?? raw.isContentStale ?? false),
```

- [ ] **Step 6.3: Thêm endpoint vào api client**

Mở `frontend/src/lib/api.ts`. Tìm function `patchPaymentLineAmount` (line ~139). NGAY SAU function này, insert:

```typescript
    refreshPaymentLineContent: (lineId: string, body?: { name_for_transfer?: string | null }) =>
      api.post<{
        payment_line: PaymentLineApiRow;
        updated: boolean;
        old_content: string;
        new_content: string;
      }>(`/api/v1/payment-lines/${lineId}/refresh-content`, body ?? {}),
```

- [ ] **Step 6.4: TS build check**

Run:
```bash
cd frontend && npx tsc -b
```
Expected: No errors found.

- [ ] **Step 6.5: Commit**

Run:
```bash
git add frontend/src/types/paymentRequest.ts frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/lib/api.ts
git commit -m "feat(fe): isContentStale field + refreshPaymentLineContent api"
```

---

## Phase 7 — FE: Component `PrStaleContentWarning`

### Task 7: Test + component

**Files:**
- Create: `frontend/src/components/payment-request/PrStaleContentWarning.tsx`
- Create: `frontend/src/components/payment-request/PrStaleContentWarning.test.tsx`

- [ ] **Step 7.1: Tạo test file TRƯỚC component**

Tạo file `frontend/src/components/payment-request/PrStaleContentWarning.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PrStaleContentWarning from "./PrStaleContentWarning";

describe("PrStaleContentWarning", () => {
  it("không render khi visible=false", () => {
    expect.assertions(1);
    const { container } = render(
      <PrStaleContentWarning visible={false} onRefresh={() => {}} onDismiss={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("render banner với cảnh báo + 2 nút khi visible=true", () => {
    expect.assertions(3);
    render(
      <PrStaleContentWarning visible={true} onRefresh={() => {}} onDismiss={() => {}} />,
    );
    // Banner phải có text cảnh báo rõ ràng
    expect(screen.getByText(/nội dung CK.*chưa.*cập nhật|đã đổi.*thông tin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cập nhật QR/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Huỷ|Bỏ qua/ })).toBeInTheDocument();
  });

  it("gọi onRefresh khi bấm 'Cập nhật QR'", () => {
    expect.assertions(2);
    const onRefresh = vi.fn();
    render(
      <PrStaleContentWarning visible={true} onRefresh={onRefresh} onDismiss={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cập nhật QR/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledWith();
  });

  it("gọi onDismiss khi bấm 'Huỷ'", () => {
    expect.assertions(1);
    const onDismiss = vi.fn();
    render(
      <PrStaleContentWarning visible={true} onRefresh={() => {}} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Huỷ|Bỏ qua/ }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("nút 'Cập nhật QR' bị disabled khi loading=true", () => {
    expect.assertions(1);
    render(
      <PrStaleContentWarning
        visible={true}
        loading={true}
        onRefresh={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Đang cập nhật|Cập nhật QR/ })).toBeDisabled();
  });

  it("có role='alert' để screen reader / accessibility nhận diện cảnh báo", () => {
    expect.assertions(1);
    render(
      <PrStaleContentWarning visible={true} onRefresh={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.2: Verify test FAIL**

Run:
```bash
cd frontend && npx vitest run src/components/payment-request/PrStaleContentWarning.test.tsx
```
Expected: Test file fail to import (module not found) — vì component chưa tồn tại.

- [ ] **Step 7.3: Tạo component**

Tạo file `frontend/src/components/payment-request/PrStaleContentWarning.tsx`:

```tsx
import { Icons } from "./Icons";

interface Props {
  visible: boolean;
  loading?: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

/**
 * Cảnh báo trên drawer: PR đã đổi tên/sđt/childName/country sau khi lần TT
 * này tạo → nội dung CK của QR đang dùng thông tin cũ → sale cần xử lý.
 *
 * Sticky: dismiss chỉ ẩn trong session hiện tại, mở drawer lại sẽ hiện lại
 * (logic dismiss giữ ở parent, component này chỉ render UI).
 */
export default function PrStaleContentWarning({
  visible,
  loading = false,
  onRefresh,
  onDismiss,
}: Props) {
  if (!visible) return null;

  return (
    <div
      role="alert"
      style={{
        background: "var(--warning-bg, #fef3c7)",
        border: "1px solid var(--warning, #f59e0b)",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>⚠️</span>
        <div style={{ flex: 1, fontSize: 13, color: "var(--text-1, #1f2937)" }}>
          <strong>Khách đã đổi thông tin.</strong>{" "}
          Nội dung CK của lần thanh toán này vẫn dùng tên / số điện thoại cũ.
          Bấm <strong>Cập nhật QR</strong> để dùng thông tin mới, hoặc <strong>Huỷ</strong> để giữ nguyên.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onDismiss}
          disabled={loading}
        >
          Huỷ
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onRefresh}
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <Icons.QrCode size={13} />
          {loading ? "Đang cập nhật…" : "Cập nhật QR"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.4: Verify test PASS**

Run:
```bash
cd frontend && npx vitest run src/components/payment-request/PrStaleContentWarning.test.tsx
```
Expected: `PASS (6) FAIL (0)`.

- [ ] **Step 7.5: TS build check**

Run:
```bash
cd frontend && npx tsc -b
```
Expected: No errors found.

- [ ] **Step 7.6: Commit**

Run:
```bash
git add frontend/src/components/payment-request/PrStaleContentWarning.tsx frontend/src/components/payment-request/PrStaleContentWarning.test.tsx
git commit -m "feat(fe): PrStaleContentWarning component + 6 tests"
```

---

## Phase 8 — FE: Integrate warning vào PaymentRequestDetailDrawer

### Task 8: Wire component + dismiss state

**Files:**
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`
- Modify: `frontend/src/components/PaymentRequestsTab.tsx`

- [ ] **Step 8.1: Thêm prop `onRefreshLineContent` vào QrRow + drawer**

Mở `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`. Tìm interface props của QrRow (line ~75-100, có các prop `qr`, `onEditAmount`...). Thêm vào interface:

```typescript
  /** Sticky: undefined → chưa dismiss. true → sale đã dismiss trong session này. */
  contentDismissed?: boolean;
  /** Callback rebuild content QR. Trả về promise để parent chờ. */
  onRefreshContent?: (line: PaymentAttempt) => Promise<void>;
  /** Callback dismiss warning (sticky session). */
  onDismissStaleWarning?: (lineId: string) => void;
```

- [ ] **Step 8.2: Render warning trong QrRow component**

Trong QrRow component body, ngay TRƯỚC return JSX (`return ( <div className="qr-row v2" ...>`), thêm:

```tsx
  const [refreshLoading, setRefreshLoading] = useState(false);

  const showStaleWarning =
    qr.isContentStale === true &&
    qr.status === "pending" &&
    !qr.cancelled &&
    contentDismissed !== true &&
    typeof onRefreshContent === "function";

  const handleRefresh = async () => {
    if (!onRefreshContent) return;
    setRefreshLoading(true);
    try {
      await onRefreshContent(qr);
    } finally {
      setRefreshLoading(false);
    }
  };
```

**Imports cần verify** ở đầu file `PaymentRequestDetailDrawer.tsx`:
- React: `useState` (đã có sẵn). Nếu QrRow chưa dùng useState ở scope nó, thêm vào.
- Local: `import PrStaleContentWarning from "./PrStaleContentWarning";`.

Lưu ý: QrRow có thể được định nghĩa inline trong file drawer (tìm `function QrRow(` hoặc `const QrRow =`). Code trong Step 8.2 đặt trong scope component QrRow, không phải scope drawer parent.

Trong JSX của QrRow, NGAY ĐẦU TIÊN sau `return (` mở `<>` fragment để render warning + qr-row:

```tsx
  return (
    <>
      <PrStaleContentWarning
        visible={showStaleWarning}
        loading={refreshLoading}
        onRefresh={handleRefresh}
        onDismiss={() => onDismissStaleWarning?.(qr.id)}
      />
      <div className="qr-row v2" style={isCancelled ? { opacity: 0.55 } : undefined}>
        {/* ... existing JSX ... */}
      </div>
    </>
  );
```

(Cẩn thận: phải đóng `</>` ở cuối, KHÔNG xóa nội dung `<div className="qr-row v2">`.)

- [ ] **Step 8.3: Pass dismiss state + handler từ drawer xuống QrRow**

Tìm chỗ drawer render QrRow (search trong file `PaymentRequestDetailDrawer.tsx`). Thêm state ở component drawer top-level:

```typescript
  const [dismissedStaleLineIds, setDismissedStaleLineIds] = useState<Set<string>>(new Set());

  // Sticky reset: chuyển sang PR khác → reset dismiss → warning hiện lại.
  // Đóng drawer + mở lại cùng PR → vẫn hiện lại nếu chưa Cập nhật QR.
  useEffect(() => {
    setDismissedStaleLineIds(new Set());
  }, [request?.id]);

  const handleDismissStale = useCallback((lineId: string) => {
    setDismissedStaleLineIds(prev => {
      const next = new Set(prev);
      next.add(lineId);
      return next;
    });
  }, []);
```

**Import note:** verify imports đầu file có `useEffect`, `useCallback`, `useState`. Nếu thiếu, thêm vào dòng `import { ... } from "react";`.

Pass xuống QrRow:
```tsx
<QrRow
  qr={p}
  ...
  contentDismissed={dismissedStaleLineIds.has(p.id)}
  onRefreshContent={onRefreshLineContent}
  onDismissStaleWarning={handleDismissStale}
/>
```

(`onRefreshLineContent` là prop mới của drawer, thêm vào interface props của drawer.)

- [ ] **Step 8.4: Thêm prop `onRefreshLineContent` vào drawer interface**

Tìm interface props của `PaymentRequestDetailDrawer` (top of file ~line 1480). Thêm:

```typescript
  onRefreshLineContent?: (line: PaymentAttempt) => Promise<void>;
```

Destructure trong component signature.

- [ ] **Step 8.5: Wire handler trong PaymentRequestsTab**

Mở `frontend/src/components/PaymentRequestsTab.tsx`. Sau function `handleEditAmount` (line ~362), thêm:

```typescript
  const handleRefreshLineContent = async (line: PaymentAttempt) => {
    if (!selected) return;
    const prId = selected.id;
    try {
      const res = await endpoints.paymentRequests.refreshPaymentLineContent(line.id);
      updateRequest(prId, (r) => ({
        ...r,
        payments: r.payments.map((p: PaymentAttempt) =>
          p.id === line.id
            ? {
                ...p,
                transferContent: res.data.payment_line.transfer_content ?? p.transferContent,
                nameForTransfer:
                  res.data.payment_line.name_for_transfer ?? p.nameForTransfer ?? null,
                isContentStale: false,
              }
            : p
        ),
      }));
      setApiNote("");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Không cập nhật được nội dung QR.";
      setApiNote(String(msg));
      throw err;
    }
  };
```

(`endpoints.paymentRequests.refreshPaymentLineContent` đã được thêm ở Phase 6.)

Lưu ý: `PaymentLineApiRow` (used trong api.ts response) có thể cần thêm fields `transfer_content`, `name_for_transfer` nếu chưa có. Kiểm tra `frontend/src/types/paymentRequest.ts` interface `PaymentLineApiRow`. Nếu thiếu, thêm:

```typescript
export interface PaymentLineApiRow {
  // ... existing fields ...
  transfer_content?: string;
  name_for_transfer?: string | null;
  is_content_stale?: boolean;
}
```

Pass `onRefreshLineContent={handleRefreshLineContent}` vào `<PaymentRequestDetailDrawer ... />` (line ~770-800).

- [ ] **Step 8.6: TS build check**

Run:
```bash
cd frontend && npx tsc -b
```
Expected: No errors found. Nếu có error → fix theo gợi ý TS.

- [ ] **Step 8.7: Smoke test thủ công (optional, recommended)**

Khởi dev server: `cd frontend && npm run dev`. Login app prod-like:
1. Tạo PR-test với name "A", phone "0900000001", childName "Con A". Tạo 1 lần TT QR.
2. PATCH PR đổi name → "B" (qua UI sửa khách hàng trong drawer).
3. Đóng drawer + mở lại → cảnh báo vàng PHẢI hiện ở lần TT pending.
4. Bấm "Cập nhật QR" → cảnh báo biến mất + xem QR thấy content có "B".
5. Đóng drawer + mở lại → cảnh báo KHÔNG hiện lại (vì content đã sync).

- [ ] **Step 8.8: Run full FE test suite**

Run:
```bash
cd frontend && npx vitest run
```
Expected: tất cả pass (gồm `PrStaleContentWarning.test.tsx` 6 tests + 211 cũ).

- [ ] **Step 8.9: Commit**

Run:
```bash
git add frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx frontend/src/components/PaymentRequestsTab.tsx frontend/src/types/paymentRequest.ts
git commit -m "feat(fe): wire PrStaleContentWarning vào drawer + sticky dismiss"
```

---

## Phase 9 — Verification & Push

### Task 9: Full regression + deploy

- [ ] **Step 9.1: Full BE suite**

Run:
```bash
cd backend && python -m pytest -q
```
Expected: tất cả pass.

- [ ] **Step 9.2: Full FE suite + TS build**

Run:
```bash
cd frontend && npx tsc -b && npx vitest run --reporter=basic
```
Expected: TS clean + `PASS (>=211) FAIL (0)`.

- [ ] **Step 9.3: Smoke test cross-PR cũ**

Test guardrail của QrViewModal vẫn hoạt động:
```bash
cd frontend && npx vitest run src/components/payment-request/QrViewModal.test.tsx
```
Expected: `PASS (35) FAIL (0)`.

- [ ] **Step 9.4: Merge feature branch vào main**

Run:
```bash
git checkout main
git pull origin main
git merge --no-ff feat/pr-stale-content-warning -m "Merge feat/pr-stale-content-warning"
git push origin main
```

- [ ] **Step 9.5: Merge main vào sandbox**

Run:
```bash
git checkout sandbox
git pull origin sandbox
git merge --no-ff main -m "Merge main: pr-stale-content-warning"
git push origin sandbox
```

- [ ] **Step 9.6: Apply migration trên Supabase prod**

Sau khi merge main → Vercel auto-deploy → BE Render auto-deploy (nếu enabled). Migration prod cần apply thủ công:

1. Copy nội dung `docs/migrations/2026-06-25-name-for-transfer.sql`.
2. Login Supabase prod `jozcvbbypwvzaefteoxn` → SQL Editor → paste → Run.
3. Verify cột tồn tại tương tự Step 1.2.

- [ ] **Step 9.7: Manual prod verify**

Sau deploy + migration:
1. Login app prod, mở 1 PR test có lần TT PENDING.
2. PATCH name khách → đóng drawer → mở lại → cảnh báo vàng phải hiện.
3. Bấm "Cập nhật QR" → mở QR view → verify content có tên mới.

- [ ] **Step 9.8: Báo cáo user kết quả deploy**

Trả lời user template:
> Plan executed. Tổng:
> - BE: 1 migration + helper + 2 serializer field + 1 endpoint + persist name_for_transfer.
> - FE: 1 component + 1 api endpoint + drawer integration với sticky dismiss.
> - Tests: BE `_is_payment_line_content_stale` (11), serializer (5), endpoint (9), addPayment (1); FE component (6).
> - Deployed: main commit `<sha>` + sandbox commit `<sha>` + migration applied trên sandbox + prod.

---

## Anti-Cheat Guardrails

Các quy tắc BẮT BUỘC implementor (kể cả Sonnet 4.6 / Opus 4.6) phải tuân thủ:

1. **KHÔNG sửa test để pass.** Nếu test fail → sửa code production, không sửa test. Trừ khi test có lỗi syntax/import — báo user trước khi sửa.
2. **KHÔNG skip test.** Mọi assertion phải pass đúng nội dung viết.
3. **KHÔNG bỏ qua TDD discipline.** Mỗi task thực hiện theo đúng thứ tự: write test → verify FAIL → implement → verify PASS → commit.
4. **KHÔNG dùng `git add -A` hay `git add .`** — luôn add từng file cụ thể (theo Step commit hướng dẫn).
5. **KHÔNG modify file ngoài plan.** Chỉ chạm các file được liệt kê trong Phase Files.
6. **KHÔNG generate code không có trong plan.** Nếu cần thêm logic không liệt kê → dừng, báo user.
7. **KHÔNG dùng `--force` hay `--force-with-lease` push** trừ khi user explicitly đồng ý.
8. **KHÔNG xóa file.** Nếu cần xóa → báo user trước.

## Tự kiểm điểm sau khi hoàn thành

- [ ] Tất cả 9 phase completed?
- [ ] Tổng test count BE tăng `≥ 22` (11 stale + 5 serializer + 9 endpoint + 1 addPayment)?
- [ ] Tổng test count FE tăng `≥ 6` (PrStaleContentWarning)?
- [ ] QrViewModal test cũ vẫn 35/35?
- [ ] Migration đã apply trên sandbox + prod?
- [ ] Smoke test prod đã pass?

Nếu MỘT box ở trên KHÔNG check được — báo user, KHÔNG báo cáo "done".
