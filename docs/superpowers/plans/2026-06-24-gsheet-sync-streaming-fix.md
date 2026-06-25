# GSheet Sync Streaming Refactor — OOM Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khắc phục OOM crash của endpoint `POST /revenue/ledger/sync-gsheet` bằng cách stream tab-by-tab (fetch → map → insert mỗi tab xong mới sang tab kế).

**Architecture:** Refactor `sync_gsheet_to_ledger` để KHÔNG hold cùng lúc `rows` raw + `payloads` của TẤT CẢ tab + 2 fingerprint cache. Đổi `collect_payloads_from_gsheet` thành generator `iter_payloads_by_tab` — yield per-tab. Sau mỗi tab insert xong, cập nhật `existing` set + `loose_existing` dict để tab kế tiếp vẫn dedup đúng với dòng vừa insert.

**Tech Stack:** Python 3.11, FastAPI, Supabase Python SDK, pytest.

---

## Non-Negotiable Guardrails

**MUST PRESERVE (kiểm tra trước MỖI commit):**

1. **Response shape KHÔNG đổi.** Endpoint `POST /revenue/ledger/sync-gsheet` phải trả dict có **đúng** keys sau, theo đúng semantics cũ:
   - `spreadsheetId: str`
   - `tabs: list[str]`
   - `fetched: int` — tổng dòng unique (sau dedup nội bộ batch sync) đã map thành công, **cộng dồn 2 tab**
   - `skippedExisting: int` — cộng dồn 2 tab
   - `skippedLoose: int` — cộng dồn 2 tab
   - `plannedInsert: int` — cộng dồn 2 tab
   - `inserted: int` — cộng dồn 2 tab; **0 nếu `dry_run=True`**
   - `dryRun: bool`
   - `samples: list[dict]` — tối đa 3 phần tử, lấy từ payloads đầu tiên gặp trong tab đầu tiên (xem Task 3 step 3)

2. **Dedup behavior KHÔNG đổi** — phải pass **tất cả** test hiện có trong `backend/tests/test_gsheet_dedup.py`:
   - `test_sync_gsheet_skips_existing_manual_ledger_row`
   - `test_pattern_x_renamed_customer_is_skipped`
   - `test_pattern_x_with_exact_match_payload_present`
   - `test_blank_uid_early_row_absorbs_filled_version`
   - `test_two_real_payments_same_amount_in_different_months_not_skipped`
   - `test_date_drift_within_month_still_dedup`

3. **CẤM sửa** các hàm sau (chỉ refactor orchestration — KHÔNG đổi semantics dedup):
   - `row_fingerprint`
   - `_loose_fp`
   - `_loose_fp_blank`
   - `map_tab_row` / `map_sm_hanoi_row` / `map_hcm_rev_row`
   - `_resolve_team_fields`
   - `TeamLookupCache`
   - `fetch_gsheet_tab_values`
   - `_gmv_from_vnd`
   - `_execute_supabase`
   - `_is_retryable_supabase_error`

4. **CẤM sửa** call site `backend/revenue_routes.py:1698-1717` (endpoint handler). Refactor 100% nội bộ trong `gsheet_ledger_import.py`.

5. **CẤM thêm dependency mới** (no new entry trong `requirements.txt`).

6. **CẤM thay** giá trị các hằng:
   - `INSERT_BATCH = 50`
   - `INSERT_PAUSE_SEC = 0.05`
   - `SUPABASE_MAX_ATTEMPTS = 5`
   - `MAP_PROGRESS_EVERY = 2000`

7. **CẤM thêm Supabase query mới ngoài 2 cái có sẵn** (`_load_existing_import_fingerprints`, `_load_existing_loose_fps`, `TeamLookupCache._load`, insert batches). Tuyệt đối không re-load fingerprint giữa các tab — phải update in-memory cache.

8. **CẤM dùng** `print` để debug — chỉ dùng `log` callable đã có.

9. **CẤM bắt** generic `except Exception` mới (chỉ giữ block hiện có ở insert retry).

10. **CẤM viết test "tests passed because nothing was tested"** — mọi test mới phải fail trước khi implement (verify RED).

