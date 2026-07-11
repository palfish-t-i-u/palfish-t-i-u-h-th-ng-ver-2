# GĐ2 — PR List Slim + Lazy Detail (scale tới ~10k PR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revised 2026-07-11:** Nhập 10 sửa đổi từ nghiên cứu scale (docs/RESEARCH_SCALE_10K_PR_2026-07-11.md mục 4) — bản này THAY THẾ bản gốc, đã duyệt qua judge panel.

**Goal:** List PR bỏ mảng `payments` (payload giảm ~5×, trần scale ~10k PR); mọi con số trên card/KPI đọc từ CỘT aggregate do BE ghi tại mutation; drawer lazy-load chi tiết qua endpoint mới.

**Architecture:** DB đã lưu `received`+`state` trên `payment_requests` (BE update qua `recompute_payment_request_totals` tại mọi mutation — giữ kiến trúc recompute **app-layer**, KHÔNG đổi sang trigger DB). GĐ2 mở rộng đúng chỗ đó thêm **7 cột NULLABLE** (không NOT NULL DEFAULT):
- 5 cột aggregate từ `payment_lines`, ghi tại recompute: `done_count`, `total_count`, `display_received`, `has_pending_qr`, `has_unverified_installment`;
- `referral_status` — ghi tại mutation `active_requests` (nếu không, nhánh slim vẫn parse `uids_data` per-request = hotspot mới trên Render);
- `search_text` — normalize dấu tiếng Việt bằng **MỘT hàm Python duy nhất** mirror hàm norm FE (commit 6e0c49d), ghi tại recompute; GĐ3 chỉ còn `CREATE INDEX gin_trgm`. **KHÔNG dùng unaccent SQL** (đ là chữ cái riêng, rủi ro lệch normalize JS).

**NULL = chưa backfill → FE fallback tự tính từ payments như cũ.** Đây vừa là rollback path vừa xóa cả class lỗi thứ-tự-deploy Vercel/Render (KPI sập về 0). Semantics các cột PHẢI khớp 100% logic FE hiện tại (`normalizeRequest`/`displayReceived`/...) — chốt bằng **golden fixture JSON chạy chung cho cả pytest lẫn Vitest**. Lưới đỡ thay cho trigger DB: **parity pg_cron nightly nằm TRONG scope GĐ2** (Task 3 Step 8). List thêm mode `?fields=slim` (default vẫn full — deploy BE trước FE an toàn, rollback FE không cần rollback BE) + field tường minh `format: "slim"|"full"`. Endpoint mới `GET /payment-requests/{id}` trả full (kèm payments) cho drawer.

**Tech Stack:** FastAPI + supabase-py, Postgres (Supabase), React 19, Vitest, pytest.

**Prerequisite:** GĐ1 (plan `2026-07-11-pr-list-load-all-gd1.md`) đã merge main + chạy ổn. **Vá GĐ1 A3 (single-flight + debounce 2s cho `loadData()`) PHẢI deploy TRƯỚC khi chạy backfill** — backfill batched vẫn bắn realtime event per-row, không có single-flight là bão refetch. Trigger làm GĐ2: console.warn `total > 1500`, HOẶC chủ động làm sớm.

