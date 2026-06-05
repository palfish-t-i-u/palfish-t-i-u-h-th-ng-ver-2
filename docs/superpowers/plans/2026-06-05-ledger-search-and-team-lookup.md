# Ledger Search Bar + Batch Team Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width search bar to Sổ doanh thu and replace N+1 team lookups with batch loading in dashboard/report routes.

**Architecture:** Backend-first — add `search` param to `_ledger_query()` using PostgREST `.or()` filter, then wire the frontend. For batch team lookup, extract a shared `load_team_map()` function and replace N+1 loops in `_load_qr_created_maps` and `_load_m2_revenue`.

**Tech Stack:** Python/FastAPI (backend), Supabase PostgREST `.or()` filter, React/TypeScript (frontend), Tailwind CSS.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/revenue_routes.py` | Modify | Add `search` to `_ledger_query`, `_count_so_doanh_thu`, `_fetch_so_doanh_thu_page`, `_fetch_so_doanh_thu`, `list_ledger`; add `load_team_map()` |
| `backend/report_routes.py` | Modify | Replace N+1 in `_load_m2_revenue` with `load_team_map()` |
| `backend/dashboard_routes.py` | Modify | Replace N+1 in `_load_qr_created_maps` with `load_team_map()` |
| `frontend/src/lib/api.ts` | Modify | Add `search` param to `listLedger` |
| `frontend/src/components/SoDoanhThuTab.tsx` | Modify | Add search input UI, debounce, wire to API |
| `backend/tests/test_ledger_search.py` | Create | Tests for search filter logic |
| `backend/tests/test_team_lookup.py` | Create | Tests for batch team lookup |

---

### Task 1: Backend — Add `search` parameter to `_ledger_query()`

**Files:**
- Modify: `backend/revenue_routes.py:527-548` (`_ledger_query`)
- Test: `backend/tests/test_ledger_search.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ledger_search.py`:

```python
"""Tests for ledger search OR-filter construction."""
import types
from unittest.mock import MagicMock


def _make_sb_mock(rows=None):
    """Build a Supabase client mock that returns `rows` and tracks method calls."""
    m = MagicMock()
    result = MagicMock()
    result.data = rows or []
    result.count = len(rows or [])
    # Every chained method returns the same builder so we can inspect calls
    builder = MagicMock()
    builder.execute.return_value = result
    builder.range.return_value = builder
    builder.limit.return_value = builder
    builder.order.return_value = builder
    builder.gte.return_value = builder
    builder.lte.return_value = builder
    builder.eq.return_value = builder
    builder.or_.return_value = builder
    m.table.return_value = MagicMock(select=MagicMock(return_value=builder))
    return m, builder


def test_ledger_query_without_search_has_no_or_filter():
    from revenue_routes import _ledger_query

    sb, builder = _make_sb_mock()
    _ledger_query(sb, "*", from_date="2026-01-01", to_date="2026-01-31")
    builder.or_.assert_not_called()


def test_ledger_query_with_search_adds_or_filter():
    from revenue_routes import _ledger_query

    sb, builder = _make_sb_mock()
    _ledger_query(sb, "*", search="0912")
    builder.or_.assert_called_once()
    or_arg = builder.or_.call_args[0][0]
    assert "ten_khach.ilike.%0912%" in or_arg
    assert "sdt.ilike.%0912%" in or_arg
    assert "uid.ilike.%0912%" in or_arg
    assert "sale_crm_name.ilike.%0912%" in or_arg
    assert "crm_order_id.ilike.%0912%" in or_arg
    assert "ma_don_hang.ilike.%0912%" in or_arg
    assert "info_code.ilike.%0912%" in or_arg


