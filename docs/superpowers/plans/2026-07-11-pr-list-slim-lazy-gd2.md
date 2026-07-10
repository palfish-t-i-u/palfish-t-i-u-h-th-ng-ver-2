# GĐ2 — PR List Slim + Lazy Detail (scale tới ~10k PR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** List PR bỏ mảng `payments` (payload giảm ~5×, trần scale ~10k PR); mọi con số trên card/KPI đọc từ CỘT aggregate do BE ghi tại mutation; drawer lazy-load chi tiết qua endpoint mới.

**Architecture:** DB đã lưu `received`+`state` trên `payment_requests` (BE update qua `recompute_payment_request_totals` tại mọi mutation). GĐ2 mở rộng đúng chỗ đó thêm 5 cột: `done_count`, `total_count`, `display_received`, `has_pending_qr`, `has_unverified_installment`. Semantics các cột PHẢI khớp 100% logic FE hiện tại (`normalizeRequest`/`displayReceived`/...) — chốt bằng **golden fixture JSON chạy chung cho cả pytest lẫn Vitest**. List thêm mode `?fields=slim` (default vẫn full — deploy BE trước FE an toàn, rollback FE không cần rollback BE). Endpoint mới `GET /payment-requests/{id}` trả full (kèm payments) cho drawer.

**Tech Stack:** FastAPI + supabase-py, Postgres (Supabase), React 19, Vitest, pytest.

**Prerequisite:** GĐ1 (plan `2026-07-11-pr-list-load-all-gd1.md`) đã merge main + chạy ổn. Trigger làm GĐ2: console.warn `total > 1500`, HOẶC chủ động làm sớm.

**Ràng buộc quan trọng (đọc trước khi code):**
- Quy tắc vàng: **row slim → MỌI con số lấy từ server fields; mảng `payments` trên row slim chỉ là CACHE cho drawer, không bao giờ dùng để tính số.**
- FE xác định slim qua `raw.payments === undefined` → nhiều response mutation (create/cancel/patch) cũng không kèm payments → Task 7 có bước AUDIT bắt buộc, không bỏ qua.
- Vùng nhạy cảm: drawer/selected từng dính bug QR nhảy nhầm PR (26/6, memory `bug_qr_cross_pr_lan_anh_26_6`). Hydration phải có seq-guard chống response cũ đè state mới.
- Deploy thứ tự nghiêm ngặt: migration → BE → backfill → parity PASS → FE. Không đảo.

---

### Task 1: Golden fixture — semantics aggregate chung FE/BE

**Files:**
- Create: `frontend/src/components/payment-request/__fixtures__/prAggregateCases.json`
- Test (FE): `frontend/src/components/payment-request/paymentRequestUtils.aggregates.test.ts`

Fixture là NGUỒN CHÂN LÝ duy nhất về semantics. FE test chứng minh fixture khớp logic FE hiện tại; BE test (Task 2) chứng minh helper Python khớp fixture → FE↔BE khớp nhau bắc cầu.

- [ ] **Step 1: Tạo fixture**

`frontend/src/components/payment-request/__fixtures__/prAggregateCases.json`:

```json
{
  "_readme": "Golden cases cho aggregate PR. lines = raw API row (snake_case) cua payment_lines. expected = gia tri cot aggregate. Dung chung: Vitest (paymentRequestUtils.aggregates.test.ts) + pytest (test_pr_aggregates_helper.py). SUA FILE NAY = SUA CA HAI PHIA.",
  "cases": [
    {
      "name": "paid qr don gian",
      "lines": [{ "id": "L1", "method": "qr", "status": "paid", "amount": 5000000 }],
      "expected": { "done_count": 1, "total_count": 1, "display_received": 5000000, "has_pending_qr": false, "has_unverified_installment": false }
    },
    {
      "name": "qr pending → has_pending_qr",
      "lines": [{ "id": "L1", "method": "qr", "status": "pending", "amount": 5000000 }],
      "expected": { "done_count": 0, "total_count": 1, "display_received": 0, "has_pending_qr": true, "has_unverified_installment": false }
    },
    {
      "name": "rejected ly do huy → cancelled, loai khoi total_count va pending",
      "lines": [
        { "id": "L1", "method": "qr", "status": "rejected", "amount": 3000000, "reject_reason": "Khách huỷ đơn" },
        { "id": "L2", "method": "cash", "status": "paid", "amount": 2000000 }
      ],
      "expected": { "done_count": 1, "total_count": 1, "display_received": 2000000, "has_pending_qr": false, "has_unverified_installment": false }
    },
    {
      "name": "rejected ly do KHAC (khong phai huy) → van tinh total_count",
      "lines": [{ "id": "L1", "method": "qr", "status": "rejected", "amount": 3000000, "reject_reason": "sai so tien" }],
      "expected": { "done_count": 0, "total_count": 1, "display_received": 0, "has_pending_qr": false, "has_unverified_installment": false }
    },
    {
      "name": "tra gop paid CHUA verify → has_unverified, display dung gross",
      "lines": [{ "id": "L1", "method": "installment", "status": "paid", "amount": 5000000, "verified_received": null }],
      "expected": { "done_count": 1, "total_count": 1, "display_received": 5000000, "has_pending_qr": false, "has_unverified_installment": true }
    },
    {
      "name": "tra gop paid DA verify → display dung so sau phi",
      "lines": [{ "id": "L1", "method": "installment", "status": "paid", "amount": 5000000, "verified_received": 4650000 }],
      "expected": { "done_count": 1, "total_count": 1, "display_received": 4650000, "has_pending_qr": false, "has_unverified_installment": false }
    },
    {
      "name": "cot cancelled=true tuong minh → loai het",
      "lines": [{ "id": "L1", "method": "qr", "status": "pending", "amount": 1000000, "cancelled": true }],
      "expected": { "done_count": 0, "total_count": 0, "display_received": 0, "has_pending_qr": false, "has_unverified_installment": false }
    },
    {
      "name": "hon hop: paid qr + pending qr + tra gop chua verify",
      "lines": [
        { "id": "L1", "method": "qr", "status": "paid", "amount": 3000000 },
        { "id": "L2", "method": "qr", "status": "pending", "amount": 2000000 },
        { "id": "L3", "method": "installment", "status": "paid", "amount": 4000000, "verified_received": null }
      ],
      "expected": { "done_count": 2, "total_count": 3, "display_received": 7000000, "has_pending_qr": true, "has_unverified_installment": true }
    },
    {
      "name": "khong co line nao",
      "lines": [],
      "expected": { "done_count": 0, "total_count": 0, "display_received": 0, "has_pending_qr": false, "has_unverified_installment": false }
    }
  ]
}
```

- [ ] **Step 2: FE test chứng minh fixture == logic FE hiện tại**

