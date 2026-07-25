---
name: deploying-gmv
description: Covers the full deploy pipeline for PalFish GMV Reconciliation — backend to Render via manual deploy hooks, frontend to Vercel via branch push, pre-push TypeScript gate, sandbox-to-production promotion checklist, and local dev startup. Use when deploying either component to any environment, promoting sandbox to production, setting up a new environment from scratch, or troubleshooting deploy failures.
---

## Overview

Two independently deployed components:

| Component | Platform | Trigger |
|-----------|----------|---------|
| Frontend (React 19 + Vite + TypeScript) | Vercel — 2 projects | Auto-deploy on git push per branch |
| Backend (FastAPI + Docker) | Render — 2 services | **Manual only** — `bash scripts/deploy.sh [sandbox\|prod]` |

**Critical rule**: `render.yaml` says `autoDeploy: true` but the Render **dashboard** has auto-deploy turned OFF for both services. The dashboard setting always wins. Never rely on a git push to deploy the backend.

---

## When to use / When NOT to use

**Use when:**
- Deploying backend changes to sandbox or production
- Deploying frontend changes (just push the right branch; Vercel handles the rest)
- Promoting sandbox → main (production) — follow the full checklist in Procedure 3
- Setting up a net-new environment (new Render service or Vercel project)
- Debugging a failed build or a "site down" incident

**Do NOT use when:**
- Applying Supabase schema migrations only — that is SQL Editor work, not a deploy
- Updating Render env vars without a code change — Render will redeploy automatically when you save env vars in the dashboard; no `deploy.sh` needed

---

## Ground truth

### Key files (repo-relative paths)

| File | Role |
|------|------|
| `scripts/deploy.sh` | Triggers Render deploy via HTTP POST to a deploy-hook URL |
| `scripts/deploy-hooks.local.example` | Template for the gitignored secrets file; shows required env var names |
| `scripts/deploy-hooks.local` | **Gitignored** — holds the real hook URLs; never committed |
| `render.yaml` | Render Blueprint: two Docker web services, `dockerContext: .` (repo root), `healthCheckPath: /healthz` |
| `backend/Dockerfile` | `WORKDIR /app/backend`; COPYs `backend/`, `api_pipe/`, `docs/team_hierarchy.json`; `ENV PYTHONPATH=/app`; exposes 8000 |
| `backend/run.ps1` | Windows local dev launcher (loads `backend/.env`, starts uvicorn on `127.0.0.1:8000`) |
| `frontend/package.json` | `build` script is `tsc -b && vite build`; `build:sandbox` is `tsc -b && vite build --mode sandbox` |
| `frontend/vercel.json` | `buildCommand: npm run build`; sets `VITE_API_BASE_URL=/api`; rewrites `/api/:path*` → Render URL |
| `frontend/tsconfig.json` | Root tsconfig using project references (required for `tsc -b`) |
| `docs/DEPLOY.md` | Full env-var table, CORS gotchas, troubleshooting |
| `docs/HANDOFF_DEPLOY_SANDBOX_TO_MAIN_2026-06-21.md` | Authoritative sandbox → production checklist (4-step: pre-merge, DB migration, code deploy, post-deploy) |

### Vercel projects

| Vercel project | Git branch | URL |
|----------------|------------|-----|
| `palfish-gmv-manager` | `main` | https://palfish-gmv-manager.vercel.app |
| `palfish-gmv-manager-sandbox` | `sandbox` | https://palfish-gmv-manager-sandbox.vercel.app |

### Render services

| Render service | Git branch | deploy.sh target |
|----------------|------------|-----------------|
| `palfish-gmv-api` | `main` | `prod` |
| `palfish-gmv-api-sandbox` | `sandbox` | `sandbox` |

### Key DB tables (deploy-relevant)

- No tables are owned by the deploy pipeline itself.
- After any schema migration, always run `NOTIFY pgrst, 'reload schema';` in the Supabase SQL Editor.

### Env var NAMES (never values)

