---
name: dashboards-and-reports
description: Covers the Bảng thông tin gamification/BXH dashboard, Dashboard Sale (Module 6), BC01/BC02/BC03 reports, team/subteam scope enforcement, lead-ranking rule, and the exchange-rate dependency shared across all dashboard endpoints. Use when adding or debugging dashboard views, leaderboard queries, report generation, sub-team scoping, or exchange-rate lookups in dashboard_routes.py or report_routes.py.
---

## Overview

There are **two distinct dashboard views** in the app that share `dashboard_routes.py` but serve different purposes:

| View | ViewId | Component | Endpoint |
|------|--------|-----------|----------|
| Bảng thông tin | `dashboard` | `DashboardTab.tsx` | `GET /api/v1/dashboard/summary` |
| Dashboard Sale (M6) | `module6` | `Module6Tab.tsx` | `GET /dashboard/summary` + `/dashboard/daily_trends` + `/dashboard/live_summary` |

**Three report types** are served by `report_routes.py`:

| Report | Endpoint | Data source | Date bucket |
|--------|----------|-------------|-------------|
| BC01 Sales Performance | `GET /revenue/pivot/sales-performance` | `so_doanh_thu` | `ngay_tien_ve` (money arrived) |
| BC02 Key Data | `GET /revenue/pivot/key-data` | `so_doanh_thu` | `pay_time` (payment made) |
| BC03 Comprehensive | `GET /reports/bc03/daily` + `/monthly` | `crm_sales_data` + `so_doanh_thu` + `don_hang` | `report_date` / `ngay_tien_ve` |

BC01 and BC02 live in `backend/revenue_routes.py`, not `report_routes.py`.

---

## When to use / When NOT to use

**Use this skill when:**
- Modifying `backend/dashboard_routes.py` (gamification BXH, KPI summary, daily trends, live summary)
- Modifying `backend/report_routes.py` (BC03 daily/monthly, monthly KPI save)
- Debugging why leaderboard (BXH) shows stale or wrong data
- Adding or changing sub-team scope enforcement in dashboard endpoints
- Changing how the exchange rate is resolved in dashboard or reports
- Working on `frontend/src/components/DashboardTab.tsx` or `frontend/src/components/Module6Tab.tsx`
- Working on `frontend/src/components/ReportBC03Tab.tsx`

**Do NOT use this skill for:**
- BC01/BC02 pivot logic — those endpoints are in `backend/revenue_routes.py`; use the `so-doanh-thu-revenue` skill
- CRM sync mechanics (`crm_routes.py`) — use the `crm-sync` skill
- RBAC and permission rules — use the `rbac-and-auth-accounts` skill

---

## Ground truth

### Key files (repo-relative paths)

| File | Role |
|------|------|
| `backend/dashboard_routes.py` | All dashboard endpoints: gamification (`/api/v1/dashboard/summary`), M6 (`/dashboard/summary`, `/dashboard/daily_trends`, `/dashboard/live_summary`, `/dashboard/filters`) |
| `backend/report_routes.py` | BC03 endpoints: `/reports/bc03/daily`, `/reports/bc03/staff`, `/reports/bc03/monthly` (GET + PUT) |
| `backend/analytics_limits.py` | Shared 50k-row cap: `MAX_ANALYTICS_ROWS = 50_000`, `fetch_rows_capped()` |
| `backend/revenue_routes.py` | BC01 (`/revenue/pivot/sales-performance`), BC02 (`/revenue/pivot/key-data`), `get_rate_for_date()`, `load_team_map()` |
| `backend/crm_metrics.py` | CRM column parsing used by both dashboard and BC03 |
| `backend/vn_staff.py` | `is_vn_sale_row()` filter; `NON_VN_TEAMS` env var (default `'tele sale,thái,úc'`) |
| `backend/rbac.py` | `enforce_report_scope()`, `scope_sale_names()` — enforced by every dashboard endpoint |
| `backend/utils/team_mapper.py` | Canonical team names; every backend module MUST import from here |
| `docs/team_hierarchy.json` | Static JSON from Metabase; consumed by "Sync Metabase now" button |
| `docs/supabase_schema_patch_bc03_monthly.sql` | DDL for `bc03_month_settings` + `bc03_kpi_rows` tables |
| `docs/sql/notifications_exchange_rates.sql` | DDL for `exchange_rates` table (NOT in numbered migration sequence) |
| `frontend/src/components/DashboardTab.tsx` | Bảng thông tin: gamification leaderboard |
| `frontend/src/components/Module6Tab.tsx` | Dashboard Sale (M6): KPI summary + daily trends chart |
| `frontend/src/components/ReportBC03Tab.tsx` | BC03 report UI |
| `frontend/src/components/admin/ExchangeRatesPanel.tsx` | Exchange-rate admin; embedded inside `SoDoanhThuTab.tsx`, NOT independently nav-accessible |
| `frontend/src/pages/MainPage.tsx` | ViewId routing: `"dashboard"` → `DashboardTab`, `"module6"` → `Module6Tab`, `"bc03"` → `ReportBC03Tab` |