Tạo `frontend/src/components/payment-request/paymentRequestUtils.aggregates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import cases from "./__fixtures__/prAggregateCases.json";
import {
  displayReceived,
  fromApiPaymentRequest,
  hasUnverifiedInstallment,
  normalizeRequest,
} from "./paymentRequestUtils";

describe("golden fixture — semantics aggregate khớp logic FE", () => {
  for (const c of cases.cases) {
    it(c.name, () => {
      const pr = normalizeRequest(
        fromApiPaymentRequest({
          id: "PR1", name: "KH", uid: "u", sale_email: "s@x.com", target: 0,
          state: "pending", created_at: "2026-07-01T00:00:00Z",
          payments: c.lines,
        })
      );
      expect(pr.doneCount).toBe(c.expected.done_count);
      expect(pr.totalCount).toBe(c.expected.total_count);
      expect(displayReceived(pr)).toBe(c.expected.display_received);
      expect(hasUnverifiedInstallment(pr)).toBe(c.expected.has_unverified_installment);
      const pendingQr = pr.payments.some((p) => !p.cancelled && p.method === "qr" && p.status === "pending");
      expect(pendingQr).toBe(c.expected.has_pending_qr);
    });
  }
});
```

- [ ] **Step 3: Chạy — PASS ngay (fixture mô tả behavior hiện có)**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.aggregates.test.ts`
Expected: 9 passed. Nếu case nào FAIL → fixture viết sai semantics, SỬA FIXTURE cho khớp behavior FE thật (FE đang chạy prod là chân lý), tuyệt đối không sửa code FE ở task này.

Lưu ý tsconfig: nếu import JSON lỗi, bật `"resolveJsonModule": true` trong `frontend/tsconfig.app.json` (compilerOptions).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/payment-request/__fixtures__/prAggregateCases.json frontend/src/components/payment-request/paymentRequestUtils.aggregates.test.ts frontend/tsconfig.app.json
git commit -m "test(pr-agg): golden fixture semantics aggregate FE lam chan ly chung FE/BE"
```

---

### Task 2: BE — helper `compute_pr_aggregates` khớp fixture

**Files:**
- Modify: `backend/payment_request_routes.py` (thêm helper gần `_compute_state` ~dòng 248)
- Test: `backend/tests/test_pr_aggregates_helper.py` (tạo mới)

- [ ] **Step 1: Viết failing test đọc CHUNG fixture**

Tạo `backend/tests/test_pr_aggregates_helper.py`:

```python
"""GĐ2: helper aggregate PHẢI khớp golden fixture (chung với Vitest).

Fixture: frontend/src/components/payment-request/__fixtures__/prAggregateCases.json
Sửa semantics → sửa fixture → cả 2 test suite cùng gác.
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

FIXTURE = os.path.join(
    os.path.dirname(__file__), "..", "..", "frontend", "src", "components",
    "payment-request", "__fixtures__", "prAggregateCases.json",
)


def _cases():
    with open(FIXTURE, encoding="utf-8") as f:
        return json.load(f)["cases"]


@pytest.mark.parametrize("case", _cases(), ids=lambda c: c["name"])
def test_compute_pr_aggregates_matches_fixture(case):
    from payment_request_routes import compute_pr_aggregates

    agg = compute_pr_aggregates(case["lines"])
    assert agg == case["expected"]


def test_line_cancelled_variants():
    """cancelled = cột cancelled, HOẶC rejected + lý do chứa 'hủy/huỷ' (mirror fromApiAttempt FE)."""
    from payment_request_routes import _line_cancelled

    assert _line_cancelled({"cancelled": True, "status": "paid"}) is True
    assert _line_cancelled({"status": "rejected", "reject_reason": "khách HUỶ"}) is True
    assert _line_cancelled({"status": "rejected", "reject_reason": "Huy don"}) is True
    assert _line_cancelled({"status": "rejected", "reject_reason": "sai so tien"}) is False
    assert _line_cancelled({"status": "paid", "reject_reason": "hủy"}) is False  # chỉ rejected mới xét reason
    assert _line_cancelled({"status": "pending"}) is False
```

- [ ] **Step 2: Chạy — FAIL** (ImportError)

Run: `cd backend && python -m pytest tests/test_pr_aggregates_helper.py -v`

- [ ] **Step 3: Implement helper** — trong `backend/payment_request_routes.py`, sau `_sum_paid_amount` (~dòng 268):

```python
import re as _re

_CANCEL_REASON_RE = _re.compile(r"hu(y|ỷ|ỷ)", _re.IGNORECASE)


def _line_cancelled(line: dict[str, Any]) -> bool:
    """Mirror FE fromApiAttempt: cancelled = raw.cancelled ?? (status rejected + reason 'hủy').

    reason match cả dạng tổ hợp (ỷ = U+1EF7) lẫn dạng rời (y + U+0309) — FE regex có cả 2.
    """
    if line.get("cancelled"):
        return True
    status = str(line.get("status") or "").lower()
    if status != "rejected":
        return False
    return bool(_CANCEL_REASON_RE.search(str(line.get("reject_reason") or "")))


def compute_pr_aggregates(lines: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate cho cột payment_requests — semantics = golden fixture prAggregateCases.json.

    Mirror FE: normalizeRequest (done/total trên line 'live' = không cancelled),
    displayReceived (paid: trả góp đã verify dùng verified_received, còn lại gross amount),
    hasUnverifiedInstallment, hasPendingQrPayments.
    """
    done = total = 0
    display = 0
    has_pending_qr = False
    has_unverified = False
    for line in lines:
        status = str(line.get("status") or "").lower()
        method = str(line.get("method") or "").lower()
        cancelled = _line_cancelled(line)
        if not cancelled:
            total += 1
            if status == "paid":
                done += 1
            if method == "qr" and status == "pending":
                has_pending_qr = True
        if status == "paid":
            if method == "installment" and line.get("verified_received") is not None:
                display += int(_parse_amount(line.get("verified_received")))
            else:
                display += int(_parse_amount(line.get("amount")))
            if method == "installment" and line.get("verified_received") is None:
                has_unverified = True
    return {
        "done_count": done,
        "total_count": total,
        "display_received": display,
        "has_pending_qr": has_pending_qr,
        "has_unverified_installment": has_unverified,
    }
```

- [ ] **Step 4: Chạy — PASS**

Run: `cd backend && python -m pytest tests/test_pr_aggregates_helper.py -v`
Expected: 9 fixture cases + cancelled variants pass.

- [ ] **Step 5: Commit**

```bash
git add backend/payment_request_routes.py backend/tests/test_pr_aggregates_helper.py
git commit -m "feat(pr-agg): compute_pr_aggregates + _line_cancelled khop golden fixture"
```

---

### Task 3: Migration + persist aggregate tại mutation + backfill + parity script