**Ràng buộc quan trọng (đọc trước khi code):**
- Quy tắc vàng: **row slim → MỌI con số lấy từ server fields; mảng `payments` trên row slim chỉ là CACHE cho drawer, không bao giờ dùng để tính số.** Ngoại lệ duy nhất: server field NULL (chưa backfill) → fallback tự tính từ payments như cũ.
- FE xác định slim qua field tường minh `format: "slim"|"full"` trong response; **backward-compat**: format vắng mặt (response mutation cũ create/cancel/patch không kèm payments) → fallback suy luận `raw.payments === undefined` → Task 7 có bước AUDIT bắt buộc, không bỏ qua.
- Vùng nhạy cảm: drawer/selected từng dính bug QR nhảy nhầm PR (26/6, memory `bug_qr_cross_pr_lan_anh_26_6`). Hydration phải có seq-guard chống response cũ đè state mới.
- Thứ tự deploy chuẩn: migration → BE → backfill → parity PASS → FE. Nhờ cột NULLABLE + FE fallback-if-null, **thứ tự sai cũng không sập số** (chỉ mất tối ưu tạm thời) — nhưng vẫn giữ thứ tự chuẩn để parity có ý nghĩa.

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
      "name": "paid + cancelled=true → loai khoi done/total NHUNG display_received VAN CONG (khoa semantics FE hien tai: khoi cong display nam NGOAI if-not-cancelled)",
      "lines": [{ "id": "L1", "method": "qr", "status": "paid", "amount": 2000000, "cancelled": true }],
      "expected": { "done_count": 0, "total_count": 0, "display_received": 2000000, "has_pending_qr": false, "has_unverified_installment": false }
    },
    {
      "name": "rejected ly do huy dang NFD (y + U+0309 roi, escape tuong minh trong JSON) → van la cancelled nhu dang NFC",
      "lines": [{ "id": "L1", "method": "qr", "status": "rejected", "amount": 1000000, "reject_reason": "khach hu\u0079\u0309 don" }],
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

**⚠️ Ghi chú 2 case bổ sung (nghiên cứu scale mục 4, điểm 7):**
- Case `paid + cancelled=true`: FE hiện tại (`displayReceived` trong `paymentRequestUtils.ts`) cộng MỌI line paid vào display — khối cộng nằm NGOÀI check `cancelled` (trong khi `received`/`doneCount` loại line cancelled). Case này **chốt semantics FE=BE TRƯỚC backfill**: BE helper (Task 2) phải mirror y hệt (khối display cũng nằm ngoài `if not cancelled`). Nếu nghiệp vụ muốn đổi ("huỷ thì không cộng display") → sửa FE + helper + fixture CÙNG LÚC, ngoài scope GĐ2.
- Case NFD: `reject_reason` dùng escape JSON tường minh `\u0079\u0309` (y + dấu hỏi rời) để không editor nào normalize ngầm được — khoá regex 'hủy' cả 2 phía trước cả 2 dạng NFC/NFD.

- [ ] **Step 3: Chạy — PASS ngay (fixture mô tả behavior hiện có)**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.aggregates.test.ts`
Expected: 11 passed. Nếu case nào FAIL → fixture viết sai semantics, SỬA FIXTURE cho khớp behavior FE thật (FE đang chạy prod là chân lý), tuyệt đối không sửa code FE ở task này.

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
    # NFD: 'huỷ' dạng rời y + U+0309 (khớp fixture case NFD)
    assert _line_cancelled({"status": "rejected", "reject_reason": "khach huy\u0309 don"}) is True
    assert _line_cancelled({"status": "rejected", "reject_reason": "sai so tien"}) is False
    assert _line_cancelled({"status": "paid", "reject_reason": "hủy"}) is False  # chỉ rejected mới xét reason
    assert _line_cancelled({"status": "pending"}) is False


def test_normalize_search_text_mirrors_fe_norm():
    """MỘT hàm normalize duy nhất (mirror norm FE PaymentRequestsTab.tsx:156, commit 6e0c49d):
    lower → NFD → bỏ dấu tổ hợp U+0300-U+036F → đ→d. KHÔNG dùng unaccent SQL."""
    from payment_request_routes import normalize_search_text

    assert normalize_search_text("Nguyễn Như Ý") == "nguyen nhu y"
    assert normalize_search_text("Đặng VĂN Đô") == "dang van do"
    # NFC vs NFD phải cho cùng kết quả (\u1ef7 = ỷ tổ hợp; y\u0309 = dạng rời)
    assert normalize_search_text("hu\u1ef7") == normalize_search_text("huy\u0309") == "huy"
    assert normalize_search_text("PR-2026-0034") == "pr-2026-0034"


def test_pr_search_text_concat_fields():
    """search_text = norm(id) + norm(name) + norm(uid) + norm(phone) — đúng 4 field FE đang search."""
    from payment_request_routes import _pr_search_text

    row = {"id": "PR-2026-0034", "name": "Nguyễn Như Ý", "uid": "U123", "phone": "0900000001"}
    assert _pr_search_text(row) == "pr-2026-0034 nguyen nhu y u123 0900000001"
```

- [ ] **Step 2: Chạy — FAIL** (ImportError)

Run: `cd backend && python -m pytest tests/test_pr_aggregates_helper.py -v`

- [ ] **Step 3: Implement helper** — trong `backend/payment_request_routes.py`, sau `_sum_paid_amount` (~dòng 268):

```python
import re as _re
import unicodedata as _ud

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


_D_STROKE = chr(0x0111)  # 'đ' — chữ cái riêng, KHÔNG decompose dưới NFD


def normalize_search_text(s: str) -> str:
    """MỘT hàm normalize duy nhất cho search — mirror norm FE
    (frontend/src/components/PaymentRequestsTab.tsx dòng ~156, commit 6e0c49d):
    lower → NFD → bỏ dấu tổ hợp U+0300-U+036F → đ→d.
    GĐ3 dùng LẠI hàm này để dịch param `q` (search server-side) — 1 implementation cho cả ghi lẫn query.
    KHÔNG thay bằng unaccent SQL (judge bác: rủi ro lệch đ→d/NFD so với JS).
    """
    s = _ud.normalize("NFD", str(s or "").lower())
    s = "".join(ch for ch in s if not (0x0300 <= ord(ch) <= 0x036F))  # đúng range regex FE đang strip
    return s.replace(_D_STROKE, "d")


def _pr_search_text(pr_row: dict[str, Any]) -> str:
    """Cột search_text = norm của ĐÚNG 4 field FE đang search: id, name, uid, phone.
    KHÔNG ghép tên sale (judge bác: join ngoài bảng = stale khi đổi tên nhan_su_sale)."""
    parts = [pr_row.get("id"), pr_row.get("name"), pr_row.get("uid"), pr_row.get("phone")]
    return " ".join(normalize_search_text(p) for p in parts if p)


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
        # CHÚ Ý: khối cộng display nằm NGOÀI `if not cancelled` — CHỦ ĐÍCH, mirror đúng
        # FE displayReceived hiện tại (cộng mọi line paid kể cả cancelled). Fixture case
        # "paid + cancelled=true" khoá semantics này — đổi là phải đổi cả FE + fixture.
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
Expected: 11 fixture cases + cancelled variants + normalize/search_text tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/payment_request_routes.py backend/tests/test_pr_aggregates_helper.py
git commit -m "feat(pr-agg): compute_pr_aggregates + _line_cancelled + normalize_search_text khop golden fixture"
```

---

### Task 3: Migration 7 cột NULLABLE + persist tại mutation + backfill batched + parity (script + pg_cron)

**Files:**
- Create: `backend/migrations/2026-07-11-pr-aggregate-columns.sql`
- Modify: `backend/payment_request_routes.py` (`recompute_payment_request_totals` ~dòng 1235-1286)
- Modify: `backend/activation_routes.py` (ghi `referral_status` tại mutation active_requests)
- Create: `backend/scripts/backfill_pr_aggregates.py`
- Create: `backend/scripts/verify_pr_aggregates.py`
- Test: `backend/tests/test_pr_aggregates_helper.py` (thêm test recompute + referral persist)

- [ ] **Step 1: Migration SQL** — 7 cột NULLABLE + index gộp cho GĐ3 + parity pg_cron (1 lần deploy)

`backend/migrations/2026-07-11-pr-aggregate-columns.sql`:

```sql
-- GĐ2 slim list: 7 cột aggregate/derived cho payment_requests.
-- NULLABLE CÓ CHỦ ĐÍCH (không NOT NULL DEFAULT):
--   * NULL = "chưa backfill" → FE fallback tự tính từ payments như cũ
--     (xóa class lỗi thứ-tự-deploy Vercel/Render + là rollback path)
--   * done_count IS NULL đồng thời là marker resume cho script backfill batched.
-- BE ghi 5 cột aggregate + search_text tại recompute_payment_request_totals (cùng chỗ received/state);
-- referral_status ghi tại mutation active_requests (activation_routes).
-- Backfill bằng backend/scripts/backfill_pr_aggregates.py (KHÔNG backfill bằng SQL —
-- semantics 'cancelled' có regex tiếng Việt + normalize search_text phải là 1 nguồn logic
-- duy nhất ở Python helper; KHÔNG dùng unaccent SQL).
alter table payment_requests
  add column if not exists done_count integer,
  add column if not exists total_count integer,
  add column if not exists display_received numeric,
  add column if not exists has_pending_qr boolean,
  add column if not exists has_unverified_installment boolean,
  add column if not exists referral_status text,
  add column if not exists search_text text;

comment on column payment_requests.display_received is 'Sum hien thi: tra gop da verify dung verified_received, con lai gross (KE CA line paid+cancelled — mirror FE). Semantics = prAggregateCases.json. NULL = chua backfill.';
comment on column payment_requests.referral_status is 'none|partial|full|NULL — ghi tai mutation active_requests (_compute_referral_status). Slim list doc cot nay thay parse uids_data.';
comment on column payment_requests.search_text is 'normalize_search_text(id+name+uid+phone) — 1 ham Python duy nhat, mirror norm FE commit 6e0c49d. GD3 chi con CREATE INDEX gin_trgm.';

-- ===== Index gộp cho GĐ3 (nghiên cứu scale mục 4 điểm 9 — deploy 1 lần, GĐ3 khỏi migration lại) =====
-- Keyset pagination GĐ3 step 2 (KHÔNG thay bằng composite (state, created_at, id) — vi phạm leftmost-prefix, judge bác):
create index if not exists idx_pr_created_at_id_desc
  on payment_requests (created_at desc, id desc);
-- Poll QR rẻ (GĐ3 step 6 endpoint pending-qr-ids → index-only scan):
create index if not exists idx_pr_pending_qr_created_at
  on payment_requests (created_at desc) where has_pending_qr = true;
-- 2 FK không index (advisor unindexed_foreign_keys):
create index if not exists idx_bank_transactions_matched_payment_id
  on bank_transactions (matched_payment_id);
create index if not exists idx_gateway_transactions_parent_txn_id
  on gateway_transactions (parent_txn_id);

-- ===== Parity pg_cron nightly (TRONG scope GĐ2 — lưới đỡ thay trigger DB đã bị bác) =====
create extension if not exists pg_cron;
-- (nếu apply_migration báo lỗi quyền extension → bật pg_cron qua Dashboard > Database > Extensions rồi chạy lại)

create table if not exists pr_aggregate_drift (
  id bigint generated always as identity primary key,
  pr_id text not null,
  detected_at timestamptz not null default now(),
  details jsonb not null
);

-- Detector-only: SQL mirror của compute_pr_aggregates để PHÁT HIỆN lệch — Python vẫn là
-- nguồn chân lý duy nhất. Mismatch → ghi drift + alert, KHÔNG tự sửa số bằng SQL.
create or replace function fn_check_pr_aggregate_parity()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  drift_count integer;
begin
  insert into pr_aggregate_drift (pr_id, details)
  select pr.id,
         jsonb_build_object(
           'stored', jsonb_build_object('done', pr.done_count, 'total', pr.total_count,
             'display', pr.display_received, 'pending_qr', pr.has_pending_qr, 'unverified', pr.has_unverified_installment),
           'recomputed', jsonb_build_object('done', agg.x_done, 'total', agg.x_total,
             'display', agg.x_display, 'pending_qr', agg.x_pending_qr, 'unverified', agg.x_unverified)
         )
  from payment_requests pr
  cross join lateral (
    select
      coalesce(count(*) filter (where not l.is_cancelled and l.status = 'paid'), 0) as x_done,
      coalesce(count(*) filter (where not l.is_cancelled), 0) as x_total,
      coalesce(sum(case when l.status = 'paid'
                        then case when l.method = 'installment' and l.verified_received is not null
                                  then l.verified_received else l.amount end
                        else 0 end), 0) as x_display,
      coalesce(bool_or(not l.is_cancelled and l.method = 'qr' and l.status = 'pending'), false) as x_pending_qr,
      coalesce(bool_or(l.status = 'paid' and l.method = 'installment' and l.verified_received is null), false) as x_unverified
    from (
      select pl.amount, pl.verified_received,
             lower(coalesce(pl.status, '')) as status,
             lower(coalesce(pl.method, '')) as method,
             (coalesce(pl.cancelled, false)
              or (lower(coalesce(pl.status, '')) = 'rejected'
                  and coalesce(pl.reject_reason, '') ~* 'hu(y|ỷ)')) as is_cancelled
      from payment_lines pl
      where pl.payment_request_id = pr.id
    ) l
  ) agg
  where lower(coalesce(pr.state, '')) <> 'cancelled'   -- PR huỷ đóng băng aggregate (chủ ý)
    and pr.done_count is not null                       -- chỉ soi row đã backfill
    and (pr.done_count <> agg.x_done
      or pr.total_count <> agg.x_total
      or pr.display_received <> agg.x_display
      or pr.has_pending_qr <> agg.x_pending_qr
      or pr.has_unverified_installment <> agg.x_unverified);
  get diagnostics drift_count = row_count;
  -- Alert khi drift_count > 0: INSERT vào bảng `notifications` (throttle 1 alert/ngày),
  -- cùng pattern telemetry vá GĐ1 A4; nối dingtalk_outbox sau khi migration DingTalk đã áp.
  -- ⚠️ Worker: xác nhận schema cột `notifications` qua MCP list_tables TRƯỚC khi viết khối INSERT này.
  return drift_count;
end;
$fn$;

revoke execute on function fn_check_pr_aggregate_parity() from public, anon, authenticated;

-- Schedule nightly 02:30 VN (19:30 UTC) — idempotent (chạy lại migration không nhân đôi job):
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'pr-aggregate-parity-nightly') then
    perform cron.schedule('pr-aggregate-parity-nightly', '30 19 * * *',
                          'select fn_check_pr_aggregate_parity()');
  end if;
end $$;
-- Convention (nghiên cứu scale mục 4 điểm 9): mọi function mới kèm REVOKE EXECUTE + SET search_path
-- (đã áp ở trên); nếu sau này thêm ADD CONSTRAINT → bọc DO-block idempotent như pattern trên.
-- Rollback path: cron.unschedule('pr-aggregate-parity-nightly'); DROP INDEX ...; cột NULLABLE giữ nguyên vô hại.
```

Lưu ý regex `hu(y|ỷ)` trong SQL: chỉ là **detector mirror** — nếu nightly báo drift mà `verify_pr_aggregates.py` (Python, chân lý) nói 0 mismatch → nghi lệch NFC/NFD giữa SQL regex và Python, điều tra detector chứ KHÔNG sửa cột.

- [ ] **Step 2: Failing test cho recompute mở rộng** — thêm vào `test_pr_aggregates_helper.py`:

```python
def _recompute_sb(monkeypatch, pr_row, lines, captured):
    from unittest.mock import MagicMock
    import payment_request_routes as prr

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
    return sb


def test_recompute_persists_aggregate_columns(monkeypatch):
    """recompute phải update received/state + 5 cột aggregate + search_text.
    (referral_status KHÔNG ghi ở đây — ghi tại mutation active_requests, xem Step 4)."""
    import payment_request_routes as prr

    pr_row = {"id": "PR1", "name": "Nguyễn Như Ý", "uid": "U123", "phone": "0900000001",
              "state": "pending", "target": 5000000, "received": 0}
    lines = [{"id": "L1", "method": "qr", "status": "paid", "amount": 5000000}]
    captured = {}
    sb = _recompute_sb(monkeypatch, pr_row, lines, captured)

    prr.recompute_payment_request_totals(sb, "PR1")
    assert captured["received"] == 5000000
    assert captured["state"] == "done"
    assert captured["done_count"] == 1
    assert captured["total_count"] == 1
    assert captured["display_received"] == 5000000
    assert captured["has_pending_qr"] is False
    assert captured["has_unverified_installment"] is False
    assert captured["search_text"] == "pr1 nguyen nhu y u123 0900000001"
    assert "referral_status" not in captured


def test_recompute_skips_update_when_values_unchanged(monkeypatch):
    """Giá trị không đổi → KHÔNG update — chặn realtime event no-op (nghiên cứu scale mục 4 điểm 5)."""
    import payment_request_routes as prr

    pr_row = {"id": "PR1", "name": "Nguyễn Như Ý", "uid": "U123", "phone": "0900000001",
              "state": "done", "target": 5000000, "received": 5000000,
              "done_count": 1, "total_count": 1, "display_received": 5000000,
              "has_pending_qr": False, "has_unverified_installment": False,
              "search_text": "pr1 nguyen nhu y u123 0900000001"}
    lines = [{"id": "L1", "method": "qr", "status": "paid", "amount": 5000000}]
    captured = {}
    sb = _recompute_sb(monkeypatch, pr_row, lines, captured)

    result = prr.recompute_payment_request_totals(sb, "PR1")
    assert captured == {}  # update KHÔNG được gọi
    assert result["received"] == 5000000
```

Run: `cd backend && python -m pytest tests/test_pr_aggregates_helper.py -v -k recompute` → FAIL (KeyError done_count / captured không rỗng).

Lưu ý: nếu import `sync_ledger_for_pr` trong recompute là local-import (from revenue_routes import ...) thì monkeypatch trên không cần — bỏ dòng đó nếu gây lỗi; state "done" sẽ chạy nhánh ledger trong try/except sẵn có nên không vỡ test.

- [ ] **Step 3: Implement** — sửa `recompute_payment_request_totals`:

1. Query lines (~dòng 1256-1261): `.select("amount, status")` → `.select("amount, status, method, cancelled, verified_received, reject_reason")`.
2. Sau `state = _compute_state(received, target)` (~dòng 1264) thêm khối tính giá trị mới + **so sánh trước khi ghi** (chỉ UPDATE khi giá trị thực đổi — chặn realtime event no-op):

```python
    aggregates = compute_pr_aggregates(line_res.data or [])
    new_values = {
        "received": received,
        "state": state,
        "search_text": _pr_search_text(pr_row),
        **aggregates,
    }
    # numeric của Postgres về str/Decimal tuỳ driver — ép kiểu trước khi so
    current = {
        "received": _parse_amount(pr_row.get("received")),
        "state": _clean_text(pr_row.get("state")).lower(),
        "search_text": pr_row.get("search_text"),
        "done_count": pr_row.get("done_count"),
        "total_count": pr_row.get("total_count"),
        "display_received": (
            None if pr_row.get("display_received") is None
            else int(float(pr_row.get("display_received")))
        ),
        "has_pending_qr": pr_row.get("has_pending_qr"),
        "has_unverified_installment": pr_row.get("has_unverified_installment"),
    }
    if all(current.get(k) == v for k, v in new_values.items()):
        updated = pr_row  # không có gì đổi → KHÔNG update, không bắn realtime event no-op
    else:
        update_res = (
            sb.table("payment_requests")
            .update(new_values)
            .eq("id", payment_request_id)
            .execute()
        )
        updated = update_res.data[0] if update_res.data else {**pr_row, **new_values}
```

(khối này THAY THẾ hẳn `.update({"received": received, "state": state})` cũ ~dòng 1266-1272; row NULL chưa backfill luôn lệch `current` → mutation đầu tiên tự "backfill" row đó)

3. Nhánh early-return PR cancelled (~dòng 1247-1254) GIỮ NGUYÊN — PR huỷ đóng băng aggregate, FE bucket "Đã huỷ" không dùng các số này.

- [ ] **Step 4: referral_status ghi tại mutation active_requests** (cột thứ 6 — slim list đọc cột thay parse `uids_data` per-request)

Failing test — thêm vào `test_pr_aggregates_helper.py`:

```python
def test_persist_pr_referral_status_writes_column(monkeypatch):
    """Mutation active_requests phải đẩy referral_status xuống cột payment_requests."""
    from unittest.mock import MagicMock
    from activation_routes import _persist_pr_referral_status

    captured = {}
    t = MagicMock()
    t.eq.return_value = t
    def _update(payload):
        captured.update(payload)
        return t
    t.update.side_effect = _update
    sb = MagicMock()
    sb.table.return_value = t

    uids = [{"uid": "u1", "courses": [{
        "referrer_uid": "r1",
        "referee_credited_at": "2026-07-01", "referrer_credited_at": "2026-07-01",
    }]}]
    _persist_pr_referral_status(sb, "PR1", uids)
    assert captured == {"referral_status": "full"}

    captured.clear()
    _persist_pr_referral_status(sb, None, uids)  # AR không gắn PR → no-op
    assert captured == {}
```

Implement — trong `backend/activation_routes.py`, cạnh `_compute_referral_status` (~dòng 301):

```python
def _persist_pr_referral_status(sb, pr_id: str | None, uids_data: list) -> None:
    """GĐ2: đẩy referral_status xuống cột payment_requests tại MỌI mutation active_requests.
    Slim list (Task 4) đọc cột này — không parse uids_data per-request nữa.
    Fail-soft: lỗi ghi cột không được làm vỡ mutation chính."""
    if not pr_id:
        return
    courses = [
        c
        for u in (uids_data or []) if isinstance(u, dict)
        for c in (u.get("courses") or []) if isinstance(c, dict)
    ]
    try:
        sb.table("payment_requests").update(
            {"referral_status": _compute_referral_status(courses)}
        ).eq("id", pr_id).execute()
    except Exception as exc:
        print(f"[activation] persist referral_status skipped: {exc}")
```

Gọi `_persist_pr_referral_status(sb, pr_id, uids_data)` SAU mỗi chỗ ghi `active_requests` — grep xác nhận đủ:

```bash
cd backend && grep -n 'table("active_requests")' activation_routes.py | grep -vE "select"
```

Các đường đã biết: insert AR (~dòng 1160, 1166), update uids_data (~1438, ~1875), patch AR (~1792 — chỉ khi patch có uids_data). Đường cộng buổi referral (referee/referrer_credited_at) đi qua update uids_data nên đã phủ — xác nhận bằng grep.

- [ ] **Step 5: AUDIT các đường mutation** — mọi chỗ đổi `payment_lines` (status/amount/cancelled/verified_received) phải gọi `recompute_payment_request_totals`. Chạy:

```bash
cd backend && grep -n "recompute_payment_request_totals" payment_request_routes.py
grep -n 'table("payment_lines")' payment_request_routes.py | grep -v select
```

Đối chiếu: mỗi `.update(...)`/`.insert(...)`/`.delete()` lên payment_lines trong route handler phải có recompute sau đó (trực tiếp hoặc trong cùng helper). Các đường đã biết: mark-paid (~1306, ~1336), add line (~2109), patch target (~1778), patch amount (nội bộ recompute). Tìm thêm: reject line, cancel line, verify trả góp (verified_received), webhook SePay (cả `main.py`: `grep -n "payment_lines" main.py`). Chỗ nào thiếu → thêm `recompute_payment_request_totals(sb, pr_id)` sau mutation, trong try/except như pattern hiện có. Ghi lại danh sách chỗ đã thêm vào commit message.

**Thêm cho search_text:** `patch_payment_request` (~dòng 1744+) đổi được `name`/`phone` (các field trong search_text) mà KHÔNG đụng payment_lines → sau patch thành công, gọi `recompute_payment_request_totals(sb, payment_request_id)` (rẻ — so-sánh-trước-ghi nên chỉ UPDATE khi search_text thực đổi) hoặc set thẳng `search_text` trong payload patch bằng `_pr_search_text(row_sau_patch)`. Chọn 1 trong 2, ghi vào commit message.

- [ ] **Step 6: Backfill script — batched + resume tự nhiên + confirm project-ref**

**Vận hành (đọc trước khi chạy):**
- **Chạy off-hours** — mỗi UPDATE vẫn bắn realtime event per-row (fact judge đã sửa: batched KHÔNG gộp event); vì thế vá GĐ1 A3 single-flight PHẢI deploy trước (xem Prerequisite).
- Marker resume = `done_count IS NULL`: script chết giữa chừng → chạy lại là tiếp tục đúng chỗ, không làm lại từ đầu.
- Script **BẮT BUỘC in project-ref và bắt gõ confirm** trước khi ghi — chống chạy nhầm prod/sandbox.
- Xong backfill → chạy `ANALYZE payment_requests;` qua MCP execute_sql / SQL editor (PostgREST không chạy được ANALYZE) — cập nhật statistics cho index mới.

`backend/scripts/backfill_pr_aggregates.py`:

```python
"""Backfill 7 cột (5 aggregate + referral_status + search_text) — batched, resume tự nhiên.

Usage:  cd backend && python scripts/backfill_pr_aggregates.py [--dry-run]
Env:    SUPABASE_URL + SUPABASE_SECRET_KEY (giống BE runtime; sandbox hoặc prod tuỳ env).
Batch:  SELECT id ... WHERE done_count IS NULL LIMIT 500 → compute Python → UPDATE từng row
        → loop tới hết (marker NULL tự resume). Chạy OFF-HOURS (realtime event per-row).
KHÔNG gọi recompute_payment_request_totals: hàm đó sync ledger cho PR done/over
(side effect không mong muốn khi backfill hàng loạt) — dùng thẳng compute_pr_aggregates.
KHÔNG backfill bằng SQL: semantics cancelled/normalize là 1 nguồn logic duy nhất ở Python.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from activation_routes import _compute_referral_status  # noqa: E402
from main import _supabase  # noqa: E402  (client factory dùng chung env BE)
from payment_request_routes import _chunked, _pr_search_text, compute_pr_aggregates  # noqa: E402

DRY = "--dry-run" in sys.argv
BATCH = 500


def _confirm_project() -> None:
    url = os.environ.get("SUPABASE_URL", "")
    ref = url.split("//")[-1].split(".")[0] or "<khong ro>"
    print(f"### Project-ref sap GHI: {ref} ({url})")
    if DRY:
        return
    if input(f"Go dung project-ref de xac nhan ghi [{ref}]: ").strip() != ref:
        raise SystemExit("Confirm sai — dung lai, khong ghi gi ca.")


def _fetch_batch(sb) -> list[dict]:
    res = (
        sb.table("payment_requests")
        .select("id, name, uid, phone")
        .filter("done_count", "is", "null")   # marker resume
        .limit(BATCH)
        .execute()
    )
    return res.data or []


def main() -> None:
    sb = _supabase()
    if sb is None:
        raise SystemExit("Thieu SUPABASE_URL / SUPABASE_SECRET_KEY")
    _confirm_project()

    total_done = 0
    while True:
        batch = _fetch_batch(sb)
        if not batch:
            break
        pr_ids = [str(p["id"]) for p in batch]

        lines_by_pr: dict[str, list[dict]] = {}
        ar_by_pr: dict[str, list[dict]] = {}
        for chunk in _chunked(pr_ids, 100):
            res = (
                sb.table("payment_lines")
                .select("payment_request_id, amount, status, method, cancelled, verified_received, reject_reason")
                .in_("payment_request_id", chunk).execute()
            )
            for line in res.data or []:
                lines_by_pr.setdefault(str(line["payment_request_id"]), []).append(line)
            ar_res = (
                sb.table("active_requests").select("pr_id, uids_data")
                .in_("pr_id", chunk).execute()
            )
            for ar in ar_res.data or []:
                ar_by_pr.setdefault(str(ar.get("pr_id") or ""), []).append(ar)

        for pr in batch:
            pr_id = str(pr["id"])
            payload = compute_pr_aggregates(lines_by_pr.get(pr_id, []))
            courses = [
                c
                for ar in ar_by_pr.get(pr_id, [])
                for u in (ar.get("uids_data") or []) if isinstance(u, dict)
                for c in (u.get("courses") or []) if isinstance(c, dict)
            ]
            payload["referral_status"] = _compute_referral_status(courses)
            payload["search_text"] = _pr_search_text(pr)
            if DRY:
                print(f"[dry] {pr_id}: {payload}")
            else:
                sb.table("payment_requests").update(payload).eq("id", pr_id).execute()
            total_done += 1

        print(f"...batch xong, tong cong {total_done} PR")
        if DRY:
            print("[dry-run] chi soi 1 batch dau (khong ghi → marker NULL khong doi, loop se lap vo han)")
            break

    print(f"{'[dry-run] ' if DRY else ''}Backfilled {total_done} PR")
    if not DRY:
        print("NHO CHAY: ANALYZE payment_requests; (qua MCP execute_sql / SQL editor)")


if __name__ == "__main__":
    main()
```

Lưu ý: nếu bảng `payment_lines` KHÔNG có cột `cancelled` (select lỗi PGRST204/column not found) → bỏ `cancelled` khỏi select ở script + `recompute` (Step 3) — `_line_cancelled` vẫn đúng nhờ nhánh reject_reason; helper đọc `line.get("cancelled")` trả None → False. (Khi đó cũng bỏ `coalesce(pl.cancelled,false)` trong SQL parity Step 1.)

- [ ] **Step 7: Parity script (guardrail số 1 của GĐ2)**

`backend/scripts/verify_pr_aggregates.py`:

```python
"""Đối chiếu 7 cột vs tính lại từ payment_lines/active_requests/pr fields. Read-only, exit 1 nếu lệch.

Usage: cd backend && python scripts/verify_pr_aggregates.py
Chạy BẮT BUỘC sau backfill (sandbox + prod) và TRƯỚC khi bật FE slim.
Đây là CHÂN LÝ parity (cùng helper Python với write-path); SQL pg_cron nightly chỉ là detector.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from activation_routes import _compute_referral_status  # noqa: E402
from main import _supabase  # noqa: E402
from payment_request_routes import _chunked, _pr_search_text, compute_pr_aggregates  # noqa: E402

AGG_COLS = ["done_count", "total_count", "display_received", "has_pending_qr", "has_unverified_installment"]
ALL_COLS = AGG_COLS + ["referral_status", "search_text"]


def main() -> None:
    sb = _supabase()
    if sb is None:
        raise SystemExit("Thieu SUPABASE_URL / SUPABASE_SECRET_KEY")

    prs: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table("payment_requests")
            .select("id, state, received, name, uid, phone, " + ", ".join(ALL_COLS))
            .order("created_at", desc=True).range(offset, offset + 499).execute()
        )
        rows = res.data or []
        prs.extend(rows)
        if len(rows) < 500:
            break
        offset += 500

    lines_by_pr: dict[str, list[dict]] = {}
    ar_by_pr: dict[str, list[dict]] = {}
    for chunk in _chunked([str(p["id"]) for p in prs], 100):
        res = (
            sb.table("payment_lines")
            .select("payment_request_id, amount, status, method, cancelled, verified_received, reject_reason")
            .in_("payment_request_id", chunk).execute()
        )
        for line in res.data or []:
            lines_by_pr.setdefault(str(line["payment_request_id"]), []).append(line)
        ar_res = (
            sb.table("active_requests").select("pr_id, uids_data")
            .in_("pr_id", chunk).execute()
        )
        for ar in ar_res.data or []:
            ar_by_pr.setdefault(str(ar.get("pr_id") or ""), []).append(ar)

    mismatches = 0
    for pr in prs:
        if str(pr.get("state") or "").lower() == "cancelled":
            continue  # PR huỷ đóng băng aggregate (chủ ý — xem recompute)
        pr_id = str(pr["id"])
        if pr.get("done_count") is None:
            mismatches += 1
            print(f"CHUA BACKFILL {pr_id}: done_count IS NULL — chạy lại backfill script")
            continue
        expected = compute_pr_aggregates(lines_by_pr.get(pr_id, []))
        courses = [
            c
            for ar in ar_by_pr.get(pr_id, [])
            for u in (ar.get("uids_data") or []) if isinstance(u, dict)
            for c in (u.get("courses") or []) if isinstance(c, dict)
        ]
        expected["referral_status"] = _compute_referral_status(courses)
        expected["search_text"] = _pr_search_text(pr)
        actual = {c: pr.get(c) for c in ALL_COLS}
        # numeric của Postgres về dạng str/Decimal tuỳ driver — ép int trước khi so
        actual["display_received"] = int(float(actual.get("display_received") or 0))
        diff = {k: (actual[k], expected[k]) for k in ALL_COLS if actual[k] != expected[k]}
        if diff:
            mismatches += 1
            print(f"MISMATCH {pr_id}: {diff}")
    print(f"Checked {len(prs)} PR — {mismatches} mismatch")
    if mismatches:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 8: Kích hoạt + kiểm parity pg_cron nightly (trong scope GĐ2 — KHÔNG đợi GĐ3)**

Sau khi migration Step 1 đã áp (sandbox trước — Task 9):
1. Xác nhận job tồn tại: `select jobname, schedule from cron.job;` (qua MCP execute_sql) → thấy `pr-aggregate-parity-nightly`.
2. Chạy tay 1 lần sau backfill: `select fn_check_pr_aggregate_parity();` → PHẢI trả `0` và `select count(*) from pr_aggregate_drift;` = 0.
3. Hoàn thiện khối alert trong function (đọc schema `notifications` qua MCP list_tables trước — xem comment trong SQL Step 1); test bằng cách sửa tay 1 giá trị cột trên sandbox → chạy lại function → 1 drift + 1 alert row → sửa lại giá trị đúng, xoá row drift test.
4. Ngưỡng vận hành (đưa vào monitoring): drift > 0 → alert ngay; 3 đêm liên tiếp có drift → truy write-path lậu (mutation nào ghi payment_lines mà không recompute).

- [ ] **Step 9: Chạy test BE + commit**

```bash
cd backend && python -m pytest tests/test_pr_aggregates_helper.py tests/test_pr_list_load_all.py -v
git add backend/migrations/2026-07-11-pr-aggregate-columns.sql backend/payment_request_routes.py backend/activation_routes.py backend/scripts/backfill_pr_aggregates.py backend/scripts/verify_pr_aggregates.py backend/tests/test_pr_aggregates_helper.py
git commit -m "feat(pr-agg): migration 7 cot nullable + recompute persist (skip no-op) + referral/search_text + backfill batched + parity script/cron"
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
        "referral_status": "partial", "search_text": "pr1 kh u 09",
    }