### Key DB tables

| Table | Purpose |
|-------|---------|
| `so_doanh_thu` | Revenue ledger; BXH queries use `ngay_tien_ve` for ranking |
| `crm_sales_data` | CRM incremental daily/summary rows; primary source for M6 KPI and BC03 |
| `payment_lines` | "Vinh danh hôm nay" (today honors) uses RPC `get_top_sales` on paid lines |
| `nhan_su_sale` | Staff roster: email → crm_name, team, sub_team for scope enforcement |
| `exchange_rates` | Per-date VND/RMB rates; `effective_from` (date), `rate` (numeric) |
| `bc03_month_settings` | Per-month exchange rate + updated_at for BC03 |
| `bc03_kpi_rows` | Per-sale KPI targets for BC03 monthly |
| `don_hang` | M2 order supplement in BC03 (rows with `tien_ve=True` not already in Sổ) |

### Env var names (never values)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `NON_VN_TEAMS` — defaults to `'tele sale,thái,úc'` if unset (diacritics are significant — comparison is exact, not ASCII-folded); missing new Thailand/AU teams silently include them in VN GMV reports

---

## Procedures

### 1. Understand which dashboard endpoint serves which UI

```
Bảng thông tin (DashboardTab)
  └─ GET /api/v1/dashboard/summary   → gamification_dashboard_summary()
        Data: payment_lines RPC (today BXH) + so_doanh_thu (month BXH)
        Static: STATIC_TASKS, STATIC_EVENTS in dashboard_routes.py lines ~100-158

Dashboard Sale M6 (Module6Tab)
  ├─ GET /dashboard/summary          → dashboard_summary()
  │     Data: crm_sales_data (KPI) + so_doanh_thu (collected VND)
  ├─ GET /dashboard/daily_trends     → dashboard_daily_trends()
  │     Data: crm_sales_data daily rows for chart
  └─ GET /dashboard/live_summary     → dashboard_live_summary()
        Data: PalFish live fetch (no DB write) + so_doanh_thu collected
```

### 2. Understand the BXH (leaderboard) data flow

Top-today (Vinh danh hôm nay) — uses `payment_lines` RPC `get_top_sales`:
- Counts `status='paid'` lines created in VN-timezone day
- Does NOT read `giao_dich` (old PayOS flow, deprecated)
- Payment appears immediately on webhook; cash/installment appears when kế toán confirms at B2

Top-month (BXH tháng) — reads `so_doanh_thu`:
- Filters `ngay_tien_ve` in `[month_start, today]`
- Groups by `sale_crm_name`, sums `so_tien_vnd`
- Uses `fetch_rows_capped()` (50k cap — see Gotchas)
- Enriches with team/sub_team from `nhan_su_sale`

Lead-ranking rule (from memory dossier, not yet in repo code):
- A lead is counted toward the day it arrived, not when it was processed
- Sunday-working is a custom rule configured by chị TrangDT
- This logic lives in CRM sync processing, not dashboard_routes.py directly

### 3. Sub-team scope enforcement pattern

Every dashboard endpoint that accepts a `team` filter must call:

```python
team_filter, sub_team = enforce_report_scope(actor, team or department)
# then for sub_team-scoped queries:
if sub_team and team_filter:
    allowed_sales = scope_sale_names(sb, team_filter, sub_team)
```

`enforce_report_scope()` is in `backend/rbac.py`:
- `system` role: honours requested team, no sub_team restriction
- `leader` / `sale` role: forces actor's own team + sub_team

