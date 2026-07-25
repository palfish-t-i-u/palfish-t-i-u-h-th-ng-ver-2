---
name: environments-and-secrets
description: Covers all environment tiers (prod/sandbox), Supabase projects, Vercel projects, Render services, the full env var catalog per service, the render.yaml coverage gap, key rotation history, and procedures for rotating or adding secrets. Use when configuring a new deploy, rotating a leaked secret, diagnosing a 503/401 that traces to a missing env var, or onboarding a team member to local dev.
---

## Overview

The app has two deployed tiers — **prod** and **sandbox** — each consisting of a Vercel frontend and a Render backend talking to a dedicated Supabase project. Local dev uses the same env var names but points to localhost or the prod Supabase project depending on the task.

---

## When to use / When NOT to use

**Use when:**
- Setting up a new Render service or Vercel project from scratch
- Rotating a leaked or expired secret
- Diagnosing a 503 on `/api/v1/crm/...`, `/api/v1/gateway/...`, or the SePay webhook
- A new engineer is doing local dev for the first time
- Sandbox is being rebuilt from scratch (reset Supabase, re-deploy Render)

**Do NOT use for:**
- Applying DB migrations (see database skill)
- Triggering a deploy (see deploying-gmv skill)
- Zalo OA token refresh flow (see zalo skill, if it exists)

---

## Ground truth

### Supabase projects (as of 2026-07-04)

| Tier | Project name | Project ref (ID) | URL |
|------|-------------|-------------------|-----|
| Prod | `project_palfish` | `jozcvbbypwvzaefteoxn` | `https://jozcvbbypwvzaefteoxn.supabase.co` |
| Sandbox | `palfish-gmv-sandbox` | `pxgybyfiwywksesyogti` | `https://pxgybyfiwywksesyogti.supabase.co` |

Key type rule (permanent since 2026-06-16): only keys with the `sb_secret_` / `sb_publishable_` prefix are valid. The legacy `eyJ...` JWT tokens are **disabled**. Using a legacy key causes silent auth failures — every API call returns 401 or 403 with no obvious message.

Re-verify key type: Supabase Dashboard → Project → Settings → API → check that the key you copied starts with `sb_secret_` or `sb_publishable_`.

### Vercel projects (as of 2026-07-04)

| Tier | Vercel project | Git branch | URL |
|------|---------------|-----------|-----|
| Prod | `palfish-gmv-manager` | `main` | `https://palfish-gmv-manager.vercel.app` |
| Sandbox | `palfish-gmv-manager-sandbox` | `sandbox` | `https://palfish-gmv-manager-sandbox.vercel.app` |

Both auto-deploy on push to their branch. Vercel may leave a new `main` deploy as "Preview" — manually promote via Vercel Dashboard → Deployments → `...` → Promote to Production if needed.

Sandbox test accounts: `test.user@dev` (Sale role) / `test.admin@dev` (system role). No local server needed for sandbox UI testing.

### Render services (as of 2026-07-04)

| Tier | Service name | Target branch | deploy.sh arg |
|------|-------------|--------------|---------------|
| Prod | `palfish-gmv-api` | `main` | `prod` |
| Sandbox | `palfish-gmv-api-sandbox` | `sandbox` | `sandbox` |

Auto-deploy is **OFF** (enforced via Render dashboard — overrides `autoDeploy: true` in `render.yaml`). All BE deploys go through:

```bash
bash scripts/deploy.sh sandbox   # or prod
```

Deploy hook URLs live in the gitignored `scripts/deploy-hooks.local` (template: `scripts/deploy-hooks.local.example`). Never commit hook URLs.

### Key files

| Path | Role |
|------|------|
| `render.yaml` | Render Blueprint; declares two services; env var list here is **incomplete** — see gap below |
| `backend/.env.example` | Complete local backend env var template (source of truth for var names) |
| `frontend/.env.example` | Frontend env var template |
| `scripts/deploy-hooks.local.example` | Template for the gitignored deploy hook file |
| `docs/DEPLOY.md` | Deploy runbook (some sections outdated — SEPAY/ZALO/GATEWAY vars are missing from its env table) |

