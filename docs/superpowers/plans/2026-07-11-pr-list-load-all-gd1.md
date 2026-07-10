# GĐ1 — PR List Load-All (fix cap 100 PR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App nạp TOÀN BỘ payment requests (không còn cắt 100 PR mới nhất) — search/KPI/chip/TVTS/bucket đúng trên toàn bộ dữ liệu, kèm guardrail chống tái phát và trigger báo khi cần nâng cấp GĐ2.

**Architecture:** Giữ nguyên 100% logic đếm/hiển thị client-side. FE thay 1 call list bằng vòng lặp phân trang (trang 500, các trang sau bắn song song), dedupe theo id. BE thêm `total` (count exact, theo RBAC filter), chunk query `in_()` theo 100 id (chống query-string quá dài), và bật gzip (JSON giảm ~80%). Poll 30s chỉ xét QR pending của PR ≤ 30 ngày (chống poll vĩnh viễn vì QR bỏ quên của PR cũ).

**Tech Stack:** FastAPI + supabase-py (BE), React 19 + axios + Vitest (FE), pytest (BE tests).

**Bối cảnh bug:** Prod có 190 PR nhưng FE gọi `GET /api/v1/payment-requests` không param → BE default `limit=100` → ~90 PR cũ ẩn hoàn toàn khỏi search/KPI/chip (vd PR-2026-0034 "Như Ý"). Chi tiết: memory `bug-pr-list-cap-100`.

**Ràng buộc quan trọng (đọc trước khi code):**
- KHÔNG đụng vào logic đếm: `normalizeRequest`, `displayReceived`, chips/KPI/TVTS/bucket ở `paymentRequestUtils.ts` + `PaymentRequestsTab.tsx` giữ nguyên (trừ việc DI CHUYỂN `hasPendingQrPayments` — Task 5).
- BE endpoint giữ nguyên default `limit=100, le=500` — FE cũ (nếu rollback) vẫn chạy. KHÔNG nâng `le`.
- Sau deploy, KPI/chip prod SẼ NHẢY SỐ (89 → ~140+ "Đang theo dõi") — đây là số ĐÚNG. Task 7 có bước báo trước cho team.

---

### Task 1: BE — thêm `total` vào response + chunk `in_()` queries

**Files:**
- Modify: `backend/payment_request_routes.py` (list endpoint ~dòng 1632-1720, thêm helper gần `_group_lines_by_request` ~dòng 772)
- Test: `backend/tests/test_pr_list_load_all.py` (tạo mới)

- [ ] **Step 1: Viết failing tests**

Tạo `backend/tests/test_pr_list_load_all.py`:

