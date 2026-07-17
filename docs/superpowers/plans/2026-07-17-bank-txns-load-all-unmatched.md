# Tab "CK ngoài chờ ghép" nạp toàn bộ giao dịch chưa ghép — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab "CK ngoài chờ ghép" hiển thị TOÀN BỘ giao dịch SePay chưa ghép, bất kể tuổi/số lượng — bỏ trần 200 dòng mới nhất.

**Architecture:** BE thêm `offset` paging + status alias (`unmatched`/`matched`) cho `GET /api/v1/bank-transactions` (giữ nguyên response bare-array — không phá contract). FE tách 2 luồng nạp: (1) loop trang nạp hết unmatched cho tab chờ ghép — mirror pattern `fetchAllPaymentRequests` đã proven từ fix PR-list cap 100 (plan 2026-07-11); (2) 1000 matched mới nhất cho badge nguồn (`bankByLine`). Fallback về list cũ nếu BE chưa deploy (deploy lệch Vercel/Render).

**Tech Stack:** FastAPI + supabase-py (`.range()`), React + axios, pytest (FakeSB pattern), Vitest.

---

## Bug gốc (đã xác nhận trên prod 17/7)

- BE `backend/sepay_routes.py:734` — `SELECT * ORDER BY created_at DESC LIMIT 200` (default).
- FE `frontend/src/components/ReconciliationTab.tsx:418` — `endpoints.bankTxns.list()` không param → chỉ nhận 200 dòng mới nhất, rồi filter client-side pending/needs_review.
- Prod: 796 dòng tổng, **530 unmatched** (529 pending + 1 needs_review). Giao dịch 1.000.000đ ngày 02/07 (Le Minh Khoi) có 266 dòng mới hơn → rớt khỏi top 200 → vô hình.
- Workaround tạm 17/7: đã bump `created_at` của txn `a89e53e2-848e-4d66-a3fe-5503abffadab` lên NOW() để hiện lên tab (Task 7 có bước restore tuỳ chọn).

## Đánh giá theo 3 tiêu chí

1. **Triệt để:** loop trang tới khi hết (backstop 20 trang = 10.000 dòng) — không còn trần ẩn nào cho unmatched.
2. **Không lỗi con:**
   - Response shape giữ bare-array; caller không param nhận đúng `range(0,199)` ≡ `limit(200)` cũ.
   - `bankByLine` (badge nguồn + "thời gian tiền về" tại `ReconciliationTab.tsx:1126` và `:1410`) nhận 1000 matched mới nhất — NHIỀU hơn hôm nay (≤200 dòng trộn status), không regression.
   - Deploy lệch (FE mới + BE cũ): BE cũ hiểu `status=unmatched` là `.eq()` → trả rỗng → FE fallback nạp kiểu cũ, tab không trống.
3. **Không tăng gánh nặng:** 2 request thay 1; payload unmatched ~530 dòng (~250KB trước gzip — GZipMiddleware đã bật trong `main.py`). Bảng 796 dòng, chưa cần index mới.

## File Structure

- Modify: `backend/sepay_routes.py:735-758` — offset + status alias
- Create: `backend/tests/test_bank_txns_list_paging.py` — test query shape
- Create: `frontend/src/lib/fetchAllBankTxns.ts` — helper loop trang
- Create: `frontend/src/lib/fetchAllBankTxns.test.ts` — unit tests helper
- Modify: `frontend/src/lib/api.ts:559-560` — thêm `limit`/`offset` param
- Modify: `frontend/src/lib/api.reconciliation.test.ts` — contract test param mới
- Modify: `frontend/src/components/ReconciliationTab.tsx:415-424` — rewire `loadBankTxns`
- Modify: `MODULES.md` — thêm file mới vào mục Đối soát

**Commit:** user prefers squash — 1 commit duy nhất ở Task 6 (không commit per-task).

---

### Task 1: BE test (failing) — query shape

**Files:**
- Create: `backend/tests/test_bank_txns_list_paging.py`

- [ ] **Step 1: Viết test file**

Pattern FakeSB recording — tham khảo `backend/tests/test_sepay_match_candidates.py` (build_client + patch resolve_actor/require_module_write):