**Files:**
- Create: `backend/migrations/2026-07-11-pr-aggregate-columns.sql`
- Modify: `backend/payment_request_routes.py` (`recompute_payment_request_totals` ~dòng 1230-1280)
- Create: `backend/scripts/backfill_pr_aggregates.py`
- Create: `backend/scripts/verify_pr_aggregates.py`
- Test: `backend/tests/test_pr_aggregates_helper.py` (thêm test recompute)

- [ ] **Step 1: Migration SQL**

`backend/migrations/2026-07-11-pr-aggregate-columns.sql`:

```sql
-- GĐ2 slim list: cột aggregate cho payment_requests.
-- BE ghi tại recompute_payment_request_totals (cùng chỗ received/state).
-- Backfill bằng backend/scripts/backfill_pr_aggregates.py (KHÔNG backfill bằng SQL —
-- semantics 'cancelled' có regex tiếng Việt, giữ 1 nguồn logic duy nhất ở Python helper).
alter table payment_requests
  add column if not exists done_count integer not null default 0,
  add column if not exists total_count integer not null default 0,
  add column if not exists display_received numeric not null default 0,
  add column if not exists has_pending_qr boolean not null default false,
  add column if not exists has_unverified_installment boolean not null default false;

comment on column payment_requests.display_received is 'Sum hien thi: tra gop da verify dung verified_received, con lai gross. Semantics = prAggregateCases.json';
```

- [ ] **Step 2: Failing test cho recompute mở rộng** — thêm vào `test_pr_aggregates_helper.py`:

```python
def test_recompute_persists_aggregate_columns(monkeypatch):
    """recompute_payment_request_totals phải update đủ 7 cột (received/state + 5 aggregate)."""
    from unittest.mock import MagicMock
    import payment_request_routes as prr

    pr_row = {"id": "PR1", "state": "pending", "target": 5000000, "received": 0}
    lines = [{"id": "L1", "method": "qr", "status": "paid", "amount": 5000000}]
    captured = {}

    def _table(name):
        t = MagicMock()
        for m in ("select", "eq", "in_", "order", "range", "limit"):
            getattr(t, m).return_value = t
        if name == "payment_requests":
            def _update(payload):
                captured.update(payload)
                return t
            t.update.side_effect = _update
            t.execute.return_value = MagicMock(data=[pr_row])
        else:
            t.execute.return_value = MagicMock(data=lines)
        return t

    sb = MagicMock()
    sb.table.side_effect = _table
    monkeypatch.setattr(prr, "sync_ledger_for_pr", lambda *a, **k: None, raising=False)

    prr.recompute_payment_request_totals(sb, "PR1")
    assert captured["received"] == 5000000
    assert captured["state"] == "done"
    assert captured["done_count"] == 1
    assert captured["total_count"] == 1
    assert captured["display_received"] == 5000000
    assert captured["has_pending_qr"] is False
    assert captured["has_unverified_installment"] is False
```

Run: `cd backend && python -m pytest tests/test_pr_aggregates_helper.py::test_recompute_persists_aggregate_columns -v` → FAIL (KeyError done_count).

Lưu ý: nếu import `sync_ledger_for_pr` trong recompute là local-import (from revenue_routes import ...) thì monkeypatch trên không cần — bỏ dòng đó nếu gây lỗi; state "done" sẽ chạy nhánh ledger trong try/except sẵn có nên không vỡ test.

- [ ] **Step 3: Implement** — sửa `recompute_payment_request_totals`:

1. Query lines (~dòng 1251-1255): `.select("amount, status")` → `.select("amount, status, method, cancelled, verified_received, reject_reason")`.
2. Sau `state = _compute_state(received, target)` (~dòng 1259) thêm:

```python
    aggregates = compute_pr_aggregates(line_res.data or [])
```

3. Update (~dòng 1263): `.update({"received": received, "state": state})` →

```python
        .update({"received": received, "state": state, **aggregates})
```

Nhánh early-return PR cancelled (~dòng 1242-1249) GIỮ NGUYÊN — PR huỷ đóng băng aggregate, FE bucket "Đã huỷ" không dùng các số này.

- [ ] **Step 4: AUDIT các đường mutation** — mọi chỗ đổi `payment_lines` (status/amount/cancelled/verified_received) phải gọi `recompute_payment_request_totals`. Chạy:

```bash
cd backend && grep -n "recompute_payment_request_totals" payment_request_routes.py
grep -n 'table("payment_lines")' payment_request_routes.py | grep -v select
```

Đối chiếu: mỗi `.update(...)`/`.insert(...)`/`.delete()` lên payment_lines trong route handler phải có recompute sau đó (trực tiếp hoặc trong cùng helper). Các đường đã biết: mark-paid (~1306, ~1336), add line (~2109), patch target (~1778), patch amount (nội bộ recompute ~1263). Tìm thêm: reject line, cancel line, verify trả góp (verified_received), webhook SePay (cả `main.py`: `grep -n "payment_lines" main.py`). Chỗ nào thiếu → thêm `recompute_payment_request_totals(sb, pr_id)` sau mutation, trong try/except như pattern hiện có. Ghi lại danh sách chỗ đã thêm vào commit message.

- [ ] **Step 5: Backfill script**

`backend/scripts/backfill_pr_aggregates.py`:

```python
"""Backfill 5 cột aggregate từ payment_lines — chạy 1 lần sau migration.

Usage:  cd backend && python scripts/backfill_pr_aggregates.py [--dry-run]
Env:    SUPABASE_URL + SUPABASE_SECRET_KEY (giống BE runtime; sandbox hoặc prod tuỳ env).
KHÔNG gọi recompute_payment_request_totals: hàm đó sync ledger cho PR done/over
(side effect không mong muốn khi backfill hàng loạt) — dùng thẳng compute_pr_aggregates.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import _supabase  # noqa: E402  (client factory dùng chung env BE)
from payment_request_routes import _chunked, compute_pr_aggregates  # noqa: E402

DRY = "--dry-run" in sys.argv


def main() -> None:
    sb = _supabase()
    if sb is None:
        raise SystemExit("Thieu SUPABASE_URL / SUPABASE_SECRET_KEY")

    prs: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table("payment_requests").select("id")
            .order("created_at", desc=True).range(offset, offset + 499).execute()
        )
        rows = res.data or []
        prs.extend(rows)
        if len(rows) < 500:
            break
        offset += 500

    lines_by_pr: dict[str, list[dict]] = {}
    pr_ids = [str(p["id"]) for p in prs]
    for chunk in _chunked(pr_ids, 100):
        res = (
            sb.table("payment_lines")
            .select("payment_request_id, amount, status, method, cancelled, verified_received, reject_reason")
            .in_("payment_request_id", chunk).execute()
        )
        for line in res.data or []:
            lines_by_pr.setdefault(str(line["payment_request_id"]), []).append(line)

    updated = 0
    for pr_id in pr_ids:
        agg = compute_pr_aggregates(lines_by_pr.get(pr_id, []))
        if DRY:
            print(f"[dry] {pr_id}: {agg}")
        else:
            sb.table("payment_requests").update(agg).eq("id", pr_id).execute()
        updated += 1
    print(f"{'[dry-run] ' if DRY else ''}Backfilled {updated}/{len(pr_ids)} PR")


if __name__ == "__main__":
    main()
```