```python
"""GĐ1 load-all PR list (2026-07-11).

Plan: docs/superpowers/plans/2026-07-11-pr-list-load-all-gd1.md
Bug: FE chỉ nạp 100 PR mới nhất → ~90 PR cũ ẩn khỏi search/KPI/chip.
GĐ1: BE trả `total` (count exact theo RBAC) + chunk in_() theo 100 id.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_client(monkeypatch, pr_rows, line_rows, total=None, record_in=None):
    """FastAPI TestClient với fake supabase — pattern từ test_health_check_and_bill_column."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    def _table(name):
        t = MagicMock()
        for m in ("select", "eq", "order", "range", "limit", "single"):
            getattr(t, m).return_value = t

        def _in(col, ids):
            if record_in is not None:
                record_in.append((name, list(ids)))
            return t

        t.in_.side_effect = _in
        if name == "payment_requests":
            t.execute.return_value = MagicMock(
                data=pr_rows, count=total if total is not None else len(pr_rows)
            )
        elif name == "payment_lines":
            t.execute.return_value = MagicMock(data=line_rows, count=None)
        else:
            t.execute.return_value = MagicMock(data=[], count=None)
        return t

    sb = MagicMock()
    sb.table.side_effect = _table

    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: None)
    monkeypatch.setattr(prr, "_sale_name_map", lambda sb: {})

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    return TestClient(app)


def _pr(i):
    return {"id": f"PR{i}", "sale_email": "s@x.com", "state": "pending",
            "created_at": f"2026-01-{(i % 28) + 1:02d}T00:00:00Z"}


def test_list_response_includes_total(monkeypatch):
    """Response phải có total = count exact (kể cả khi trang trả ít hơn)."""
    client = _make_client(monkeypatch, [_pr(1), _pr(2)], [], total=190)
    res = client.get("/api/v1/payment-requests?limit=2")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 190
    assert len(body["requests"]) == 2


def test_list_empty_still_has_total(monkeypatch):
    """Trang rỗng (offset vượt cuối) vẫn phải trả total — FE cần nó để dừng loop."""
    client = _make_client(monkeypatch, [], [], total=190)
    res = client.get("/api/v1/payment-requests?limit=500&offset=500")
    assert res.status_code == 200
    body = res.json()
    assert body["requests"] == []
    assert body["total"] == 190


def test_lines_and_ar_queries_chunked_by_100(monkeypatch):
    """250 PR → payment_lines + active_requests mỗi bảng 3 lượt in_ (100/100/50)."""
    calls: list[tuple[str, list]] = []
    pr_rows = [_pr(i) for i in range(250)]
    client = _make_client(monkeypatch, pr_rows, [], total=250, record_in=calls)
    res = client.get("/api/v1/payment-requests?limit=500")
    assert res.status_code == 200
    line_chunks = [len(ids) for name, ids in calls if name == "payment_lines"]
    ar_chunks = [len(ids) for name, ids in calls if name == "active_requests"]
    assert line_chunks == [100, 100, 50]
    assert ar_chunks == [100, 100, 50]


def test_chunked_helper():
    from payment_request_routes import _chunked

    assert list(_chunked([1, 2, 3, 4, 5], 2)) == [[1, 2], [3, 4], [5]]
    assert list(_chunked([], 2)) == []
    assert list(_chunked([1], 5)) == [[1]]
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `cd backend && python -m pytest tests/test_pr_list_load_all.py -v`
Expected: FAIL — `total` không có trong response (KeyError) + `ImportError: cannot import name '_chunked'`.

- [ ] **Step 3: Implement BE**

Trong `backend/payment_request_routes.py`, thêm helper module-level (đặt ngay sau `_group_lines_by_request`, ~dòng 780):

```python
def _chunked(items: list, size: int) -> list[list]:
    """Chia list thành lô — in_() với >100 uuid làm query string phình ~19KB, dễ vượt giới hạn proxy."""
    return [items[i : i + size] for i in range(0, len(items), size)]
```

Sửa list endpoint (`list_payment_requests`, ~dòng 1642-1697):

1. Dòng `query = sb.table("payment_requests").select("*")` →

```python
        query = sb.table("payment_requests").select("*", count="exact")
```

2. Sau `pr_res = (...).execute()`, lấy total:

```python
        pr_rows = pr_res.data or []
        total = pr_res.count if pr_res.count is not None else len(pr_rows)
        if not pr_rows:
            return {"requests": [], "total": total}
```

(thay cho `return {"requests": []}` cũ ~dòng 1667)

3. Khối fetch `payment_lines` (~dòng 1671-1681) thay bằng bản chunk:

```python
        lines_by_pr: dict[str, list[dict[str, Any]]] = {pr_id: [] for pr_id in pr_ids}
        if pr_ids:
            try:
                all_line_rows: list[dict[str, Any]] = []
                for chunk in _chunked(pr_ids, 100):
                    line_res = (
                        sb.table("payment_lines")
                        .select("*")
                        .in_("payment_request_id", chunk)
                        .execute()
                    )
                    all_line_rows.extend(line_res.data or [])
                grouped = _group_lines_by_request(all_line_rows)
                lines_by_pr.update(grouped)
            except Exception as exc:
                raise HTTPException(500, f"Khong doc duoc payment_lines: {exc}") from exc
