---
name: so-doanh-thu-revenue
description: Covers Sổ doanh thu (revenue ledger) data operations: import paths (GSheet, xlsx/DingTalk, M3 auto-sync), deduplication safety, DingTalk locale bug, exchange rate config, analytics row cap, and VN-team filter. Use when reading or writing so_doanh_thu rows, running imports, debugging GMV figures, changing exchange rates, or touching BC01/BC02 report logic.
---

## Overview

**Sổ doanh thu** (`so_doanh_thu` Supabase table) is the single source of truth for all GMV revenue reporting. One row = one payment received. Three ingest paths feed it:

| Path | `loai_nhap` value | Entry point |
|------|-------------------|-------------|
| M3 order approval (auto-hook) | `tu_dong` | `revenue_routes.py` → `sync_ledger_from_m3_order()` |
| Google Sheet "All File Thu Hiền" | `import:gsheet:*` | `gsheet_ledger_import.py` |
| DingTalk xlsx file upload | `import:dingtalk:*` | `xlsx_ledger_import.py` |

Only `loai_nhap=tay` (manually entered) rows can be deleted through the API. `tu_dong` and `import:*` rows must be deleted via SQL Editor.

---

## When to use / When NOT to use

**Use this skill when:**
- Running or debugging a GSheet or xlsx import
- Investigating duplicate rows or unexpected GMV figures
- Changing exchange rate (VND/RMB) values or wiring the ExchangeRatesPanel into nav
- Working on BC01 / BC02 / BC03 reports
- Touching `_gmv_from_vnd()`, `get_rate_for_date()`, `DEFAULT_TY_GIA`, or `NON_VN_TEAMS`
- Hitting the `analytics_limits.py` 50 k row cap

**Do NOT use this skill for:**
- CRM sync logic (`crm_routes.py`, `crm_metrics.py`) — separate subsystem
- mPOS/Payoo reconciliation — see `mpos-payoo-reconciliation` skill
- Supabase migrations or secrets management — see `environments-and-secrets` skill

---

## Ground truth

### Key files (repo-relative paths)

| File | Role |
|------|------|
| `backend/revenue_routes.py` | All Sổ doanh thu CRUD, BC01 `/revenue/pivot/sales-performance`, BC02 `/revenue/pivot/key-data`, `DEFAULT_TY_GIA`, `get_rate_for_date()`, `vnd_to_rmb()`, `_row_to_ledger()` |
| `backend/gsheet_ledger_import.py` | GSheet import: tab fetch, dual-fingerprint dedup, `_gmv_from_vnd()` DingTalk locale fix |
| `backend/xlsx_ledger_import.py` | DingTalk xlsx import (SM INCOME + HCM REVENUE sheets); hard-codes `ty_gia_vnd_rmb: 3700.0` per row |
| `backend/dashboard_routes.py` | `DEFAULT_EXCHANGE_RATE = 3700`; calls `get_rate_for_date()` for BXH queries |
| `backend/analytics_limits.py` | `MAX_ANALYTICS_ROWS = 50_000`; `fetch_rows_capped()` returns `(rows, truncated_bool)` |
| `backend/vn_staff.py` | `NON_VN_TEAMS` env-driven filter; `is_vn_sale_row()` / `filter_vn_rows()` |
| `backend/utils/team_mapper.py` | Canonical team name map; ALL backend modules must import from here |
| `backend/scripts/dedup_gsheet_ledger.py` | One-off dedup script (already run 2026-06-12); safe to re-run with `--apply` |
| `backend/report_routes.py` | BC03 (CRM + Sổ + M2 don_hang merge) |
| `frontend/src/components/SoDoanhThuTab.tsx` | Revenue ledger UI; embeds `ExchangeRatesPanel` directly |
| `frontend/src/components/admin/ExchangeRatesPanel.tsx` | Rate management UI; rendered inside `SoDoanhThuTab`, not a standalone nav item |
| `docs/sql/notifications_exchange_rates.sql` | DDL for `exchange_rates` and `notifications` tables — NOT in the numbered migration sequence |
| `docs/MODULE_SO_DOANH_THU.md` | Business spec: pivot rules, BC01/BC02 month-bucket rules, team name map |
| `docs/M5_OPERATIONS.md` | Ops runbook: seed scripts, purge/re-seed DingTalk, deploy steps |

### Key DB tables

| Table | Notes |
|-------|-------|
| `so_doanh_thu` | Revenue ledger; primary key `id` (uuid) |
| `exchange_rates` | Per-date VND/RMB rate; `effective_from` (date PK), `rate` (numeric). DDL in `docs/sql/notifications_exchange_rates.sql` |
| `bc03_month_settings` | Per-month KPI + exchange rate targets for BC03. DDL in `supabase_schema_patch_bc03_monthly.sql` |