def test_ledger_query_empty_search_is_ignored():
    from revenue_routes import _ledger_query

    sb, builder = _make_sb_mock()
    _ledger_query(sb, "*", search="  ")
    builder.or_.assert_not_called()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ledger_search.py -v`
Expected: FAIL — `_ledger_query` does not accept `search` parameter yet.

- [ ] **Step 3: Add `search` parameter to `_ledger_query`**

In `backend/revenue_routes.py`, replace lines 527-548:

```python
def _ledger_query(
    sb,
    select: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
    search: str | None = None,
    count: str | None = None,
):
    """Lọc theo Pay Time (pay_time) — khớp pivot Excel Hiếu, không dùng ngay_tien_ve."""
    if count:
        q = sb.table("so_doanh_thu").select(select, count=count)
    else:
        q = sb.table("so_doanh_thu").select(select)
    q = q.order("pay_time", desc=True).order("created_at", desc=True)
    if from_date:
        q = q.gte("pay_time", f"{from_date[:10]}T00:00:00")
    if to_date:
        q = q.lte("pay_time", f"{to_date[:10]}T23:59:59")
    if loai_nhap in ("tu_dong", "tay"):
        q = q.eq("loai_nhap", loai_nhap)
    if search and search.strip():
        term = search.strip()
        pattern = f"%{term}%"
        or_clauses = ",".join(
            f"{col}.ilike.{pattern}"
            for col in (
                "ten_khach", "sdt", "uid", "sale_crm_name",
                "crm_order_id", "ma_don_hang", "info_code",
            )
        )
        q = q.or_(or_clauses)
    return q
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_ledger_search.py -v`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/revenue_routes.py backend/tests/test_ledger_search.py
git commit -m "feat: add search parameter to _ledger_query"
```

---

### Task 2: Backend — Wire `search` through to `list_ledger` endpoint

**Files:**
- Modify: `backend/revenue_routes.py:566-591` (`_count_so_doanh_thu`)
- Modify: `backend/revenue_routes.py:594-609` (`_fetch_so_doanh_thu_page`)
- Modify: `backend/revenue_routes.py:659-691` (`_fetch_so_doanh_thu`)
- Modify: `backend/revenue_routes.py:1207-1261` (`list_ledger`)

- [ ] **Step 1: Pass `search` through `_count_so_doanh_thu`**

Replace `_count_so_doanh_thu` (lines 566-591):

```python
def _count_so_doanh_thu(
    sb,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
    team_filter: str | None = None,
    search: str | None = None,
) -> int:
    if team_filter:
        rows = _fetch_so_doanh_thu(
            sb,
            "id, team, team_pivot_label",
            from_date=from_date,
            to_date=to_date,
            loai_nhap=loai_nhap,
            search=search,
        )
        return len(_filter_rows_by_team(rows, team_filter))
    res = _ledger_query(
        sb,
        "id",
        from_date=from_date,
        to_date=to_date,
        loai_nhap=loai_nhap,
        search=search,
        count="exact",
    ).limit(0).execute()
    return int(res.count or 0)
```

- [ ] **Step 2: Pass `search` through `_fetch_so_doanh_thu_page`**

Replace `_fetch_so_doanh_thu_page` (lines 594-609):

```python
def _fetch_so_doanh_thu_page(
    sb,
    select: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
    search: str | None = None,
    limit: int = LEDGER_TABLE_PAGE,
    offset: int = 0,
) -> list[dict[str, Any]]:
    res = (
        _ledger_query(sb, select, from_date=from_date, to_date=to_date, loai_nhap=loai_nhap, search=search)
        .range(offset, offset + max(limit, 1) - 1)
        .execute()
    )
    return res.data or []
```

- [ ] **Step 3: Pass `search` through `_fetch_so_doanh_thu`**

Replace `_fetch_so_doanh_thu` (lines 659-691):

```python
def _fetch_so_doanh_thu(
    sb,
    select: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    """PostgREST trả tối đa 1000 dòng/lần — paginate có giới hạn MAX_ANALYTICS_ROWS."""
    from analytics_limits import fetch_rows_capped

    select_cols = select if "id" in select else f"id, {select}"

    def fetch_page(offset: int, limit: int) -> list[dict[str, Any]]:
        q = (
            sb.table("so_doanh_thu")
            .select(select_cols)
            .order("pay_time", desc=True)
            .order("created_at", desc=True)
        )
        if from_date:
            q = q.gte("pay_time", f"{from_date[:10]}T00:00:00")
        if to_date:
            q = q.lte("pay_time", f"{to_date[:10]}T23:59:59")
        if loai_nhap in ("tu_dong", "tay"):
            q = q.eq("loai_nhap", loai_nhap)
        if search and search.strip():
            term = search.strip()
            pattern = f"%{term}%"
            or_clauses = ",".join(
                f"{col}.ilike.{pattern}"
                for col in (
                    "ten_khach", "sdt", "uid", "sale_crm_name",
                    "crm_order_id", "ma_don_hang", "info_code",
                )
            )
            q = q.or_(or_clauses)
        res = q.range(offset, offset + limit - 1).execute()
        return res.data or []

    rows, _ = fetch_rows_capped(
        fetch_page, page_size=_SUPABASE_PAGE, log_prefix="[revenue] so_doanh_thu"
    )
    return _dedupe_rows_by_id(rows)
```