Backend (Render + `backend/.env` for local):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (absence causes `/me` 503)
- `FRONTEND_URL` — must have NO trailing slash; trailing slash breaks CORS preflight
- `FRONTEND_URLS` — optional comma-separated extra Vercel preview domains
- `SYSTEM_ADMIN_EMAILS`, `OPS_EMAILS`
- `USE_PAYOS` — set to `false` (SePay-only since 2026-06-19)
- `SEPAY_API_TOKEN`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_ALLOWED_IPS`
- `GATEWAY_EXTENSION_INGEST_TOKEN`, `CRM_EXTENSION_INGEST_TOKEN`, `CRM_ENCRYPT_KEY`
- `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_REFRESH_TOKEN`, `ZALO_OA_APP_ID`, `ZALO_OA_APP_SECRET`, `ZALO_OA_ID`, `ZALO_OA_TOKEN_EXPIRES_AT`
- `APP_ENV` — set to `sandbox` on the sandbox service only
- `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` — still required even when USE_PAYOS=false (PayOS webhook signature verification)

Frontend (Vercel env vars + `frontend/.env.local` for local):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key only, NOT service_role)
- `VITE_API_BASE_URL` — `/api` on Vercel (hardcoded in `vercel.json`); `http://localhost:8000` locally
- `VITE_OPS_EMAILS`, `VITE_BANK_BIN`, `VITE_BANK_ACCOUNT_NO`, `VITE_BANK_ACCOUNT_NAME`, `VITE_BANK_DISPLAY_NAME`, `VITE_BANK_BRANCH`
- `VITE_APP_ENV=sandbox` and `VITE_SANDBOX=true` — activate the yellow SANDBOX banner

Deploy hook secrets (gitignored `scripts/deploy-hooks.local`):
- `RENDER_DEPLOY_HOOK_SANDBOX`, `RENDER_DEPLOY_HOOK_PROD`

---

## Procedures

### Procedure 1: Pre-push TypeScript gate (mandatory before every push)

Run this from repo root. Do NOT use `tsc --noEmit` — it skips project references and will pass when `tsc -b` fails.

```bash
cd frontend && npx tsc -b
```

If there are errors, fix them before pushing. Vercel runs `tsc -b && vite build` verbatim; a push with TypeScript errors will fail the Vercel build.

Optionally run the full Vercel-identical build locally:

```bash
cd frontend && npm run build
```

---

### Procedure 2: Deploy backend to Render

**Prerequisites:** `scripts/deploy-hooks.local` must exist with the real hook URLs. If it does not exist:

```bash
cp scripts/deploy-hooks.local.example scripts/deploy-hooks.local
# Edit deploy-hooks.local: paste the real URLs from Render → service → Settings → Deploy → Deploy Hook
```

**Deploy sandbox:**

```bash
bash scripts/deploy.sh sandbox
```

**Deploy production:**

```bash
bash scripts/deploy.sh prod
```

The script POSTs to the hook URL, prints the Render response, and exits. Monitor build progress in the Render dashboard (service → Events/Logs). Wait for status = `Live` before running smoke tests.

**Smoke test (always do this after a backend deploy):**

```bash
curl https://palfish-gmv-api.onrender.com/healthz
```

Expected response: `{"status":"ok","supabase_configured":true,"supabase_project_ref":"jozcvbbypwvzaefteoxn"}`. If `supabase_project_ref` shows the sandbox ID (`pxgybyfiwywksesyogti`), the Render env vars point at the wrong Supabase project.

---

### Procedure 3: Sandbox → production promotion (full checklist)

This is the authoritative procedure. The full original is `docs/HANDOFF_DEPLOY_SANDBOX_TO_MAIN_2026-06-21.md`. Below is the condensed runbook.

**Step 1 — Pre-merge verification**

```bash
git fetch origin
git checkout sandbox && git pull origin sandbox

# Backend tests
cd backend && python -m pytest
# Must pass fully

# Frontend gate
cd ../frontend
npx tsc -b        # zero errors required
npm test          # all tests must pass
```

Also smoke-test the sandbox URL manually: https://palfish-gmv-manager-sandbox.vercel.app/ — verify PR creation (B1), SePay reconciliation (B2), course activation (B3).

**Step 2 — DB migration on Supabase prod**

Follow the full migration procedure in the `database-and-migrations` skill, including the Layer 1/2/3 application order and the out-of-sequence `docs/sql/` trap.

Key reminders for prod:
1. Verify the Supabase project in the topbar shows `jozcvbbypwvzaefteoxn`, NOT the sandbox ID.
2. Take a manual backup first: Database → Backups → Create backup.
3. Apply all pending migrations in Layer 1/2/3 order (see `database-and-migrations` skill for exact file list).
4. After every file: `NOTIFY pgrst, 'reload schema';`

**Step 3 — Code deploy**

```bash
git checkout main && git pull origin main
git merge --no-ff sandbox -m "Merge sandbox → main: <sprint description>"
git push origin main
```

Vercel auto-deploys on push to `main`. Monitor the `palfish-gmv-manager` project → Deployments.

After push, deploy the backend:

```bash
bash scripts/deploy.sh prod
```

Wait for Render service status = `Live`.

**Step 4 — Post-deploy**

1. In the Render dashboard for `palfish-gmv-api` → Environment, verify/update these vars:
   - `USE_PAYOS=false` (explicit, do not rely on default)
   - `SEPAY_WEBHOOK_SECRET`, `SEPAY_API_TOKEN`, `GATEWAY_EXTENSION_INGEST_TOKEN` (get from Minh)
