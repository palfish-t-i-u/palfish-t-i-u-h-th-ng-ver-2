---
name: backend-conventions
description: Covers the FastAPI backend architecture contract for the PalFish GMV Reconciliation app — startup order, route registration pattern, Supabase client factory, RBAC, audit logging, rpc_helpers, background workers, CORS, and the critical 2026-06-19 indentation incident. Use when adding a new domain route module, debugging 404s after a merge, onboarding to the backend, or reviewing any change that touches main.py, register_*_routes, or rbac.py.
---

## Overview

Single-process FastAPI app (`backend/main.py`) served by uvicorn on port 8000.
All domain routes live in separate modules (`*_routes.py`) and are registered
synchronously at module load time via `register_*_routes(app, _supabase)` calls.
There is no runtime route discovery — if a call to `register_*_routes` is missing
or broken, those routes silently return 404.

Key DB: Supabase (Postgres). Auth: Supabase JWT validated per-request via
`resolve_actor()` in `rbac.py`. Deployment: Docker on Render (auto-deploy OFF —
use `bash scripts/deploy.sh sandbox|prod`).

---

## When to Use / When NOT to Use

**Use when:**
- Adding a new domain route module (follow the register_*_routes pattern exactly)
- Debugging 404s or "route not found" after a merge touching `activation_routes.py`
  or any `register_*_routes` function
- Onboarding a new backend contributor
- Reviewing changes to `main.py`, `rbac.py`, `env_utils.py`, `rpc_helpers.py`, or `audit.py`
- Setting up a new Render environment and need the env var list

**Do NOT use when:**
- Working on frontend (React/Vite) — see the FE skills
- Working on Supabase migrations (no dedicated runbook here; see `docs/migrations/`)
- Working on the separate `pf-revenue` repo (different codebase, different deploy)

---

## Ground Truth

### Key files (repo-relative)

| File | Role |
|---|---|
| `backend/main.py` | App entrypoint: CORS, inline routes (`/orders`, `/healthz`, `/webhook/*`), 12 `register_*_routes()` calls at lines 1317–1328, 4 `@on_event("startup")` handlers |
| `backend/rbac.py` | `Actor` dataclass, `resolve_actor()`, `ROLE_RANK`, `visible_creator_emails()`, `enforce_report_scope()` |
| `backend/activation_routes.py` | B3 Activation — 17 routes (14 have 'activ' in path; 3 are `/course-budget`, `/invoice-courses/*`). Site of the June-19 indentation bug. `_diff_referral_courses` MUST stay at module scope BEFORE `register_activation_routes` (currently line 1349 vs 1406). |
| `backend/admin_routes.py` | Dynamic RBAC permission matrix, `require_module_write()`, staff CRUD |
| `backend/env_utils.py` | `app_env()`, `is_sandbox_env()`, `resolve_dingtalk_webhook_url()`, `zalo_oa_configured()` |
| `backend/rpc_helpers.py` | `rpc_next_ma_don`, `rpc_next_payment_request_id`, `rpc_allocate_tax_sequences`, `MIGRATION_HINT` string |
| `backend/audit.py` | `log_audit()` — fire-and-forget, swallows all exceptions |
| `backend/Dockerfile` | `python:3.12-slim`, copies `backend/` + `api_pipe/` + `docs/team_hierarchy.json`, `CMD uvicorn main:app --host 0.0.0.0 --port 8000` |
| `backend/.env.example` | Canonical env var list — start here when onboarding a new environment |
| `backend/run.ps1` | Windows local dev: loads `.env` into process before uvicorn `--reload` |
| `render.yaml` | Render spec (note: `autoDeploy=true` in file but overridden to OFF in Render dashboard) |

### Key DB tables

| Table | Purpose |
|---|---|
| `nhan_su_sale` | Canonical staff record: `role`, `team`, `sub_team`, `manager_email`, `is_active`. Queried on every authenticated request by `resolve_actor()`. |
| `audit_logs` | Written by `log_audit()`. Never read in business logic. |
| `payment_requests` | Used by `/healthz` ping to confirm DB reachability. |
| `active_requests` | B3 Activation records. |
| `zalo_outbox` / `dingtalk_outbox` | Polled by background workers. |