Note: `_fetch_so_doanh_thu` builds its own query (doesn't call `_ledger_query`), so the search OR clause must be duplicated here.

- [ ] **Step 4: Add `search` query parameter to `list_ledger` endpoint**

Replace `list_ledger` (lines 1207-1261):

```python
    @app.get("/revenue/ledger")
    def list_ledger(
        authorization: str | None = Header(None),
        from_date: str | None = Query(None, alias="from"),
        to_date: str | None = Query(None, alias="to"),
        loai_nhap: str | None = Query(None),
        team_filter: str | None = Query(None, alias="team"),
        search: str | None = Query(None),
        limit: int = Query(LEDGER_TABLE_PAGE, ge=1, le=200),
        offset: int = Query(0, ge=0),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        search_term = (search or "").strip() or None
        try:
            team = (team_filter or "").strip() or None
            if team:
                all_rows = _fetch_so_doanh_thu(
                    sb,
                    "*",
                    from_date=from_date or None,
                    to_date=to_date or None,
                    loai_nhap=loai_nhap,
                    search=search_term,
                )
                filtered = _filter_rows_by_team(all_rows, team)
                total = len(filtered)
                page_rows = filtered[offset : offset + limit]
                rows = _enrich_ledger_rows(sb, page_rows)
            else:
                total = _count_so_doanh_thu(
                    sb,
                    from_date=from_date or None,
                    to_date=to_date or None,
                    loai_nhap=loai_nhap,
                    search=search_term,
                )
                db_rows = _fetch_so_doanh_thu_page(
                    sb,
                    "*",
                    from_date=from_date or None,
                    to_date=to_date or None,
                    loai_nhap=loai_nhap,
                    search=search_term,
                    limit=limit,
                    offset=offset,
                )
                rows = _enrich_ledger_rows(sb, db_rows)
            return {
                "rows": rows,
                "count": total,
                "offset": offset,
                "limit": limit,
                "hasMore": offset + len(rows) < total,
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi đọc Sổ doanh thu: {exc}") from exc
```

- [ ] **Step 5: Run existing tests to verify nothing broke**

Run: `cd backend && python -m pytest tests/test_ledger_search.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/revenue_routes.py
git commit -m "feat: wire search parameter through ledger list endpoint"
```

---

### Task 3: Frontend — Add search input to SoDoanhThuTab

**Files:**
- Modify: `frontend/src/lib/api.ts:232-240`
- Modify: `frontend/src/components/SoDoanhThuTab.tsx`

- [ ] **Step 1: Add `search` to API params**

In `frontend/src/lib/api.ts`, replace lines 233-240:

```typescript
    listLedger: (params?: {
      from?: string;
      to?: string;
      loai_nhap?: string;
      team?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }) => api.get<RevenueLedgerListResponse>("/revenue/ledger", { params }),
```

- [ ] **Step 2: Add search state and debounce to SoDoanhThuTab**

In `frontend/src/components/SoDoanhThuTab.tsx`, add a `search` state variable after the existing draft/applied states (after line 133):

```typescript
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 3: Add debounce effect**

Add this effect after the existing `useEffect` blocks (after line 226):

```typescript
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setAppliedSearch(searchTerm.trim());
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchTerm]);
```

- [ ] **Step 4: Wire search into fetchPage and reloadAll**

Update `filterParams` (line 107-113) to include search:

```typescript
function filterParams(from: string, to: string, loaiFilter: string, teamFilter: string, search?: string) {
  return {
    from: from || undefined,
    to: to || undefined,
    loai_nhap: loaiFilter || undefined,
    team: teamFilter || undefined,
    search: search || undefined,
  };
}
```

Update `fetchPage` (line 150-163) to pass `appliedSearch`:

```typescript
  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      const params = {
        ...filterParams(appliedFrom, appliedTo, appliedLoai, appliedTeam, appliedSearch),
        limit: PAGE_SIZE,
        offset,
      };
      const res = await endpoints.revenue.listLedger(params);
      setTotalCount(res.data.count);
      setHasMore(res.data.hasMore);
      setRows((prev) => (replace ? res.data.rows : [...prev, ...res.data.rows]));
      return res.data;
    },
    [appliedFrom, appliedTo, appliedLoai, appliedTeam, appliedSearch]
  );