### Env var NAMES (never values)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON` — file path only (not inline JSON); code calls `os.path.isfile(path)`. On Render, use Secret Files to mount the JSON at a known path, then set this var to that mount path. See `environments-and-secrets` skill for full Render setup steps.
- `GOOGLE_SHEETS_ID` — spreadsheet id for "All File Thu Hiền"
- `NON_VN_TEAMS` — comma-separated team names to exclude from VN GMV reports; default `tele sale,thái,úc`

---

## Procedures

### 1. Run a GSheet import

```bash
cd backend
# Dry-run first (reads GSheet, prints what would be imported, writes nothing)
python -c "
from gsheet_ledger_import import import_from_gsheet
result = import_from_gsheet(dry_run=True)
print(result)
"
```

The import reads tabs `SM Hanoi` and `HCM REV` from the spreadsheet identified by `GOOGLE_SHEETS_ID`.  
Dedup uses a two-tier fingerprint:
- **Exact**: SHA256 of `uid+pay_time_day+vnd+sale+sdt`
- **Loose** (`_loose_fp`): `uid+sale+YYYY-MM+vnd` — survives phone-number or date edits between sync runs

### 2. Run a DingTalk xlsx import

```bash
cd backend
# Preview without writing
python scripts/seed_dingtalk_ledger.py --dry-run --confirm

# Production re-seed: remove old import:gsheet:* rows, insert DingTalk rows
# TAKE A SUPABASE BACKUP FIRST
python scripts/seed_dingtalk_ledger.py --purge-gsheet --confirm
```

The xlsx import (`xlsx_ledger_import.py`) reads:
- SM INCOME sheet (col layout +2 vs GSheet "All File")
- HCM REVENUE sheet

It writes `ty_gia_vnd_rmb: 3700.0` per row unconditionally (open task VAC-05 — see Exchange Rate section).

### 3. Deduplicate so_doanh_thu

The one-off dedup (101 duplicate rows found and removed 2026-06-12) used `scripts/dedup_gsheet_ledger.py`. The backup table `so_doanh_thu_dedup_backup_20260612` exists in prod Supabase.

**Current dedup safety status (as of 2026-07-04):** The replace-by-day import strategy (proposed durable fix) has NOT been implemented. The current protection is the dual-fingerprint dedup in `gsheet_ledger_import.py`. If you suspect new duplicates:

```bash
cd backend
# Dry-run: see what would be removed (no writes)
python scripts/dedup_gsheet_ledger.py

# Apply (creates a timestamped backup JSON before deleting)
python scripts/dedup_gsheet_ledger.py --apply

# Restore from backup
python scripts/dedup_gsheet_ledger.py --restore <backup_file>
```

Re-verification command:
```bash
# Count duplicates by (uid, pay_time_day, so_tien_vnd) in prod
# Run in Supabase SQL Editor:
SELECT uid, date_trunc('day', pay_time::timestamptz) AS d, so_tien_vnd, count(*)
FROM so_doanh_thu
WHERE loai_nhap LIKE 'import:%'
GROUP BY 1,2,3 HAVING count(*) > 1;
```

### 4. Exchange rate lookup

The rate hierarchy (highest priority first):

1. `exchange_rates` table: `SELECT rate FROM exchange_rates WHERE effective_from <= $target_date ORDER BY effective_from DESC LIMIT 1` (implemented in `get_rate_for_date()`, `revenue_routes.py`)
2. Fall back to `DEFAULT_TY_GIA = Decimal("3700")` (`revenue_routes.py:23`)

**Where 3700 is hard-coded (open task VAC-05):**

| Location | Detail |
|----------|--------|
| `revenue_routes.py:23` | `DEFAULT_TY_GIA = Decimal("3700")` |
| `revenue_routes.py` (`_row_to_ledger`) | Falls back when `ty_gia_vnd_rmb` column is `NULL` |
| `dashboard_routes.py:40` | `DEFAULT_EXCHANGE_RATE = 3700` |
| `xlsx_ledger_import.py:83` | `"ty_gia_vnd_rmb": 3700.0` written for every xlsx row |

To add a new exchange rate period, insert into `exchange_rates`:

```sql
INSERT INTO exchange_rates (effective_from, rate, note, created_by)
VALUES ('2026-07-01', 3750, 'Q3 2026 rate', 'your-email@palfish.com')
ON CONFLICT (effective_from) DO UPDATE SET rate = EXCLUDED.rate;
```