### Env var names (never values)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENV`, `FRONTEND_URL`,
`FRONTEND_URLS`, `OPS_EMAILS`, `SYSTEM_ADMIN_EMAILS`, `USE_PAYOS`,
`SEPAY_WEBHOOK_SECRET`, `SEPAY_API_TOKEN`, `SEPAY_ALLOWED_IPS`,
`GATEWAY_EXTENSION_INGEST_TOKEN`, `ZALO_OA_APP_ID`, `ZALO_OA_APP_SECRET`,
`ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_REFRESH_TOKEN`, `ZALO_OA_TOKEN_EXPIRES_AT`,
`DINGTALK_WEBHOOK_URL`, `DINGTALK_WEBHOOK_URL_SANDBOX`,
`GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`,
`METABASE_BASE_URL`, `METABASE_EMAIL`, `METABASE_PASSWORD`,
`METABASE_PACKAGES_QUESTION_ID`, `RENDER_EXTERNAL_URL`,
`PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_WEBHOOK_URL`

> `CRM_ENCRYPT_KEY` and `CRM_EXTENSION_INGEST_TOKEN` are used by `crm_routes.py`
> but absent from both `render.yaml` and `.env.example` — a new deploy without
> them silently disables CRM sync and extension ingest.

---

## Procedures

### 1. Add a new domain route module

```
# 1. Create backend/my_module_routes.py — export exactly one function:
def register_my_module_routes(app, supabase_factory):
    @app.get("/api/v1/my-resource")
    def list_my_resource(authorization: str | None = Header(None)):
        sb = supabase_factory()
        ...

# 2. Import in backend/main.py (with the other domain imports, lines 18-35):
from my_module_routes import register_my_module_routes

# 3. Add the call at module level, AFTER FastAPI() instantiation and BEFORE
#    the @on_event("startup") decorators (current block: lines 1317-1328):
register_my_module_routes(app, _supabase)

# 4. Verify all routes registered correctly (run from backend/ dir):
python -c "import main; print(len([r for r in main.app.routes if hasattr(r,'path')]))"
# Should increase by the number of new routes you added.

# Also check your specific prefix:
python -c "import main; print([r.path for r in main.app.routes if hasattr(r,'path') and 'my-resource' in r.path])"
```

### 2. Verify route registration after any merge (critical post-merge check)

Run from `backend/` directory. The total route count should match the expected
value — if it drops, a helper was accidentally indented (see Gotchas).

```bash
cd backend
python -c "import main; print('Total routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"

# Spot-check activation routes specifically (currently 14 paths with 'activ' in path; 17 total in activation_routes.py):
python -c "import main; routes=[r for r in main.app.routes if hasattr(r,'path') and 'activ' in r.path]; print(len(routes), [r.path for r in routes])"

# Or hit OpenAPI JSON from a running server:
curl http://localhost:8000/openapi.json | python -m json.tool | grep '"path"'
```

### 3. Start the local dev server (Windows)

```powershell
cd backend
./run.ps1
# FastAPI on http://localhost:8000
# Docs at http://localhost:8000/docs
```

Do NOT use `uvicorn main:app --reload` directly on Windows — it spawns subprocesses
that may not inherit the `.env` file. `run.ps1` loads `.env` first.

### 4. Health check

```bash
curl http://localhost:8000/healthz
# Returns: app_env, key_looks_valid, db_reachable, url_ref (project ref, not a secret)
```

`db_reachable: false` usually means `SUPABASE_SERVICE_ROLE_KEY` is a placeholder
or an old revoked `eyJ...` key (legacy keys were globally disabled 2026-06-16).

### 5. Resolve PostgREST schema cache stale error

Symptom: `pgrst204` or `schema cache` after a migration. Fix:

```sql
-- Supabase SQL Editor:
NOTIFY pgrst, 'reload schema';
```

### 6. Deploy to Render (sandbox or prod)

```bash
bash scripts/deploy.sh sandbox   # Hook URLs in scripts/deploy-hooks.local (gitignored)
bash scripts/deploy.sh prod
```

### 7. Use the Supabase client in a route handler

```python
def register_my_routes(app, supabase_factory):
    @app.get("/api/v1/something")
    def get_something(authorization: str | None = Header(None)):
        sb = supabase_factory()   # returns the process-wide singleton client
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        actor = resolve_actor(sb, authorization)
        ...
```