Never bypass this. Failing to enforce means a sale can see rival team data.

### 4. Exchange-rate lookup order (dashboard endpoints)

`dashboard_routes._load_exchange_rate()` (line ~410) checks in order:
1. `bc03_month_settings.exchange_rate` for the target month
2. `exchange_rates` table via `get_rate_for_date()` (lte effective_from, desc, limit 1)
3. `DEFAULT_EXCHANGE_RATE = 3700` (hard-coded fallback)

This is different from `revenue_routes.get_rate_for_date()` which skips step 1.

Open task VAC-05 (as of 2026-07-04): three remaining 3700 hard-codes in `revenue_routes.py` (lines ~776, ~942, ~1149 — verify exact lines before editing).

### 5. BC03 merge logic

`report_routes.py` BC03 merges three sources in this order:
1. `crm_sales_data` — `gmv_rmb_crm` + `orders_crm` (CRM funnel metrics L1/L3/L4/L8)
2. `so_doanh_thu` — `collected_vnd` + `gmv_rmb_ledger` (actual VND collected)
3. `don_hang` with `tien_ve=True` — `collected_vnd_m2` only for rows NOT already in Sổ

Monthly KPI (b2_orders, b4_gmv_vnd per sale) is stored in `bc03_kpi_rows` and read via `_load_monthly()`.

### 6. Create bc03_month_settings table on a new Supabase instance

If you see error `pgrst205` or `does not exist` from any BC03 endpoint:

```sql
-- Run in Supabase SQL Editor
-- File: docs/supabase_schema_patch_bc03_monthly.sql
```

Paste the content of that file. The `exchange_rates` table is in a separate file:
```
docs/sql/notifications_exchange_rates.sql
```
Both files are outside the numbered migration sequence — they will NOT be auto-applied on sandbox reset.

### 7. Update static tasks/events in gamification

Tasks and events are hard-coded lists in `dashboard_routes.py`:
- `STATIC_TASKS` — lines ~100-131
- `STATIC_EVENTS` — lines ~133-158

Edit those lists directly. There is no DB-backed config for gamification tasks/events as of 2026-07-04.

### 8. Update team_hierarchy.json

The "Sync Metabase now" button reads `docs/team_hierarchy.json` — it does NOT call Metabase live. To update hierarchy:

1. Export Metabase question `remaining-lesson-vn` to xlsx
2. Convert to JSON
3. Replace `docs/team_hierarchy.json`
4. Commit the updated file

---

## Gotchas & past incidents

**50k-row cap silently truncates results (no frontend warning).**
`analytics_limits.fetch_rows_capped()` prints to stdout when truncated but the `truncated` boolean is NOT included in API responses. BC01/BC02/BC03 and BXH queries over large date ranges can return incomplete data with no visible warning. Callers in `dashboard_routes.py` and `revenue_routes.py` discard the truncation flag. If reports look short for wide date ranges, add logging or surface `truncated` in the response `meta` field.

**KPI vs chart use different record_type rows (dashboard_routes.py lines ~1183-1195).**
`/dashboard/summary` (M6 endpoint) uses only `record_type='summary'` rows for KPI numbers (L1, GMV). Chart uses only `record_type='daily'` rows. If daily rows were synced but summary rows were not, chart shows data but KPI cards show zeros — and vice versa.

**bc03_month_settings missing on fresh instances.**
`/reports/bc03/monthly` and `/reports/bc03/daily` fail with 503 if `bc03_month_settings` table does not exist. Error message points to `docs/supabase_schema_patch_bc03_monthly.sql`. Also note `exchange_rates` table (used by `get_rate_for_date()`) requires running `docs/sql/notifications_exchange_rates.sql` separately — both are outside numbered migrations.

**"Sync Metabase now" is NOT a live pull.**
The button in the UI only re-reads `docs/team_hierarchy.json`. If the org chart changes, manually re-export from Metabase and commit the file.

**ExchangeRatesPanel is not independently nav-accessible.**
`frontend/src/components/admin/ExchangeRatesPanel.tsx` is embedded inside `SoDoanhThuTab.tsx` (not in `MainPage.tsx` ViewId list). You cannot navigate to it directly; it appears inside the Sổ doanh thu tab.