**ExchangeRatesPanel wiring:** `ExchangeRatesPanel.tsx` is rendered inside `SoDoanhThuTab` (line 480). It is NOT a standalone nav item in `MainPage.tsx`. Changing its placement requires editing `SoDoanhThuTab.tsx` or adding a new `ViewId` case in `frontend/src/pages/MainPage.tsx`.

### 5. Check or update NON_VN_TEAMS

`vn_staff.py` reads `NON_VN_TEAMS` from env at import time. Default is `tele sale,thái,úc`.

```bash
# Verify what the running backend reads
grep NON_VN_TEAMS backend/.env
# or on Render: check Environment Variables panel

# To add a new non-VN team, update the env var (do NOT hardcode in vn_staff.py —
# test_audit_other.py:397-416 (test_non_vn_teams_not_hardcoded) will fail)
NON_VN_TEAMS=tele sale,thái,úc,sales lào
```

`is_vn_sale_row()` excludes a row if:
- `depart6_name` contains `"thailand"` (case-insensitive), OR
- `row["team"].lower()` is in `NON_VN_TEAMS`

If a new Thailand/AU team name does NOT contain "thailand" and is NOT added to `NON_VN_TEAMS`, their rows silently pollute VN GMV reports.

### 6. Backfill Sổ from M3 orders

```bash
cd backend
# Idempotent — safe to run multiple times
# Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env
python scripts/seed_so_doanh_thu.py --backfill-m3
```

---

## Gotchas & past incidents

### Membership-dedup nuốt giao dịch thật (2026-07-23) — BUG ĐÃ FIX
Import GSheet dùng `key in existing_set` (membership): 1 dòng UID-trống trong DB tạo key `|sale|tháng|tiền` chặn vĩnh viễn mọi khách mới cùng bộ 3. Kết quả: 11 GD / 175tr (2026) nuốt âm thầm. Fix: thay bằng consumption (`ledger_recon.reconcile()`) — mỗi DB row chỉ "tiêu thụ" 1 sheet row; import và audit dùng chung module → audit = dry-run của import, hai bên không thể lệch. Floor mặc định `2026-01-01` (dòng lịch sử chỉ báo cáo, không insert). Sheet có 2 dòng y hệt uid+ngày+tiền → `dup_suspect` (không auto-insert). Xem chi tiết: `docs/learnings/2026-07-23-membership-dedup-eats-real-rows.md` + plan `docs/superpowers/plans/2026-07-23-import-consumption-dedup.md`.

**Facts drift sau fix:** import qua `ledger_recon.reconcile` (không phải membership set); bucket mới `dupSuspect`, `skippedWeak`, `amountMismatch`, `belowFloor` trong response JSON; CLI: `backend/scripts/run_import.py` (dry-run mặc định), `backfill_blank_uid.py`, `sync_and_audit.py`.

### Duplicate rows from GSheet import (2026-06-12)
101 duplicate rows were created because the old fingerprint included `sdt` (phone). Thu Hiền edited phone numbers between sync runs → same transaction got a new fingerprint on the second sync → imported again. Fix: `sdt` removed from the loose fingerprint key (`_loose_fp` in `gsheet_ledger_import.py`). Backup: `so_doanh_thu_dedup_backup_20260612` in prod. **Replace-by-day import was proposed but not implemented.**

### DingTalk locale bug — GMV ×1000
DingTalk uses `.` as a thousands separator (`4.978` = 4,978 RMB). When copy-pasted to Google Sheets, Sheets interprets it as a decimal (≈5 RMB). Result: imported GMV is ~1000× too small.

Auto-fix in `_gmv_from_vnd()` (`gsheet_ledger_import.py:289`):
- `ratio < 0.01` → certain error → silent auto-correct from VND
- `0.01 ≤ ratio < 0.10` → grey zone → auto-correct + log warning
- `ratio ≥ 0.10` → plausible value → keep sheet value

This fix is active for **GSheet imports only**. DingTalk xlsx imports go through `xlsx_ledger_import.py` which also calls `_gmv_from_vnd()` (re-uses the same mapper).

Known residual issue: "All File SM Hanoi" tab loses fractional GMV when copy-pasted (~461 RMB missing per audit 2026-05-25). A re-seed from original DingTalk xlsx is recommended but NOT yet run on prod (`M5_OPERATIONS.md §2.3`).

### analytics_limits.py 50 k row cap — silent truncation
`fetch_rows_capped()` returns `(rows, truncated_bool)`. All current callers in `revenue_routes.py` and `dashboard_routes.py` discard the `truncated` flag with `_`:

```python
rows, _ = fetch_rows_capped(...)   # truncation is silently dropped
```

A BC01/BC02 report covering a large date range can return incomplete data with no warning in the API response or UI. If report totals look suspiciously low, check whether 50 k rows was hit by querying the table directly.