`supabase_factory()` returns a process-wide singleton — cheap to call anywhere.
Never call `supabase.create_client()` directly in app code; always go through
the factory. Never hold a client across a process fork.

### 8. Write an audit log entry

```python
from audit import log_audit

# Fire-and-forget — never depends on this succeeding:
log_audit(
    sb,
    actor_email=actor.email,
    action="my_action",
    target_type="payment_request",
    target_id=str(pr_id),
    payload={"key": "value"},
)
```

### 9. Generate a collision-free sequential ID

```python
from rpc_helpers import rpc_next_payment_request_id, rpc_next_ma_don

pr_id = rpc_next_payment_request_id(sb)      # "PR-0123"
ma_don = rpc_next_ma_don(sb)                 # "KH001"

# If the Postgres RPC function is missing (migration not applied), these raise
# HTTP 503 with MIGRATION_HINT pointing to docs/supabase_schema_patch_db_audit_20260603.sql
```

### 10. Check environment / sandbox isolation

```python
from env_utils import app_env, is_sandbox_env

if is_sandbox_env():
    # sandbox-only logic
    pass

# DingTalk sandbox isolation:
# If APP_ENV=sandbox and DINGTALK_WEBHOOK_URL_SANDBOX is unset, outbound
# DingTalk messages are silently muted (printed to stdout, not sent).
```

---

## Gotchas & Past Incidents

### THE INDENTATION BUG — commit 462557e, 2026-06-19 (CRITICAL)

A helper function `_diff_referral_courses` was accidentally defined with extra
indentation **inside** `register_activation_routes()`. Python parsed it as a
local function. The 10 `@app.route` decorators that came after it were then
nested inside that local function definition and **were never called**. FastAPI
raised zero warnings — those routes returned 404 silently.

Result: 4 of 14 activation routes were exposed; all AR mutation endpoints
("Kích hoạt khoá học" button, credit-referral checkboxes) returned 404.

**Rule:** ALL module-level helper functions used inside a `register_*_routes`
closure MUST be defined at module scope BEFORE the `register_*_routes` call.
After every merge that touches a `register_*_routes` function, run the route
count verification (Procedure 2).

### Supabase client is a process-wide singleton (since 2026-07-09)

`main.py:_supabase()` lazily creates ONE shared client (double-checked lock)
and returns it forever after. Before 2026-07-09 it created a NEW client per
call — under business-hours traffic that leaked ~150MB/hour of unclosed httpx
pools and OOM-crashed the 512MB Render instance every ~3 hours (verified via
Render memory metrics). Never call `supabase.create_client()` directly in app
code. If env vars are missing/placeholder it returns `None` (and does not
cache the `None`).

### Legacy `eyJ...` JWT keys globally disabled 2026-06-16

After a key leak, all legacy JWT-format service role keys were disabled on the
Supabase project. Only `sb_secret_*` or `sb_publishable_*` format keys work.
`/healthz` validates the key format and reports `key_looks_valid`. Never commit
or deploy with an `eyJ...` key.

### `resolve_actor()` makes a synchronous HTTP call on every request

`rbac.py:_auth_user_from_jwt()` calls `SUPABASE_URL/auth/v1/user` with a 15s
timeout on every authenticated request. There is no caching. A slow Supabase
auth service directly increases API latency.

### Unactivated accounts get HTTP 403 — including Google OAuth signups

All new signups (email and Google OAuth) have `is_activated=false` in
`user_metadata`. `resolve_actor()` raises `HTTP 403` for unactivated users not
in `SYSTEM_ADMIN_EMAILS`. There is currently no "pending activation" message.
The admin must activate the user via the Auth Accounts admin panel.

### CORS — do not remove the regex pattern

`main.py:81` includes `allow_origin_regex` covering all `*.vercel.app` URLs
matching `(pf-gmv|palfish)`. Removing this breaks every sandbox Vercel preview
deploy.

### `api_pipe/.env` is loaded before `backend/.env`

`main.py:45-46` loads `api_pipe/.env` first (no override), then `backend/.env`
with `override=True`. `backend/.env` wins for any shared variable.

### PayOS webhook registration is skipped when `USE_PAYOS != "true"`

As of Sprint 3 decision (2026-06-19), `USE_PAYOS=false` is the production
setting — SePay + self-generated VietQR is used instead. The PayOS create-link
endpoint still exists but is unused.

### `render.yaml` says `autoDeploy: true` but dashboard override is OFF