**NON_VN_TEAMS default silently covers only known team name substrings.**
`backend/vn_staff.py` filters non-VN rows using `NON_VN_TEAMS` env var (default `'tele sale,thái,úc'` — diacritics required; comparison is exact, not ASCII-folded). New Thailand/AU team names that do not contain `'thailand'` AND are not in `NON_VN_TEAMS` will silently appear in VN GMV reports.

**DoanhThuSaleTab.tsx is an orphaned component (as of 2026-07-04).**
`frontend/src/components/DoanhThuSaleTab.tsx` exists but has no ViewId wiring in `MainPage.tsx`. It is unreachable from the UI. If you need Sales Performance pivot, it must be added to `MainPage.tsx`.

---

## Volatile facts (as of 2026-07-04)

**`DEFAULT_EXCHANGE_RATE = 3700`** hard-coded in `dashboard_routes.py` line 40 and `report_routes.py` line 29.
Re-verify: `grep -n "3700\|DEFAULT_EXCHANGE_RATE\|DEFAULT_TY_GIA" backend/dashboard_routes.py backend/report_routes.py backend/revenue_routes.py`

**`MAX_ANALYTICS_ROWS = 50_000`** in `backend/analytics_limits.py` line 7.
Re-verify: `grep -n "MAX_ANALYTICS_ROWS" backend/analytics_limits.py`

**`GAMIFICATION_TODAY_LIMIT = 5`, `GAMIFICATION_MONTH_LIMIT = 999`** in `dashboard_routes.py` lines ~96-97.
Re-verify: `grep -n "GAMIFICATION" backend/dashboard_routes.py`

**`NON_VN_TEAMS` default** = `'tele sale,thái,úc'` in `backend/vn_staff.py:9` (diacritics required — comparison is exact, not ASCII-folded).
Re-verify: `grep -n "_fallback_teams" backend/vn_staff.py`

**BC03 tables not in numbered migration sequence** — `bc03_month_settings`, `bc03_kpi_rows`, `exchange_rates`, `notifications` all require manual SQL steps on sandbox reset.
Re-verify which files to run: `ls docs/sql/ docs/supabase_schema_patch_bc03_monthly.sql`

**STATIC_TASKS and STATIC_EVENTS** are hard-coded in `dashboard_routes.py` (no DB config).
Re-verify: `grep -n "STATIC_TASKS\|STATIC_EVENTS" backend/dashboard_routes.py`

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
- If FE touched: `cd frontend && npx tsc -b`
- Verify exchange-rate constants haven't drifted: `grep -n "3700\|DEFAULT_EXCHANGE_RATE\|DEFAULT_TY_GIA" backend/dashboard_routes.py backend/report_routes.py backend/revenue_routes.py 2>&1 | grep -v "^Binary"`
- Verify `MAX_ANALYTICS_ROWS` cap is unchanged: `grep -n "MAX_ANALYTICS_ROWS" backend/analytics_limits.py 2>&1 | grep -v "^Binary"`

**Tier 2 — when touching BC03, BXH, or report endpoints:**
- Re-run the affected BC report on sandbox and compare row counts: hit `GET /reports/bc03/daily?month=YYYY-MM` before and after the change; confirm row count and total `collected_vnd` are stable.
- Verify `bc03_month_settings` and `exchange_rates` tables exist on the target instance (SQL Editor):
  ```sql
  SELECT to_regclass('public.bc03_month_settings'), to_regclass('public.exchange_rates');
  ```
  Both must be non-null — these tables are outside the numbered migration sequence.
- If sub-team scope changed: confirm `enforce_report_scope()` is called at the top of every modified endpoint (grep: `grep -n "enforce_report_scope" backend/dashboard_routes.py`).

**Tier 3 — before merge/deploy only:**
- Smoke-test both dashboard views on sandbox: `GET /api/v1/dashboard/summary` (Bảng thông tin) and `GET /dashboard/summary` (M6). Confirm HTTP 200 and non-empty `leaderboard` / `kpi` keys.
- Confirm `DoanhThuSaleTab.tsx` still has no `ViewId` wiring (it is intentionally orphaned — do not wire it unless explicitly instructed).

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** filter command output for errors — e.g. `2>&1 | grep -iE "error|traceback|pgrst|does not exist"` — instead of dumping full logs into context.