### exchange_rates DDL outside numbered migrations
`docs/sql/notifications_exchange_rates.sql` creates both `notifications` and `exchange_rates` tables. It is NOT in `backend/migrations/` or `docs/migrations/`. On a fresh sandbox reset, if you only replay the numbered migrations, both tables will be missing. Always run this file separately:

```sql
-- Run in Supabase SQL Editor after replaying migrations
\i docs/sql/notifications_exchange_rates.sql
-- or paste the contents directly
```

### LedgerCreateBody.tyGiaVndRmb — None vs 3700 distinction
`LedgerCreateBody.tyGiaVndRmb` is `float | None = None`. The create handler (`revenue_routes.py:1425`) uses `body.model_fields_set` to distinguish "caller explicitly sent 3700" from "caller omitted the field". If omitted, it calls `get_rate_for_date()` (which queries the `exchange_rates` table). If explicitly sent (even as `null`), it falls back to `DEFAULT_TY_GIA`. Do not change this to a plain default of `3700` — it would bypass the exchange rate table for all new manual entries.

### GSheet column layout differs between tabs
- SM Hanoi tab: column `AH` (index 33) = `TEAM` for historical rows
- HCM REV tab: all rows default to team `HCM (Online)` regardless of column content

If Thu Hiền renames or adds tabs in the spreadsheet, `DEFAULT_SHEET_TABS` in `gsheet_ledger_import.py:18` must be updated.

---

## Volatile facts (as of 2026-07-04)

- **DEFAULT_TY_GIA = 3700** in `revenue_routes.py:23` and `dashboard_routes.py:40`; `xlsx_ledger_import.py:83` writes 3700.0 per row. Open task VAC-05 tracks adding per-period config. Re-verify: `grep -n "3700" backend/revenue_routes.py backend/dashboard_routes.py backend/xlsx_ledger_import.py`

- **exchange_rates table seed**: one row `('2020-01-01', 3700, 'Default historical rate')` is inserted by the DDL file. Any rate added after that date takes precedence for queries on or after that date. Re-verify: `SELECT * FROM exchange_rates ORDER BY effective_from;` in SQL Editor.

- **NON_VN_TEAMS default** = `tele sale,thái,úc` (`vn_staff.py:9`). Re-verify: `grep _fallback_teams backend/vn_staff.py`

- **MAX_ANALYTICS_ROWS = 50_000** (`analytics_limits.py:7`). Re-verify: `grep MAX_ANALYTICS_ROWS backend/analytics_limits.py`

- **GSheet tabs** = `SM Hanoi`, `HCM REV` (`gsheet_ledger_import.py:18`). Re-verify with Thu Hiền or check spreadsheet directly if import returns zero rows.

- **so_doanh_thu_dedup_backup_20260612** table exists in prod Supabase as of 2026-06-12 backup. Confirm presence: `SELECT count(*) FROM so_doanh_thu_dedup_backup_20260612;` in SQL Editor.

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
- If FE touched: `cd frontend && npx tsc -b`
- Duplicate-count sanity query (run in Supabase SQL Editor after any import):
  ```sql
  SELECT uid, date_trunc('day', pay_time::timestamptz) AS d, so_tien_vnd, count(*)
  FROM so_doanh_thu WHERE loai_nhap LIKE 'import:%'
  GROUP BY 1,2,3 HAVING count(*) > 1;
  ```
  Expected: zero rows. Any row = stop and investigate before proceeding.
- Verify `MAX_ANALYTICS_ROWS` and `DEFAULT_TY_GIA` constants are unchanged: `grep -n "3700\|MAX_ANALYTICS_ROWS" backend/revenue_routes.py backend/analytics_limits.py 2>&1 | grep -v "^Binary"`

**Tier 2 — when touching import or dedup logic:**
- Dry-run the relevant import path (no writes): `cd backend && python -c "from gsheet_ledger_import import import_from_gsheet; print(import_from_gsheet(dry_run=True))"` or `python scripts/seed_dingtalk_ledger.py --dry-run --confirm`
- Any destructive data operation (purge, re-seed, dedup apply) **requires a backup table first** — this is skill doctrine; the `--apply` flag on `dedup_gsheet_ledger.py` creates one automatically.
- Re-run BC01/BC02 endpoints on sandbox and verify total VND rows match expected count.

**Tier 3 — before merge/deploy only:**
- Confirm `exchange_rates` DDL has been run on the target Supabase instance: `SELECT count(*) FROM exchange_rates;` in SQL Editor.
- Run the dedup script in dry-run on prod data and confirm zero rows returned before releasing any import change.

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** filter command output for errors — e.g. `2>&1 | grep -iE "error|traceback|duplicate"` — instead of dumping full logs into context.