```

Update `reloadAll` dependency array (line 166-183) — add `appliedSearch`:

```typescript
  const reloadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const summaryParams = filterParams(appliedFrom, appliedTo, appliedLoai, appliedTeam);
      const [summaryRes] = await Promise.all([
        endpoints.revenue.ledgerSummary(summaryParams),
        fetchPage(0, true),
      ]);
      setSummary(summaryRes.data);
    } catch {
      setError("Không tải được Sổ doanh thu.");
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [appliedFrom, appliedTo, appliedLoai, appliedTeam, appliedSearch, fetchPage]);
```

Note: `summaryParams` does NOT include `appliedSearch` — summary cards stay unaffected.

- [ ] **Step 5: Add search to resetFilters**

Update `resetFilters` (line 241-250):

```typescript
  function resetFilters() {
    setDraftFrom("");
    setDraftTo("");
    setDraftLoai("");
    setDraftTeam("");
    setAppliedFrom("");
    setAppliedTo("");
    setAppliedLoai("");
    setAppliedTeam("");
    setSearchTerm("");
    setAppliedSearch("");
  }
```

Update `hasActiveFilter` (line 260):

```typescript
  const hasActiveFilter = Boolean(appliedFrom || appliedTo || appliedLoai || appliedTeam || appliedSearch);
```

- [ ] **Step 6: Add search input UI**

Insert the search bar between `LedgerSummaryCards` and the "Hiển thị X / Y dòng" line. Replace lines 472-477:

```tsx
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ── SEARCH BAR ── */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gmv-muted"
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm theo tên khách, SĐT, UID, sale, mã đơn..."
          className="w-full rounded-lg border border-gmv-border bg-gmv-canvas py-2.5 pl-10 pr-10 text-sm text-gmv-text-strong placeholder:text-gmv-muted focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => { setSearchTerm(""); setAppliedSearch(""); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gmv-muted hover:text-gmv-text"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <p className="text-xs text-gmv-muted">
        {appliedSearch
          ? totalCount > 0
            ? <>Tìm thấy {totalCount.toLocaleString("vi-VN")} dòng cho "<span className="font-medium text-gmv-text">{appliedSearch}</span>"{loadingMore && " · đang tải thêm…"}</>
            : <>Không tìm thấy dòng nào cho "<span className="font-medium text-gmv-text">{appliedSearch}</span>"</>
          : <>Hiển thị {rows.length.toLocaleString("vi-VN")} / {totalCount.toLocaleString("vi-VN")} dòng{loadingMore && " · đang tải thêm…"}</>
        }
      </p>
```

- [ ] **Step 7: Run dev server and verify visually**

Run: `cd frontend && npm run dev`
Open http://localhost:5173, navigate to Sổ doanh thu tab. Verify:
- Search bar appears between summary cards and table
- Typing triggers search after 400ms pause
- Results update correctly
- Reset bộ lọc clears search
- Summary cards do not change when searching

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/SoDoanhThuTab.tsx
git commit -m "feat: add search bar to Sổ doanh thu tab"
```

---

### Task 4: Backend — Create shared `load_team_map()` function

**Files:**
- Modify: `backend/revenue_routes.py` (add `load_team_map` near top-level helpers)
- Test: `backend/tests/test_team_lookup.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_team_lookup.py`:

```python
"""Tests for batch team lookup."""
from unittest.mock import MagicMock


def _make_sb_with_staff(rows: list[dict]) -> MagicMock:
    sb = MagicMock()
    result = MagicMock()
    result.data = rows
    builder = MagicMock()
    builder.execute.return_value = result
    builder.eq.return_value = builder
    builder.range.return_value = builder
    sb.table.return_value = MagicMock(select=MagicMock(return_value=builder))
    return sb


def test_load_team_map_basic():
    from revenue_routes import load_team_map

    sb = _make_sb_with_staff([
        {"crm_name": "Nguyen Van A", "team": "HCM (Online)"},
        {"crm_name": "Tran Thi B", "team": "Inhouse 1"},
    ])
    result = load_team_map(sb)
    assert result["Nguyen Van A"] == "HCM (Online)"
    assert result["Tran Thi B"] == "Inhouse 1"


def test_load_team_map_strips_whitespace():
    from revenue_routes import load_team_map

    sb = _make_sb_with_staff([
        {"crm_name": "  Nguyen Van A  ", "team": "  HCM (Online)  "},
    ])
    result = load_team_map(sb)
    assert result["Nguyen Van A"] == "HCM (Online)"


def test_load_team_map_duplicate_keeps_first():
    from revenue_routes import load_team_map

    sb = _make_sb_with_staff([
        {"crm_name": "Nguyen Van A", "team": "HCM (Online)"},
        {"crm_name": "Nguyen Van A", "team": "Inhouse 1"},
    ])
    result = load_team_map(sb)
    assert result["Nguyen Van A"] == "HCM (Online)"


def test_load_team_map_skips_empty_name():
    from revenue_routes import load_team_map

    sb = _make_sb_with_staff([
        {"crm_name": "", "team": "HCM (Online)"},
        {"crm_name": None, "team": "Inhouse 1"},
        {"crm_name": "Valid Sale", "team": "Inhouse 2"},
    ])
    result = load_team_map(sb)
    assert len(result) == 1
    assert result["Valid Sale"] == "Inhouse 2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_team_lookup.py -v`