11. **Idempotent retry** phải work: chạy sync lần 2 ngay sau lần 1 thành công → `inserted == 0`, `skippedExisting == plannedInsert lần 1`.

12. **Cross-tab dedup** phải work: payload có cùng `row_fingerprint` xuất hiện ở cả 2 tab → chỉ insert 1 lần.

13. **Type hints** — mọi hàm mới/đổi signature **PHẢI** có type hints đầy đủ (Python 3.11 union syntax: `list[str]`, `dict[str, int]`, `X | None`).

14. **Memory hygiene** — sau mỗi tab insert xong, **PHẢI** có `del rows` và `del to_insert` để giải phóng RAM trước khi load tab kế.

15. **Logging output** — phải giữ đúng các log line hiện có (frontend hoặc ops có thể grep):
    - `"Load team cache (nhan_su_sale)…"`
    - `"  {N} sale → team"`
    - `"Map dữ liệu từ Google Sheet…"`
    - `"  Tải Google Sheet tab «{tab}»…"`
    - `"  «{tab}»: {N} dòng ({M} data) — đang map…"`
    - `"  «{tab}»: xong — {N} dòng hợp lệ"`
    - `"Insert {N} dòng mới (batch {INSERT_BATCH})…"` — log mỗi tab có insert
    - `"  inserted {N}/{TOTAL}"` — log từng batch

---

## File Structure

**Modify:**
- `backend/gsheet_ledger_import.py` — refactor `sync_gsheet_to_ledger`, thêm `iter_payloads_by_tab` generator, **giữ nguyên** `collect_payloads_from_gsheet` làm wrapper (cho backward-compat các script/import khác).

**Modify (test):**
- `backend/tests/test_gsheet_dedup.py` — update mock target từ `collect_payloads_from_gsheet` → `iter_payloads_by_tab` (xem Task 2). KHÔNG xoá test cũ, chỉ đổi mock.

**Create:**
- `backend/tests/test_gsheet_streaming.py` — test mới cho streaming behavior + cross-tab dedup + loose dedup with just-inserted rows.

**Không sửa:**
- `backend/revenue_routes.py`
- Frontend (`frontend/src/components/SoDoanhThuTab.tsx`)
- Bất kỳ file nào khác

---

## Task 1: Failing test — streaming sync với 2 tab, cross-tab exact dedup

**Files:**
- Create: `backend/tests/test_gsheet_streaming.py`

- [ ] **Step 1: Tạo test file với fake Supabase + cross-tab dedup test**

Create `backend/tests/test_gsheet_streaming.py`:

```python
from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Iterator


class _FakeQuery:
    def __init__(self, sb: "_FakeSupabase", table_name: str):
        self._sb = sb
        self._table = table_name
        self._like_filters: list[tuple[str, str]] = []
        self._insert_payload: list[dict] | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def like(self, column: str, pattern: str):
        self._like_filters.append((column, pattern))
        return self

    def range(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self._insert_payload = payload if isinstance(payload, list) else [payload]
        return self

    def execute(self):
        if self._insert_payload is not None:
            self._sb.inserted.extend(self._insert_payload)
            self._sb.ledger.extend(self._insert_payload)
            return SimpleNamespace(data=self._insert_payload)
        if self._table == "so_doanh_thu":
            rows = list(self._sb.ledger)
            for column, pattern in self._like_filters:
                if pattern == "import:%":
                    rows = [r for r in rows if str(r.get(column) or "").startswith("import:")]
            return SimpleNamespace(data=rows)
        return SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(self, ledger_rows: list[dict]):
        self.ledger: list[dict] = list(ledger_rows)
        self.inserted: list[dict] = []

    def table(self, name: str):
        return _FakeQuery(self, name)


def _payload(tab: str, **over: Any) -> dict:
    base = {
        "uid": "3311069834",
        "ngay_tien_ve": "2026-05-29",
        "pay_time": "2026-05-29T10:00:00",
        "so_tien_vnd": 8_480_000,
        "sale_crm_name": "Le Thi Thuy Trang",
        "sdt": "81-7035239960",
        "ten_khach": "Hiro",
        "created_by_email": f"import:gsheet:{tab}",
        "updated_by_email": f"import:gsheet:{tab}",
    }
    base.update(over)
    return base


def test_cross_tab_exact_duplicate_inserted_once(monkeypatch):
    """Cùng fingerprint xuất hiện ở cả SM Hanoi và HCM REV → chỉ insert 1 lần."""
    from gsheet_ledger_import import sync_gsheet_to_ledger

    p_sm = _payload("SM Hanoi")
    p_hcm = _payload("HCM REV")  # cùng uid/sale/pay_time/vnd/sdt → cùng fp

    def fake_iter(*_args, **_kwargs) -> Iterator[tuple[str, list[dict]]]:
        yield ("SM Hanoi", [p_sm])
        yield ("HCM REV", [p_hcm])

    monkeypatch.setattr(
        "gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0)
    )
    monkeypatch.setattr("gsheet_ledger_import.iter_payloads_by_tab", fake_iter)

    sb = _FakeSupabase([])
    result = sync_gsheet_to_ledger(sb, log=lambda *_a, **_k: None)

    assert result["fetched"] == 1, f"Cross-tab fp duplicate → fetched=1, got {result['fetched']}"
    assert result["plannedInsert"] == 1
    assert result["inserted"] == 1
    assert len(sb.inserted) == 1
```