Never rely on `render.yaml` for deploy behavior. The Render dashboard setting
wins. Always deploy manually via `bash scripts/deploy.sh sandbox|prod`.

---

## RBAC Quick Reference

```
ROLE_RANK: sale=1, ops=2, leader=2, manager=3, system=4
"admin" in JWT/DB → normalized to "system"
unknown role string → normalized to "sale"
```

Role resolution in `resolve_actor()`: `nhan_su_sale.role` (DB, canonical) →
`SYSTEM_ADMIN_EMAILS` env → `user_metadata.role` (JWT fallback).

`visible_creator_emails(actor)`: `None` (all) for system/ops; `[self]` for
sale; team-scoped for leader/manager.

---

## Background Workers (started at ASGI startup)

Four `@app.on_event("startup")` handlers register in `main.py:1334-1388`:

| Handler | Task |
|---|---|
| `_start_zalo_token_refresh` | Starts hourly Zalo OA token refresh guard (`zalo_notifier.start_zalo_token_refresh_task`) |
| `_register_payos_webhook_on_startup` | Registers PayOS webhook URL — **skipped** when `USE_PAYOS != "true"` or `APP_ENV == "sandbox"` |
| `_start_zalo_worker` | Polls `zalo_outbox` table (`zalo_outbox_worker.start_outbox_worker`) |
| `_start_dingtalk_worker` | Polls `dingtalk_outbox` table (`dingtalk_outbox_worker.start_outbox_worker`) |

---

## JSON Contract with Frontend

All API responses use `snake_case` field names. The frontend (`api.ts`) maps
these directly — never change a field name on the backend without a coordinated
FE update. Pydantic models use `snake_case`; any `camelCase` conversion is done
only in legacy inline routes in `main.py`.

---

## Volatile Facts (as of 2026-07-04)

- **Supabase key format**: accepted formats are `sb_secret_*`, `sb_publishable_*`,
  and legacy `eyJ...` (3+ dot segments, len > 40). If Supabase changes key format
  again, update the check at `backend/main.py:597-601`. Re-verify:
  `grep -n "key_looks_valid\|sb_secret\|sb_publishable\|eyJ" backend/main.py`

- **Route registration block location**: currently `main.py:1317-1328` (12 calls).
  Re-verify: `grep -n "register_.*_routes(app" backend/main.py`

- **Render autoDeploy**: `render.yaml` shows `autoDeploy: true` but dashboard
  overrides to OFF. Re-verify by checking Render dashboard Settings → Auto-Deploy,
  or test with a dummy push.

- **USE_PAYOS**: set to `false` in Render prod env (SePay-only since 2026-06-19).
  Re-verify: `grep -r "USE_PAYOS" backend/` and check Render env dashboard.

- **Activation routes count**: 17 total routes in `activation_routes.py`; 14 have 'activ' in path (the other 3 are `/course-budget`, `/invoice-courses/bulk-issue`, `/invoice-courses/export-batch`). Re-verify:
  `cd backend && python -c "import main; r=[x for x in main.app.routes if hasattr(x,'path') and 'activ' in x.path]; print(len(r))"`
  Cross-reference: the June-19 incident affected 14 total routes at the time (10 were unregistered; 4 were exposed). See `change-control-and-handoffs` skill.

---

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):** verify-routes-exposed after every change touching `main.py` or any `register_*_routes` function (2026-06-19 incident: mis-indent silently dropped 10 routes):
```bash
cd backend && python -c "import main; print('Total routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"
cd backend && python -c "import main; r=[x for x in main.app.routes if hasattr(x,'path') and 'activ' in x.path]; print(len(r))"
```

**Tier 2 — when adding a route module or touching RBAC:**
```bash
curl http://localhost:8000/healthz | python -m json.tool | grep -E "db_reachable|key_looks_valid"
cd backend && python -c "import main; print([r.path for r in main.app.routes if hasattr(r,'path') and 'YOUR_PREFIX' in r.path])"
```

**Tier 3 — before merge/deploy only:**
```bash
cd backend && python -m pytest 2>&1 | tail -20
curl https://palfish-gmv-api.onrender.com/healthz | python -m json.tool | grep -E "db_reachable|key_looks_valid|app_env"
```

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** pipe output through `grep` or `tail` — never dump full `openapi.json` into context.