Expected: FAIL — `load_team_map` does not exist yet.

- [ ] **Step 3: Implement `load_team_map`**

In `backend/revenue_routes.py`, add this function after the imports (around line 13, after `DEFAULT_TY_GIA`):

```python
def load_team_map(sb) -> dict[str, str]:
    """Batch load nhan_su_sale (active only) → {crm_name: team}. Keeps first on duplicate."""
    team_map: dict[str, str] = {}
    try:
        offset = 0
        while True:
            res = (
                sb.table("nhan_su_sale")
                .select("crm_name, team")
                .eq("is_active", True)
                .range(offset, offset + 999)
                .execute()
            )
            chunk = res.data or []
            if not chunk:
                break
            for row in chunk:
                name = (row.get("crm_name") or "").strip()
                team = (row.get("team") or "").strip()
                if name and team and name not in team_map:
                    team_map[name] = team
            if len(chunk) < 1000:
                break
            offset += 1000
    except Exception as exc:
        print(f"[team_map] nhan_su_sale load failed: {exc}")
    return team_map
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_team_lookup.py -v`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/revenue_routes.py backend/tests/test_team_lookup.py
git commit -m "feat: add shared load_team_map() for batch team lookup"
```

---

### Task 5: Backend — Replace N+1 in `_load_qr_created_maps`

**Files:**
- Modify: `backend/dashboard_routes.py:507-554` (`_load_qr_created_maps`)

- [ ] **Step 1: Update import in dashboard_routes.py**

In `backend/dashboard_routes.py`, line 37, update the import:

```python
from report_routes import _load_ledger_revenue, _sale_key, load_team_map
```

- [ ] **Step 2: Replace `_load_qr_created_maps` with batch version**

Replace lines 507-554:

```python
def _load_qr_created_maps(
    sb,
    d_start: str,
    d_end: str,
    *,
    team: str | None = None,
    sale: str | None = None,
) -> tuple[int, int]:
    """Module 2 — doanh thu tạo mã QR: don_hang.created_at trong kỳ (không cần tien_ve)."""
    total = 0
    count = 0
    try:
        team_map = load_team_map(sb) if team else {}
        q = (
            sb.table("don_hang")
            .select("sale_crm_name, so_tien_can_thu, created_at, trang_thai")
            .gte("created_at", f"{d_start}T00:00:00")
            .lte("created_at", f"{d_end}T23:59:59")
        )
        for r in q.execute().data or []:
            if str(r.get("trang_thai") or "").strip().lower() == "huy":
                continue
            sname = _sale_key(r.get("sale_crm_name"))
            if sale and sname != sale:
                continue
            if team and sname != "(Chưa gán sale)":
                sale_team = team_map.get(sname, "—")
                if sale_team != team:
                    continue
            vnd = parse_metric(r.get("so_tien_can_thu"))
            if vnd <= 0:
                continue
            count += 1
            total += vnd
    except Exception as exc:
        print(f"[Dashboard] don_hang QR-created query failed: {exc}")
    return total, count
```

- [ ] **Step 3: Run existing tests**

Run: `cd backend && python -m pytest tests/ -v --tb=short`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/dashboard_routes.py
git commit -m "perf: batch team lookup in _load_qr_created_maps"
```

---

### Task 6: Backend — Replace N+1 in `_load_m2_revenue`

**Files:**
- Modify: `backend/report_routes.py:264-307` (`_load_m2_revenue`)