```

4. Khối fetch `active_requests` (~dòng 1684-1697) thay bằng bản chunk:

```python
        ars_by_pr: dict[str, list[dict[str, Any]]] = {pr_id: [] for pr_id in pr_ids}
        if pr_ids:
            try:
                for chunk in _chunked(pr_ids, 100):
                    ar_res = (
                        sb.table("active_requests")
                        .select("pr_id, uids_data")
                        .in_("pr_id", chunk)
                        .execute()
                    )
                    for ar in (ar_res.data or []):
                        pid = str(ar.get("pr_id") or "")
                        if pid in ars_by_pr:
                            ars_by_pr[pid].append(ar)
            except Exception as exc:
                print(f"Khong doc duoc active_requests for PR referral_status: {exc}")
```

5. Return cuối endpoint: tìm chỗ trả `{"requests": requests}` (sau vòng `for row in pr_rows`) → thêm total:

```python
        return {"requests": requests, "total": total}
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `cd backend && python -m pytest tests/test_pr_list_load_all.py tests/test_health_check_and_bill_column.py -v`
Expected: PASS toàn bộ (file health-check là regression guard — endpoint này từng dính storm Storage).

Lưu ý nếu `test_list_payment_requests_does_not_list_storage` (file health-check) fail vì fake `execute` thiếu `count`: sửa fake trong file ĐÓ thành `MagicMock(data=[pr_row], count=1)` — được phép, vì response shape đổi có chủ đích.

- [ ] **Step 5: Commit**

```bash
git add backend/payment_request_routes.py backend/tests/test_pr_list_load_all.py
git commit -m "feat(pr-list): BE tra total + chunk in_() theo 100 id (GD1 load-all)"
```

---

### Task 2: BE — bật gzip

**Files:**
- Modify: `backend/main.py` (~dòng 79, sau CORSMiddleware)
- Test: `backend/tests/test_pr_list_load_all.py` (thêm 1 test)

- [ ] **Step 1: Viết failing test** — thêm vào cuối `test_pr_list_load_all.py`:

```python
def test_gzip_middleware_registered():
    """JSON list ~2KB/PR chưa nén — gzip giảm ~80% wire. Middleware phải được đăng ký."""
    from fastapi.middleware.gzip import GZipMiddleware
    import main

    assert any(m.cls is GZipMiddleware for m in main.app.user_middleware)
```

- [ ] **Step 2: Chạy — FAIL**

Run: `cd backend && python -m pytest tests/test_pr_list_load_all.py::test_gzip_middleware_registered -v`
Expected: FAIL — assert False.

- [ ] **Step 3: Implement** — trong `backend/main.py`, sau khối `app.add_middleware(CORSMiddleware, ...)` (~dòng 79-85):

```python
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1024)
```

(import đặt cùng nhóm import fastapi ở đầu file; giữ style hiện có)

- [ ] **Step 4: Chạy — PASS**

Run: `cd backend && python -m pytest tests/test_pr_list_load_all.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_pr_list_load_all.py
git commit -m "perf(be): bat gzip response (JSON list giam ~80% wire)"
```

---

### Task 3: FE — hàm `fetchAllPaymentRequests` (loop trang + song song + dedupe)

**Files:**
- Create: `frontend/src/lib/fetchAllPaymentRequests.ts`
- Test: `frontend/src/lib/fetchAllPaymentRequests.test.ts`

- [ ] **Step 1: Viết failing tests**

Tạo `frontend/src/lib/fetchAllPaymentRequests.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  fetchAllPaymentRequests,
  type PrListPage,
  type RawPrRow,
} from "./fetchAllPaymentRequests";

function row(i: number): RawPrRow {
  return { id: `PR${i}`, created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z` };
}

function pagedFetcher(rows: RawPrRow[], total = rows.length) {
  return vi.fn(async (limit: number, offset: number): Promise<PrListPage> => ({
    requests: rows.slice(offset, offset + limit),
    total,
  }));
}

