# OOM Fix Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the palfish-gmv-api Render instance (512MB) from OOM-crashing by eliminating per-request Supabase client churn, fix the broken `/orders` scope filter, and gate the DingTalk worker behind an env flag.

**Architecture:** Root cause is verified from Render metrics (2026-07-09): memory climbs ~150MB/hour proportional to request traffic, crashes every ~3h during business hours (14:05 and 16:13 VN time). Cause: every request handler calls `_supabase()` which creates a brand-new supabase-py client (with its own httpx pools) — thousands per hour, never closed. Fix: process-wide singleton. Two secondary fixes ride along: `/orders` creator-scope filter must move into SQL (currently filters AFTER limit → sale users lose orders), and the DingTalk worker polls a nonexistent table every 30s.

**Tech Stack:** Python 3.12, FastAPI, supabase-py (sync), httpx, pytest + pytest-asyncio. Windows dev machine, Git Bash. Deploy: Docker on Render via `bash scripts/deploy.sh`.

---

## Evidence (do not re-litigate — already verified)

- Render memory metrics srv-d8786dl7vvec738pem2g 2026-07-09: baseline after boot ~160-210MB → steady climb to 512MB in ~2-3h under traffic → OOM kill → restart. No sudden single-request spikes.
- `don_hang` table in prod has **0 rows** (verified via SQL). `/orders` is a legacy route — no traffic in logs. Its fix is correctness-only, not OOM-related.
- Hot routes (polled every few seconds per client): `/api/v1/payment-requests`, `/api/v1/active-requests`, `/api/v1/notifications`. All small payloads (153 PRs, 158 lines). The payload size is NOT the problem; the per-request client creation IS.
- `dingtalk_outbox` table does not exist in prod → worker logs `PGRST205` every 30s. Log noise + one wasted client per poll.
- The two log errors (`PGRST106` storage schema, `PGRST205` dingtalk_outbox) are handled gracefully in code and do NOT crash anything.
- The only `create_client()` call in the app runtime path is `main.py:_supabase()`. All route modules and workers receive `_supabase` as their factory. Scripts under `backend/scripts/` are one-off CLI tools — out of scope.
- `rbac.py:_auth_user_from_jwt()` creates a fresh `httpx.Client` per authenticated request (line ~86). Properly closed via `with`, so it does not leak — but it forces a new TLS handshake on every request. Cheap win to share one client.

## The state you are starting from

The working tree already contains uncommitted edits in `backend/main.py` from a previous session:
1. `_supabase()` caches into `_sb_instance` (no thread lock yet),
2. `_list_orders_supabase` has `limit/offset` via `.range()` but the creator filter still runs in Python AFTER the limit (bug),
3. `_start_dingtalk_worker` body replaced with a bare print (worker fully removed, no way to re-enable via env).

Your tasks build on / correct these edits. Do not revert them wholesale.

---

## GUARDRAILS (read before every task, re-read after any failure)

1. **Scope lock.** Only touch the files listed in a task's **Files:** block. NO frontend changes. NO changes to `zalo_outbox_worker.py`, `dingtalk_outbox_worker.py`, or any `*_routes.py`. No drive-by refactors, renames, or reformatting.
2. **Contract lock.** `/orders` response stays `{"orders": [...]}` with the same camelCase order objects. `poll_and_send(sb_factory)` signatures stay unchanged. No new required params on any endpoint.
3. **Route-count gate after EVERY `backend/main.py` edit** (2026-06-19 incident: a mis-indent silently dropped 10 routes with zero warnings):
   ```bash
   cd backend && python -c "import main; print('Total routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"
   ```
   Expected: `Total routes: 148`. Also:
   ```bash
   python -c "import main; r=[x for x in main.app.routes if hasattr(x,'path') and 'activ' in x.path]; print('activ:', len(r))"
   ```
   Expected: `activ: 15`. If either number differs → STOP, report verbatim, do not continue.
