---
name: database-and-migrations
description: Covers the two-Supabase-project setup, migration file locations and authoritative order, sandbox-first workflow, full-history replay rule, key table inventory, atomic RPCs, seed/cleanup scripts, and backup conventions. Use when writing or applying a migration, setting up a fresh environment, debugging missing columns or RPC errors, adding tables, or auditing the schema.
---

## Overview

The project uses two Supabase Postgres projects and applies migrations **manually** via the Supabase SQL Editor. There is no CLI runner. All SQL files must end with `NOTIFY pgrst, 'reload schema';` — PostgREST caches the schema and will not see new columns or functions until notified.

**Two Supabase projects:**

| Project | ID | Purpose |
|---|---|---|
| prod | `jozcvbbypwvzaefteoxn` | Live data — all real sales, payments, activations |
| sandbox | `pxgybyfiwywksesyogti` | Testing; reset freely, but replay full history on reset |

**Key env vars (names only — never commit values):**
- `SUPABASE_URL` — backend service URL
- `SUPABASE_SERVICE_ROLE_KEY` — backend only; bypasses RLS
- `VITE_SUPABASE_URL` — frontend (anon access via backend endpoints only)
- `VITE_SUPABASE_ANON_KEY` — frontend

---

## When to use / When NOT to use

**Use this skill when:**
- Applying a migration to sandbox or prod
- Setting up a fresh sandbox or new dev environment (seed order matters)
- Debugging 503 errors from `rpc_helpers.py` (missing RPC function)
- Adding a new table or altering an existing one
- Checking which migration created a specific column/constraint
- Deduplicating or cleaning up `so_doanh_thu` or `bank_transactions` data

**Do NOT use this skill for:**
- Zalo OA token lifecycle (separate operational concern)
- CRM sync logic (see CRM subsystem docs)
- Frontend data fetching (tables are accessed via FastAPI endpoints, not direct Supabase client from FE)

---

## Ground truth

### Migration file locations

Three layers, applied in historical order:

**Layer 1 — Pre-numbered patch files** (applied before the dated sequence):
```
docs/supabase_schema_patch.sql
docs/supabase_schema_patch_v2.sql
...through v8...
docs/supabase_schema_patch_db_audit_20260603.sql
docs/supabase_schema_patch_payment_requests.sql
docs/supabase_schema_patch_active_requests.sql
docs/supabase_schema_patch_crm_tokens.sql
docs/supabase_schema_patch_bc03_monthly.sql
docs/supabase_schema_patch_ledger_search.sql
docs/supabase_schema_patch_payment_requests_*.sql  (several named patches)
docs/supabase_schema_patch_active_requests_*.sql   (pr_id type migration)
docs/supabase_schema_patch_v8_bill_images_activated_status.sql
```