def test_slim_has_aggregates_no_payments(monkeypatch):
    client = _make_client(monkeypatch, [_pr_full(1)], [], total=1)
    res = client.get("/api/v1/payment-requests?fields=slim")
    assert res.status_code == 200
    item = res.json()["requests"][0]
    assert item["format"] == "slim"  # field tường minh — FE đọc format thay suy luận
    assert "payments" not in item
    assert item["done_count"] == 1
    assert item["total_count"] == 2
    assert item["display_received"] == 2000000
    assert item["has_pending_qr"] is True
    assert item["has_unverified_installment"] is False
    assert item["referral_status"] == "partial"  # đọc CỘT (Task 3 Step 4), không parse uids_data


def test_slim_null_aggregates_passthrough(monkeypatch):
    """Row chưa backfill → BE trả nguyên NULL (KHÔNG ép về 0) — FE cần null để fallback."""
    pr = {**_pr_full(1), "done_count": None, "total_count": None, "display_received": None,
          "has_pending_qr": None, "has_unverified_installment": None, "referral_status": None}
    client = _make_client(monkeypatch, [pr], [], total=1)
    item = client.get("/api/v1/payment-requests?fields=slim").json()["requests"][0]
    assert item["done_count"] is None
    assert item["display_received"] is None
    assert item["has_pending_qr"] is None