describe("fetchAllPaymentRequests", () => {
  it("1 trang khi total <= PAGE_SIZE — đúng 1 call", async () => {
    const rows = Array.from({ length: 190 }, (_, i) => row(i));
    const fetcher = pagedFetcher(rows);
    const res = await fetchAllPaymentRequests(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(res.requests).toHaveLength(190);
    expect(res.total).toBe(190);
    expect(res.incomplete).toBe(false);
  });

  it("nhiều trang — gọi offset 0/500/1000, gộp đủ", async () => {
    const rows = Array.from({ length: 1037 }, (_, i) => row(i));
    const fetcher = pagedFetcher(rows);
    const res = await fetchAllPaymentRequests(fetcher);
    expect(fetcher.mock.calls.map((c) => c[1])).toEqual([0, 500, 1000]);
    expect(res.requests).toHaveLength(1037);
  });

  it("dedupe id trùng ở ranh trang (PR mới tạo giữa 2 lần fetch làm trang trượt)", async () => {
    const rows = Array.from({ length: 600 }, (_, i) => row(i));
    const fetcher = vi.fn(async (limit: number, offset: number): Promise<PrListPage> => {
      if (offset === 0) return { requests: rows.slice(0, 500), total: 600 };
      // trang 2 lặp lại phần tử cuối trang 1 (trượt offset)
      return { requests: rows.slice(499, 600), total: 600 };
    });
    const res = await fetchAllPaymentRequests(fetcher);
    const ids = res.requests.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.requests).toHaveLength(600);
  });

  it("thiếu row so với total → incomplete=true (guardrail hiển thị note)", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => row(i));
    const fetcher = pagedFetcher(rows, 450); // BE báo 450 nhưng chỉ trả được 400
    const res = await fetchAllPaymentRequests(fetcher);
    expect(res.incomplete).toBe(true);
  });

  it("BE cũ không trả total → loop tuần tự tới trang ngắn (rollback-safe)", async () => {
    const rows = Array.from({ length: 700 }, (_, i) => row(i));
    const fetcher = vi.fn(async (limit: number, offset: number): Promise<PrListPage> => ({
      requests: rows.slice(offset, offset + limit),
    }));
    const res = await fetchAllPaymentRequests(fetcher);
    expect(res.requests).toHaveLength(700);
    expect(res.total).toBeNull();
  });

  it("trang lỗi 1 lần → retry thành công", async () => {
    const rows = Array.from({ length: 600 }, (_, i) => row(i));
    let failed = false;
    const fetcher = vi.fn(async (limit: number, offset: number): Promise<PrListPage> => {
      if (offset === 500 && !failed) {
        failed = true;
        throw new Error("network");
      }
      return { requests: rows.slice(offset, offset + limit), total: 600 };
    });
    const res = await fetchAllPaymentRequests(fetcher);
    expect(res.requests).toHaveLength(600);
  });

  it("trang lỗi 2 lần liên tiếp → throw (all-or-nothing, không hiển thị số thiếu)", async () => {
    const fetcher = vi.fn(async (limit: number, offset: number): Promise<PrListPage> => {
      if (offset === 500) throw new Error("network");
      return { requests: Array.from({ length: 500 }, (_, i) => row(i)), total: 600 };
    });
    await expect(fetchAllPaymentRequests(fetcher)).rejects.toThrow("network");
  });
});
```

- [ ] **Step 2: Chạy — FAIL**

Run: `cd frontend && npx vitest run src/lib/fetchAllPaymentRequests.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Implement**

Tạo `frontend/src/lib/fetchAllPaymentRequests.ts`:

```ts
/**
 * GĐ1 load-all (2026-07-11): nạp TOÀN BỘ PR thay vì 100 PR mới nhất.
 * Trang 1 tuần tự (lấy total) → các trang còn lại song song → dedupe id.
 * All-or-nothing: 1 trang fail sau retry → throw, caller giữ state cũ
 * (KHÔNG bao giờ hiển thị danh sách thiếu — đó chính là bug gốc).
 */

export interface RawPrRow {
  id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface PrListPage {
  requests?: RawPrRow[];
  total?: number;
}

export type PrListFetcher = (limit: number, offset: number) => Promise<PrListPage>;

export const PR_PAGE_SIZE = 500;
/** Vượt ngưỡng này = đến lúc làm GĐ2 (slim list) — xem plan 2026-07-11-pr-list-slim-lazy-gd2.md */
export const PR_TOTAL_WARN_THRESHOLD = 1500;
/** Backstop 20k PR — chống loop vô hạn nếu BE trả total/paging sai. */
const MAX_PAGES = 40;

async function fetchPageWithRetry(fetchPage: PrListFetcher, limit: number, offset: number): Promise<PrListPage> {
  try {
    return await fetchPage(limit, offset);
  } catch {
    return await fetchPage(limit, offset);
  }
}

function dedupeById(rows: RawPrRow[]): RawPrRow[] {
  const seen = new Set<string>();
  const out: RawPrRow[] = [];
  for (const r of rows) {
    const id = String(r.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

export async function fetchAllPaymentRequests(fetchPage: PrListFetcher): Promise<{
  requests: RawPrRow[];
  total: number | null;
  /** true = gộp xong vẫn thiếu so với total (row đổi giữa các lần fetch) — realtime refetch sẽ tự lành */
  incomplete: boolean;
}> {
  const first = await fetchPageWithRetry(fetchPage, PR_PAGE_SIZE, 0);
  const total = typeof first.total === "number" ? first.total : null;
  const collected: RawPrRow[] = [...(first.requests ?? [])];

  if (total !== null) {
    const offsets: number[] = [];
    for (let o = PR_PAGE_SIZE; o < Math.min(total, MAX_PAGES * PR_PAGE_SIZE); o += PR_PAGE_SIZE) {
      offsets.push(o);
    }
    const rest = await Promise.all(offsets.map((o) => fetchPageWithRetry(fetchPage, PR_PAGE_SIZE, o)));
    for (const page of rest) collected.push(...(page.requests ?? []));
  } else {
    // BE cũ chưa deploy total (rollback scenario): loop tuần tự tới trang ngắn
    let offset = PR_PAGE_SIZE;
    let lastLen = (first.requests ?? []).length;
    while (lastLen === PR_PAGE_SIZE && offset < MAX_PAGES * PR_PAGE_SIZE) {
      const page = await fetchPageWithRetry(fetchPage, PR_PAGE_SIZE, offset);
      const rows = page.requests ?? [];
      collected.push(...rows);
      lastLen = rows.length;
      offset += PR_PAGE_SIZE;
    }
  }

  const requests = dedupeById(collected);
  // Giữ thứ tự created_at desc như BE (các trang song song đã theo offset, sort lại cho chắc)
  requests.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return {
    requests,
    total,
    incomplete: total !== null && requests.length < total,
  };
}
```

- [ ] **Step 4: Chạy — PASS**

Run: `cd frontend && npx vitest run src/lib/fetchAllPaymentRequests.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/fetchAllPaymentRequests.ts frontend/src/lib/fetchAllPaymentRequests.test.ts
git commit -m "feat(pr-list): fetchAllPaymentRequests — loop trang song song + dedupe + retry"
```

---

### Task 4: FE — nối vào `loadData` + guardrail total

**Files:**
- Modify: `frontend/src/lib/api.ts:122` (list nhận params)
- Modify: `frontend/src/types/paymentRequest.ts:195` (thêm `total`)
- Modify: `frontend/src/contexts/PaymentFlowContext.tsx:149-159` (loadData)

- [ ] **Step 1: api.ts** — thay dòng 122:

```ts
    list: (params?: { limit?: number; offset?: number }) =>
      api.get<PaymentRequestsListResponse>("/api/v1/payment-requests", { params }),
```

- [ ] **Step 2: types** — trong `frontend/src/types/paymentRequest.ts`, interface `PaymentRequestsListResponse` thêm field:

```ts
export interface PaymentRequestsListResponse {
  requests: PaymentRequest[];
  activeRequests: ActiveRequest[];
  total?: number;
}
```

- [ ] **Step 3: PaymentFlowContext.loadData** — thay khối try PR (dòng 149-159):