- [ ] **Step 2: Verify test fails**

Run: `cd backend && python -m pytest tests/test_gsheet_streaming.py::test_cross_tab_exact_duplicate_inserted_once -v`
Expected: FAIL với `AttributeError: module 'gsheet_ledger_import' has no attribute 'iter_payloads_by_tab'`

- [ ] **Step 3: Commit (chỉ test, KHÔNG implementation)**

```bash
git add backend/tests/test_gsheet_streaming.py
git commit -m "test(gsheet-sync): add failing test for cross-tab exact dedup streaming"
```

---

## Task 2: Implement `iter_payloads_by_tab` generator + refactor `sync_gsheet_to_ledger`

**Files:**
- Modify: `backend/gsheet_ledger_import.py`

- [ ] **Step 1: Thêm generator `iter_payloads_by_tab` (giữ `collect_payloads_from_gsheet` nguyên)**

Trong `backend/gsheet_ledger_import.py`, ngay TRƯỚC `def collect_payloads_from_gsheet`, thêm:

```python
def iter_payloads_by_tab(
    team_cache: TeamLookupCache,
    *,
    spreadsheet_id: str,
    tabs: tuple[str, ...] = DEFAULT_SHEET_TABS,
    credentials_path: str | None = None,
    limit: int = 0,
    log: Callable[[str], None] = _log,
) -> Iterator[tuple[str, list[dict[str, Any]]]]:
    """Stream payloads per-tab — yield (tab_name, payloads_list).

    Khác `collect_payloads_from_gsheet`: KHÔNG accumulate cross-tab, dedup
    fingerprint nội-tab thôi. Cross-tab dedup do caller (sync_gsheet_to_ledger)
    quản lý qua seen set xuyên-tab. Giải phóng `rows` ngay sau khi map xong tab.
    """
    total_emitted = 0
    for tab in tabs:
        log(f"  Tải Google Sheet tab «{tab}»…")
        rows = fetch_gsheet_tab_values(
            spreadsheet_id=spreadsheet_id,
            tab=tab,
            credentials_path=credentials_path,
        )
        data_rows = max(len(rows) - 1, 0)
        log(f"  «{tab}»: {len(rows)} dòng ({data_rows} data) — đang map…")
        tab_payloads: list[dict[str, Any]] = []
        seen_in_tab: set[str] = set()
        mapped = 0
        for i, row in enumerate(rows):
            if i == 0:
                continue
            payload = map_tab_row(team_cache, tab, row)
            if not payload:
                continue
            fp = row_fingerprint(payload)
            if fp in seen_in_tab:
                continue
            seen_in_tab.add(fp)
            tab_payloads.append(payload)
            mapped += 1
            if mapped % MAP_PROGRESS_EVERY == 0:
                log(f"  «{tab}»: đã map {mapped} dòng hợp lệ…")
            if limit and total_emitted + mapped >= limit:
                log(f"  Dừng sớm — limit {limit}")
                log(f"  «{tab}»: xong — {mapped} dòng hợp lệ")
                yield (tab, tab_payloads)
                return
        del rows  # giải phóng RAM trước khi yield
        log(f"  «{tab}»: xong — {mapped} dòng hợp lệ")
        total_emitted += mapped
        yield (tab, tab_payloads)
```