def test_slim_never_queries_payment_lines_nor_active_requests(monkeypatch):
    calls = []
    client = _make_client(monkeypatch, [_pr_full(1)], [], total=1, record_in=calls)
    res = client.get("/api/v1/payment-requests?fields=slim")
    assert res.status_code == 200
    assert not any(name == "payment_lines" for name, _ in calls)
    assert not any(name == "active_requests" for name, _ in calls)  # referral đọc cột — hết hotspot parse


def test_default_still_full(monkeypatch):
    """Không truyền fields → response y hệt GĐ1 (kèm payments) + format='full' — FE cũ vẫn chạy."""
    line = {"id": "L1", "payment_request_id": "PR1", "status": "paid",
            "amount": 2000000, "created_at": "2026-07-01T00:00:00Z"}
    client = _make_client(monkeypatch, [_pr_full(1)], [line], total=1)
    res = client.get("/api/v1/payment-requests")
    item = res.json()["requests"][0]
    assert "payments" in item and len(item["payments"]) == 1
    assert item["format"] == "full"
```

Run: `cd backend && python -m pytest tests/test_pr_slim_list.py -v` → FAIL.

- [ ] **Step 2: Implement** — trong `list_payment_requests`:

1. Thêm param vào signature: `fields: str | None = Query(None),` (sau `uid`).
2. Sau khi có `pr_rows`/`total`: `slim = _clean_text(fields).lower() == "slim"`.
3. Khối fetch `payment_lines` bọc điều kiện: `if pr_ids and not slim:`. Khối fetch `active_requests` (~dòng 1693-1708) CŨNG bọc `if pr_ids and not slim:` — nhánh slim đọc CỘT `referral_status` (Task 3 Step 4 ghi tại mutation AR), không parse `uids_data` per-request nữa (né hotspot mới trên Render).
4. Trong vòng serialize, nhánh hoá:

```python
        for row in pr_rows:
            pr_id = str(row.get("id") or "")
            if slim:
                item = _serialize_payment_request(row)
                item["format"] = "slim"  # field tường minh — thay hidden contract payments===undefined
                item["cancelled_at"] = row.get("cancelled_at") or None
                item["cancelled_reason"] = row.get("cancelled_reason") or None
                # QUAN TRỌNG: trả NGUYÊN giá trị cột, KỂ CẢ None (chưa backfill) —
                # ép int(None or 0) sẽ giết fallback-if-null của FE.
                item["done_count"] = row.get("done_count")
                item["total_count"] = row.get("total_count")
                dr = row.get("display_received")
                item["display_received"] = _parse_amount(dr) if dr is not None else None
                item["has_pending_qr"] = row.get("has_pending_qr")
                item["has_unverified_installment"] = row.get("has_unverified_installment")
                item["referral_status"] = row.get("referral_status")
                # CHÚ Ý: không set key "payments" — FE cũ (chưa đọc format) vẫn suy luận đúng
            else:
                item = _serialize_payment_request_list_item(
                    row, lines_by_pr.get(pr_id, []), {}, {}, name_map
                )
                item["format"] = "full"
                # nhánh full GIỮ NGUYÊN phần referral_status parse từ ars_by_pr như cũ
            # các gán sau đó (sale_name...) GIỮ NGUYÊN chạy chung cho cả 2 nhánh