```ts
    let nextRequests: PaymentRequest[] = [];
    let prOk = false;
    try {
      const all = await fetchAllPaymentRequests(async (limit, offset) => {
        const response = await endpoints.paymentRequests.list({ limit, offset });
        return { requests: (response.data.requests ?? []) as unknown as RawPrRow[], total: response.data.total };
      });
      nextRequests = all.requests.map((r) => normalizeRequest(fromApiPaymentRequest(r)));
      prOk = true;
      if (all.incomplete) {
        notes.push("Danh sách PR tải chưa đủ — sẽ tự đồng bộ lại, hoặc bấm tải lại trang.");
      }
      if (all.total !== null && all.total > PR_TOTAL_WARN_THRESHOLD) {
        console.warn(
          `[pr-list] total=${all.total} vượt ${PR_TOTAL_WARN_THRESHOLD} — trigger GĐ2 (slim list), xem docs/superpowers/plans/2026-07-11-pr-list-slim-lazy-gd2.md`
        );
      }
    } catch {
      notes.push("GET /payment-requests chưa sẵn sàng.");
    }
```

Thêm import ở đầu file:

```ts
import {
  fetchAllPaymentRequests,
  PR_TOTAL_WARN_THRESHOLD,
  type RawPrRow,
} from "../lib/fetchAllPaymentRequests";
```

- [ ] **Step 4: Typecheck + toàn bộ unit**