---

## Full env var catalog

### Backend (Render + local `backend/.env`)

All names verified against `backend/*.py` via grep.

#### Core / always required

| Var | Used in | Effect if missing |
|-----|---------|-------------------|
| `SUPABASE_URL` | everywhere | 503 on every request |
| `SUPABASE_SERVICE_ROLE_KEY` | everywhere | 503 on `/me` and all data endpoints |
| `FRONTEND_URL` | `main.py` CORS | CORS 400 for all browser requests |
| `FRONTEND_URLS` | `main.py` CORS | Optional; add Vercel preview URLs here |
| `SYSTEM_ADMIN_EMAILS` | `rbac.py` | No one can reach system-admin routes before `nhan_su_sale` record exists |
| `OPS_EMAILS` | `rbac.py` | No one can tick "tiền đã vào" (canConfirmPayment) |
| `APP_ENV` | `env_utils.py` | Defaults to `development`; set to `sandbox` on sandbox Render service only |

#### SePay (webhook + reconciliation API)

| Var | Used in | Effect if missing |
|-----|---------|-------------------|
| `SEPAY_WEBHOOK_SECRET` | `sepay_routes.py:30` | On `APP_ENV=production`: **webhook rejected with 500**; otherwise accepted without HMAC check |
| `SEPAY_API_TOKEN` | `sepay_routes.py:31` | 503 when polling SePay for transactions |
| `SEPAY_ALLOWED_IPS` | `sepay_routes.py:37` | Defaults to empty = accept all IPs (dev mode); set to SePay's official IPs in prod |

#### CRM extension ingest — MISSING from render.yaml and backend/.env.example

| Var | Used in | Effect if missing |
|-----|---------|-------------------|
| `CRM_ENCRYPT_KEY` | `crm_routes.py:48` | 503 on any CRM token store/retrieve; Fernet cipher disabled |
| `CRM_EXTENSION_INGEST_TOKEN` | `crm_routes.py:76` | 503 on all CRM extension ingest calls |

Both vars are absent from `render.yaml` **and** from `backend/.env.example`. A fresh deploy using only render.yaml-declared vars will silently break all CRM sync and extension ingest.

#### Gateway extension ingest (mPOS / Payoo) — MISSING from render.yaml

| Var | Used in | Effect if missing |
|-----|---------|-------------------|
| `GATEWAY_EXTENSION_INGEST_TOKEN` | `gateway_routes.py:64` | 503 on all mPOS/Payoo data pushes from extension |

#### PayOS (legacy — disabled since 2026-06-19)

| Var | Used in | Default |
|-----|---------|---------|
| `PAYOS_CLIENT_ID` | `api_pipe/` | — |
| `PAYOS_API_KEY` | `api_pipe/` | — |
| `PAYOS_CHECKSUM_KEY` | `api_pipe/` | — |
| `USE_PAYOS` | `payment_request_routes.py:1853`, `main.py:1350` | `false` (SePay-only since 2026-06-19) |

PayOS keys can live in `api_pipe/.env`; backend loads that file before `backend/.env`. Keep `USE_PAYOS=false` unless explicitly re-enabling.

#### Zalo OA notifications — MISSING from render.yaml

All vars read in `zalo_notifier.py` and `env_utils.py`:

| Var | Notes |
|-----|-------|
| `ZALO_OA_APP_ID` | Also accepted as `ZALO_OA_ID` (legacy alias) |
| `ZALO_OA_APP_SECRET` | Required for token refresh |
| `ZALO_OA_ACCESS_TOKEN` | Short-lived; auto-refreshed via `ZALO_OA_REFRESH_TOKEN` |
| `ZALO_OA_REFRESH_TOKEN` | Long-lived; **minting a new one via OAuth revokes all previous tokens immediately** |
| `ZALO_OA_TOKEN_EXPIRES_AT` | ISO datetime; backend refreshes before expiry |