**Layer 2 — Dated docs/migrations/** (chronological, 2026-05-24 through 2026-06-25):
```
docs/migrations/2026-05-24-invoice-email-logs.sql
docs/migrations/2026-06-05-add-min-role.sql
docs/migrations/2026-06-07-payments-module.sql
docs/migrations/2026-06-08-enable-rls-payment-tables.sql
docs/migrations/2026-06-09-top1-02-installment-fields.sql   ← CRITICAL, often missed on reset
docs/migrations/2026-06-09-top2-pr-fields.sql
docs/migrations/2026-06-10-top1-02-verified-installment.sql
docs/migrations/2026-06-13-sepay-bank-transactions.sql
docs/migrations/2026-06-16-fix-sepay-unique-constraint.sql
docs/migrations/2026-06-16-gateway-transactions.sql
docs/migrations/2026-06-18-audit-logs.sql
docs/migrations/2026-06-18-bank-transactions-discrepancy.sql
docs/migrations/2026-06-20-add-manual-matched-status.sql
docs/migrations/2026-06-21-fix-sepay-timezone.sql
docs/migrations/2026-06-22-payment-lines-audit-cols.sql
docs/migrations/2026-06-23-zalo-outbox.sql
docs/migrations/2026-06-25-name-for-transfer.sql
```

**Layer 3 — Dated backend/migrations/** (2026-06-23 onward, canonical for prod):
```
backend/migrations/2026-06-23-zalo-oa-tables.sql       ← canonical Zalo tables for prod
backend/migrations/2026-06-23-activation-reminders-pending-snapshot.sql
backend/migrations/2026-06-26-dingtalk-tables.sql
backend/migrations/2026-06-26-zalo-msg-add-sale-team.sql
backend/migrations/2026-06-27-pr-wants-invoice.sql
backend/migrations/2026-06-29-zalo-msg-use-crm-name.sql
backend/migrations/2026-07-02-zalo-course-activated-enrich.sql
backend/migrations/2026-07-02-zalo-outbox-image-and-ar-created-event.sql
backend/migrations/2026-07-04-zalo-payment-paid-format-v2.sql
backend/migrations/2026-07-04-zalo-phone-intl-format.sql
backend/migrations/2026-07-04-zalo-payment-paid-add-method.sql
backend/migrations/2026-07-06-security-revoke-rpc-and-bucket-listing.sql
```

**TRAP — out-of-sequence DDL:**
```
docs/sql/notifications_exchange_rates.sql   ← NOT in any numbered sequence
docs/sql/dashboard_rpc.sql
```
`docs/sql/notifications_exchange_rates.sql` creates the `notifications` and `exchange_rates` tables. It is easy to miss on sandbox reset. Apply it after Layer 1 patches, before Layer 2.

The authoritative patch order is also listed in `docs/PROJECT.md` (line ~150). Re-read that file after adding any new migration, as the list must be updated manually.

---

## Key tables inventory

| Table | Created by | Notes |
|---|---|---|
| `don_hang` | `docs/supabase_schema_patch.sql` | Legacy M1/M2 orders; id UUID; `ma_don_hang` KH### via `next_ma_don()` RPC |
| `nhan_su_sale` | `docs/supabase_schema_patch_v2.sql` | Sales staff master; role CHECK ('sale','leader','manager','system'); email lookup case-insensitive (ILIKE); seed via `scripts/seed_nhan_su_sale.py` |
| `payment_requests` | `docs/supabase_schema_patch_payment_requests.sql` | id is TEXT `PR-YYYY-####`; allocated by `next_payment_request_id()` RPC |
| `payment_lines` | same as above | lần thanh toán; method: qr/cash/card/installment |
| `active_requests` | `docs/supabase_schema_patch_active_requests.sql` | id is TEXT (not UUID); `pr_id` TEXT references `payment_requests.id`; `uids_data` JSONB |
| `bank_transactions` | `docs/migrations/2026-06-13-sepay-bank-transactions.sql` | SePay webhook rows; `match_status` CHECK: pending/auto_matched/manual_matched/needs_review/ignored; `transaction_date` stores Vietnam local time (not UTC) |
| `gateway_transactions` | `docs/migrations/2026-06-16-gateway-transactions.sql` | mPOS / Payoo card transactions; `txn_code` UNIQUE; `source` CHECK: 'mpos','payoo' |
| `gateway_settlements` | same | Batch settlement records for mPOS/Payoo |
| `so_doanh_thu` | `docs/supabase_schema_patch_v7_so_doanh_thu.sql` | Revenue ledger M5; `loai_nhap`: 'tu_dong'/'tay'; had 101 duplicate rows deduped 2026-06-12 |
| `crm_tokens` | `docs/supabase_schema_patch_crm_tokens.sql` | Encrypted CRM auth tokens per sale |
| `zalo_oa_credentials` | `backend/migrations/2026-06-23-zalo-oa-tables.sql` | Single-row Zalo OA token store |
| `zalo_team_groups` | same | team_code → Zalo group_id mapping |
| `zalo_outbox` | same | Notification queue; UNIQUE(source_table, source_id, event_type); `event_type` CHECK: payment_paid/course_activated/activation_urgent_reminder/activation_request_created (4th value added by `backend/migrations/2026-07-02-zalo-outbox-image-and-ar-created-event.sql`) |
| `dingtalk_team_groups` | `backend/migrations/2026-06-26-dingtalk-tables.sql` | team_code → DingTalk webhook + secret |
| `dingtalk_outbox` | same | Same event_type values as zalo_outbox |
| `notifications` | `docs/sql/notifications_exchange_rates.sql` | In-app notification bell; RLS permissive FOR ALL USING true |
| `exchange_rates` | same | Date-keyed VND/RMB rates; default 3700 row seeded; RLS permissive FOR ALL USING true |
| `payment_request_sequences` | `docs/supabase_schema_patch_payment_requests.sql` | Table-based PR ID counter by year |
| `don_hang_seq` | `docs/supabase_schema_patch_db_audit_20260603.sql` | Postgres SEQUENCE for KH### IDs |
| `tax_sequences` | same | Invoice + product code batch allocator |

---

## Procedures

### Applying a migration

```sql
-- 1. Copy contents of the SQL file
-- 2. Open Supabase SQL Editor for the target project
--    Sandbox: pxgybyfiwywksesyogti
--    Prod:    jozcvbbypwvzaefteoxn
-- 3. Paste and run
-- 4. Verify no errors in the result panel
-- 5. Always end with (or confirm it's already at the end of the file):
NOTIFY pgrst, 'reload schema';
```

**Workflow rule: sandbox first.**
1. Apply to sandbox → smoke-test the affected feature
2. After `main` branch is deployed to Render, apply to prod

### Applying a data-mutating migration safely

Always preview the affected rows before committing:

```sql
-- Example: preview before applying 2026-06-21-fix-sepay-timezone.sql
SELECT id, transaction_date,
       transaction_date - INTERVAL '7 hours' AS corrected
FROM public.bank_transactions
WHERE gateway IN ('sepay_webhook', 'sepay_poll')
  AND transaction_date IS NOT NULL
ORDER BY transaction_date DESC
LIMIT 20;
```

### Setting up a fresh sandbox / new environment

Apply SQL in this order (verified against repo 2026-07-04 — re-verify with `ls docs/supabase_schema_patch*.sql docs/sql/ docs/migrations/ backend/migrations/` after adding new files):

**Layer 1 — numbered v* patches:**
1. `docs/supabase_schema_patch.sql`
2. `docs/supabase_schema_patch_v2.sql`
3. `docs/supabase_schema_patch_v3.sql`
4. `docs/supabase_schema_patch_v4.sql`
5. `docs/supabase_schema_patch_v5.sql`
6. `docs/supabase_schema_patch_v6.sql`
7. `docs/supabase_schema_patch_v7_so_doanh_thu.sql`
8. `docs/supabase_schema_patch_v8_bill_images_activated_status.sql`

**Layer 1 — named patch files (apply after v* patches):**
9. `docs/supabase_schema_patch_payment_requests.sql`
10. `docs/supabase_schema_patch_payment_requests_cancel.sql`
11. `docs/supabase_schema_patch_payment_requests_email.sql`
12. `docs/supabase_schema_patch_payment_requests_sale_email.sql`
13. `docs/supabase_schema_patch_payment_requests_tax_id.sql`
14. `docs/supabase_schema_patch_payment_lines_bill.sql`
15. `docs/supabase_schema_patch_active_requests.sql`
16. `docs/supabase_schema_patch_active_requests_nullable_pr.sql`
17. `docs/supabase_schema_patch_active_requests_pr_id_text.sql`
18. `docs/supabase_schema_patch_invoice_courses.sql`
19. `docs/supabase_schema_patch_crm_sales_data.sql`
20. `docs/supabase_schema_patch_crm_sales_data_v2.sql`
21. `docs/supabase_schema_patch_crm_sales_period.sql`
22. `docs/supabase_schema_patch_crm_sales_sale_date.sql`
23. `docs/supabase_schema_patch_crm_hybrid.sql`
24. `docs/supabase_schema_patch_crm_record_type.sql`
25. `docs/supabase_schema_patch_crm_tokens.sql`
26. `docs/supabase_schema_patch_bc03_monthly.sql`
27. `docs/supabase_schema_patch_db_audit_20260603.sql`
28. `docs/supabase_schema_patch_ledger_search.sql`
29. `docs/supabase_schema_patch_revenue_ledger_link.sql`

**Out-of-sequence DDL (easy to miss):**
30. `docs/sql/notifications_exchange_rates.sql`  ← creates `notifications` and `exchange_rates` tables

**Layer 2 — dated docs/migrations/ (apply in date order):**
31–50. All files in `docs/migrations/` (see Layer 2 list in Ground truth above)

**Layer 3 — dated backend/migrations/ (apply in date order):**
51+. All files in `backend/migrations/` (see Layer 3 list in Ground truth above)

After all SQL: seed `nhan_su_sale`:

```bash
# From repo root, with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
python scripts/seed_nhan_su_sale.py
```

Optional sandbox test data:

```bash
# Dry-run first, then apply
python backend/scripts/seed_sandbox_data.py
python backend/scripts/seed_sandbox_data.py --apply
```

### Checking RPC sequence state

```sql
-- PR ID counter by year
SELECT * FROM public.payment_request_sequences;

-- Legacy KH### sequence
SELECT last_value, is_called FROM don_hang_seq;
```

### Diagnosing a 503 from rpc_helpers.py

If the backend returns a 503 with Vietnamese text pointing to `supabase_schema_patch_db_audit_20260603.sql`, the DB-audit migration was not applied (or was applied to the wrong project). Apply `docs/supabase_schema_patch_db_audit_20260603.sql` and run `NOTIFY pgrst, 'reload schema';`.

---

## Atomic RPCs (backend/rpc_helpers.py)

All ID allocation uses INSERT ... ON CONFLICT DO UPDATE — never SELECT-then-INSERT:

| RPC function (DB) | Python wrapper | Purpose |
|---|---|---|
| `next_payment_request_id(p_year)` | `rpc_next_payment_request_id(sb)` | Allocate next `PR-YYYY-####` |
| `next_ma_don()` | `rpc_next_ma_don(sb)` | Allocate next `KH###` |
| `allocate_tax_sequences(p_date_key, p_n)` | `rpc_allocate_tax_sequences(sb, n, date_key)` | Batch-allocate invoice + product codes |

All three are defined in `docs/supabase_schema_patch_db_audit_20260603.sql`.

---

## Seed and cleanup scripts inventory

| Script | Location | Purpose | Usage |
|---|---|---|---|
| `seed_nhan_su_sale.py` | `scripts/` | Seeds `nhan_su_sale` from `docs/team_hierarchy.json`; critical for fresh env | `python scripts/seed_nhan_su_sale.py` |
| `seed_sandbox_data.py` | `backend/scripts/` | Idempotent test data (PR, payment lines, etc.) | `python backend/scripts/seed_sandbox_data.py --apply` |
| `cleanup_so_doanh_thu.py` | `scripts/` | Remove duplicate / stale revenue ledger rows | `--dry-run` first, then `--apply` |
| `dedup_gsheet_ledger.py` | `backend/scripts/` | Dedup GSheet-imported ledger rows (already applied to prod 2026-06-12) | Use with caution — create backup first |
| `zalo_archive_cron.py` | `backend/scripts/` | Deletes sent `zalo_outbox` rows older than 30 days | Weekly; NOT scheduled in render.yaml — must run manually |

**Backup convention:** before any destructive data operation, create a named backup table in Supabase SQL Editor:

```sql
CREATE TABLE public.so_doanh_thu_dedup_backup_20260612
  AS SELECT * FROM public.so_doanh_thu;
```

---

## Gotchas & past incidents

**LESSON 2026-06-23 — Replay the FULL migration history on sandbox reset.**
`docs/migrations/2026-06-09-top1-02-installment-fields.sql` (adds `verified_total`, `verified_received` columns to `payment_lines`) was missed during a sandbox reset. This caused a silent prod/sandbox schema discrepancy. When you reset sandbox, do not skip any file, including early-numbered patches.

**TRAP — docs/sql/ is outside the numbered sequence.**
`docs/sql/notifications_exchange_rates.sql` creates `notifications` and `exchange_rates`. It has no date prefix and is not listed in the numbered migration sequence. If the `notifications` table is missing, `useNotifications.ts` silently falls back to mock data (line 76-85) — users see stale fake notifications with no error.

**Zalo overlap between docs/migrations/ and backend/migrations/ (2026-06-23).**
Both `docs/migrations/2026-06-23-zalo-outbox.sql` and `backend/migrations/2026-06-23-zalo-oa-tables.sql` exist. The `backend/` version is canonical for prod. On an old sandbox provisioned before `backend/migrations/` existed, apply `docs/` version first if you see missing-table errors.

**bank_transactions.transaction_date timezone double-shift (fixed 2026-06-21).**
SePay sends Vietnam local time; the old backend stored it as naive, Postgres treated it as UTC, FE shifted +7 again. Migration `docs/migrations/2026-06-21-fix-sepay-timezone.sql` subtracted 7 hours from all historical rows. If re-importing historical SePay data, verify timestamps are already Vietnam local time before inserting.

**bank_transactions.sepay_id requires a UNIQUE CONSTRAINT, not just an index.**
ON CONFLICT (sepay_id) DO NOTHING requires a full constraint. Migration `docs/migrations/2026-06-16-fix-sepay-unique-constraint.sql` dropped the partial index and added the constraint. If ON CONFLICT errors occur on `sepay_id`, confirm the constraint exists:

```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.bank_transactions'::regclass
  AND contype = 'u';
```

**active_requests.id is TEXT, not UUID.**
`zalo_outbox.source_id` is UUID. The trigger uses `md5(NEW.id)::uuid` as a deterministic conversion. This is intentional — not a bug.

**so_doanh_thu had 101 duplicate rows (deduped 2026-06-12).**
Backup table `so_doanh_thu_dedup_backup_20260612` exists in prod. The durable fix (replace-by-day import semantics) may or may not be implemented — verify before assuming it is safe to re-import a full date range.

**Supabase key format changed 2026-06-16.**
After a key leak, all legacy `eyJ...` JWT keys were disabled. Only `sb_secret_*` / `sb_publishable_*` prefixed keys are valid. If you see 401 errors from any Supabase call, check that the key in use has the new prefix.

**exchange_rates and notifications have permissive RLS.**
Both tables have `FOR ALL USING (true)` — any authenticated session can read and write them. This is intentional for the exchange rate config feature, but note it when reviewing access control.

**Cross-repo dependency: bank_transactions.**
The `pf-revenue` repo (separate app, same Supabase prod DB `jozcvbbypwvzaefteoxn`) reads `bank_transactions` and pushes to Lark Base "GD SePay" on a 1-5 minute sliding window. Any schema change to `bank_transactions` in this repo can silently break `pf-revenue` sync. Check with the `pf-revenue` maintainer before altering this table.

**SECURITY DEFINER functions: EXECUTE revoked from PUBLIC/anon/authenticated (2026-07-06).**
All public-schema SECURITY DEFINER functions had default EXECUTE granted to PUBLIC. Fixed by `backend/migrations/2026-07-06-security-revoke-rpc-and-bucket-listing.sql`. Any **new** SECURITY DEFINER function must include `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated;` at the end — otherwise Postgres re-grants PUBLIC by default.

**Storage bucket `bills`: listing blocked for anon (2026-07-06).**
Same migration dropped the `"public read bills"` SELECT policy on `storage.objects`. Public URLs still work (bucket `public` flag = true). Backend uses service_role (bypasses RLS). If a new storage policy is added for bills, do NOT add a blanket SELECT — it re-enables listing all file paths.

---

## Volatile facts (as of 2026-07-04)

- **Authoritative migration order list** — in `docs/PROJECT.md` line ~150. Re-read after adding any migration; the list must be updated manually. Re-verify: `grep -n "Patch" docs/PROJECT.md`
- **backend/migrations/ file list** — newer files may not be in `docs/PROJECT.md`. Re-verify: `ls backend/migrations/` and `ls docs/migrations/`
- **bank_transactions.match_status CHECK values** — currently: `pending, auto_matched, manual_matched, needs_review, ignored`. Re-verify: `grep -n "match_status" docs/migrations/2026-06-20-add-manual-matched-status.sql`
- **zalo_outbox event_type CHECK values** — currently: `payment_paid, course_activated, activation_urgent_reminder, activation_request_created` (4th value added by `backend/migrations/2026-07-02-zalo-outbox-image-and-ar-created-event.sql`). Re-verify: `grep -n "event_type" backend/migrations/2026-07-02-zalo-outbox-image-and-ar-created-event.sql`
- **exchange_rates default of 3700** — expected to become configurable (task VAC-05, open as of 2026-07-04). Re-verify: `grep -rn "3700\|DEFAULT_TY_GIA\|DEFAULT_EXCHANGE_RATE" backend/revenue_routes.py backend/dashboard_routes.py`
- **nhan_su_sale row count** — approximately 149 entries as of 2026-07-04. Re-verify after any Metabase sync: `SELECT count(*) FROM nhan_su_sale;`

---

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
```sql
-- After applying any migration: confirm NOTIFY was issued (schema cache refresh)
-- Run in Supabase SQL Editor immediately after each file:
NOTIFY pgrst, 'reload schema';

-- SELECT-preview before any data-mutating migration (never mutate blind):
SELECT count(*) FROM <target_table> WHERE <affected_condition>;
```

**Tier 2 — when adding or altering a table:**
```sql
-- Confirm new column/constraint exists before running backend code against it
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = '<your_table>' AND table_schema = 'public';

-- Confirm RPC function registered (required for rpc_helpers.py):
SELECT proname FROM pg_proc
WHERE proname IN ('next_payment_request_id','next_ma_don','allocate_tax_sequences');
```

**Tier 3 — sandbox first; prod only after main branch is deployed:**
```bash
# Apply to sandbox, smoke the affected feature at:
# https://palfish-gmv-manager-sandbox.vercel.app/
# Only after sandbox passes AND main is merged+deployed:
# Apply to prod (Supabase project jozcvbbypwvzaefteoxn)

# Verify migration file list is current before fresh-env replay:
ls docs/supabase_schema_patch*.sql docs/sql/ docs/migrations/ backend/migrations/
```

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** `grep` or `LIMIT 20` SQL output — do not paste full table scans into context.