4. **Two-strike rule.** If the same test/gate fails twice in a row, STOP. Report the failing output verbatim and wait for instructions. Never attempt a third blind fix.
5. **No network in tests.** All tests use fakes/monkeypatch (conftest.py already sets fake `SUPABASE_URL`). If a test you wrote tries to reach a real service, that test is wrong — fix the test.
6. **Semantics to preserve (tests enforce these — do not "clean them up"):**
   - Orders with NULL or empty `created_by` are visible to ALL users (legacy behavior).
   - `_supabase()` returns `None` (and does NOT cache `None`) when env vars are missing.
   - DingTalk worker default = OFF. Only `DINGTALK_WORKER_ENABLED=true` (case-insensitive) enables it.
7. **Commits.** Commit per task with the messages given (checkpoints), then squash to ONE commit at the end (Task 7) — user requires a single squashed commit.
8. **Never run anything in `backend/scripts/` and never execute SQL against prod/sandbox.** Not needed for this plan.
9. Run all `python`/`pytest` commands from the `backend/` directory. `pytest.ini`/conftest live there.

---

### Task 0: Branch + baseline

**Files:** none (git only)

- [ ] **Step 0.1: Create branch and checkpoint the pre-existing edits**

```bash
git checkout -b fix/oom-rework
git add backend/main.py
git commit -m "wip: checkpoint prior singleton/orders/dingtalk edits before rework"
```

- [ ] **Step 0.2: Baseline gates**

```bash
cd backend
python -c "import main; print('Total routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"
python -m pytest tests/test_dingtalk_outbox_worker.py tests/test_zalo_outbox_worker.py tests/test_legacy_auth_hardening.py -q
```

Expected: `Total routes: 148`, all listed tests pass. If baseline already fails → STOP, report (pre-existing breakage is not yours to fix).

---

### Task 1: Thread-safe singleton `_supabase()`