Lưu ý: nếu bảng `payment_lines` KHÔNG có cột `cancelled` (select lỗi PGRST204/column not found) → bỏ `cancelled` khỏi select ở script + `recompute` (Step 3) — `_line_cancelled` vẫn đúng nhờ nhánh reject_reason; helper đọc `line.get("cancelled")` trả None → False.

- [ ] **Step 6: Parity script (guardrail số 1 của GĐ2)**

`backend/scripts/verify_pr_aggregates.py`:

```python
"""Đối chiếu cột aggregate vs tính lại từ payment_lines. Read-only, exit 1 nếu lệch.

Usage: cd backend && python scripts/verify_pr_aggregates.py
Chạy BẮT BUỘC sau backfill (sandbox + prod) và TRƯỚC khi bật FE slim.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import _supabase  # noqa: E402
from payment_request_routes import _chunked, compute_pr_aggregates  # noqa: E402

AGG_COLS = ["done_count", "total_count", "display_received", "has_pending_qr", "has_unverified_installment"]


def main() -> None:
    sb = _supabase()
    if sb is None:
        raise SystemExit("Thieu SUPABASE_URL / SUPABASE_SECRET_KEY")

    prs: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table("payment_requests")
            .select("id, state, received, " + ", ".join(AGG_COLS))
            .order("created_at", desc=True).range(offset, offset + 499).execute()
        )
        rows = res.data or []
        prs.extend(rows)
        if len(rows) < 500:
            break
        offset += 500

    lines_by_pr: dict[str, list[dict]] = {}
    for chunk in _chunked([str(p["id"]) for p in prs], 100):
        res = (
            sb.table("payment_lines")
            .select("payment_request_id, amount, status, method, cancelled, verified_received, reject_reason")
            .in_("payment_request_id", chunk).execute()
        )
        for line in res.data or []:
            lines_by_pr.setdefault(str(line["payment_request_id"]), []).append(line)

    mismatches = 0
    for pr in prs:
        if str(pr.get("state") or "").lower() == "cancelled":
            continue  # PR huỷ đóng băng aggregate (chủ ý — xem recompute)
        expected = compute_pr_aggregates(lines_by_pr.get(str(pr["id"]), []))
        actual = {c: pr.get(c) for c in AGG_COLS}
        # numeric của Postgres về dạng str/Decimal tuỳ driver — ép int trước khi so
        actual["display_received"] = int(float(actual.get("display_received") or 0))
        diff = {k: (actual[k], expected[k]) for k in AGG_COLS if actual[k] != expected[k]}
        if diff:
            mismatches += 1
            print(f"MISMATCH {pr['id']}: {diff}")
    print(f"Checked {len(prs)} PR — {mismatches} mismatch")
    if mismatches:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Chạy test BE + commit**

```bash
cd backend && python -m pytest tests/test_pr_aggregates_helper.py tests/test_pr_list_load_all.py -v
git add backend/migrations/2026-07-11-pr-aggregate-columns.sql backend/payment_request_routes.py backend/scripts/backfill_pr_aggregates.py backend/scripts/verify_pr_aggregates.py backend/tests/test_pr_aggregates_helper.py
git commit -m "feat(pr-agg): migration 5 cot aggregate + recompute persist + backfill/parity scripts"
```

---

### Task 4: BE — list mode `?fields=slim`

**Files:**
- Modify: `backend/payment_request_routes.py` (list endpoint)
- Test: `backend/tests/test_pr_slim_list.py` (tạo mới)

- [ ] **Step 1: Failing tests**

Tạo `backend/tests/test_pr_slim_list.py` (dùng lại `_make_client` — copy từ `test_pr_list_load_all.py`, thêm import):

```python
"""GĐ2: list ?fields=slim — không payments, số đọc từ cột aggregate."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.test_pr_list_load_all import _make_client  # noqa: E402


def _pr_full(i):
    return {
        "id": f"PR{i}", "sale_email": "s@x.com", "state": "short",
        "created_at": "2026-07-01T00:00:00Z", "target": 5000000, "received": 2000000,
        "done_count": 1, "total_count": 2, "display_received": 2000000,
        "has_pending_qr": True, "has_unverified_installment": False,
    }


def test_slim_has_aggregates_no_payments(monkeypatch):
    client = _make_client(monkeypatch, [_pr_full(1)], [], total=1)
    res = client.get("/api/v1/payment-requests?fields=slim")
    assert res.status_code == 200
    item = res.json()["requests"][0]
    assert "payments" not in item
    assert item["done_count"] == 1
    assert item["total_count"] == 2
    assert item["display_received"] == 2000000
    assert item["has_pending_qr"] is True
    assert item["has_unverified_installment"] is False
    assert "referral_status" in item  # AR vẫn fetch cho chip referral


def test_slim_never_queries_payment_lines(monkeypatch):
    calls = []
    client = _make_client(monkeypatch, [_pr_full(1)], [], total=1, record_in=calls)
    res = client.get("/api/v1/payment-requests?fields=slim")
    assert res.status_code == 200
    assert not any(name == "payment_lines" for name, _ in calls)


def test_default_still_full(monkeypatch):
    """Không truyền fields → response y hệt GĐ1 (kèm payments) — FE cũ vẫn chạy."""
    line = {"id": "L1", "payment_request_id": "PR1", "status": "paid",
            "amount": 2000000, "created_at": "2026-07-01T00:00:00Z"}
    client = _make_client(monkeypatch, [_pr_full(1)], [line], total=1)
    res = client.get("/api/v1/payment-requests")
    item = res.json()["requests"][0]
    assert "payments" in item and len(item["payments"]) == 1
```

Run: `cd backend && python -m pytest tests/test_pr_slim_list.py -v` → FAIL.

- [ ] **Step 2: Implement** — trong `list_payment_requests`:

1. Thêm param vào signature: `fields: str | None = Query(None),` (sau `uid`).
2. Sau khi có `pr_rows`/`total`: `slim = _clean_text(fields).lower() == "slim"`.
3. Khối fetch `payment_lines` bọc điều kiện: `if pr_ids and not slim:` (khối AR referral_status GIỮ NGUYÊN — chip referral cần cho cả slim).
4. Trong vòng serialize, nhánh hoá:

```python
        for row in pr_rows:
            pr_id = str(row.get("id") or "")
            if slim:
                item = _serialize_payment_request(row)
                item["cancelled_at"] = row.get("cancelled_at") or None
                item["cancelled_reason"] = row.get("cancelled_reason") or None
                item["done_count"] = int(row.get("done_count") or 0)
                item["total_count"] = int(row.get("total_count") or 0)
                item["display_received"] = _parse_amount(row.get("display_received"))
                item["has_pending_qr"] = bool(row.get("has_pending_qr"))
                item["has_unverified_installment"] = bool(row.get("has_unverified_installment"))
                # CHÚ Ý: không set key "payments" — FE nhận biết slim qua payments === undefined
            else:
                item = _serialize_payment_request_list_item(
                    row, lines_by_pr.get(pr_id, []), {}, {}, name_map
                )
            # phần referral_status + các gán sau đó (sale_name...) GIỮ NGUYÊN chạy chung cho cả 2 nhánh
```

Đọc kỹ đoạn sau vòng lặp hiện tại (sau `item["referral_status"] = ...`): nếu có gán `item["sale_name"] = name_map.get(...)` hoặc tương tự — giữ chạy cho cả nhánh slim (FE cần saleName cho cột TVTS).

- [ ] **Step 3: Chạy — PASS**

Run: `cd backend && python -m pytest tests/test_pr_slim_list.py tests/test_pr_list_load_all.py tests/test_health_check_and_bill_column.py -v`

- [ ] **Step 4: Commit**

```bash
git add backend/payment_request_routes.py backend/tests/test_pr_slim_list.py
git commit -m "feat(pr-list): mode fields=slim — bo payments, so tu cot aggregate (default van full)"
```

---

### Task 5: BE — endpoint detail `GET /payment-requests/{id}`

**Files:**
- Modify: `backend/payment_request_routes.py` (thêm route TRONG `register_payment_request_routes`)
- Test: `backend/tests/test_pr_detail_endpoint.py` (tạo mới)

**CẢNH BÁO route order FastAPI:** route `/{payment_request_id}` phải khai báo SAU các route tĩnh cùng prefix (`/payment-requests/sync-pending-payos`...). Trong FastAPI path cụ thể match trước path param nếu đăng ký trước — đặt route mới ở CUỐI cụm GET `/payment-requests*` để chắc chắn.

- [ ] **Step 1: Failing tests**

Tạo `backend/tests/test_pr_detail_endpoint.py`:

```python
"""GĐ2: GET /payment-requests/{id} — full detail cho drawer, RBAC 404 không leak."""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _client(monkeypatch, pr_rows, line_rows, allowed_emails=None):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "sale@test.com"

    def _table(name):
        t = MagicMock()
        for m in ("select", "eq", "in_", "order", "range", "limit", "single"):
            getattr(t, m).return_value = t
        if name == "payment_requests":
            t.execute.return_value = MagicMock(data=pr_rows)
        elif name == "payment_lines":
            t.execute.return_value = MagicMock(data=line_rows)
        else:
            t.execute.return_value = MagicMock(data=[])
        return t

    sb = MagicMock()
    sb.table.side_effect = _table
    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: allowed_emails)
    monkeypatch.setattr(prr, "_sale_name_map", lambda sb: {"s@x.com": "Sale X"})
    monkeypatch.setattr(prr, "_build_display_names_for_lines", lambda sb, lines: {})

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    return TestClient(app)


PR = {"id": "PR1", "sale_email": "s@x.com", "state": "short", "target": 5000000,
      "received": 2000000, "created_at": "2026-07-01T00:00:00Z"}
LINE = {"id": "L1", "payment_request_id": "PR1", "status": "paid", "amount": 2000000,
        "created_at": "2026-07-01T00:00:00Z"}


def test_detail_returns_full_item(monkeypatch):
    client = _client(monkeypatch, [PR], [LINE], allowed_emails=None)  # None = thấy hết
    res = client.get("/api/v1/payment-requests/PR1")
    assert res.status_code == 200
    item = res.json()["request"]
    assert item["id"] == "PR1"
    assert len(item["payments"]) == 1
    assert item["sale_name"] == "Sale X"
    assert "referral_status" in item


def test_detail_rbac_denied_is_404(monkeypatch):
    """Sale khác team → 404 (không leak tồn tại PR)."""
    client = _client(monkeypatch, [PR], [LINE], allowed_emails=["other@x.com"])
    assert client.get("/api/v1/payment-requests/PR1").status_code == 404


def test_detail_not_found(monkeypatch):
    client = _client(monkeypatch, [], [], allowed_emails=None)
    assert client.get("/api/v1/payment-requests/PRX").status_code == 404
```

Run: `cd backend && python -m pytest tests/test_pr_detail_endpoint.py -v` → FAIL (405/404 route không tồn tại).

- [ ] **Step 2: Implement** — thêm route ở CUỐI cụm route GET trong `register_payment_request_routes` (sau route `/payment-requests/{payment_request_id}/invoice-remind` là an toàn nhất):

```python
    @router.get("/payment-requests/{payment_request_id}")
    def get_payment_request_detail(
        payment_request_id: str,
        authorization: str | None = Header(None),
    ):
        """Full detail (kèm payments) cho drawer — GĐ2 slim list lazy-load."""
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        pr_res = (
            sb.table("payment_requests").select("*")
            .eq("id", payment_request_id).limit(1).execute()
        )
        if not pr_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")
        row = pr_res.data[0]

        allowed = visible_creator_emails(sb, actor)
        if allowed is not None:
            allowed_lower = {str(e).lower() for e in allowed}
            if str(row.get("sale_email") or "").lower() not in allowed_lower:
                raise HTTPException(404, "Khong tim thay payment_request")  # 404, khong leak

        line_res = (
            sb.table("payment_lines").select("*")
            .eq("payment_request_id", payment_request_id).execute()
        )
        lines = line_res.data or []
        display_names = _build_display_names_for_lines(sb, lines)
        item = _serialize_payment_request_list_item(row, lines, {}, {}, display_names)

        name_map = _sale_name_map(sb)
        sale_name = name_map.get(str(row.get("sale_email") or "").lower())
        if sale_name:
            item["sale_name"] = sale_name

        all_courses = []
        try:
            ar_res = (
                sb.table("active_requests").select("pr_id, uids_data")
                .eq("pr_id", payment_request_id).execute()
            )
            for ar in (ar_res.data or []):
                for u in (ar.get("uids_data") or []):
                    if isinstance(u, dict):
                        for c in (u.get("courses") or []):
                            if isinstance(c, dict):
                                all_courses.append(c)
        except Exception as exc:
            print(f"Khong doc duoc active_requests for PR detail: {exc}")
        item["referral_status"] = _compute_referral_status(all_courses)
        return {"request": item}
```

- [ ] **Step 3: Chạy — PASS**

Run: `cd backend && python -m pytest tests/test_pr_detail_endpoint.py tests/test_pr_slim_list.py -v`
Kiểm tra thêm route order: `python -m pytest tests/ -q -k "payment or pr_"` — các test route cũ (sync-pending-payos...) vẫn pass.

- [ ] **Step 4: Commit**

```bash
git add backend/payment_request_routes.py backend/tests/test_pr_detail_endpoint.py
git commit -m "feat(pr-detail): GET /payment-requests/{id} — full detail cho drawer, RBAC 404"
```

---

### Task 6: FE — types + slim-aware utils

**Files:**
- Modify: `frontend/src/types/paymentRequest.ts` (interface `PaymentRequest`)
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts` (`fromApiPaymentRequest`, `normalizeRequest`, `displayReceived`, `hasUnverifiedInstallment`, `hasPendingQrPayments`)
- Test: `frontend/src/components/payment-request/paymentRequestUtils.slim.test.ts` (tạo mới)

- [ ] **Step 1: Failing tests**

Tạo `frontend/src/components/payment-request/paymentRequestUtils.slim.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  displayReceived,
  fromApiPaymentRequest,
  hasPendingQrPayments,
  hasUnverifiedInstallment,
  normalizeRequest,
} from "./paymentRequestUtils";

const SLIM_RAW = {
  id: "PR1", name: "KH", uid: "u", sale_email: "s@x.com",
  target: 5000000, received: 2000000, state: "short",
  created_at: "2026-07-10T00:00:00Z", done_count: 1, total_count: 2,
  display_received: 1650000, has_pending_qr: true, has_unverified_installment: true,
  // KHÔNG có key payments → slim
};

describe("slim row — tin số server, không tự tính lại", () => {
  it("fromApiPaymentRequest đánh dấu slim khi payments undefined", () => {
    const pr = fromApiPaymentRequest(SLIM_RAW);
    expect(pr.slim).toBe(true);
    expect(pr.payments).toEqual([]);
  });

  it("normalizeRequest KHÔNG reset received/state về 0/pending (bug chí mạng nếu quên)", () => {
    const pr = normalizeRequest(fromApiPaymentRequest(SLIM_RAW));
    expect(pr.received).toBe(2000000);
    expect(pr.state).toBe("short");
    expect(pr.doneCount).toBe(1);
    expect(pr.totalCount).toBe(2);
    expect(pr.delta).toBe(-3000000);
  });

  it("displayReceived/hasUnverifiedInstallment/pendingQr đọc server fields", () => {
    const pr = normalizeRequest(fromApiPaymentRequest(SLIM_RAW));
    expect(displayReceived(pr)).toBe(1650000);
    expect(hasUnverifiedInstallment(pr)).toBe(true);
    expect(hasPendingQrPayments([pr], new Date("2026-07-11T00:00:00Z"))).toBe(true);
  });

  it("row full (payments là mảng) → slim=false, hành vi cũ giữ nguyên", () => {
    const pr = normalizeRequest(
      fromApiPaymentRequest({ ...SLIM_RAW, payments: [{ id: "L1", method: "qr", status: "paid", amount: 2000000 }] })
    );
    expect(pr.slim).toBe(false);
    expect(pr.received).toBe(2000000); // tự tính từ payments như cũ
  });

  it("slim + payments cache (carry-over từ drawer) → số VẪN từ server, cache chỉ cho drawer", () => {
    const pr = normalizeRequest({
      ...fromApiPaymentRequest(SLIM_RAW),
      payments: [
        { id: "L9", idx: 1, amount: 999, status: "paid", createdAt: "", paidAt: null, code: "",
          billImage: null, billImages: [], bill: false, method: "qr", bank: undefined, cardLast4: null,
          installmentMonths: null, installmentPlatform: null, installmentTotal: null, saleReceived: null,
          verifiedTotal: null, verifiedReceived: null, cashier: null, paymentLinkId: null,
          transferContent: null, qrCode: null, checkoutUrl: null, cancelled: false, cancelledAt: null,
          rejectReason: null, confirmedBy: null, confirmedByName: null, confirmedAt: null,
          confirmedSource: null, nameForTransfer: null, isContentStale: false, studentName: null },
      ],
    });
    expect(pr.received).toBe(2000000); // KHÔNG phải 999
    expect(displayReceived(pr)).toBe(1650000);
  });
});
```

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.slim.test.ts` → FAIL.

- [ ] **Step 2: Types** — trong `frontend/src/types/paymentRequest.ts`, interface `PaymentRequest` thêm:

```ts
  /** GĐ2 slim list: true = row không kèm payments thật — MỌI con số lấy từ server fields, payments chỉ là cache drawer */
  slim?: boolean;
  serverDisplayReceived?: number;
  serverHasPendingQr?: boolean;
  serverHasUnverifiedInstallment?: boolean;
```

- [ ] **Step 3: Implement utils**

`fromApiPaymentRequest` — thay dòng `payments: Array.isArray(raw.payments) ? ... : []`:

```ts
    payments: Array.isArray(raw.payments) ? raw.payments.map(fromApiAttempt) : [],
    slim: !Array.isArray(raw.payments),
    serverDisplayReceived: typeof raw.display_received === "number" ? raw.display_received : undefined,
    serverHasPendingQr: typeof raw.has_pending_qr === "boolean" ? raw.has_pending_qr : undefined,
    serverHasUnverifiedInstallment:
      typeof raw.has_unverified_installment === "boolean" ? raw.has_unverified_installment : undefined,
```

`normalizeRequest` — thêm early-return đầu hàm:

```ts
export function normalizeRequest(req: PaymentRequest): PaymentRequest {
  if (req.slim) {
    // Slim: received/state/doneCount/totalCount là cột BE (recompute_payment_request_totals).
    // payments (nếu có) là cache drawer — TUYỆT ĐỐI không tính số từ nó.
    const state: PaymentRequestStatus =
      req.cancelledAt || req.state === "cancelled" ? "cancelled" : req.state;
    return { ...req, state, delta: req.received - req.target };
  }
  // ... phần cũ giữ nguyên
```

`displayReceived` — thêm đầu hàm:

```ts
  if (pr.slim) return pr.serverDisplayReceived ?? pr.received;
```

`hasUnverifiedInstallment` — thêm đầu hàm:

```ts
  if (pr.slim) return pr.serverHasUnverifiedInstallment ?? false;
```

`hasPendingQrPayments` — dòng cuối trong `.some(...)` thay bằng:

```ts
    if (pr.slim) return pr.serverHasPendingQr ?? false;
    return pr.payments.some((p) => !p.cancelled && p.method === "qr" && p.status === "pending");
```

- [ ] **Step 4: Chạy — PASS toàn bộ tests FE**

Run: `cd frontend && npx vitest run src/components/payment-request/ && npx tsc -b`
Expected: slim tests + aggregates fixture tests + pendingQr tests + tests cũ pass. Fixture test Task 1 pass vì row có `payments` array → slim=false → nhánh cũ.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/paymentRequest.ts frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.slim.test.ts
git commit -m "feat(pr-slim): FE tin so server tren row slim — normalizeRequest/display/flags"
```

---

### Task 7: AUDIT — mọi chỗ merge response PR vào state

**Bối cảnh:** `slim` suy từ `raw.payments === undefined`. Nhiều response mutation (create PR, cancel, restore, patch...) trả payment_request KHÔNG kèm payments → parse ra `slim:true`. Nếu merge nguyên con vào row đang full → row nhiễm slim + server fields cũ/thiếu → số sai. Task này rà từng chỗ.

**Files:**
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts` (`mergeAddPaymentLineResponse`)
- Modify: các call site tìm thấy khi audit (PaymentFlowContext.tsx, PaymentRequestsTab.tsx)

- [ ] **Step 1: Liệt kê call sites**

```bash
cd frontend && grep -rn "fromApiPaymentRequest" src --include="*.ts*" | grep -v test | grep -v "export function"
```

- [ ] **Step 2: Áp quy tắc cho TỪNG site** theo bảng:

| Response có `payments` array? | Merge vào row nào? | Hành động |
|---|---|---|
| Có | bất kỳ | Không cần sửa — parse ra slim=false chuẩn |
| Không | row mới/thay nguyên con (vd list slim) | Giữ slim=true — đúng thiết kế |
| Không | row ĐÃ CÓ payments thật (mutation response) | Merge phải: giữ `payments` hiện tại + set `slim: false` + GIỮ server fields cũ nếu response không có |

`mergeAddPaymentLineResponse` (paymentRequestUtils.ts ~dòng 153-176) sửa 2 chỗ:

```ts
  if (Array.isArray(prRaw?.payments) && prRaw.payments.length > 0) {
    return normalizeRequest(fromApiPaymentRequest(prRaw));
  }
  // ... phần giữa giữ nguyên ...
  const prFromBe = fromApiPaymentRequest(prRaw);
  return normalizeRequest({ ...current, ...prFromBe, payments, slim: false });
```

(điểm sửa duy nhất: thêm `slim: false` vào object cuối — payments đã được truyền tường minh nên normalizeRequest tính lại từ payments như cũ)

Các site khác trong PaymentFlowContext/PaymentRequestsTab (vd handler cancel/restore/update dùng `CreatePrResponse`): nếu code hiện tại đã chỉ spread field cụ thể hoặc giữ `r.payments` → không sửa; nếu thay nguyên con row bằng `normalizeRequest(fromApiPaymentRequest(res.data...))` mà response không kèm payments → đổi thành pattern:

```ts
setRequests((prev) =>
  prev.map((r) => {
    if (r.id !== prId) return r;
    const fromBe = fromApiPaymentRequest(raw);
    return normalizeRequest({ ...r, ...fromBe, payments: r.payments, slim: r.slim && r.payments.length === 0 ? true : false });
  })
);
```

Ghi lại danh sách site đã sửa/đã xác nhận-không-cần-sửa vào commit message.

- [ ] **Step 3: Chạy full FE test + typecheck**

Run: `cd frontend && npm run test && npx tsc -b`

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src
git commit -m "fix(pr-slim): audit merge response — khong de row full nhiem slim/mat payments"
```

---

### Task 8: FE — loadData slim + carry-over cache + hydrate drawer

**Files:**
- Modify: `frontend/src/lib/api.ts` (list params + endpoint detail)
- Modify: `frontend/src/contexts/PaymentFlowContext.tsx` (loadData, hydratePr, context value)
- Modify: `frontend/src/components/PaymentRequestsTab.tsx` (effect hydrate khi mở drawer)

- [ ] **Step 1: api.ts**

```ts
    list: (params?: { limit?: number; offset?: number; fields?: "slim" }) =>
      api.get<PaymentRequestsListResponse>("/api/v1/payment-requests", { params }),
    get: (id: string) =>
      api.get<{ request: Record<string, unknown> }>(`/api/v1/payment-requests/${id}`),
```

- [ ] **Step 2: loadData — gọi slim + carry-over payments cache**

Trong `PaymentFlowContext.tsx`, khối fetch PR (đã là fetchAll từ GĐ1) sửa:

```ts
      const all = await fetchAllPaymentRequests(async (limit, offset) => {
        const response = await endpoints.paymentRequests.list({ limit, offset, fields: "slim" });
        return { requests: (response.data.requests ?? []) as unknown as RawPrRow[], total: response.data.total };
      });
      const prevById = new Map(requestsRef.current.map((r) => [r.id, r]));
      nextRequests = all.requests.map((r) => {
        const mapped = fromApiPaymentRequest(r);
        const prev = prevById.get(mapped.id);
        // Carry-over cache drawer: row slim mới + row cũ có payments thật → giữ payments.
        // slim vẫn true → số từ server; drawer đang mở sẽ tự hydrate lại (effect ở Tab).
        if (mapped.slim && prev && prev.payments.length > 0) {
          return normalizeRequest({ ...mapped, payments: prev.payments });
        }
        return normalizeRequest(mapped);
      });
```

`requestsRef`: thêm ref mirror state (đặt cạnh `loadDataSeqRef`):

```ts
  const requestsRef = useRef<PaymentRequest[]>([]);
  useEffect(() => { requestsRef.current = requests; }, [requests]);
```

(không đưa `requests` vào deps `loadData` — sẽ tạo loop refetch)

- [ ] **Step 3: hydratePr — fetch detail + seq-guard (chống bug kiểu QR cross-PR 26/6)**

Thêm vào PaymentFlowContext:

```ts
  const hydrateSeqRef = useRef<Record<string, number>>({});

  const hydratePr = useCallback(async (prId: string) => {
    const seq = (hydrateSeqRef.current[prId] = (hydrateSeqRef.current[prId] ?? 0) + 1);
    try {
      const res = await endpoints.paymentRequests.get(prId);
      if (seq !== hydrateSeqRef.current[prId]) return; // response cũ → bỏ, không đè state mới
      if (Date.now() < persistCooldownRef.current) return; // đang cooldown optimistic-persist
      const full = normalizeRequest(fromApiPaymentRequest(res.data.request));
      setRequests((prev) =>
        prev.map((r) => (r.id === prId ? { ...full, saleName: full.saleName ?? r.saleName } : r))
      );
    } catch {
      // giữ cache slim — drawer vẫn render được từ carry-over
    }
  }, []);
```

Expose `hydratePr` trong context value + type `PaymentFlowContextValue`.

- [ ] **Step 4: Tab — hydrate khi mở drawer + sau mỗi lần list refetch**

Trong `PaymentRequestsTab.tsx` (cạnh effect `nav.openPrId` ~dòng 105):

```ts
  // GĐ2: row slim → nạp full detail khi mở drawer; sau mỗi lần list refetch
  // row về lại slim (cache) → effect tự refire để lấy lines mới nhất.
  useEffect(() => {
    if (!drawerOpen || !selectedId) return;
    if (selected && !selected.slim) return;
    void hydratePr(selectedId);
  }, [drawerOpen, selectedId, selected, hydratePr]);
```

(lấy `hydratePr` từ `usePaymentFlow()` — thêm vào destructuring đầu component)

- [ ] **Step 5: Typecheck + full test + build**

Run: `cd frontend && npx tsc -b && npm run test && npm run build`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/contexts/PaymentFlowContext.tsx frontend/src/components/PaymentRequestsTab.tsx
git commit -m "feat(pr-slim): loadData fields=slim + carry-over cache + hydrate drawer co seq-guard"
```

---

### Task 9: Deploy sandbox — thứ tự nghiêm ngặt + smoke equality

- [ ] **Step 1: Migration sandbox** — chạy `backend/migrations/2026-07-11-pr-aggregate-columns.sql` trên project Supabase **palfish-gmv-sandbox** (`pxgybyfiwywksesyogti`) qua SQL editor / MCP apply_migration.

- [ ] **Step 2: Deploy BE sandbox** (FE CHƯA push):

```bash
git push origin sandbox && bash scripts/deploy.sh sandbox
```

FE sandbox lúc này vẫn gọi default full → không đổi hành vi. (Nếu Vercel auto-deploy FE theo push — không sao: FE code mới gọi `fields=slim` chỉ sau khi Task 8 nằm trong push này; nếu đã gộp chung 1 push thì BỎ QUA step tách — quan trọng là migration chạy TRƯỚC deploy.)

- [ ] **Step 3: Backfill + parity sandbox**

```bash
cd backend
# env trỏ sandbox Supabase (SUPABASE_URL/SUPABASE_SECRET_KEY của sandbox)
python scripts/backfill_pr_aggregates.py --dry-run   # soi mắt vài dòng
python scripts/backfill_pr_aggregates.py
python scripts/verify_pr_aggregates.py               # PHẢI: 0 mismatch, exit 0
```

Parity FAIL → DỪNG, không bật FE slim. Debug lệch semantics (nghi phạm số 1: `_line_cancelled` vs data thật; nghi phạm 2: đường mutation thiếu recompute — quay lại Task 3 Step 4).

- [ ] **Step 4: Smoke equality trên sandbox** (guardrail "không lỗi con" quan trọng nhất):
1. TRƯỚC khi FE slim live: ghi lại số KPI + số trên từng chip/tab + vài card (chụp màn hình).
2. Sau khi FE slim live: **mọi con số PHẢI GIỐNG HỆT** — khác 1 số bất kỳ = bug semantics, dừng lại debug.
3. DevTools Network: list request có `fields=slim`, response item không có `payments`; mở drawer → thấy call `GET /payment-requests/{id}`; drawer hiển thị đủ lần thanh toán, bill, QR.
4. Flow mutation: thêm lần thanh toán → số card cập nhật đúng; upload bill; xác nhận thử 1 line (account admin); huỷ line — sau mỗi thao tác số card khớp drawer.
5. Realtime: mở 2 tab browser, tab A xác nhận line, tab B (đang mở drawer PR đó) phải tự cập nhật trong ~vài giây.
6. Chạy lại `python scripts/verify_pr_aggregates.py` sau các thao tác — vẫn 0 mismatch (chứng minh mutation path ghi cột đúng).

- [ ] **Step 5: Soak sandbox 2-3 ngày** — team dùng bình thường; mỗi ngày chạy lại parity script. 0 mismatch liên tục → đủ điều kiện prod.

---

### Task 10: Deploy prod

- [ ] **Step 1: Báo team** — thao tác giống GĐ1: số KHÔNG được đổi lần này (GĐ2 là tối ưu tốc độ, không phải fix số). Ai thấy số lệch so với hôm trước → báo ngay.

- [ ] **Step 2: Thứ tự prod:**

```bash
# 1. Migration trên project_palfish (jozcvbbypwvzaefteoxn) — SQL editor/MCP
# 2. Merge + deploy BE
git checkout main && git pull && git merge --squash sandbox
git commit -m "perf(pr-list): slim list + lazy detail drawer — scale ~10k PR (GD2)"
git push origin main && bash scripts/deploy.sh prod
# 3. Backfill + parity prod (env trỏ prod)
cd backend && python scripts/backfill_pr_aggregates.py && python scripts/verify_pr_aggregates.py
# 4. FE tự deploy theo push main (Vercel palfish-gmv-manager)
git checkout sandbox
```

- [ ] **Step 3: Verify prod:**
1. Smoke equality như Task 9 Step 4 (số y hệt trước deploy).
2. DevTools: payload list giảm rõ (item không payments), drawer hoạt động, search "Như Ý" vẫn ra PR-2026-0034.
3. Render memory plateau (tiền sử OOM 9/7).
4. Parity script prod lần 2 sau 24h → 0 mismatch.

- [ ] **Step 4: Update memory + learnings** — memory `bug-pr-list-cap-100.md`: GĐ2 DONE; chạy skill `extract-approach` (golden-fixture-parity là pattern đáng lưu).

---

## Guardrails tổng hợp (recap)

| Guardrail | Cơ chế | Ở đâu |
|---|---|---|
| Semantics FE↔BE không lệch | Golden fixture JSON chạy chung Vitest + pytest | Task 1+2 |
| Cột aggregate đúng trên data thật | `verify_pr_aggregates.py` exit 1 khi lệch — chạy sau backfill, sau smoke, sau 24h prod | Task 3 |
| Mutation nào cũng ghi cột | Audit grep mọi write lên payment_lines + recompute | Task 3 Step 4 |
| Row full không nhiễm slim | Audit mọi call site `fromApiPaymentRequest` + quy tắc bảng | Task 7 |
| Số không được đổi khi chuyển GĐ1→GĐ2 | Smoke equality trước/sau trên cùng data | Task 9 Step 4 |
| Response cũ không đè state mới (bài học QR cross-PR 26/6) | seq-guard per-PR trong `hydratePr` + tôn trọng persistCooldown | Task 8 |
| Deploy an toàn 2 chiều | BE default vẫn full; FE slim chỉ bật khi FE mới lên | Task 4 |
| Thứ tự deploy | migration → BE → backfill → parity PASS → FE | Task 9/10 |