Prod and sandbox share one Zalo OA app — they **cannot both hold valid tokens simultaneously**. Whoever last ran the OAuth mint flow wins. Do not run the OAuth flow on sandbox when prod is live.

#### DingTalk notifications — MISSING from render.yaml

| Var | Used in | Notes |
|-----|---------|-------|
| `DINGTALK_WEBHOOK_URL` | `env_utils.py:29` | Per-team webhook URL for prod; if empty, outbound muted |
| `DINGTALK_WEBHOOK_URL_SANDBOX` | `env_utils.py:23` | Sandbox isolation: if not set, sandbox DingTalk outbound is silently muted |

#### Google Sheets import (Sổ doanh thu) — MISSING from render.yaml

| Var | Used in | Notes |
|-----|---------|-------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `gsheet_ledger_import.py:508` | **File path only** (not inline JSON) — code calls `os.path.isfile(path)`. On Render, use the Render Secret Files feature to mount the JSON at a known path, then set this var to that path. |
| `GOOGLE_SHEETS_ID` | `gsheet_ledger_import.py:692` | Spreadsheet ID for "All File Thu Hiền" |

**Path-vs-inline JSON ambiguity:** `gsheet_ledger_import.py` strips quotes and then calls `os.path.isfile(path)` — it only accepts a file path, not inline JSON. On Render, you must create a Secret File (not an env var) containing the JSON, then set `GOOGLE_SERVICE_ACCOUNT_JSON` to the mounted path (e.g. `/etc/secrets/gsheet-sa.json`).

#### VN staff filtering

| Var | Used in | Default if absent |
|-----|---------|-------------------|
| `NON_VN_TEAMS` | `vn_staff.py:11` | `tele sale,thái,úc` (comma-separated; case-insensitive) |

If a new Thailand/AU team name is added to CRM that does not contain "thailand" in `depart6_name` AND is not in `NON_VN_TEAMS`, their data silently appears in VN GMV reports.

#### Metabase (optional)

| Var | Effect if missing |
|-----|-------------------|
| `METABASE_BASE_URL` | Package sync disabled |
| `METABASE_EMAIL` | — |
| `METABASE_PASSWORD` | — |
| `METABASE_PACKAGES_QUESTION_ID` | — |

### Frontend (Vercel + local `frontend/.env.local`)

All names verified against `frontend/.env.example`.

| Var | Where | Notes |
|-----|-------|-------|
| `VITE_SUPABASE_URL` | Vercel + local | Prod or sandbox project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel + local | `sb_publishable_` key only — **never** service_role |
| `VITE_API_BASE_URL` | Local only | `http://localhost:8000`; Vercel sets this to `/api` via `vercel.json` at build time |
| `VITE_OPS_EMAILS` | Vercel + local | Fallback UI display; authoritative value comes from `GET /me` |
| `VITE_BANK_BIN` | Vercel | MB Bank BIN for VietQR |
| `VITE_BANK_ACCOUNT_NO` | Vercel | — |
| `VITE_BANK_ACCOUNT_NAME` | Vercel | — |
| `VITE_BANK_DISPLAY_NAME` | Vercel | — |
| `VITE_BANK_BRANCH` | Vercel | — |
| `VITE_APP_ENV` | Vercel sandbox | Set to `sandbox` → activates yellow SANDBOX banner |
| `VITE_SANDBOX` | Vercel sandbox | `true` → alternative sandbox banner flag |

---

## The render.yaml coverage gap