2. If Render env vars were changed, wait for the automatic redeploy to reach `Live`.
3. Verify healthz:
   ```bash
   curl https://palfish-gmv-api.onrender.com/healthz
   ```
4. Check Render startup logs for: `[payos] confirm-webhook skipped (USE_PAYOS=false)`. If absent, `USE_PAYOS` is not set correctly.
5. Vercel may leave the new deployment in "Preview" state even after a `main` push. If so: Vercel Dashboard → project → Deployments → find the new deployment → `... → Promote to Production`.
6. Update the Chrome extension (`palfish-gateway-sync`) BE URL and token:
   - Open the extension options (click icon → Settings)
   - BE URL: set to `https://palfish-gmv-api.onrender.com` (the prod Render URL)
   - Token: set to `GATEWAY_EXTENSION_INGEST_TOKEN` (the value you set in step 1)
   - Save → open mpos.vn + portal.payoo.vn → click "Sync now" in the extension to verify
   (Full context in `docs/HANDOFF_DEPLOY_SANDBOX_TO_MAIN_2026-06-21.md` §4.4)

---

### Procedure 4: Deploy frontend only (Vercel)

Push to the correct branch:

```bash
# Sandbox
git push origin sandbox

# Production
git push origin main
```

Vercel picks it up automatically. The build runs `npm run build` (which is `tsc -b && vite build`). `VITE_API_BASE_URL` is baked in as `/api` at build time — the Vercel rewrite rule in `vercel.json` then proxies `/api/:path*` to `https://palfish-gmv-api.onrender.com`.

After deploy, if the Vercel deployment sits in "Preview": Vercel Dashboard → Promote to Production.

---

### Procedure 5: Local dev startup

**Frontend:**

```bash
cd frontend && npm run dev          # Vite on http://localhost:5173
# Or for sandbox mode:
cd frontend && npm run dev:sandbox
```

Vite reads `.env.local` only at startup. Changes to `.env.local` require restarting the dev server.

**Backend (Windows — recommended path):**

```powershell
cd backend && .\run.ps1
```

`run.ps1` hardcodes `C:\Users\ductd\miniconda3\python.exe`. On any other machine, use:

```bash
# From backend/ directory, with backend/.env already loaded:
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

`backend/.env` is the local secrets file. Copy from `backend/.env.example` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The backend also loads `api_pipe/.env` (PayOS keys). In production this is handled via Render env vars, not the file.

---

### Procedure 6: New environment / fresh Render service setup

1. Docker context MUST be repo root (`.`), not `backend/`. The Dockerfile COPYs `api_pipe/` and `docs/team_hierarchy.json` from sibling directories. If context is `backend/`, these COPY instructions fail.
   - In `render.yaml`: `dockerContext: .` (already set correctly — do not change)
2. After creating the service, set all env vars listed in the "Env var NAMES" section above. `render.yaml` only declares a subset; many required vars (`SEPAY_*`, `ZALO_*`, `CRM_ENCRYPT_KEY`, `CRM_EXTENSION_INGEST_TOKEN`, `GATEWAY_EXTENSION_INGEST_TOKEN`) are absent from `render.yaml` and must be set manually in the Render dashboard.
3. Seed `nhan_su_sale`: run `backend/scripts/seed_nhan_su_sale.py` (required for any new sandbox/prod instance).
4. Apply the full migration sequence in order. When resetting sandbox, replay the ENTIRE history — never skip migrations.

---

## Gotchas & past incidents

**`render.yaml` says `autoDeploy: true`, dashboard has it OFF.** Team policy keeps auto-deploy disabled. Any git push to `main` or `sandbox` will NOT deploy the backend. Always use `deploy.sh`. (Ongoing policy.)

**Docker context must be repo root.** If you set context to `./backend/`, the COPY for `api_pipe/` fails and the PayOS env loader breaks. `render.yaml` already sets `dockerContext: .` — do not change this. (Documented in `render.yaml` comment on `Dockerfile` line 3.)

**`tsc --noEmit` passes when `tsc -b` fails.** Project references and declaration emit are only checked in build mode. Vercel runs `tsc -b`. Using `--noEmit` locally gives a false green. This has burned the team before. Always use `npx tsc -b`. (Known failure mode.)

**Vercel may not auto-promote to Production after a push to `main`.** If the deployment stays in "Preview" state, the live URL still points at the old deployment. Manually click `... → Promote to Production` in the Vercel dashboard. (Observed behavior.)

**FRONTEND_URL trailing slash breaks CORS.** Render env var `FRONTEND_URL` must have no trailing slash. `https://palfish-gmv-manager.vercel.app/` causes CORS preflight 400. (Documented in `docs/DEPLOY.md`.)