- [ ] **Step 1: Add import at top of report_routes.py**

The `load_team_map` function is in the same file (`revenue_routes.py`) but `_load_m2_revenue` is in `report_routes.py`. Check the existing imports in report_routes.py and add:

In `backend/report_routes.py`, add to the imports section:

```python
from revenue_routes import load_team_map
```

If `revenue_routes` is already imported for other functions, add `load_team_map` to the existing import.

- [ ] **Step 2: Replace `_load_m2_revenue` with batch version**

Replace lines 264-307 of `backend/report_routes.py`:

```python
def _load_m2_revenue(
    sb, d_start: str, d_end: str, team: str | None, skip_don_ids: set[str]
) -> dict[str, dict]:
    """Module 2 — don_hang tien_ve=true (bổ sung đơn chưa có trên Sổ)."""
    out: dict[str, dict] = {}
    try:
        team_map = load_team_map(sb) if team else {}
        q = (
            sb.table("don_hang")
            .select("id, sale_crm_name, so_tien_can_thu, updated_at")
            .eq("tien_ve", True)
            .gte("updated_at", f"{d_start}T00:00:00")
            .lte("updated_at", f"{d_end}T23:59:59")
        )
        for r in q.execute().data or []:
            oid = str(r.get("id") or "")
            if oid in skip_don_ids:
                continue
            sname = _sale_key(r.get("sale_crm_name"))
            sale_team = "—"
            if team and sname != "(Chưa gán sale)":
                sale_team = team_map.get(sname, "—")
                if sale_team != team:
                    continue
            entry = _ensure_rev(out, sname, sale_team)
            vnd = parse_metric(r.get("so_tien_can_thu"))
            day = str(r.get("updated_at") or "")[:10]
            entry["collected_vnd_m2"] += vnd
            entry["orders_m2"] += 1
            _bump_rev_daily(entry, day, collected_vnd_m2=vnd, orders_m2=1)
    except Exception as exc:
        print(f"[BC03] don_hang query failed: {exc}")
    return out
```

- [ ] **Step 3: Run existing tests**

Run: `cd backend && python -m pytest tests/ -v --tb=short`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/report_routes.py
git commit -m "perf: batch team lookup in _load_m2_revenue"
```

---

### Task 7: SQL — Add database index for search fields

**Files:**
- Create: `docs/supabase_schema_patch_ledger_search.sql`

- [ ] **Step 1: Write the migration SQL**

Create `docs/supabase_schema_patch_ledger_search.sql`:

```sql
-- Sổ doanh thu: index for search bar (uid, sdt are most commonly searched)
CREATE INDEX IF NOT EXISTS idx_sdt_uid_search
  ON so_doanh_thu (uid, sdt);

-- nhan_su_sale: index for batch team lookup and search
CREATE INDEX IF NOT EXISTS idx_nhan_su_sale_crm_name
  ON nhan_su_sale (crm_name)
  WHERE is_active = true;
```

- [ ] **Step 2: Apply on Supabase**

Run the SQL via Supabase SQL editor or MCP tool. Verify with:

```sql
SELECT indexname FROM pg_indexes
WHERE tablename IN ('so_doanh_thu', 'nhan_su_sale')
ORDER BY tablename, indexname;
```

Expected: `idx_sdt_uid_search` and `idx_nhan_su_sale_crm_name` appear in the list.

- [ ] **Step 3: Commit**

```bash
git add docs/supabase_schema_patch_ledger_search.sql
git commit -m "docs: add SQL migration for search + team lookup indexes"
```

---

### Task 8: Manual verification checklist

- [ ] **Step 1: Verify search bar**

On http://localhost:5173, Sổ doanh thu tab:
- Type a UID → correct row appears
- Type partial phone "0912" → all matching rows
- Type a customer name → correct results
- Combine date filter + search → results within date range only
- Combine team filter + search → results within team only
- Clear search (X button) → full list returns
- Scroll down in search results → loads more
- Summary cards unchanged during search
- "Reset bộ lọc" clears search field
- No results → shows "Không tìm thấy dòng nào"

- [ ] **Step 2: Verify batch team lookup**

- Dashboard Sale → filter by team HCM → compare QR created numbers with previous (should match)
- BC03 report → filter by team → revenue numbers should match previous
- Dashboard without team filter → works normally (no team map loaded)

- [ ] **Step 3: Push sandbox**

```bash
git push origin sandbox
```