Run: `cd frontend && npx tsc -b && npm run test`
Expected: 0 type errors, toàn bộ tests pass (kể cả tests cũ của tab/context nếu có — chúng mock `endpoints.paymentRequests.list`; nếu mock cũ không nhận params thì call vẫn tương thích vì params là optional; nếu test nào fail vì response thiếu `total` → hàm đã có nhánh fallback total=null, không cần sửa test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/types/paymentRequest.ts frontend/src/contexts/PaymentFlowContext.tsx
git commit -m "feat(pr-list): loadData nap toan bo PR qua fetchAll + guardrail total>1500"
```

---

### Task 5: FE — poll QR pending chỉ xét PR ≤ 30 ngày

**Bối cảnh:** `hasPendingQrPayments` quyết định bật poll 30s. Nạp cả PR cũ → QR pending bỏ quên từ tháng trước sẽ giữ poll chạy VĨNH VIỄN cho mọi user. Realtime subscription (payment_lines) vẫn bắt CK thật của PR cũ, nên giới hạn 30 ngày không mất chức năng.

**Files:**
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts` (thêm export)
- Modify: `frontend/src/contexts/PaymentFlowContext.tsx:111-116` (xoá bản local, import bản mới)
- Test: `frontend/src/components/payment-request/paymentRequestUtils.pendingQr.test.ts` (tạo mới)

- [ ] **Step 1: Viết failing tests**

Tạo `frontend/src/components/payment-request/paymentRequestUtils.pendingQr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasPendingQrPayments } from "./paymentRequestUtils";
import type { PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";

const NOW = new Date("2026-07-11T10:00:00Z");

function pr(overrides: Partial<PaymentRequest>, payments: Partial<PaymentAttempt>[]): PaymentRequest {
  return {
    id: "PR1", name: "KH", uid: "u1", phone: "", country: "VN", address: "",
    email: "", customerType: "individual", target: 1000, source: "", saleEmail: "s@x.com",
    createdAt: "2026-07-10 09:00", received: 0, doneCount: 0, totalCount: 0,
    delta: -1000, state: "pending", cancelledAt: null, cancelledReason: null,
    isTest: false,
    payments: payments.map((p, i) => ({
      id: `L${i}`, idx: i + 1, amount: 500, status: "pending", createdAt: "", paidAt: null,
      code: "", billImage: null, billImages: [], bill: false, method: "qr", bank: undefined,
      cardLast4: null, installmentMonths: null, installmentPlatform: null, installmentTotal: null,
      saleReceived: null, verifiedTotal: null, verifiedReceived: null, cashier: null,
      paymentLinkId: null, transferContent: null, qrCode: null, checkoutUrl: null,
      cancelled: false, cancelledAt: null, rejectReason: null, confirmedBy: null,
      confirmedByName: null, confirmedAt: null, confirmedSource: null, nameForTransfer: null,
      isContentStale: false, studentName: null,
      ...p,
    })),
    ...overrides,
  } as PaymentRequest;
}

describe("hasPendingQrPayments — scope 30 ngày", () => {
  it("PR mới (1 ngày) có QR pending → true", () => {
    expect(hasPendingQrPayments([pr({}, [{ method: "qr", status: "pending" }])], NOW)).toBe(true);
  });

  it("PR cũ 40 ngày có QR pending bỏ quên → false (chống poll vĩnh viễn)", () => {
    const old = pr({ createdAt: "2026-06-01 09:00" }, [{ method: "qr", status: "pending" }]);
    expect(hasPendingQrPayments([old], NOW)).toBe(false);
  });

  it("PR cancelled → false", () => {
    const cancelled = pr({ state: "cancelled" }, [{ method: "qr", status: "pending" }]);
    expect(hasPendingQrPayments([cancelled], NOW)).toBe(false);
  });

  it("line QR pending nhưng đã cancelled → false", () => {
    expect(hasPendingQrPayments([pr({}, [{ method: "qr", status: "pending", cancelled: true }])], NOW)).toBe(false);
  });

  it("createdAt không parse được → vẫn poll (fail-safe)", () => {
    const weird = pr({ createdAt: "" }, [{ method: "qr", status: "pending" }]);
    expect(hasPendingQrPayments([weird], NOW)).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy — FAIL**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.pendingQr.test.ts`
Expected: FAIL — `hasPendingQrPayments` chưa export từ utils.

- [ ] **Step 3: Implement**

Trong `paymentRequestUtils.ts`, thêm (đặt gần `parsePaymentDate`, ~dòng 539):

```ts
const PENDING_QR_POLL_WINDOW_DAYS = 30;

/**
 * Gate bật poll 30s chờ SePay webhook. Chỉ xét PR tạo trong 30 ngày —
 * QR pending bỏ quên ở PR cũ sẽ giữ poll chạy vĩnh viễn cho mọi user
 * (GĐ1 load-all nạp cả PR cũ nên rủi ro này thành hiện thực).
 * PR cũ có khách CK thật vẫn được realtime subscription (payment_lines) bắt.
 */
export function hasPendingQrPayments(requests: PaymentRequest[], now: Date = new Date()): boolean {
  const cutoff = now.getTime() - PENDING_QR_POLL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return requests.some((pr) => {
    if (pr.state === "cancelled") return false;
    const created = parsePaymentDate(pr.createdAt);
    if (created && created.getTime() < cutoff) return false;
    return pr.payments.some((p) => !p.cancelled && p.method === "qr" && p.status === "pending");
  });
}
```

Trong `PaymentFlowContext.tsx`:
- XOÁ hàm local `hasPendingQrPayments` (dòng 111-116).
- Thêm `hasPendingQrPayments` vào import sẵn có từ `"../components/payment-request/paymentRequestUtils"` (file đã import `normalizeRequest`, `fromApiPaymentRequest`, `fromApiActiveRequest` — thêm vào cùng chỗ).
- Dòng `const pendingQr = useMemo(() => hasPendingQrPayments(requests), [requests]);` giữ nguyên (default param `now`).

- [ ] **Step 4: Chạy — PASS + typecheck**

Run: `cd frontend && npx vitest run src/components/payment-request/ && npx tsc -b`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.pendingQr.test.ts frontend/src/contexts/PaymentFlowContext.tsx
git commit -m "fix(pr-list): poll QR pending chi xet PR <=30 ngay (chong poll vinh vien)"
```

---

### Task 6: Verify toàn cục

- [ ] **Step 1: Full test suites**

```bash
cd backend && python -m pytest tests/ -x -q
cd frontend && npx tsc -b && npm run test && npm run build
```

Expected: pass hết + build OK (`tsc -b` là chuẩn Vercel — KHÔNG dùng `--noEmit`).

- [ ] **Step 2: Smoke local (nếu chạy được local BE)** — bỏ qua nếu không có `.env` local, smoke trên sandbox ở Task 7.

---

### Task 7: Deploy sandbox → smoke → prod

- [ ] **Step 1: Push sandbox + deploy BE**

```bash
git push origin sandbox
bash scripts/deploy.sh sandbox
```

(FE tự deploy qua Vercel project `palfish-gmv-manager-sandbox` khi push branch sandbox)

- [ ] **Step 2: Smoke sandbox** — mở https://palfish-gmv-manager-sandbox.vercel.app/ login `test.admin@dev`:
1. Tab Quản lý thanh toán load bình thường, đủ PR (sandbox ít PR → 1 call).
2. DevTools Network: request `payment-requests?limit=500&offset=0`, response có `total`, header `Content-Encoding: gzip` (nếu payload > 1KB).
3. Mở drawer 1 PR, add payment line thử, upload bill thử — flow cũ không vỡ.
4. Console không có error mới.

- [ ] **Step 3: BÁO TEAM TRƯỚC KHI LÊN PROD** (guardrail truyền thông): nhắn anh Minh/kế toán — sau deploy, "Đang theo dõi" sẽ nhảy ~89 → ~140+ và tổng KPI tăng: đây là số ĐÚNG (trước đây app chỉ đếm 100 PR mới nhất). Tránh team tưởng data lỗi.

- [ ] **Step 4: Merge main (squash) + deploy prod**

```bash
git checkout main && git pull
git merge --squash sandbox
git commit -m "fix(pr-list): nap toan bo PR thay vi 100 moi nhat — total+gzip+chunk+poll-scope (GD1)"
git push origin main
bash scripts/deploy.sh prod
git checkout sandbox
```

(nếu `scripts/deploy.sh` không có mode prod → dùng deploy hook prod như quy trình hiện hành của repo)

- [ ] **Step 5: Verify prod**
1. Đăng nhập account SYSTEM: "Đang theo dõi" ≥ 140 (trước: 89), tab Đã huỷ tăng tương ứng. Tổng 3 tab ≈ 190.
2. Search "Như Ý" → thấy PR-2026-0034 (tạo 16/6). Search theo SĐT/UID của PR cũ khác → ra.
3. DevTools: response `total` = 190±, `Content-Encoding: gzip`.
4. Render dashboard: memory plateau sau 30-60 phút — không vượt xa mốc 236MB/512MB (tiền sử OOM 9/7; list giờ nạp ~190 PR/lượt thay 100 — tăng nhẹ là bình thường, tăng dốc là bất thường).
5. Account Sale thường (test 1 account): chỉ thấy PR trong scope RBAC như cũ, `total` = tổng theo scope (count đi qua cùng filter).

- [ ] **Step 6: Update memory** — sửa memory `bug-pr-list-cap-100.md`: DONE + commit hash + note trigger GĐ2 = console.warn total>1500.

---

## Guardrails tổng hợp (recap)

| Guardrail | Cơ chế | Ở đâu |
|---|---|---|
| Không bao giờ hiển thị list thiếu | All-or-nothing: trang fail sau retry → throw, giữ state cũ | `fetchAllPaymentRequests` |
| Phát hiện thiếu row so với count | `incomplete` → apiNote cho user | `loadData` |
| Trigger nâng cấp GĐ2 | `console.warn` khi total > 1500 | `loadData` |
| Chống loop vô hạn | MAX_PAGES=40 (20k PR) | `fetchAllPaymentRequests` |
| Chống query-string quá dài | `_chunked` 100 id/lượt `in_()` | BE list endpoint |
| Chống poll vĩnh viễn | QR pending chỉ xét PR ≤ 30 ngày | `hasPendingQrPayments` |
| Rollback an toàn 2 chiều | BE giữ default limit=100 (FE cũ chạy được); FE có nhánh total=null (BE cũ chạy được) | cả hai |
| Số nhảy sau deploy | Báo team trước khi lên prod | Task 7 Step 3 |
| Tiền sử OOM | Check memory plateau Render sau deploy | Task 7 Step 5 |