`render.yaml` (verified content) only declares these vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `FRONTEND_URLS`, `SYSTEM_ADMIN_EMAILS`, `OPS_EMAILS`, `APP_ENV`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`.

**Missing from render.yaml** (must be added manually in Render Dashboard → Environment after a Blueprint deploy):

```
CRM_ENCRYPT_KEY
CRM_EXTENSION_INGEST_TOKEN
SEPAY_WEBHOOK_SECRET
SEPAY_API_TOKEN
SEPAY_ALLOWED_IPS
GATEWAY_EXTENSION_INGEST_TOKEN
ZALO_OA_APP_ID
ZALO_OA_APP_SECRET
ZALO_OA_ACCESS_TOKEN
ZALO_OA_REFRESH_TOKEN
ZALO_OA_TOKEN_EXPIRES_AT
DINGTALK_WEBHOOK_URL
GOOGLE_SERVICE_ACCOUNT_JSON   (path to mounted secret file)
GOOGLE_SHEETS_ID
NON_VN_TEAMS
USE_PAYOS
```

A render.yaml-only deploy will start and pass the health check at `/healthz` but will silently fail: CRM sync, extension ingest (mPOS/Payoo), SePay webhook verification, Zalo notifications, DingTalk notifications, and GSheet import.

---

## Procedures

### Add a missing env var to Render

1. Render Dashboard → select service (`palfish-gmv-api` or `palfish-gmv-api-sandbox`).
2. Environment → Add Environment Variable.
3. Set the key and value. For secrets: use "Secret" type so it is masked in logs.
4. For `GOOGLE_SERVICE_ACCOUNT_JSON`: go to Secret Files → upload the JSON file → note the mount path → set `GOOGLE_SERVICE_ACCOUNT_JSON` to that path.
5. Save Changes — Render will trigger a redeploy automatically. No `deploy.sh` needed for a pure env-var change (see `deploying-gmv` skill — this is listed as an explicit NOT-use case for deploy.sh).

### Rotate a leaked secret

1. Generate a new value (token, key, password) from the issuing service.
2. Update **all** locations:
   - Render Dashboard → Environment (both services if shared)
   - Local `backend/.env` on each developer machine
   - Vercel Dashboard → Environment Variables (for VITE_* vars)
   - Local `frontend/.env.local` or `frontend/.env.sandbox` on each machine
3. Trigger a Render redeploy: `bash scripts/deploy.sh sandbox` then (after smoke test) `bash scripts/deploy.sh prod`.
4. Vercel redeploys automatically on the next push; force a redeploy via Vercel Dashboard → Deployments → Redeploy if needed.
5. Update `backend/.env.example` / `frontend/.env.example` placeholder comments if the var was newly discovered (never commit real values).

### Set up local backend dev

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — fill real values for at least:
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYSTEM_ADMIN_EMAILS, OPS_EMAILS
#   SEPAY_WEBHOOK_SECRET, SEPAY_API_TOKEN (if testing SePay)
#   CRM_ENCRYPT_KEY, CRM_EXTENSION_INGEST_TOKEN (if testing CRM extension)
#   GATEWAY_EXTENSION_INGEST_TOKEN (if testing mPOS/Payoo)
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Set up local frontend dev

```bash
cp frontend/.env.example frontend/.env.local
# Edit frontend/.env.local — fill:
#   VITE_SUPABASE_URL (prod or sandbox project URL)
#   VITE_SUPABASE_ANON_KEY (sb_publishable_ key — never service_role)
#   VITE_API_BASE_URL=http://localhost:8000  (or sandbox Render URL if not running BE locally)
cd frontend && npm run dev
```

### Verify Supabase key type after rotation

```bash
# Key must start with sb_secret_ (backend) or sb_publishable_ (frontend)
# Legacy eyJ... keys are disabled since 2026-06-16
grep SUPABASE_SERVICE_ROLE_KEY backend/.env
grep VITE_SUPABASE_ANON_KEY frontend/.env.local
```

Re-verify correct key type: Supabase Dashboard → Project Settings → API.

---

## Gotchas & past incidents

- **2026-06-16: Legacy JWT key rotation.** All `eyJ...` Supabase keys were disabled after a leak. Any `.env` file or Render/Vercel env var still holding an old key will cause silent auth failures. New keys carry `sb_secret_` / `sb_publishable_` prefixes.
- **2026-06-18: SePay key rotation.** Both `SEPAY_API_TOKEN` and `SEPAY_WEBHOOK_SECRET` were rotated on prod and sandbox. Engineers were notified to update local `.env` files. If a local backend stops accepting SePay webhooks, check whether the local key matches the current production value.
- **render.yaml autoDeploy:true is a lie.** The file says `autoDeploy: true` but the team has disabled auto-deploy in the Render dashboard for both services. All BE deploys must go through `bash scripts/deploy.sh [sandbox|prod]`. This dashboard setting takes precedence over `render.yaml`.
- **Zalo OA shared token pool.** Prod and sandbox share one Zalo OA app. Minting a new OAuth token (e.g. to rotate `ZALO_OA_REFRESH_TOKEN`) immediately revokes **all** previous access and refresh tokens. Do not run the OAuth flow on sandbox while prod is live.
- **FRONTEND_URL must not have a trailing slash.** CORS preflight returns 400 if it does. Set it to `https://palfish-gmv-manager.vercel.app` not `https://palfish-gmv-manager.vercel.app/`.
- **CRM_ENCRYPT_KEY and CRM_EXTENSION_INGEST_TOKEN are absent from backend/.env.example.** A developer copying the example file and running without these vars will get 503 on CRM routes — not immediately obvious.
- **GOOGLE_SERVICE_ACCOUNT_JSON is a file path, not inline JSON.** `gsheet_ledger_import.py` calls `os.path.isfile(path)` after reading the env var. Passing inline JSON content silently fails with "file not found". On Render, use Secret Files, not an env var with JSON content.