**Supabase legacy JWT keys disabled 2026-06-16.** After a key leak, legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` format keys were disabled. Use only `sb_publishable_*` (frontend anon) and `sb_secret_*` (backend service role) format keys. All `.env` files and Render/Vercel env vars must use the new keys.

**`scripts/deploy-hooks.local` is gitignored and must be created manually.** Copy from `scripts/deploy-hooks.local.example`. A missing file causes `deploy.sh` to exit with instructions. The real hook URLs come from Render → service → Settings → Deploy → Deploy Hook. Get them from Minh via Zalo if you do not have them.

**`vercel.json` rewrites destination is hardcoded.** `https://palfish-gmv-api.onrender.com` appears twice in `frontend/vercel.json`. If the Render service URL ever changes, this file must be updated before the next frontend deploy.

**`run.ps1` hardcodes a specific machine's Python path.** `C:\Users\ductd\miniconda3\python.exe` only works on Đức's machine. On all others, run `python -m uvicorn ...` directly.

**`activation_routes.py` indent bug (2026-06-19).** A mis-indent caused 10 of 14 activation routes (at that point in time) to silently not register, producing 404s on routes that appeared to exist in code. Fixed in commit `462557e`. Current total is 17 routes — see `backend-conventions` skill for authoritative count. Symptom: a route exists in Python but returns 404 in prod. Check `register_activation_routes()` is called at the correct indentation level.

**After any `ALTER TABLE` on Supabase, run `NOTIFY pgrst, 'reload schema';`.** Without this, PostgREST does not see new columns/tables and returns `PGRST204 column does not exist` even though the column is present in the DB.

---

## Volatile facts (as of 2026-07-04)

**Render service plan is `free` in `render.yaml` but Sandbox was upgraded to `Starter` (512 MB RAM)** — as of 2026-07-04. Re-verify current plan: `render.yaml` line 7 vs Render Dashboard → service → Settings → Plan. Memory constraints affect export patterns (use `tempfile + FileResponse`, NOT `StreamingResponse(BytesIO)`) and CRM backfill concurrency (`BACKFILL_CONCURRENCY_MAX ≤ 3`).

**Render auto-deploy is OFF in the dashboard** — as of 2026-07-04. Re-verify: Render Dashboard → service `palfish-gmv-api` → Settings → Deploy → Auto-Deploy toggle.

**`frontend/vercel.json` rewrites hardcode `https://palfish-gmv-api.onrender.com`** — as of 2026-07-04. Re-verify by reading `frontend/vercel.json` before assuming the Render URL is still correct.

**Supabase project IDs** — as of 2026-07-04:
- Prod: `jozcvbbypwvzaefteoxn` (project `project_palfish`)
- Sandbox: `pxgybyfiwywksesyogti` (project `palfish-gmv-sandbox`)

Re-verify: `grep -r "jozcvb\|pxgyby" backend/.env frontend/.env.local`.

**`render.yaml` does not declare all required env vars** — as of 2026-07-04. Many env vars (`SEPAY_*`, `ZALO_*`, `CRM_ENCRYPT_KEY`, `CRM_EXTENSION_INGEST_TOKEN`, `GATEWAY_EXTENSION_INGEST_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEETS_ID`) are absent from `render.yaml`. Re-verify by grepping: `grep -rn 'os.getenv' backend/*.py | grep -v test`.

**`backend/run.ps1` Python path** — as of 2026-07-04: `C:\Users\ductd\miniconda3\python.exe`. Re-verify: `head -3 backend/run.ps1`.

---

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
```bash
# TypeScript must be clean before any push (tsc --noEmit is NOT enough)
cd frontend && npx tsc -b

# Confirm deploy hook file exists before triggering Render deploy
ls scripts/deploy-hooks.local
```

**Tier 2 — when touching backend routes or env vars:**
```bash
# After any backend route change: verify route count hasn't dropped
cd backend && python -c "import main; print('Routes:', len([r for r in main.app.routes if hasattr(r,'path')]))"

# After env var changes: verify key format in local .env
grep -E "^(SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_ANON_KEY)" backend/.env frontend/.env.local
```

**Tier 3 — before merge/deploy to production only:**
```bash
# Smoke sandbox first — must pass before promoting to main
curl https://palfish-gmv-api-sandbox.onrender.com/healthz

# Then promote; after prod deploy, smoke prod:
curl https://palfish-gmv-api.onrender.com/healthz
# Expected: supabase_project_ref == "jozcvbbypwvzaefteoxn"

# Verify USE_PAYOS flag in Render startup logs:
# "payos] confirm-webhook skipped (USE_PAYOS=false)" must appear
```

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** filter command output — e.g. `curl .../healthz | python -m json.tool` rather than dumping raw responses into context.