The singleton already exists (previous session) but lazy init has a race: two threadpool threads can both run `create_client` (one client leaks — the exact disease we're curing). Add double-checked locking.

**Files:**
- Modify: `backend/main.py` (imports block ~line 1-16, and `_supabase()` at ~line 215)
- Test: `backend/tests/test_supabase_singleton.py` (create)

- [ ] **Step 1.1: Write the failing tests**

Create `backend/tests/test_supabase_singleton.py`:

```python
"""Singleton Supabase client — per-request client creation leaked ~150MB/h
under load and OOM'd the 512MB Render instance (2026-07-09)."""


def _reset(main):
    main._sb_instance = None


def test_supabase_returns_same_instance(monkeypatch):
    import main
    import supabase

    _reset(main)
    calls = {"n": 0}
    sentinel = object()

    def fake_create(url, key):
        calls["n"] += 1
        return sentinel

    monkeypatch.setattr(supabase, "create_client", fake_create)

    a = main._supabase()
    b = main._supabase()

    assert a is sentinel and b is sentinel
    assert calls["n"] == 1
    _reset(main)


def test_supabase_missing_env_returns_none_and_does_not_cache(monkeypatch):
    import main

    _reset(main)
    monkeypatch.setenv("SUPABASE_URL", "")

    assert main._supabase() is None
    assert main._sb_instance is None
    _reset(main)


def test_supabase_init_is_locked():
    """The lazy init must hold a lock so concurrent first calls can't
    both run create_client."""
    import main
    import threading

    assert isinstance(main._sb_lock, type(threading.Lock()))
```

- [ ] **Step 1.2: Run tests, verify they fail**

```bash
cd backend && python -m pytest tests/test_supabase_singleton.py -q
```

Expected: FAIL — `test_supabase_init_is_locked` errors with `AttributeError: module 'main' has no attribute '_sb_lock'`. (The first two may already pass — that's fine.)

- [ ] **Step 1.3: Implement**

In `backend/main.py`, add `threading` to the stdlib imports at the top of the file (near `import os` — check it isn't already imported first: `grep -n "^import threading" main.py`):

```python
import threading
```

Replace the current `_supabase()` block (starts at `_sb_instance = None`, ~line 215) with:

```python
_sb_instance = None
_sb_lock = threading.Lock()

def _supabase():
    """Process-wide singleton Supabase client.

    Per-request create_client() leaked ~150MB/h under load (httpx pools
    never closed) and OOM'd the 512MB Render instance — 2026-07-09.
    Safe to share: service-role usage is stateless and each .table()/.rpc()
    call builds a fresh request builder on a thread-safe httpx client.
    """
    global _sb_instance
    if _sb_instance is not None:
        return _sb_instance
    with _sb_lock:
        if _sb_instance is not None:
            return _sb_instance
        url = os.getenv("SUPABASE_URL", "").strip()
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            return None
        if "YOUR_PROJECT" in url or "PASTE_" in key or key.startswith("YOUR_"):
            return None
        try:
            from supabase import create_client
            from supabase._sync.client import SupabaseException

            _sb_instance = create_client(url, key)
            return _sb_instance
        except SupabaseException as exc:
            print(f"Supabase client init failed: {exc}")
            return None
        except Exception as exc:
            print(f"Supabase client init failed: {exc}")
            return None
```

- [ ] **Step 1.4: Run tests + route gate**

```bash
cd backend && python -m pytest tests/test_supabase_singleton.py -q
python -c "import main; print('Total routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"
```

Expected: 3 passed. `Total routes: 148`.

- [ ] **Step 1.5: Commit**

```bash
git add backend/main.py backend/tests/test_supabase_singleton.py
git commit -m "fix(oom): thread-safe singleton supabase client"
```

---

### Task 2: `/orders` — creator scope filter in SQL, BEFORE limit

Current bug: `.range()` cuts 100 newest rows of the WHOLE table, then Python filters by creator → a sale user whose orders aren't in the newest 100 sees nothing. Move the filter into SQL. Also normalize `created_by` at write time so SQL equality matching is reliable (table is empty in prod — no backfill needed).

**Files:**
- Modify: `backend/main.py` — `_list_orders_supabase` (~line 536), `/orders` endpoint (~line 680), `don_payload` in `_create_order_supabase` (~line 506)
- Test: `backend/tests/test_orders_scope.py` (create)

- [ ] **Step 2.1: Write the failing tests**

Create `backend/tests/test_orders_scope.py`:

```python
"""/orders scope filter must be applied in SQL BEFORE the row limit.

Regression guard: a previous edit applied .range() first and filtered
allowed_creators in Python afterwards — sale users with no orders in the
newest N rows saw an empty list."""

from types import SimpleNamespace


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def select(self, *args, **kwargs):
        self.calls.append(("select", args))
        return self

    def or_(self, arg):
        self.calls.append(("or_", arg))
        return self

    def order(self, *args, **kwargs):
        self.calls.append(("order", args))
        return self

    def range(self, start, end):
        self.calls.append(("range", (start, end)))
        return self

    def execute(self):
        self.calls.append(("execute", None))
        return SimpleNamespace(data=self.rows)


class _SB:
    def __init__(self, rows):
        self.query = _Query(rows)

    def table(self, name):
        assert name == "don_hang"
        return self.query


def _call_names(query):
    return [name for name, _ in query.calls]


def test_ops_no_creator_filter_but_limited():
    from main import _list_orders_supabase

    sb = _SB([])
    _list_orders_supabase(sb, allowed_creators=None)

    names = _call_names(sb.query)
    assert "or_" not in names
    assert ("range", (0, 999)) in sb.query.calls


def test_sale_filter_in_sql_before_range():
    from main import _list_orders_supabase

    sb = _SB([])
    _list_orders_supabase(sb, allowed_creators=["sale@x.com"])

    names = _call_names(sb.query)
    assert "or_" in names, "creator filter must run in SQL"
    assert names.index("or_") < names.index("range"), "filter must come BEFORE limit"

    or_arg = next(arg for name, arg in sb.query.calls if name == "or_")
    assert "created_by.is.null" in or_arg, "legacy rows without creator stay visible"
    assert '""' in or_arg, "empty-string creator stays visible"
    assert '"sale@x.com"' in or_arg


def test_creator_emails_are_sanitized_and_lowercased():
    from main import _list_orders_supabase

    sb = _SB([])
    _list_orders_supabase(sb, allowed_creators=['Sa"le,@X.com'])

    or_arg = next(arg for name, arg in sb.query.calls if name == "or_")
    assert '"sale@x.com"' in or_arg
    assert 'Sa"' not in or_arg


def test_rows_are_mapped_to_orders():
    from main import _list_orders_supabase

    rows = [{"id": "1", "ma_don_hang": "KH001", "created_by": "a@x.com",
             "khach_hang": {"ho_ten": "Khach A"}}]
    sb = _SB(rows)
    out = _list_orders_supabase(sb, allowed_creators=None)

    assert len(out) == 1
    assert out[0]["maDonHang"] == "KH001"
    assert out[0]["tenKhach"] == "Khach A"


def test_created_by_normalized_on_write():
    """don_hang.created_by must be stored stripped + lowercased so the SQL
    scope filter matches exactly."""
    import inspect
    import main

    src = inspect.getsource(main._create_order_supabase)
    assert 'body.createdBy' in src
    assert '.strip().lower()' in src, "created_by must be normalized at write time"
```

- [ ] **Step 2.2: Run tests, verify they fail**

```bash
cd backend && python -m pytest tests/test_orders_scope.py -q
```

Expected: FAIL — `test_sale_filter_in_sql_before_range` (no `or_` call in current code) and `test_created_by_normalized_on_write`.

- [ ] **Step 2.3: Implement**

In `backend/main.py`, replace the whole `_list_orders_supabase` function with:

```python
def _list_orders_supabase(
    sb, allowed_creators: list[str] | None = None,
    limit: int = 1000, offset: int = 0,
) -> list[dict[str, Any]]:
    query = sb.table("don_hang").select("*, khach_hang(*)")
    if allowed_creators is not None:
        # Scope filter phải nằm trong SQL, TRƯỚC limit — lọc sau limit làm
        # sale mất đơn cũ. Đơn không có created_by thì ai cũng thấy (legacy).
        quoted = ",".join(
            '"{}"'.format(e.replace('"', "").replace(",", "").strip().lower())
            for e in [""] + list(allowed_creators)
        )
        query = query.or_(f"created_by.is.null,created_by.in.({quoted})")
    res = (
        query.order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    out = []
    for row in res.data or []:
        kh = row.pop("khach_hang", None) if isinstance(row, dict) else None
        out.append(_row_to_order(row, kh))
    return out
```

In the `/orders` endpoint, change the signature defaults (limit default was 100 — restore effective legacy cap of 1000 so the FE, which sends no params, sees identical data):

```python
@app.get("/orders")
def list_orders(authorization: str = Header(...), limit: int = Query(1000, ge=1, le=1000), offset: int = Query(0, ge=0)):
```

(the body already passes `limit=limit, offset=offset` to `_list_orders_supabase` — keep it).

In `_create_order_supabase`, change the `don_payload` line (~506):

```python
        "created_by": ((body.createdBy or "").strip().lower() or None),
```

- [ ] **Step 2.4: Run tests + route gate**

```bash
cd backend && python -m pytest tests/test_orders_scope.py -q
python -c "import main; print('Total routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"
```

Expected: 6 passed. `Total routes: 148`.

- [ ] **Step 2.5: Commit**

```bash
git add backend/main.py backend/tests/test_orders_scope.py
git commit -m "fix(orders): creator scope filter in SQL before limit; normalize created_by on write"
```

---

### Task 3: DingTalk worker behind env flag (default OFF)

DingTalk side isn't set up yet (`dingtalk_outbox` table doesn't exist). Worker must be OFF by default and re-enablable via Render env var only — no code change, no redeploy.

**Files:**
- Modify: `backend/main.py` — `_start_dingtalk_worker` (~line 1345)
- Modify: `backend/.env.example` (append)
- Test: `backend/tests/test_dingtalk_worker_flag.py` (create)

**Do NOT touch `backend/dingtalk_outbox_worker.py`** — it stays as-is for when DingTalk goes live.

- [ ] **Step 3.1: Write the failing tests**

Create `backend/tests/test_dingtalk_worker_flag.py`:

```python
"""DingTalk outbox worker must be gated by DINGTALK_WORKER_ENABLED.

Default OFF: the dingtalk_outbox table doesn't exist yet (setup pending);
an always-on worker spams PGRST205 errors every 30s. Re-enable later by
setting the env var on Render — no code change."""

import asyncio

import pytest


@pytest.mark.asyncio
async def test_dingtalk_worker_disabled_by_default(monkeypatch):
    import main

    monkeypatch.delenv("DINGTALK_WORKER_ENABLED", raising=False)
    created = []

    def fake_create_task(coro):
        coro.close()
        created.append(coro)

    monkeypatch.setattr(asyncio, "create_task", fake_create_task)
    await main._start_dingtalk_worker()

    assert created == [], "worker must NOT start when flag is unset"


@pytest.mark.asyncio
async def test_dingtalk_worker_disabled_when_false(monkeypatch):
    import main

    monkeypatch.setenv("DINGTALK_WORKER_ENABLED", "false")
    created = []

    def fake_create_task(coro):
        coro.close()
        created.append(coro)

    monkeypatch.setattr(asyncio, "create_task", fake_create_task)
    await main._start_dingtalk_worker()

    assert created == []


@pytest.mark.asyncio
async def test_dingtalk_worker_enabled_via_env(monkeypatch):
    import main

    monkeypatch.setenv("DINGTALK_WORKER_ENABLED", "TRUE")
    created = []

    def fake_create_task(coro):
        coro.close()
        created.append(coro)

    monkeypatch.setattr(asyncio, "create_task", fake_create_task)
    await main._start_dingtalk_worker()

    assert len(created) == 1, "worker must start when flag is true (case-insensitive)"
```

- [ ] **Step 3.2: Run tests, verify they fail**

```bash
cd backend && python -m pytest tests/test_dingtalk_worker_flag.py -q
```

Expected: FAIL — `test_dingtalk_worker_enabled_via_env` fails (current handler is a bare print; nothing is ever created).

- [ ] **Step 3.3: Implement**

In `backend/main.py`, replace the whole `_start_dingtalk_worker` handler with:

```python
@app.on_event("startup")
async def _start_dingtalk_worker() -> None:
    import asyncio

    if os.getenv("DINGTALK_WORKER_ENABLED", "").strip().lower() != "true":
        print("[dingtalk] outbox worker disabled — set DINGTALK_WORKER_ENABLED=true after DingTalk setup (dingtalk_outbox table + webhook groups)")
        return

    from dingtalk_outbox_worker import start_outbox_worker as start_dingtalk_outbox

    print("[dingtalk] starting outbox worker...")
    asyncio.create_task(start_dingtalk_outbox(_supabase))
```

Append to `backend/.env.example`:

```bash
# DingTalk outbox worker — bật lại khi DingTalk setup xong (bảng dingtalk_outbox + webhook groups)
DINGTALK_WORKER_ENABLED=false
```

- [ ] **Step 3.4: Run tests + route gate**

```bash
cd backend && python -m pytest tests/test_dingtalk_worker_flag.py tests/test_dingtalk_outbox_worker.py -q
python -c "import main; print('Total routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"
```

Expected: all passed (worker unit tests must still pass untouched). `Total routes: 148`.

- [ ] **Step 3.5: Commit**

```bash
git add backend/main.py backend/.env.example backend/tests/test_dingtalk_worker_flag.py
git commit -m "fix(dingtalk): gate outbox worker behind DINGTALK_WORKER_ENABLED (default off)"
```

---

### Task 4: Shared httpx client in rbac.py

`_auth_user_from_jwt` opens + closes a fresh `httpx.Client` (new TLS handshake) on EVERY authenticated request. Not a leak, but needless allocation pressure and latency on the hottest code path. Share one module-level client (httpx.Client is thread-safe).

**Files:**
- Modify: `backend/rbac.py` (~lines 80-99)
- Test: `backend/tests/test_rbac_shared_http.py` (create)

- [ ] **Step 4.1: Write the failing tests**

Create `backend/tests/test_rbac_shared_http.py`:

```python
"""rbac must reuse one module-level httpx client for JWT lookups —
per-request clients redo the TLS handshake on every authenticated call."""


class _FakeRes:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _FakeHTTP:
    def __init__(self, res):
        self.res = res
        self.calls = []

    def get(self, url, headers=None):
        self.calls.append({"url": url, "headers": headers})
        return self.res


def test_module_has_shared_client():
    import httpx
    import rbac

    assert isinstance(rbac._http, httpx.Client)


def test_auth_user_uses_shared_client(monkeypatch):
    import rbac

    fake = _FakeHTTP(_FakeRes(200, {"email": "a@x.com"}))
    monkeypatch.setattr(rbac, "_http", fake)

    out = rbac._auth_user_from_jwt("some-token")

    assert out == {"email": "a@x.com"}
    assert len(fake.calls) == 1
    assert fake.calls[0]["url"].endswith("/auth/v1/user")
    assert fake.calls[0]["headers"]["Authorization"] == "Bearer some-token"


def test_auth_user_non_200_returns_none(monkeypatch):
    import rbac

    fake = _FakeHTTP(_FakeRes(401))
    monkeypatch.setattr(rbac, "_http", fake)

    assert rbac._auth_user_from_jwt("bad-token") is None
```

- [ ] **Step 4.2: Run tests, verify they fail**

```bash
cd backend && python -m pytest tests/test_rbac_shared_http.py -q
```

Expected: FAIL — `AttributeError: module 'rbac' has no attribute '_http'`.

- [ ] **Step 4.3: Implement**

In `backend/rbac.py`, add below the imports (module level):

```python
_http = httpx.Client(timeout=15)
```

Replace the body of `_auth_user_from_jwt` (keep the signature):

```python
def _auth_user_from_jwt(token: str) -> dict[str, Any] | None:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        return None
    try:
        res = _http.get(
            f"{url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": key,
            },
        )
        if res.status_code != 200:
            return None
        return res.json()
    except Exception as exc:
        print(f"JWT user lookup failed: {exc}")
        return None
```

- [ ] **Step 4.4: Run tests + the existing auth suite (rbac is load-bearing — regression check)**

```bash
cd backend && python -m pytest tests/test_rbac_shared_http.py tests/test_legacy_auth_hardening.py tests/test_audit_auth.py -q
```

Expected: all passed.

- [ ] **Step 4.5: Commit**

```bash
git add backend/rbac.py backend/tests/test_rbac_shared_http.py
git commit -m "perf(rbac): shared httpx client for JWT lookups"
```

---

### Task 5: Update backend-conventions skill (convention changed)

The skill currently mandates per-request clients — now factually wrong and dangerous. Update it so the next session doesn't "fix" the singleton back.

**Files:**
- Modify: `.claude/skills/backend-conventions/SKILL.md` (locate with `ls .claude/skills/backend-conventions/` if the filename differs)

- [ ] **Step 5.1: Replace Procedure 7 code comment**

Find the block containing `sb = supabase_factory()   # new client per request, not a singleton` and replace that comment line so the block reads:

```python
        sb = supabase_factory()   # returns the process-wide singleton client
```

Find the line `Never store `sb` at module level. Call `supabase_factory()` at handler time.` and replace with:

```
`supabase_factory()` returns a process-wide singleton — cheap to call anywhere.
Never call `supabase.create_client()` directly in app code; always go through
the factory. Never hold a client across a process fork.
```

- [ ] **Step 5.2: Replace the gotcha section**

Find the section header `### Per-request Supabase client — no connection pool` and replace the entire section (header + paragraph) with:

```markdown
### Supabase client is a process-wide singleton (since 2026-07-09)

`main.py:_supabase()` lazily creates ONE shared client (double-checked lock)
and returns it forever after. Before 2026-07-09 it created a NEW client per
call — under business-hours traffic that leaked ~150MB/hour of unclosed httpx
pools and OOM-crashed the 512MB Render instance every ~3 hours (verified via
Render memory metrics). Never call `supabase.create_client()` directly in app
code. If env vars are missing/placeholder it returns `None` (and does not
cache the `None`).
```

- [ ] **Step 5.3: Commit**

```bash
git add .claude/skills/backend-conventions/
git commit -m "docs(skill): backend-conventions — supabase client is now a singleton"
```

---

### Task 6: Full gate run

- [ ] **Step 6.1: All touched suites + route gates in one go**

```bash
cd backend
python -m pytest tests/test_supabase_singleton.py tests/test_orders_scope.py tests/test_dingtalk_worker_flag.py tests/test_rbac_shared_http.py tests/test_dingtalk_outbox_worker.py tests/test_zalo_outbox_worker.py tests/test_legacy_auth_hardening.py tests/test_audit_auth.py -q
python -c "import main; print('Total routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"
python -c "import main; r=[x for x in main.app.routes if hasattr(x,'path') and 'activ' in x.path]; print('activ:', len(r))"
```

Expected: all tests pass, `Total routes: 148`, `activ: 15`. Any failure → two-strike rule (Guardrail 4).

---

### Task 7: Squash to one commit

User requires related work squashed into a single commit.

- [ ] **Step 7.1: Squash**

```bash
git log --oneline main..fix/oom-rework   # sanity: only this plan's commits listed
git reset --soft main
git commit -m "fix(oom): singleton supabase client, SQL-side /orders scope filter, dingtalk worker env flag

- _supabase() is now a thread-safe process-wide singleton: per-request
  create_client() leaked ~150MB/h of unclosed httpx pools and OOM-crashed
  the 512MB Render instance every ~3h (verified via Render metrics 9/7)
- /orders: creator scope filter moved into SQL BEFORE the row limit
  (filter-after-limit made sale users lose old orders); created_by
  normalized (strip+lower) at write time; limit capped at 1000
- dingtalk outbox worker gated behind DINGTALK_WORKER_ENABLED (default
  off — dingtalk_outbox table not created yet; re-enable via Render env
  after DingTalk setup, no redeploy needed)
- rbac: shared httpx client for JWT lookups (was: new TLS handshake per
  authenticated request)
- backend-conventions skill updated to match new singleton convention

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 7.2: Re-run the full gate (Task 6 commands) once more on the squashed tree.** Same expected outputs.

---

### Task 8: Deploy to sandbox + verify — then STOP

- [ ] **Step 8.1: Merge into sandbox branch**

```bash
git checkout sandbox && git pull
git merge fix/oom-rework
```

If there are ANY merge conflicts: `git merge --abort`, STOP, report the conflicting files. Do not resolve conflicts yourself.

- [ ] **Step 8.2: Push + deploy**

```bash
git push origin sandbox
bash scripts/deploy.sh sandbox
```

- [ ] **Step 8.3: Verify (wait ~3-5 min for Render build)**

```bash
curl -s https://palfish-gmv-api-sandbox.onrender.com/healthz | python -m json.tool
```

Expected: `db_reachable: true`, `key_looks_valid: true`, `app_env: sandbox`.

Then confirm in the deploy logs (Render dashboard → palfish-gmv-api-sandbox → Logs) that startup prints:
- `[dingtalk] outbox worker disabled — set DINGTALK_WORKER_ENABLED=true ...`
- `[zalo] starting outbox worker...` (zalo must still start!)

- [ ] **Step 8.4: STOP and report**

Do NOT merge to `main`, do NOT deploy prod. Report back:
- test results summary,
- healthz output,
- the two startup log lines above.

Prod rollout (merge to main + `bash scripts/deploy.sh prod` + 2-3h memory-metric watch on srv-d8786dl7vvec738pem2g expecting a plateau around 200-300MB instead of a climb to 512MB) is a human decision — leave it to the main session.

---

## Explicitly OUT of scope (do not touch, even if tempting)

- `zalo_outbox_worker.py`, `dingtalk_outbox_worker.py` — worker internals unchanged; the singleton factory fixes their churn automatically.
- The `storage.objects` PGRST106 log line — graceful fallback, config gap in Supabase, separate task.
- `download_all_payment_line_bills` in-memory ZIP — real spike risk but separate task.
- Frontend — anything under `frontend/`.
- Any Supabase migration or SQL.
- `main.py` `_start_zalo_token_refresh` / `_start_zalo_worker` / PayOS startup handlers.
