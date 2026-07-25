---
name: crm-sync
description: Covers CRM sync operations (hybrid vs autonomous modes, token encryption, team hierarchy update, backfill, and deployment traps). Use when debugging CRM sync failures, adding or backfilling CRM data, updating the team hierarchy, deploying with CRM env vars, or explaining how the extension-to-backend token flow works.
---

## Overview

The CRM sync module pulls sales-funnel data from PalFish's internal CRM API into the `crm_sales_data` Supabase table. The architecture is **hybrid**:

- **Autonomous (incremental) path** — backend builds the CRM download payload server-side without the user pressing Export on the PalFish UI. The browser extension provides only the auth cookie/headers.
- **Live path** — `fetch_live_crm_rows()` in `dashboard_routes.py` hits PalFish directly for the current-day live summary; nothing is written to the DB.

All sync logic lives in `backend/crm_routes.py`. The extension delivers the CRM auth cookie via a dedicated ingest endpoint, protected by a separate secret (`CRM_EXTENSION_INGEST_TOKEN`). The cookie is Fernet-encrypted at rest using `CRM_ENCRYPT_KEY`, then stored in the `crm_tokens` table (single row, id=1). If Supabase is unavailable, the token falls back to an in-memory dict (`_crm_token_mem`) — this is lost on process restart.

---

## When to use / When NOT to use

**Use this skill when:**
- CRM sync returns 503 on any endpoint
- Setting up a new Render deployment (env vars are NOT in `render.yaml` — see Deployment trap below)
- Running a backfill after the team hierarchy changes
- Updating `docs/team_hierarchy.json` (requires a Docker rebuild + redeploy)
- Investigating missing dates or duplicate `crm_sales_data` rows
- Explaining to a manager why the "Sync Metabase now" button exists and what it actually does

**Do NOT use this skill for:**
- Sổ doanh thu import issues (see the revenue-ledger skill)
- Zalo / DingTalk notification issues (separate subsystems)
- mPOS / Payoo reconciliation (separate extension flow via `GATEWAY_EXTENSION_INGEST_TOKEN`)

---

## Ground truth

### Key files (repo-relative)

| Path | Role |
|------|------|
| `backend/crm_routes.py` | All CRM sync routes and helpers |
| `backend/crm_metrics.py` | Column mapping, `parse_metric/parse_rate`, `latest_snapshot_rows` dedup |
| `backend/dashboard_routes.py` | Live CRM summary (no DB write); daily dashboard KPIs from `crm_sales_data` |
| `backend/Dockerfile` | Bakes `docs/team_hierarchy.json` into the image (`COPY docs/team_hierarchy.json /app/docs/team_hierarchy.json`) |
| `backend/admin_routes.py` | "Sync Metabase now" handler — reads `docs/team_hierarchy.json` at line 28 (`HIERARCHY_JSON = ROOT / "docs" / "team_hierarchy.json"`) |
| `docs/team_hierarchy.json` | Static JSON; source of truth for sale→team→sub-team hierarchy |
| `scripts/extract_hierarchy.cjs` | Node script that converts the Metabase xlsx export to `team_hierarchy.json` |
| `scripts/seed_nhan_su_sale.py` | Seeds `nhan_su_sale` table from `docs/team_hierarchy.json` (required after hierarchy rebuild) |
| `backend/.env.example` | Lists env vars for local dev — **CRM_ENCRYPT_KEY and CRM_EXTENSION_INGEST_TOKEN are absent** |
| `render.yaml` | Declares only SUPABASE_*, FRONTEND_URL*, SYSTEM_ADMIN_EMAILS, OPS_EMAILS, APP_ENV, PAYOS_* — **CRM vars missing** |

### DB tables

| Table | Purpose |
|-------|---------|
| `crm_tokens` | Single-row (id=1) Fernet-encrypted cookie + headers bundle; must be created manually if not yet present (DDL in `crm_routes.py` file header, lines 9-14) |
| `crm_sales_data` | 1 row per `(sale_name, report_date)`; upsert conflict key = `sale_name,report_date`; `record_type='daily'` for rows from incremental sync |

### Env var names (never values)

| Var | Effect if missing |
|-----|-------------------|
| `CRM_ENCRYPT_KEY` | `_get_cipher()` returns `None`; any write/read attempt raises HTTP 503 "CRM token encryption key not configured" |
| `CRM_EXTENSION_INGEST_TOKEN` | `_require_extension_ingest_token()` raises HTTP 503 "CRM extension ingest token not configured" |
| `CRM_DEPARTMENT_ID` | Optional override; defaults to `VN_ORG_DEPARTMENT_ID=2242153` |
| `CRM_SHOW_TYPE` | Optional override; defaults to `2` (fetches sub-team members under the org) |