---

## Volatile facts (re-verify before relying)

- **Render service plan** (as of 2026-07-04): both services declare `plan: free` in `render.yaml`. Verify actual plan in Render Dashboard; sandbox was upgraded to Starter paid tier at one point. Re-verify: Render Dashboard → service → Settings → Plan.
  ```bash
  # Check render.yaml plan declarations
  grep -n "plan:" render.yaml
  ```
- **Sandbox Render service suspension** (as of 2026-07-04): other Render services in the workspace (`pf-revenue-api`, `palfish-backend`) were suspended in June 2026 and are unrelated to this app. Verify: Render Dashboard → workspace service list.
- **Supabase key format** (as of 2026-07-04): only `sb_secret_`/`sb_publishable_` prefixed keys are valid. Re-verify: Supabase Dashboard → Project Settings → API → "Project API keys" section.
  ```bash
  grep -E "^(SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_ANON_KEY)" backend/.env frontend/.env.local
  ```
- **`vn_staff.py` NON_VN_TEAMS default** (as of 2026-07-04): fallback is `"tele sale,thái,úc"`. Re-verify:
  ```bash
  grep -n "_fallback_teams" backend/vn_staff.py
  ```
- **SePay keys** (last rotated 2026-06-18): if SePay webhook returns 403 or polling returns 401, keys may have been rotated again. Re-verify in the SePay portal and update Render + local `.env`.

---

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
```bash
# Verify Supabase key format — must start with sb_secret_ or sb_publishable_
grep -E "^(SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_ANON_KEY)" backend/.env frontend/.env.local

# Check render.yaml-declared plan (re-verify against Render Dashboard)
grep -n "plan:" render.yaml
```

**Tier 2 — when rotating secrets or adding a new env var:**
```bash
# Confirm the var is present in all required locations (Render + local)
grep -n "SUPABASE_SERVICE_ROLE_KEY\|CRM_ENCRYPT_KEY\|SEPAY_WEBHOOK_SECRET" backend/.env

# Catch vars in code that are not in render.yaml (coverage gap check)
grep -rn 'os.getenv' backend/*.py | grep -v test | grep -v ".pyc"
```

**Tier 3 — before merge/deploy only:**
```bash
# After rotating a secret and deploying: smoke the healthz endpoint
curl https://palfish-gmv-api.onrender.com/healthz
# db_reachable must be true; key_looks_valid must be true

# Verify sandbox healthz points at sandbox project, not prod
curl https://palfish-gmv-api-sandbox.onrender.com/healthz | python -m json.tool | grep "project_ref"
# Must show: pxgybyfiwywksesyogti (sandbox), NOT jozcvbbypwvzaefteoxn (prod)
```

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** `grep` for specific fields rather than dumping full `/healthz` or env file content into context.