```python
"""Load-all CK ngoài chờ ghép (2026-07-17).

Bug: GET /api/v1/bank-transactions LIMIT 200 theo created_at DESC →
giao dịch pending cũ (>200 dòng mới hơn) biến mất khỏi tab "CK ngoài chờ ghép".
Fix: offset paging (range) + status alias unmatched/matched.
Plan: docs/superpowers/plans/2026-07-17-bank-txns-load-all-unmatched.md
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ACTOR = MagicMock(email="ops@test.com", role="system")


class _RecordingQuery:
    """Ghi lại filter được gọi — assert query shape, không giả lập Postgrest."""

    def __init__(self, rows, calls):
        self.rows = rows
        self.calls = calls

    def select(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def range(self, start, end):
        self.calls.append(("range", start, end))
        return self

    def limit(self, value):
        self.calls.append(("limit", value))
        return self

    def eq(self, col, val):
        self.calls.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self.calls.append(("in", col, list(vals)))
        return self

    def gte(self, col, val):
        self.calls.append(("gte", col, val))
        return self

    def lte(self, col, val):
        self.calls.append(("lte", col, val))
        return self

    def execute(self):
        return MagicMock(data=self.rows)


class _FakeSB:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def table(self, name):
        return _RecordingQuery(self.rows, self.calls)


def _client_and_sb(rows=None):
    import sepay_routes

    sb = _FakeSB(rows or [])
    app = FastAPI()
    sepay_routes.register_sepay_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False), sb


def _get(client, url):
    with patch("sepay_routes.resolve_actor", return_value=ACTOR):
        with patch("sepay_routes.require_module_write"):
            return client.get(url)


def test_offset_maps_to_range():
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions?limit=500&offset=1000")
    assert res.status_code == 200
    assert ("range", 1000, 1499) in sb.calls


def test_default_call_keeps_old_window():
    """Không param → range(0,199) ≡ limit 200 cũ — caller cũ không đổi hành vi."""
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions")
    assert res.status_code == 200
    assert ("range", 0, 199) in sb.calls


def test_status_unmatched_uses_in_filter():
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions?status=unmatched")
    assert res.status_code == 200
    assert ("in", "match_status", ["pending", "needs_review"]) in sb.calls


def test_status_matched_uses_in_filter():
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions?status=matched")
    assert res.status_code == 200
    assert ("in", "match_status", ["auto_matched", "manual_matched"]) in sb.calls


def test_status_plain_still_eq():
    """status đơn (vd ignored) vẫn eq như cũ."""
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions?status=ignored")
    assert res.status_code == 200
    assert ("eq", "match_status", "ignored") in sb.calls


def test_response_stays_bare_array():
    """Contract FE: response là bare array, KHÔNG bọc object."""
    rows = [{"txn_id": "t1"}, {"txn_id": "t2"}]
    client, _sb = _client_and_sb(rows)
    res = _get(client, "/api/v1/bank-transactions")
    assert res.json() == rows
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `cd backend && python -m pytest tests/test_bank_txns_list_paging.py -v`
Expected: FAIL — `test_offset_maps_to_range`, `test_status_unmatched_uses_in_filter`, `test_status_matched_uses_in_filter` fail (endpoint hiện dùng `.limit()` không `.range()`, không có alias). `test_default_call_keeps_old_window` fail vì range chưa được gọi. `test_status_plain_still_eq` + `test_response_stays_bare_array` có thể PASS sẵn (behavior cũ) — OK.

### Task 2: BE implement — offset + status alias

**Files:**
- Modify: `backend/sepay_routes.py:735-758` (hàm `list_bank_transactions`)

- [ ] **Step 1: Sửa endpoint**

Thay signature + query block (giữ nguyên phần `q` filter và `return rows` phía dưới):

```python
    @router.get("/api/v1/bank-transactions")
    def list_bank_transactions(
        status: str | None = Query(None),
        q: str | None = Query(None),
        from_date: str | None = Query(None, alias="from"),
        to_date: str | None = Query(None, alias="to"),
        limit: int = Query(200, ge=1, le=1000),
        offset: int = Query(0, ge=0),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "reconciliation")

        # Alias nhóm status: "unmatched" = tab CK ngoài chờ ghép, "matched" = badge nguồn
        status_groups = {
            "unmatched": ["pending", "needs_review"],
            "matched": ["auto_matched", "manual_matched"],
        }

        query = (
            sb.table("bank_transactions")
            .select("*")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
        )
        if status in status_groups:
            query = query.in_("match_status", status_groups[status])
        elif status and status != "all":
            query = query.eq("match_status", status)
        if from_date:
            query = query.gte("transaction_date", from_date)
        if to_date:
            query = query.lte("transaction_date", to_date)