Sửa import ở đầu file (sau `from typing import Any, Callable`):

```python
from typing import Any, Callable, Iterator
```

- [ ] **Step 2: Refactor `sync_gsheet_to_ledger` thành streaming**

Thay thế **toàn bộ thân hàm** `sync_gsheet_to_ledger` (giữ signature):

```python
def sync_gsheet_to_ledger(
    sb,
    *,
    spreadsheet_id: str | None = None,
    tabs: tuple[str, ...] = DEFAULT_SHEET_TABS,
    credentials_path: str | None = None,
    limit: int = 0,
    dry_run: bool = False,
    actor_email: str = "import:gsheet",
    log: Callable[[str], None] = _log,
    sb_factory: Callable[[], Any] | None = None,
) -> dict[str, Any]:
    sid = (spreadsheet_id or os.environ.get("GOOGLE_SHEETS_ID") or DEFAULT_SPREADSHEET_ID).strip()
    log("Load team cache (nhan_su_sale)…")
    team_cache = TeamLookupCache(sb)
    log(f"  {team_cache.size} sale → team")

    log("Map dữ liệu từ Google Sheet…")
    log("Kiểm tra dòng đã import…")
    existing = _load_existing_import_fingerprints(sb, log=log)
    log("Kiểm tra loose match (uid+ngày+tiền)…")
    loose_existing = _load_existing_loose_fps(sb, log=log)

    seen_payloads: set[str] = set()
    samples: list[dict[str, Any]] = []
    totals = {
        "fetched": 0,
        "skippedExisting": 0,
        "skippedLoose": 0,
        "plannedInsert": 0,
        "inserted": 0,
    }
    client = sb

    for tab, payloads in iter_payloads_by_tab(
        team_cache,
        spreadsheet_id=sid,
        tabs=tabs,
        credentials_path=credentials_path,
        limit=limit,
        log=log,
    ):
        to_insert: list[dict[str, Any]] = []
        skipped_tab = 0
        loose_skipped_tab = 0

        for p in payloads:
            fp = row_fingerprint(p)
            if fp in seen_payloads:
                continue
            seen_payloads.add(fp)
            totals["fetched"] += 1
            if len(samples) < 3:
                samples.append(p)

            if fp in existing:
                skipped_tab += 1
                continue
            if _loose_fp(p) in loose_existing or _loose_fp_blank(p) in loose_existing:
                loose_skipped_tab += 1
                continue

            p["updated_by_email"] = actor_email
            if not p.get("created_by_email"):
                p["created_by_email"] = actor_email
            to_insert.append(p)

        totals["skippedExisting"] += skipped_tab
        totals["skippedLoose"] += loose_skipped_tab
        totals["plannedInsert"] += len(to_insert)

        if dry_run or not to_insert:
            del payloads
            del to_insert
            continue

        base_ts = datetime.now(timezone.utc)
        for idx, p in enumerate(to_insert):
            p["created_at"] = (base_ts + timedelta(milliseconds=idx)).isoformat()
        log(f"Insert {len(to_insert)} dòng mới (batch {INSERT_BATCH})…")
        inserted_tab = 0
        for i in range(0, len(to_insert), INSERT_BATCH):
            chunk = to_insert[i : i + INSERT_BATCH]
            try:
                _execute_supabase(
                    lambda c=client, ch=chunk: c.table("so_doanh_thu").insert(ch).execute(),
                    log=log,
                    label="Insert batch",
                )
            except Exception:
                if sb_factory:
                    log("  Tạo lại Supabase client sau lỗi kết nối…")
                    client = sb_factory()
                    _execute_supabase(
                        lambda c=client, ch=chunk: c.table("so_doanh_thu").insert(ch).execute(),
                        log=log,
                        label="Insert batch (client mới)",
                    )
                else:
                    raise
            for p in chunk:
                existing.add(row_fingerprint(p))
                key = _loose_fp(p)
                loose_existing[key] = loose_existing.get(key, 0) + 1
            inserted_tab += len(chunk)
            log(f"  inserted {inserted_tab}/{len(to_insert)}")
            if INSERT_PAUSE_SEC and i + INSERT_BATCH < len(to_insert):
                time.sleep(INSERT_PAUSE_SEC)
        totals["inserted"] += inserted_tab
        del payloads
        del to_insert

    if dry_run:
        log(f"Dry-run — sẽ insert {totals['plannedInsert']} dòng "
            f"(skip {totals['skippedExisting']} exact + {totals['skippedLoose']} loose)")
    elif totals["inserted"] == 0:
        log(f"Không có dòng mới (skip {totals['skippedExisting']} exact + "
            f"{totals['skippedLoose']} loose)")

    return {
        "spreadsheetId": sid,
        "tabs": list(tabs),
        "fetched": totals["fetched"],
        "skippedExisting": totals["skippedExisting"],
        "skippedLoose": totals["skippedLoose"],
        "plannedInsert": totals["plannedInsert"],
        "inserted": totals["inserted"] if not dry_run else 0,
        "dryRun": dry_run,
        "samples": samples[:3],
    }
```