```

Đọc kỹ đoạn sau vòng lặp hiện tại (sau `item["referral_status"] = ...`): nếu có gán `item["sale_name"] = name_map.get(...)` hoặc tương tự — giữ chạy cho cả nhánh slim (FE cần saleName cho cột TVTS).

- [ ] **Step 3: Chạy — PASS**

Run: `cd backend && python -m pytest tests/test_pr_slim_list.py tests/test_pr_list_load_all.py tests/test_health_check_and_bill_column.py -v`

- [ ] **Step 4: Commit**

```bash
git add backend/payment_request_routes.py backend/tests/test_pr_slim_list.py
git commit -m "feat(pr-list): mode fields=slim + format tuong minh — bo payments, so tu cot aggregate (default van full)"
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
    assert item["format"] == "full"
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
        item["format"] = "full"  # field tường minh — drawer hydrate parse ra slim=false chắc chắn

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
  created_at: "2026-07-10T00:00:00Z", format: "slim", done_count: 1, total_count: 2,
  display_received: 1650000, has_pending_qr: true, has_unverified_installment: true,
  // format tường minh; cũng KHÔNG có key payments (khớp BE slim thật)
};

describe("slim row — tin số server, không tự tính lại", () => {
  it("fromApiPaymentRequest đánh dấu slim qua format tường minh", () => {
    const pr = fromApiPaymentRequest(SLIM_RAW);
    expect(pr.slim).toBe(true);
    expect(pr.payments).toEqual([]);
  });

  it("backward-compat: format vắng mặt → fallback suy luận payments === undefined", () => {
    const { format: _f, ...noFormat } = SLIM_RAW;
    expect(fromApiPaymentRequest(noFormat).slim).toBe(true); // không payments → slim
    expect(
      fromApiPaymentRequest({ ...noFormat, payments: [] }).slim
    ).toBe(false); // có mảng payments (dù rỗng) → full như cũ
  });

  it('format: "full" thắng suy luận — mutation response tương lai có format thì tin format', () => {
    const pr = fromApiPaymentRequest({ ...SLIM_RAW, format: "full", payments: [] });
    expect(pr.slim).toBe(false);
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

  it('row full (format: "full" + payments) → slim=false, hành vi cũ giữ nguyên', () => {
    const pr = normalizeRequest(
      fromApiPaymentRequest({
        ...SLIM_RAW,
        format: "full",
        payments: [{ id: "L1", method: "qr", status: "paid", amount: 2000000 }],
      })
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

  it("fallback-if-null: server fields NULL (chưa backfill) → tự tính từ payments như cũ, không sập", () => {
    const nullRaw = {
      ...SLIM_RAW,
      done_count: null, total_count: null, display_received: null,
      has_pending_qr: null, has_unverified_installment: null,
    };
    // (a) không cache → fallback trên payments rỗng: count 0, flags false — nhưng
    // received/state VẪN là cột server GĐ1, KPI tiền không sập về 0.
    const bare = normalizeRequest(fromApiPaymentRequest(nullRaw));
    expect(bare.received).toBe(2000000);
    expect(bare.state).toBe("short");
    expect(bare.doneCount).toBe(0);
    expect(hasUnverifiedInstallment(bare)).toBe(false);
    // (b) có cache payments (carry-over) → tính từ cache đúng như logic GĐ1
    const cached = normalizeRequest({
      ...fromApiPaymentRequest(nullRaw),
      payments: [
        { id: "L9", idx: 1, amount: 2000000, status: "paid", createdAt: "", paidAt: null, code: "",
          billImage: null, billImages: [], bill: false, method: "qr", bank: undefined, cardLast4: null,
          installmentMonths: null, installmentPlatform: null, installmentTotal: null, saleReceived: null,
          verifiedTotal: null, verifiedReceived: null, cashier: null, paymentLinkId: null,
          transferContent: null, qrCode: null, checkoutUrl: null, cancelled: false, cancelledAt: null,
          rejectReason: null, confirmedBy: null, confirmedByName: null, confirmedAt: null,
          confirmedSource: null, nameForTransfer: null, isContentStale: false, studentName: null },
      ],
    });
    expect(cached.doneCount).toBe(1);
    expect(displayReceived(cached)).toBe(2000000);
  });
});
```

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.slim.test.ts` → FAIL.

- [ ] **Step 2: Types** — trong `frontend/src/types/paymentRequest.ts` thêm union type + fields:

```ts
/** GĐ2: field tường minh từ BE — thay hidden contract payments === undefined */
export type PrRowFormat = "slim" | "full";
```

Interface `PaymentRequest` thêm:

```ts
  /** GĐ2 slim list: true = row không kèm payments thật — MỌI con số lấy từ server fields
   *  (trừ khi field null = chưa backfill → fallback tự tính từ payments như cũ);
   *  payments chỉ là cache drawer */
  slim?: boolean;
  serverDoneCount?: number;
  serverTotalCount?: number;
  serverDisplayReceived?: number;
  serverHasPendingQr?: boolean;
  serverHasUnverifiedInstallment?: boolean;
```

- [ ] **Step 3: Implement utils**

`fromApiPaymentRequest` — thay dòng `payments: Array.isArray(raw.payments) ? ... : []`:

```ts
    payments: Array.isArray(raw.payments) ? raw.payments.map(fromApiAttempt) : [],
    // format tường minh thắng; vắng format (mutation response cũ) → fallback suy luận như trước
    slim:
      raw.format === "slim" || raw.format === "full"
        ? raw.format === "slim"
        : !Array.isArray(raw.payments),
    // typeof === "number"/"boolean" tự nhiên loại null → undefined = "chưa backfill", kích fallback
    serverDoneCount: typeof raw.done_count === "number" ? raw.done_count : undefined,
    serverTotalCount: typeof raw.total_count === "number" ? raw.total_count : undefined,
    serverDisplayReceived: typeof raw.display_received === "number" ? raw.display_received : undefined,
    serverHasPendingQr: typeof raw.has_pending_qr === "boolean" ? raw.has_pending_qr : undefined,
    serverHasUnverifiedInstallment:
      typeof raw.has_unverified_installment === "boolean" ? raw.has_unverified_installment : undefined,
```

`normalizeRequest` — thêm early-return đầu hàm:

```ts
export function normalizeRequest(req: PaymentRequest): PaymentRequest {
  if (req.slim) {
    // Slim: received/state là cột BE (recompute_payment_request_totals) — GIỮ NGUYÊN, không tính lại.
    // doneCount/totalCount: server fields; NULL (chưa backfill) → fallback tự tính từ payments như cũ.
    // payments (nếu có) là cache drawer — ngoài nhánh fallback, TUYỆT ĐỐI không tính số từ nó.
    const payments = req.payments || [];
    const live = payments.filter((p) => !p.cancelled);
    const doneCount = req.serverDoneCount ?? live.filter((p) => p.status === "paid").length;
    const totalCount = req.serverTotalCount ?? live.length;
    const state: PaymentRequestStatus =
      req.cancelledAt || req.state === "cancelled" ? "cancelled" : req.state;
    return { ...req, payments, state, doneCount, totalCount, delta: req.received - req.target };
  }
  // ... phần cũ giữ nguyên
```

`displayReceived` — thêm đầu hàm (fallback-if-null: rơi xuống reduce cũ):

```ts
  if (pr.slim && pr.serverDisplayReceived != null) return pr.serverDisplayReceived;
  // slim + null (chưa backfill) → tính từ payments như cũ (body reduce hiện tại giữ nguyên)
```

`hasUnverifiedInstallment` — thêm đầu hàm:

```ts
  if (pr.slim && pr.serverHasUnverifiedInstallment != null) return pr.serverHasUnverifiedInstallment;
  // null → .some(...) cũ trên payments
```

`hasPendingQrPayments` — dòng cuối trong `.some(...)` thay bằng:

```ts
    if (pr.slim && pr.serverHasPendingQr != null) return pr.serverHasPendingQr;
    return pr.payments.some((p) => !p.cancelled && p.method === "qr" && p.status === "pending");
```

- [ ] **Step 4: Chạy — PASS toàn bộ tests FE**

Run: `cd frontend && npx vitest run src/components/payment-request/ && npx tsc -b`
Expected: slim tests (format + fallback-if-null) + aggregates fixture tests + pendingQr tests + tests cũ pass. Fixture test Task 1 pass vì raw không có `format` nhưng có `payments` array → suy luận slim=false → nhánh cũ.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/paymentRequest.ts frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.slim.test.ts
git commit -m "feat(pr-slim): FE doc format tuong minh + tin so server, fallback-if-null tu payments"
```

---

### Task 7: AUDIT — mọi chỗ merge response PR vào state

**Bối cảnh:** `slim` giờ đọc từ field tường minh `format: "slim"|"full"` (Task 4/5/6) — nhưng **response mutation cũ (create PR, cancel, restore, patch...) KHÔNG có format và KHÔNG kèm payments** → FE fallback suy luận `raw.payments === undefined` → parse ra `slim:true`. Nếu merge nguyên con vào row đang full → row nhiễm slim + server fields cũ/thiếu → số sai. Task này rà từng chỗ. (Về sau nếu thêm `format` vào các response mutation BE thì audit này nhẹ đi — nhưng GĐ2 KHÔNG bắt buộc sửa BE mutation, chỉ audit FE.)

**Files:**
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts` (`mergeAddPaymentLineResponse`)
- Modify: các call site tìm thấy khi audit (PaymentFlowContext.tsx, PaymentRequestsTab.tsx)

- [ ] **Step 1: Liệt kê call sites**

```bash
cd frontend && grep -rn "fromApiPaymentRequest" src --include="*.ts*" | grep -v test | grep -v "export function"
```

- [ ] **Step 2: Áp quy tắc cho TỪNG site** theo bảng:

| Response có gì? | Merge vào row nào? | Hành động |
|---|---|---|
| `format: "full"` HOẶC có `payments` array | bất kỳ | Không cần sửa — parse ra slim=false chuẩn |
| `format: "slim"` (list slim) | row mới/thay nguyên con | Giữ slim=true — đúng thiết kế |
| KHÔNG format + KHÔNG payments (mutation response cũ) | row ĐÃ CÓ payments thật | Merge phải: giữ `payments` hiện tại + set `slim: false` + GIỮ server fields cũ nếu response không có |

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

### Task 9: Deploy sandbox — thứ tự chuẩn + smoke equality

**Ghi chú thứ tự deploy (đã nới nhờ 7 cột NULLABLE — nghiên cứu scale mục 4 điểm 1+10):** thứ tự CHUẨN vẫn là migration → BE → backfill → parity PASS → FE, nhưng đây không còn là ràng buộc sống-còn: FE slim lên trước backfill chỉ gặp field NULL → fallback tự tính từ payments như cũ, số không sập về 0. Các ràng buộc "không đảo, đảo là KPI=0" của bản plan gốc đã XÓA — không cần dàn xếp Vercel/Render deploy khớp nhau từng phút nữa.

- [ ] **Step 1: Migration sandbox** — chạy `backend/migrations/2026-07-11-pr-aggregate-columns.sql` (7 cột + index gộp + pg_cron parity) trên project Supabase **palfish-gmv-sandbox** (`pxgybyfiwywksesyogti`) qua SQL editor / MCP apply_migration. Sau migration chạy `get_advisors` — 0 finding mới thì mới coi là xong (thủ tục cố định).

- [ ] **Step 2: Deploy BE sandbox** (FE CHƯA push):

```bash
git push origin sandbox && bash scripts/deploy.sh sandbox
```

FE sandbox lúc này vẫn gọi default full → không đổi hành vi. (Nếu Vercel auto-deploy FE theo push cũng KHÔNG sao — cột NULLABLE + fallback-if-null đỡ; chỉ lưu ý số card sẽ tạm tính theo fallback cho tới khi backfill xong.)

- [ ] **Step 3: Backfill + parity sandbox** — chạy **off-hours** (backfill bắn realtime event per-row; đã có single-flight GĐ1 A3 đỡ nhưng vẫn lịch sự với user đang online)

```bash
cd backend
# env trỏ sandbox Supabase (SUPABASE_URL/SUPABASE_SECRET_KEY của sandbox)
python scripts/backfill_pr_aggregates.py --dry-run   # soi mắt vài dòng
python scripts/backfill_pr_aggregates.py             # script IN PROJECT-REF, gõ đúng ref mới ghi
# ANALYZE payment_requests;  ← chạy qua MCP execute_sql / SQL editor sau khi script xong
python scripts/verify_pr_aggregates.py               # PHẢI: 0 mismatch, exit 0
# Parity cron: select fn_check_pr_aggregate_parity();  ← chạy tay qua MCP → phải trả 0
```

Parity FAIL → DỪNG, không bật FE slim. Debug lệch semantics (nghi phạm số 1: `_line_cancelled` vs data thật — đặc biệt case paid+cancelled và NFC/NFD; nghi phạm 2: đường mutation thiếu recompute / thiếu `_persist_pr_referral_status` — quay lại Task 3 Step 4-5). Script chết giữa chừng → cứ chạy lại, marker `done_count IS NULL` tự resume.

- [ ] **Step 4: Smoke equality trên sandbox** (guardrail "không lỗi con" quan trọng nhất):
1. TRƯỚC khi FE slim live: ghi lại số KPI + số trên từng chip/tab + vài card (chụp màn hình).
2. Sau khi FE slim live: **mọi con số PHẢI GIỐNG HỆT** — khác 1 số bất kỳ = bug semantics, dừng lại debug.
3. DevTools Network: list request có `fields=slim`, response item không có `payments`; mở drawer → thấy call `GET /payment-requests/{id}`; drawer hiển thị đủ lần thanh toán, bill, QR.
4. Flow mutation: thêm lần thanh toán → số card cập nhật đúng; upload bill; xác nhận thử 1 line (account admin); huỷ line — sau mỗi thao tác số card khớp drawer.
5. Realtime: mở 2 tab browser, tab A xác nhận line, tab B (đang mở drawer PR đó) phải tự cập nhật trong ~vài giây.
6. Chạy lại `python scripts/verify_pr_aggregates.py` sau các thao tác — vẫn 0 mismatch (chứng minh mutation path ghi cột đúng, gồm cả `referral_status` + `search_text`).
7. Search client vẫn đúng: gõ "nhu y" phải ra PR "Như Ý" (norm FE chưa đổi ở GĐ2 — search vẫn client-side; cột `search_text` chỉ để GĐ3 dùng, kiểm bằng verify script ở mục 6).
8. Đêm sau: `select count(*) from pr_aggregate_drift;` = 0 (parity cron chạy tự động sạch).

- [ ] **Step 5: Soak sandbox 2-3 ngày** — team dùng bình thường; mỗi ngày chạy lại parity script. 0 mismatch liên tục → đủ điều kiện prod.

---

### Task 10: Deploy prod

- [ ] **Step 1: Báo team** — thao tác giống GĐ1: số KHÔNG được đổi lần này (GĐ2 là tối ưu tốc độ, không phải fix số). Ai thấy số lệch so với hôm trước → báo ngay.

- [ ] **Step 2: Thứ tự prod:**

```bash
# 1. Migration trên project_palfish (jozcvbbypwvzaefteoxn) — SQL editor/MCP,
#    xong chạy get_advisors (0 finding mới = xong)
# 2. Merge + deploy BE
git checkout main && git pull && git merge --squash sandbox
git commit -m "perf(pr-list): slim list + lazy detail drawer — scale ~10k PR (GD2)"
git push origin main && bash scripts/deploy.sh prod
# 3. Backfill + parity prod (env trỏ prod) — chạy OFF-HOURS; script in project-ref,
#    PHẢI gõ đúng ref prod mới ghi (chống nhầm sandbox/prod)
cd backend && python scripts/backfill_pr_aggregates.py && python scripts/verify_pr_aggregates.py
#    rồi ANALYZE payment_requests; qua MCP execute_sql
# 4. FE tự deploy theo push main (Vercel palfish-gmv-manager)
#    (nhờ cột NULLABLE + fallback-if-null: nếu FE lỡ lên trước backfill cũng KHÔNG sập số)
git checkout sandbox
```

- [ ] **Step 3: Verify prod:**
1. Smoke equality như Task 9 Step 4 (số y hệt trước deploy).
2. DevTools: payload list giảm rõ (item không payments, có `format: "slim"`), drawer hoạt động, search "Như Ý" vẫn ra PR-2026-0034.
3. Render memory plateau (tiền sử OOM 9/7).
4. Parity script prod lần 2 sau 24h → 0 mismatch; `select count(*) from pr_aggregate_drift;` = 0 sau đêm đầu (parity cron nightly sống).

- [ ] **Step 4: Update memory + learnings** — memory `bug-pr-list-cap-100.md`: GĐ2 DONE; chạy skill `extract-approach` (golden-fixture-parity là pattern đáng lưu).

---

## Guardrails tổng hợp (recap)

| Guardrail | Cơ chế | Ở đâu |
|---|---|---|
| Semantics FE↔BE không lệch | Golden fixture JSON (11 case) chạy chung Vitest + pytest — gồm case paid+cancelled (khoá display ngoài if-not-cancelled) + case 'hủy' NFD escape tường minh | Task 1+2 |
| 7 cột đúng trên data thật | `verify_pr_aggregates.py` (Python = chân lý, đủ 7 cột) exit 1 khi lệch — chạy sau backfill, sau smoke, sau 24h prod | Task 3 Step 7 |
| Drift phát hiện tự động, không đợi người chạy script | Parity **pg_cron nightly** (detector SQL mirror) → bảng `pr_aggregate_drift` + alert; drift 3 đêm liên tiếp → truy write-path lậu | Task 3 Step 1+8 |
| Mutation nào cũng ghi cột | Audit grep mọi write lên payment_lines + recompute; mọi write active_requests + `_persist_pr_referral_status`; patch name/phone + search_text | Task 3 Step 4-5 |
| Lỗi thứ-tự-deploy không sập số | 7 cột **NULLABLE** + BE trả nguyên NULL + FE fallback-if-null (tự tính từ payments như cũ) — đồng thời là rollback path | Task 3 Step 1, Task 4, Task 6 |
| Backfill an toàn, chạy nhầm không được | Batched 500 + marker `done_count IS NULL` (resume tự nhiên) + **in project-ref bắt gõ confirm** + off-hours + ANALYZE cuối | Task 3 Step 6 |
| Backfill không gây bão realtime | Vá GĐ1 A3 single-flight deploy TRƯỚC backfill (event vẫn bắn per-row) | Prerequisite + Task 9 Step 3 |
| Recompute không spam realtime | Chỉ UPDATE khi giá trị thực đổi (so sánh trước ghi) — chặn event no-op | Task 3 Step 3 |
| Slim/full không còn hidden contract | Field tường minh `format: "slim"\|"full"` + TS union `PrRowFormat`; fallback suy luận payments===undefined khi format vắng (backward-compat) | Task 4/5/6 |
| Search không lệch normalize | MỘT hàm `normalize_search_text` Python duy nhất mirror norm FE (commit 6e0c49d); KHÔNG unaccent SQL; KHÔNG ghép tên sale | Task 2 Step 3 |
| Slim không đẻ hotspot mới | `referral_status` đọc CỘT (ghi tại mutation AR) — slim không fetch payment_lines LẪN active_requests | Task 3 Step 4 + Task 4 |
| GĐ3 khỏi migration lại | Index gộp sẵn: `(created_at DESC, id DESC)` keyset + partial `has_pending_qr` + 2 FK index; function mới kèm REVOKE + search_path; constraint bọc DO-block | Task 3 Step 1 |
| Row full không nhiễm slim | Audit mọi call site `fromApiPaymentRequest` + quy tắc bảng | Task 7 |
| Số không được đổi khi chuyển GĐ1→GĐ2 | Smoke equality trước/sau trên cùng data | Task 9 Step 4 |
| Response cũ không đè state mới (bài học QR cross-PR 26/6) | seq-guard per-PR trong `hydratePr` + tôn trọng persistCooldown | Task 8 |
| Deploy an toàn 2 chiều | BE default vẫn full; FE slim chỉ bật khi FE mới lên | Task 4 |
| Thứ tự deploy | Chuẩn: migration → BE → backfill → parity PASS → FE; nhờ NULLABLE, sai thứ tự = mất tối ưu tạm thời, KHÔNG sập | Task 9/10 |
| Migration sạch | `get_advisors` sau MỌI migration — 0 finding mới = xong | Task 9 Step 1, Task 10 Step 2 |