```

Lưu ý: `.range(a, b)` của postgrest inclusive 2 đầu → `range(0, 199)` = 200 dòng đầu, tương đương `limit(200)` cũ.

- [ ] **Step 2: Chạy test — phải PASS**

Run: `cd backend && python -m pytest tests/test_bank_txns_list_paging.py -v`
Expected: 6/6 PASS

- [ ] **Step 3: Chạy test sepay hiện có — không vỡ**

Run: `cd backend && python -m pytest tests/test_sepay_match_candidates.py tests/test_sepay_webhook.py tests/test_sepay_e2e_flow.py -v`
Expected: PASS toàn bộ. Nếu FakeSB trong test cũ thiếu method `.range()` → thêm vào class `Query` của test đó:

```python
    def range(self, start, end):
        self._limit = end - start + 1
        return self
```

### Task 3: FE helper `fetchAllBankTxns` (TDD)

**Files:**
- Create: `frontend/src/lib/fetchAllBankTxns.test.ts`
- Create: `frontend/src/lib/fetchAllBankTxns.ts`

- [ ] **Step 1: Viết test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { fetchAllBankTxns, BANK_TXN_PAGE_SIZE } from "./fetchAllBankTxns";
import type { BankTransaction } from "./api";

const txn = (id: string) => ({ txn_id: id } as BankTransaction);

describe("fetchAllBankTxns", () => {
  it("1 trang ngắn → dừng sau 1 lần gọi", async () => {
    const fetcher = vi.fn().mockResolvedValue([txn("a"), txn("b")]);
    const rows = await fetchAllBankTxns(fetcher);
    expect(rows).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(BANK_TXN_PAGE_SIZE, 0);
  });

  it("trang đầy → gọi tiếp trang sau tới khi gặp trang ngắn", async () => {
    const full = Array.from({ length: BANK_TXN_PAGE_SIZE }, (_, i) => txn(`p1-${i}`));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([txn("p2-0")]);
    const rows = await fetchAllBankTxns(fetcher);
    expect(rows).toHaveLength(BANK_TXN_PAGE_SIZE + 1);
    expect(fetcher).toHaveBeenNthCalledWith(2, BANK_TXN_PAGE_SIZE, BANK_TXN_PAGE_SIZE);
  });

  it("dedupe txn_id trùng giữa 2 trang (offset trôi khi dòng mới chen vào)", async () => {
    const full = Array.from({ length: BANK_TXN_PAGE_SIZE }, (_, i) => txn(`x-${i}`));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([txn(`x-${BANK_TXN_PAGE_SIZE - 1}`), txn("new")]);
    const rows = await fetchAllBankTxns(fetcher);
    expect(rows).toHaveLength(BANK_TXN_PAGE_SIZE + 1);
  });

  it("retry 1 lần khi trang fail; fail cả retry → throw (caller giữ state cũ)", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce([txn("a")]);
    const rows = await fetchAllBankTxns(fetcher);
    expect(rows).toHaveLength(1);

    const dead = vi.fn().mockRejectedValue(new Error("network"));
    await expect(fetchAllBankTxns(dead)).rejects.toThrow("network");
  });
});
```

- [ ] **Step 2: Chạy — phải FAIL (module chưa tồn tại)**

Run: `cd frontend && npx vitest run src/lib/fetchAllBankTxns.test.ts`
Expected: FAIL — cannot resolve `./fetchAllBankTxns`

- [ ] **Step 3: Viết helper**