- [ ] **Step 3: Verify cross-tab test passes**

Run: `cd backend && python -m pytest tests/test_gsheet_streaming.py::test_cross_tab_exact_duplicate_inserted_once -v`
Expected: PASS

- [ ] **Step 4: Verify KHÔNG break existing tests** — chạy regression đủ tệp dedup

Run: `cd backend && python -m pytest tests/test_gsheet_dedup.py -v`
Expected: nếu có test FAIL → mock target đã đổi → sang Task 3 fix mock. **CẤM** sửa logic refactor; chỉ sửa test mock.

- [ ] **Step 5: KHÔNG commit ở step này** — chờ Task 3 fix test mock trước, rồi commit chung.

---

## Task 3: Cập nhật mock trong test cũ — đổi `collect_payloads_from_gsheet` → `iter_payloads_by_tab`

**Files:**
- Modify: `backend/tests/test_gsheet_dedup.py`

- [ ] **Step 1: Đổi helper `_run_sync` để mock generator mới**

Trong `backend/tests/test_gsheet_dedup.py`, thay thế helper `_run_sync`:

```python
def _run_sync(monkeypatch, ledger_rows: list[dict], payloads: list[dict]) -> dict:
    from gsheet_ledger_import import sync_gsheet_to_ledger

    def fake_iter(*_args, **_kwargs):
        yield ("SM Hanoi", list(payloads))

    monkeypatch.setattr("gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0))
    monkeypatch.setattr("gsheet_ledger_import.iter_payloads_by_tab", fake_iter)
    return sync_gsheet_to_ledger(_FakeSupabase(ledger_rows), dry_run=True, log=lambda *_a, **_k: None)
```

- [ ] **Step 2: Đổi mock trong `test_sync_gsheet_skips_existing_manual_ledger_row`**

Tìm 2 dòng (xung quanh dòng 65-66 file cũ):

```python
    monkeypatch.setattr("gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0))
    monkeypatch.setattr("gsheet_ledger_import.collect_payloads_from_gsheet", lambda *_args, **_kwargs: [payload])
```

Thay thành:

```python
    def fake_iter(*_args, **_kwargs):
        yield ("HCM REV", [payload])

    monkeypatch.setattr("gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0))
    monkeypatch.setattr("gsheet_ledger_import.iter_payloads_by_tab", fake_iter)
```

- [ ] **Step 3: Run toàn bộ test file dedup**

Run: `cd backend && python -m pytest tests/test_gsheet_dedup.py -v`
Expected: ALL PASS (6 test)