---

## Procedures

### 1. Generate a valid CRM_ENCRYPT_KEY

`CRM_ENCRYPT_KEY` must be a URL-safe base64-encoded 32-byte Fernet key.

```python
# Run once — paste output into Render env var
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set both `CRM_ENCRYPT_KEY` and `CRM_EXTENSION_INGEST_TOKEN` in the Render dashboard for both `palfish-gmv-api` (prod) and `palfish-gmv-api-sandbox` (sandbox). They are **not** in `render.yaml` and will not be set automatically.

### 2. Create the crm_tokens table (fresh Supabase instance)

Run in Supabase SQL editor (prod: `jozcvbbypwvzaefteoxn`, sandbox: `pxgybyfiwywksesyogti`):

```sql
CREATE TABLE IF NOT EXISTS crm_tokens (
    id           INT PRIMARY KEY DEFAULT 1,
    cookie_value TEXT NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3. Incremental sync (1 day)

Requires manager role JWT. Call from Module 5 UI or directly:

```
POST /crm/sync
Body: {"sync_date": "2026-07-03"}
```

Response includes `sync_mode: "incremental_daily"`, `payload_autonomous: true`, `department_id_used`, and `department_fallback` (true if team-level export was empty and the org-level fallback was used).

### 4. Backfill a date range

Max concurrency is capped at 3 in code (`BACKFILL_CONCURRENCY_MAX = 3`).

```
POST /crm/sync/backfill
Body: {"start_date": "2026-06-01", "end_date": "2026-06-30", "concurrency": 3}
```

### 5. Find and fill missing dates

```
GET  /crm/sync/missing-dates?lookback_days=60   # returns list of dates with no data
POST /crm/sync/missing                           # detect + backfill missing dates automatically
Body: {"lookback_days": 60}
```

Note: `_detect_missing_dates()` uses explicit `.range()` pagination to work around PostgREST's 1000-row server-side cap (see `crm_routes.py` comment near line 1042).

### 6. Update team hierarchy

The hierarchy JSON is baked into the Docker image. Updating it requires:

1. Export the Metabase question `remaining-lesson-vn` (question id `14393`) to xlsx.
2. Run the conversion script (requires `xlsx` from frontend node_modules):
   ```bash
   cd frontend && node ../scripts/extract_hierarchy.cjs /path/to/exported.xlsx
   ```
   Outputs: `docs/team_hierarchy.json` and `docs/team_hierarchy.md`.
3. Commit the updated `docs/team_hierarchy.json`.
4. Deploy the backend (Render rebuild picks up the new file via `COPY` in `backend/Dockerfile`).
5. Seed `nhan_su_sale` table to match (run from repo root, not from backend/):
   ```bash
   python scripts/seed_nhan_su_sale.py
   ```

**The "Sync Metabase now" button in the Admin UI does NOT pull live data from Metabase.** It re-reads `docs/team_hierarchy.json` from the running container's filesystem. If the JSON was not updated in the last deploy, the button does nothing new.

### 7. Deploy to Render (CRM-safe checklist)

Follow the full deploy procedure in the `deploying-gmv` skill (Procedure 2 for backend deploy, Procedure 3 for sandbox → production promotion). For the complete list of env vars to verify before deploying, see the `environments-and-secrets` skill.

CRM-specific env vars that are absent from `render.yaml` and must be set manually:

- `CRM_ENCRYPT_KEY`
- `CRM_EXTENSION_INGEST_TOKEN`

---

## Gotchas & past incidents

**Deployment trap (ongoing)** — `CRM_ENCRYPT_KEY` and `CRM_EXTENSION_INGEST_TOKEN` are absent from both `render.yaml` and `backend/.env.example`. A fresh Render deploy configured only from `render.yaml` will silently serve HTTP 503 on all CRM sync and token-ingest endpoints. Always set these manually in the Render dashboard.

**Department ID fallback (ongoing)** — If the CRM team-level department export returns a CSV with headers only (no data rows), `_resolve_sync_department_id()` automatically retries with `VN_ORG_DEPARTMENT_ID=2242153`. The response field `department_fallback: true` indicates this happened. This is normal for new teams; it is a silent operational detail unless the fallback itself also fails (raises HTTP 502).

**CRM CSV dual-header format** — The PalFish CRM export CSV has two header rows: row 0 is Chinese, row 1 is English. The parser uses `skiprows=1` (`crm_routes.py` `_read_csv_crm()`). If a CRM export contains only Chinese headers (row 1 is missing), the entire file may be misread silently.

**MTD cumulative snapshots** — CRM data is month-to-date cumulative, not daily deltas. `latest_snapshot_rows()` in `crm_metrics.py` keeps only the newest row per (sale, period) to avoid double-counting. If multiple rows exist for the same sale and date, only the latest is used for KPI calculations.

**In-memory token fallback** — If Supabase is unreachable when the extension delivers a token, the token is stored in `_crm_token_mem` (module-level dict). This is lost on process restart. Verify the token was persisted to `crm_tokens` after any Render restart.

**team_hierarchy.json baked at build time** — The file at `docs/team_hierarchy.json` is copied into the Docker image during build (`backend/Dockerfile` line 12). Editing the file in the repo without rebuilding and redeploying has no effect on the running container.

**Sandbox vs prod Supabase crm_tokens table** — The `crm_tokens` table DDL is in the `crm_routes.py` file header (lines 9-14) as a comment, not in the numbered migration sequence. It can be missed on a fresh sandbox reset. If `/system/update-crm-token/extension` fails with a PostgREST error about the table not existing, run the DDL manually.

---

## Volatile facts (as of 2026-07-04)

- **`VN_ORG_DEPARTMENT_ID = 2242153`** in `crm_routes.py` line 105 — re-verify if PalFish restructures CRM departments.
  ```bash
  grep -n "VN_ORG_DEPARTMENT_ID" backend/crm_routes.py
  ```

- **`docs/team_hierarchy.json` was last exported 2026-07-03** — re-verify against Metabase question `14393-remaining-lesson-vn` when the org chart changes.
  ```bash
  python -c "import json,pathlib; d=json.loads(pathlib.Path('docs/team_hierarchy.json').read_text()); print(d.get('generated_at'), d.get('total_sales'))"
  ```

- **`BACKFILL_CONCURRENCY_MAX = 3`** in `crm_routes.py` line 103 — Render free tier (512 MB RAM) is the constraint. Verify before raising.
  ```bash
  grep -n "BACKFILL_CONCURRENCY" backend/crm_routes.py
  ```

- **`crm_tokens` table DDL is a code comment, not a migration file** — verify it exists in both prod and sandbox Supabase before a release.
  ```bash
  # Supabase SQL editor: SELECT to_regclass('public.crm_tokens');
  ```

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
- Verify CRM-critical env vars are set (never log values): `grep -E "CRM_ENCRYPT_KEY|CRM_EXTENSION_INGEST_TOKEN" backend/.env | grep -c "=" `  — expect 2.
- Confirm `BACKFILL_CONCURRENCY_MAX` and `VN_ORG_DEPARTMENT_ID` constants are unchanged: `grep -n "BACKFILL_CONCURRENCY_MAX\|VN_ORG_DEPARTMENT_ID" backend/crm_routes.py 2>&1 | grep -v "^Binary"`
- Confirm `team_hierarchy.json` metadata is current: `python -c "import json,pathlib; d=json.loads(pathlib.Path('docs/team_hierarchy.json').read_text()); print(d.get('generated_at'), d.get('total_sales'))"`

**Tier 2 — when touching sync or backfill endpoints:**
- Verify `crm_tokens` table exists on the target Supabase instance (SQL Editor): `SELECT to_regclass('public.crm_tokens');` — expect non-null.
- Trigger a single-day incremental sync on sandbox (`POST /crm/sync` with a recent `sync_date`) and check response for `payload_autonomous: true` and no `department_fallback: true`.
- After any hierarchy update: verify `nhan_su_sale` row count matches hierarchy `total_sales` field: `SELECT count(*) FROM nhan_su_sale;`

**Tier 3 — before merge/deploy only:**
- Confirm both `CRM_ENCRYPT_KEY` and `CRM_EXTENSION_INGEST_TOKEN` are set in the Render dashboard for both prod and sandbox environments — these are absent from `render.yaml` and will not be set automatically.
- Run `GET /crm/sync/missing-dates?lookback_days=7` on sandbox; confirm list is empty or expected.

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** filter command output for errors — e.g. `2>&1 | grep -iE "error|traceback|503|missing"` — instead of dumping full logs into context.