```typescript
/**
 * Load-all CK ngoài chờ ghép (2026-07-17): nạp TOÀN BỘ bank txns theo 1 status
 * thay vì 200 dòng mới nhất (bug: giao dịch pending cũ biến mất khỏi tab).
 * BE trả bare array (không total) → loop tuần tự tới khi gặp trang ngắn.
 * Mirror fallback branch của fetchAllPaymentRequests.ts (plan 2026-07-11).
 * All-or-nothing: 1 trang fail sau retry → throw, caller giữ state cũ.
 */
import type { BankTransaction } from "./api";

export type BankTxnPageFetcher = (limit: number, offset: number) => Promise<BankTransaction[]>;

export const BANK_TXN_PAGE_SIZE = 500;
/** Backstop 10k dòng — chống loop vô hạn nếu BE paging sai. */
const MAX_PAGES = 20;

async function fetchPageWithRetry(
  fetchPage: BankTxnPageFetcher,
  limit: number,
  offset: number,
): Promise<BankTransaction[]> {
  try {
    return await fetchPage(limit, offset);
  } catch {
    return await fetchPage(limit, offset);
  }
}

export async function fetchAllBankTxns(fetchPage: BankTxnPageFetcher): Promise<BankTransaction[]> {
  const collected: BankTransaction[] = [];
  let offset = 0;
  let lastLen = BANK_TXN_PAGE_SIZE;
  while (lastLen === BANK_TXN_PAGE_SIZE && offset < MAX_PAGES * BANK_TXN_PAGE_SIZE) {
    const rows = await fetchPageWithRetry(fetchPage, BANK_TXN_PAGE_SIZE, offset);
    collected.push(...rows);
    lastLen = rows.length;
    offset += BANK_TXN_PAGE_SIZE;
  }
  // Dedupe txn_id — dòng mới chen vào giữa 2 lần fetch làm offset trôi → có thể trùng
  const seen = new Set<string>();
  return collected.filter((r) => {
    if (!r.txn_id || seen.has(r.txn_id)) return false;
    seen.add(r.txn_id);
    return true;
  });
}
```

- [ ] **Step 4: Chạy — phải PASS**

Run: `cd frontend && npx vitest run src/lib/fetchAllBankTxns.test.ts`
Expected: 4/4 PASS

### Task 4: FE api.ts — param `limit`/`offset` + contract test

**Files:**
- Modify: `frontend/src/lib/api.ts:559-560`
- Modify: `frontend/src/lib/api.reconciliation.test.ts`

- [ ] **Step 1: Mở rộng params của `bankTxns.list`**

Tại `api.ts:559`, thay:

```typescript
    list: (params?: { status?: string; q?: string; from?: string; to?: string }) =>
      api.get<BankTransaction[]>("/api/v1/bank-transactions", { params }),
```

thành:

```typescript
    list: (params?: { status?: string; q?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
      api.get<BankTransaction[]>("/api/v1/bank-transactions", { params }),
```

- [ ] **Step 2: Thêm contract test**

Trong `frontend/src/lib/api.reconciliation.test.ts`, thêm test mới NGAY SAU test `"list với filter status=needs_review chuyền query đúng"` (dòng 56-67), cùng describe block:

```typescript
  it("list truyền status/limit/offset lên query đúng (load-all paging)", async () => {
    let received: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/api/v1/bank-transactions`, ({ request }) => {
        received = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      }),
    );

    await endpoints.bankTxns.list({ status: "unmatched", limit: 500, offset: 500 });
    expect(received!.get("status")).toBe("unmatched");
    expect(received!.get("limit")).toBe("500");
    expect(received!.get("offset")).toBe("500");
  });
```

- [ ] **Step 3: Chạy — phải PASS**

Run: `cd frontend && npx vitest run src/lib/api.reconciliation.test.ts`
Expected: PASS toàn bộ (test cũ + mới)

### Task 5: FE ReconciliationTab — rewire `loadBankTxns`

**Files:**
- Modify: `frontend/src/components/ReconciliationTab.tsx:415-424`

- [ ] **Step 1: Thêm import** (đầu file, cạnh các import từ `../lib/`)

```typescript
import { fetchAllBankTxns } from "../lib/fetchAllBankTxns";
```

- [ ] **Step 2: Thay body `loadBankTxns`**

Thay khối `ReconciliationTab.tsx:415-424`:

```typescript
  // Tải biến động số dư ngân hàng (SePay) — dùng cho badge nguồn + tab "CK ngoài chờ ghép"
  // Load-all 2026-07-17: nạp TOÀN BỘ unmatched (bỏ trần 200 dòng) + 1000 matched mới nhất cho badge
  const loadBankTxns = useCallback(async () => {
    try {
      const [unmatched, matchedRes] = await Promise.all([
        fetchAllBankTxns((limit, offset) =>
          endpoints.bankTxns
            .list({ status: "unmatched", limit, offset })
            .then((r) => (Array.isArray(r.data) ? r.data : [])),
        ),
        endpoints.bankTxns.list({ status: "matched", limit: 1000 }),
      ]);
      const matched = Array.isArray(matchedRes.data) ? matchedRes.data : [];
      let rows = [...unmatched, ...matched];
      if (unmatched.length === 0) {
        // BE cũ chưa hiểu status=unmatched (deploy lệch/rollback) → nạp kiểu cũ, tab không trống
        const legacy = await endpoints.bankTxns.list();
        if (Array.isArray(legacy.data) && legacy.data.length > 0) rows = legacy.data;
      }
      setBankTxns(rows);
    } catch {
      setBankTxns([]);
    }
  }, []);