- [ ] **Step 4: Run cross-streaming test**

Run: `cd backend && python -m pytest tests/test_gsheet_streaming.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit (gộp Task 2 + Task 3)**

```bash
git add backend/gsheet_ledger_import.py backend/tests/test_gsheet_dedup.py backend/tests/test_gsheet_streaming.py
git commit -m "refactor(gsheet-sync): stream tab-by-tab to fix OOM on sync"
```

---

## Task 4: Failing test — loose dedup vs just-inserted rows từ tab trước

**Files:**
- Modify: `backend/tests/test_gsheet_streaming.py`

- [ ] **Step 1: Thêm test cho live update của `loose_existing` sau insert**

Append vào `backend/tests/test_gsheet_streaming.py`:

```python
def test_loose_dedup_against_just_inserted_row(monkeypatch):
    """Tab 1 insert dòng A → Tab 2 có dòng A' loose-match (cùng uid+sale+
    tháng+tiền, khác sdt) → tab 2 phải skip vì loose_existing đã được cập
    nhật."""
    from gsheet_ledger_import import sync_gsheet_to_ledger

    p_a = _payload("SM Hanoi", sdt="81-1111111111")
    p_a_prime = _payload("HCM REV", sdt="81-2222222222", uid="3311069834")
    # Cùng UID + sale + pay_time tháng + so_tien_vnd → loose key giống

    def fake_iter(*_args, **_kwargs):
        yield ("SM Hanoi", [p_a])
        yield ("HCM REV", [p_a_prime])

    monkeypatch.setattr(
        "gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0)
    )
    monkeypatch.setattr("gsheet_ledger_import.iter_payloads_by_tab", fake_iter)

    sb = _FakeSupabase([])
    result = sync_gsheet_to_ledger(sb, log=lambda *_a, **_k: None)

    assert result["inserted"] == 1, "Chỉ p_a vào DB, p_a_prime loose-skip"
    assert result["skippedLoose"] == 1
    assert len(sb.inserted) == 1
```

- [ ] **Step 2: Verify test pass (đã implement ở Task 2 step 2)**

Run: `cd backend && python -m pytest tests/test_gsheet_streaming.py::test_loose_dedup_against_just_inserted_row -v`
Expected: PASS

Nếu FAIL: code trong Task 2 step 2 thiếu phần `loose_existing[key] = loose_existing.get(key, 0) + 1` sau mỗi insert chunk. KHÔNG sửa test — sửa code.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_gsheet_streaming.py
git commit -m "test(gsheet-sync): verify loose dedup uses just-inserted rows"
```

---

## Task 5: Verify integration — toàn bộ backend test suite + type check

- [ ] **Step 1: Chạy toàn bộ test suite backend**

Run: `cd backend && python -m pytest -x -q`
Expected: ALL PASS (số test không giảm so với baseline). Nếu test ngoài 2 file (`test_gsheet_dedup.py` + `test_gsheet_streaming.py`) bị fail → đã đụng phần khác → **revert** và xem lại.

- [ ] **Step 2: Smoke run — import module check syntax + signature**

Run: `cd backend && python -c "from gsheet_ledger_import import sync_gsheet_to_ledger, iter_payloads_by_tab, collect_payloads_from_gsheet; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Verify response shape giữ nguyên (dry-run trên fake DB)**

Tạo file scratch `_verify_shape.py` ở root repo:

```python
import sys
sys.path.insert(0, "backend")
sys.path.insert(0, "backend/tests")
from types import SimpleNamespace
from test_gsheet_streaming import _FakeSupabase, _payload
from gsheet_ledger_import import sync_gsheet_to_ledger
import unittest.mock as m

def fake_iter(*_a, **_k):
    yield ("SM Hanoi", [_payload("SM Hanoi")])
    yield ("HCM REV", [_payload("HCM REV", uid="9999999999")])

with m.patch("gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0)), \
     m.patch("gsheet_ledger_import.iter_payloads_by_tab", fake_iter):
    r = sync_gsheet_to_ledger(_FakeSupabase([]), dry_run=True, log=lambda *_a, **_k: None)
    expected = {"spreadsheetId", "tabs", "fetched", "skippedExisting", "skippedLoose",
                "plannedInsert", "inserted", "dryRun", "samples"}
    assert set(r.keys()) == expected, f"shape mismatch: {set(r.keys()) ^ expected}"
    assert r["inserted"] == 0 and r["dryRun"] is True
    assert r["fetched"] == 2
    print("shape ok")
```

Run: `cd "E:/PalFish/DA/pf-gmv-reconciliation/palfish-t-i-u-h-th-ng-ver-2" && python _verify_shape.py`
Expected: `shape ok`

- [ ] **Step 4: Xoá file scratch + commit nếu có thay đổi**

```bash
rm _verify_shape.py
```

Không commit (file đã xoá, không có thay đổi).

---

## Task 6: Manual deploy verification (production gate)

- [ ] **Step 1: Push lên sandbox branch**

```bash
git push origin sandbox
```

- [ ] **Step 2: Deploy sandbox**

Run: `bash scripts/deploy.sh sandbox`
Expected: deploy succeed, no Render error.

- [ ] **Step 3: Gọi sandbox sync với `dryRun=true`** — verify response shape không đổi và không crash.

Sandbox URL: `https://palfish-gmv-manager-sandbox.vercel.app/`. Login `test.admin@dev`. Mở Sổ doanh thu → bấm "Sync All File Thu Hiền" → check pop-up trả về có đầy đủ `fetched/skippedExisting/skippedLoose/plannedInsert/inserted`.

Verify Render log:
- KHÔNG có `Started server process [1]` xuất hiện sau lúc bấm sync
- Có log line `«SM Hanoi»: ...` và `«HCM REV»: ...` tuần tự
- Có log `Insert N dòng mới` cho ÍT NHẤT 1 tab (nếu có dòng mới)

- [ ] **Step 4: Stress run — sync thật (dryRun=false) trên sandbox**

Yêu cầu user click "Sync" thực tế. Quan sát Render metrics RAM:
- Peak memory KHÔNG được vượt 80% RAM limit của plan Starter (~410MB)
- Process KHÔNG restart trong suốt quá trình sync

Nếu peak vẫn vượt → escalate (có thể cần Fix A bổ sung hoặc upgrade plan).

- [ ] **Step 5: Báo cáo kết quả**

Trả về user: peak RAM, thời gian sync, số dòng inserted, screenshot Render metrics nếu khả thi.

---

## Risk Register & Rollback

| Risk | Detection | Rollback |
|---|---|---|
| Partial failure giữa 2 tab | User báo "thiếu HCM REV" | Idempotent — bấm sync lại; fingerprint dedup skip SM Hanoi đã insert |
| Loose dedup miss → duplicate insert | Audit query `SELECT _loose_fp, COUNT(*) FROM so_doanh_thu GROUP BY ... HAVING COUNT > 1` sau sync | `git revert <commit>` + redeploy |
| Response shape đổi → frontend crash | Frontend toast lỗi `undefined.fetched` | `git revert` + redeploy |
| Peak RAM vẫn OOM | Render log `Started server process [1]` | Escalate: implement Fix A song song (gộp 2 fingerprint loader) |

**Rollback command:**

```bash
git revert <commit-sha> && git push origin sandbox && bash scripts/deploy.sh sandbox
```

---

## Definition of Done

Tất cả phải tick TRƯỚC khi merge `sandbox` → `main`:

- [ ] All 6 test cũ trong `test_gsheet_dedup.py` PASS
- [ ] All test mới trong `test_gsheet_streaming.py` PASS
- [ ] Toàn bộ backend test suite PASS (`pytest -x -q`)
- [ ] Sandbox deploy thành công
- [ ] Sandbox sync thật (dryRun=false) hoàn thành KHÔNG crash
- [ ] Peak RAM sandbox < 80% limit Starter
- [ ] Response shape khớp expected keys (verify ở Task 5 step 3)
- [ ] Log lines giữ đúng (Task 1 guardrail #15)
- [ ] User đã verify sync 2 lần liên tiếp (lần 2 phải `inserted=0`)