```

Không đổi gì ở `bankPendingTxns` (dòng 427) và `bankByLine` (dòng 514) — cả hai tiêu thụ `bankTxns` như cũ.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: 0 lỗi (BẮT BUỘC `tsc -b`, không dùng `--noEmit`)

### Task 6: Verify toàn bộ + MODULES.md + commit (squash 1 commit)

- [ ] **Step 1: Full FE test + build**

Run: `cd frontend && npm run test && npx tsc -b`
Expected: PASS toàn bộ

- [ ] **Step 2: BE tests liên quan**

Run: `cd backend && python -m pytest tests/test_bank_txns_list_paging.py tests/test_sepay_match_candidates.py tests/test_sepay_webhook.py tests/test_sepay_e2e_flow.py -v`
Expected: PASS toàn bộ

- [ ] **Step 3: Cập nhật MODULES.md**

Mục "Đối soát thẻ mPOS/Payoo" / phần SePay recon: thêm `frontend/src/lib/fetchAllBankTxns.ts` (+ test) và `backend/tests/test_bank_txns_list_paging.py`.

- [ ] **Step 4: Commit (1 commit duy nhất — user prefers squash)**

```bash
git add backend/sepay_routes.py backend/tests/test_bank_txns_list_paging.py \
  frontend/src/lib/fetchAllBankTxns.ts frontend/src/lib/fetchAllBankTxns.test.ts \
  frontend/src/lib/api.ts frontend/src/lib/api.reconciliation.test.ts \
  frontend/src/components/ReconciliationTab.tsx MODULES.md
git commit -m "fix(recon): tab CK ngoài chờ ghép nạp toàn bộ giao dịch chưa ghép — bỏ trần 200 dòng

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Kiểm tra `git status` sau add — không stage file lạ (đang có 4 file docs/HANDOFF_* untracked của session khác, KHÔNG add).

### Task 7: Deploy sandbox + verify

**Thứ tự deploy quan trọng:** FE mới + BE cũ = tab trống tạm (đã có fallback nhưng vẫn nên BE trước).

- [ ] **Step 1: Push sandbox** — `git push origin sandbox` (Vercel sandbox auto-build FE)

- [ ] **Step 2: Deploy BE Render sandbox NGAY** — `bash scripts/deploy.sh sandbox` (auto-deploy OFF, phải chạy tay)

- [ ] **Step 3: Verify API**

Login sandbox lấy token, rồi:
`GET https://<render-sandbox-url>/api/v1/bank-transactions?status=unmatched&limit=5` → 200, array, mọi phần tử `match_status ∈ {pending, needs_review}`.

- [ ] **Step 4: Verify UI sandbox**

https://palfish-gmv-manager-sandbox.vercel.app/ (login test.admin@dev) → Đối soát → tab "CK ngoài chờ ghép" load bình thường, DevTools Network thấy request `status=unmatched`. Lưu ý: DB sandbox ít dữ liệu — verify số lượng thật phải chờ prod.

- [ ] **Step 5 (prod, sau khi soak sandbox):** merge main → `bash scripts/deploy.sh prod` TRƯỚC (Vercel prod tự build từ push main) → verify tab hiện đủ ~530 dòng unmatched, giao dịch cũ nhất (giữa tháng 6) hiện ra.

- [ ] **Step 6 (tuỳ chọn, sau khi prod live):** restore `created_at` của txn đã bump tạm 17/7 (chỉ cosmetic — nếu kế toán đã ghép xong thì bỏ qua):

```sql
UPDATE bank_transactions
SET created_at = '2026-07-02 06:10:47.257592+00'
WHERE txn_id = 'a89e53e2-848e-4d66-a3fe-5503abffadab';
```

---

## Out of scope (ghi nhận, không làm ở plan này)

- `q` filter BE áp dụng SAU limit (Python-side) — flaw sẵn có, FE không dùng `q`.
- Badge `bankByLine` trần 1000 matched — đủ vài tháng; khi vượt, matched txn nên trả kèm payment line thay vì list toàn cục (GĐ2).
- Server-side pagination UI cho tab (khi unmatched > vài nghìn dòng) — cần dọn "ignored" workflow trước.
