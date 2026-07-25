---
name: activation-and-invoicing
description: Covers B3 (Kích hoạt khóa học / Active Request lifecycle) and B4 (Xuất hóa đơn / Invoice issuance), including the address-required rule for invoice export, in-app notifications wiring, and the legacy M3/M4 boundary. Use when working on active_requests CRUD, CRM order_id matching, per-course INV allocation, tax ZIP export, invoice-remind or activation-urgent-remind flows, or the notifications bell.
---

## Overview

**B3 — Kích hoạt khóa học** manages Active Requests (ARs): per-PR records linking customer UIDs to one or more courses, tracking CRM `order_id` assignment and status transitions.

**B4 — Xuất hóa đơn** handles per-course INV issuance (allocating from `invoice_sequences`), a 3-file tax ZIP download for the tax authority, and a delivery log recording when the accountant sent the invoice PDF to the customer.

Both flows live entirely in `backend/activation_routes.py` on the `active_requests` table. The legacy `backend/invoice_routes.py` operates on `don_hang` (M3/M4) and is still live — see the Legacy Boundary section below.

---

## When to use / When NOT to use

**Use this skill when:**
- Adding or modifying AR creation, editing, or deletion logic (`active_requests` table)
- Changing course status machine (`pending_order` → `partial_order` → `activated` / `ready_invoice` → `invoiced`)
- Working on INV code allocation, tax ZIP export, or delivery log
- Debugging the address-required rule (why a customer is blocked from invoice export)
- Working on invoice-remind (sale → accountant) or activation-urgent-remind (sale → Ops Zalo)
- Working on the in-app notification bell (`notifications` table, `useNotifications.ts`)

**Do NOT use this skill for:**
- Legacy M3/M4 flow — see `backend/invoice_routes.py` and `don_hang` table
- SePay / VietQR payment matching — see the `sepay-payments-and-qr` skill
- General RBAC/permissions — see the `rbac-and-auth-accounts` skill
- Zalo OA token management — see the `zalo-oa-notifications` skill

---

## Ground truth

### Key files

| File | Role |
|------|------|
| `backend/activation_routes.py` | B3 AR CRUD + B4 per-course INV issuance, tax batch export, activation-urgent-remind endpoints |
| `backend/invoice_routes.py` | **Legacy M3/M4 only** — `don_hang` table: CHO_XAC_NHAN → CHO_XUAT_HD → DA_XUAT_HD + old tax export |
| `backend/invoice_email_routes.py` | Delivery log (POST/GET `/api/v1/invoices/{ar_id}/delivery-log`) |
| `backend/invoice_email_service.py` | Email validation helper (`is_valid_email` regex) |
| `backend/payment_request_routes.py` | Invoice-remind endpoints (create/status/list) — lines ~2653–2853 |
| `backend/notification_routes.py` | In-app notifications: GET list, POST read, POST mark-all-read |
| `frontend/src/components/ActivationTab.tsx` | B3 UI: AR list, detail drawer, order_id entry, invoice blocker check, urgent-remind button |
| `frontend/src/components/InvoiceRequestTab.tsx` | B4 UI: invoice issuance drawer, tax ZIP download, delivery log |
| `frontend/src/components/ActivationTab.invoiceBlockers.test.ts` | Unit tests for `getInvoiceBlockers` — defines ground truth for address validation logic |
| `frontend/src/hooks/useNotifications.ts` | Notification bell hook — polls every 30s; falls back to `MOCK_NOTIFICATIONS` on any 404/500/undefined error |
| `frontend/src/lib/api.ts` | All API endpoint constants: `activeRequests`, `invoiceRemind`, `activationUrgentRemind`, `deliveryLog` groups |
| `docs/sql/notifications_exchange_rates.sql` | DDL for `notifications` + `exchange_rates` tables — NOT in numbered migrations |
| `docs/supabase_schema_patch_invoice_courses.sql` | Creates `invoice_sequences` table + `patch_active_request_course_order` RPC |
| `docs/supabase_schema_patch_db_audit_20260603.sql` | Defines `issue_course_invoice_atomic`, `revoke_course_invoice_atomic`, `request_ar_invoice_atomic` Postgres RPCs |

### Key DB tables

| Table | Owner |
|-------|-------|
| `active_requests` | B3/B4 main entity |
| `invoice_sequences` | INV counter per year — created by `docs/supabase_schema_patch_invoice_courses.sql` |
| `invoice_email_logs` | Delivery log |
| `invoice_reminders` | Invoice-remind records (sale → accountant) |
| `activation_reminders` | Activation-urgent-remind records (sale → Ops) |
| `notifications` | In-app bell notifications — created by `docs/sql/notifications_exchange_rates.sql` |
| `don_hang` | Legacy M3/M4 only |

### Env var names (never values)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — DB access
- No B3/B4-specific env vars; `OPS_GROUP_TEAM_CODE = "Inhouse 2"` is hardcoded in `activation_routes.py:37`

---

## Jargon

| Term | Meaning |
|------|---------|
| **AR (Active Request)** | Record in `active_requests` linking a PR to UID(s) + courses. Primary B3 entity. |
| **Course Code (CC-XXXX-NNN)** | Auto-assigned per-course identifier within an AR. Format: `CC-{PR_4digits}-{seq:03d}`. |
| **INV** | Per-course invoice ID. Format: `INV-{year}-1{seq:03d}` (e.g. `INV-2026-1001`). Leading `1` is hardcoded. |
| **tax_invoice_code** | Daily-reset M-prefix code for the tax authority export (`M{DDMMYY}{seq:03d}`). Stored in course JSONB. |
| **tax_product_code** | Global sequential PF-prefix code for tax export. Stored in course JSONB. |
| **uids_data** | JSONB column on `active_requests`. Array of uid-blocks, each with uid, phone, country, and a `courses` array. All course-level state lives here. |
| **invoice_requested_at** | Timestamp on a course JSONB entry: sale pressed "Xuất HĐ". Triggers status → `ready_invoice`. Distinct from `invoiced=True`. |
| **OV customer** | Overseas customer. Identified by `province` field containing a foreign country name from `FOREIGN_COUNTRY_NAMES`. Only country required for address rule. |
| **invoice-remind** | Sale notifying accountant a PR is paid and needs invoice. Table: `invoice_reminders`. 24h throttle. Lives in `payment_request_routes.py`. |
| **activation-urgent-remind** | Sale pinging Ops (Zalo to Inhouse 2 group) about pending CRM `order_id`s. Table: `activation_reminders`. 15-minute throttle with smart cooldown. Lives in `activation_routes.py`. |
| **delivery-log** | Record in `invoice_email_logs` that accountant sent the INV PDF to the customer (manual UI action). |
| **M3/M4 flow** | Legacy flow on `don_hang`: CHO_XAC_NHAN → CHO_XUAT_HD → DA_XUAT_HD. Separate from `active_requests` B3/B4. |

---

## Procedures

### Add or edit a B3/B4 feature

1. All new B3/B4 code goes in `backend/activation_routes.py`. Never add to `backend/invoice_routes.py` (legacy only).
2. Check the AR status machine before adding a transition:
   - `pending_order` → no courses with `order_id` and no `invoice_requested_at`
   - `partial_order` → some courses have `order_id`, none have `invoice_requested_at`
   - `activated` → all courses have `order_id`, none have `invoice_requested_at`
   - `ready_invoice` → at least one course has `invoice_requested_at`
   - `invoiced` → all courses have `invoiced=True`
3. Run unit tests to catch address-validation regressions:
   ```bash
   cd frontend && npm run test
   ```
4. Type-check before push (use `-b`, not `--noEmit` — Vercel uses `tsc -b`):
   ```bash
   cd frontend && npx tsc -b
   ```
5. Full build check:
   ```bash
   cd frontend && npm run build
   ```

### Reproduce or debug the address-required rule

The rule is duplicated symmetrically in **two places**. Both must agree:

- **FE**: `getInvoiceBlockers()` in `frontend/src/components/ActivationTab.tsx:337`
  - Derives `FOREIGN_COUNTRY_NAMES` dynamically from `CountryCombo.tsx`'s `COUNTRIES` array (filters `code !== "VN"`)
- **BE**: `_invoice_address_complete()` in `backend/activation_routes.py:773`
  - Uses a hardcoded `FOREIGN_COUNTRY_NAMES` set at line 753

Rule: VN customer needs Tỉnh + Phường + Số nhà. OV customer (province field contains a foreign country name) only needs country (province field alone).

To check divergence between FE and BE country lists:
```bash
# FE source
grep -A 80 "FOREIGN_COUNTRY_NAMES" frontend/src/components/ActivationTab.tsx

# BE source
grep -A 20 "FOREIGN_COUNTRY_NAMES: set" backend/activation_routes.py
```

### Provision notifications table on a fresh environment

The `notifications` table DDL is NOT in the numbered migration sequence. It lives only in:

```
docs/sql/notifications_exchange_rates.sql
```

Run it in the Supabase SQL Editor (it is idempotent):
```sql
-- paste contents of docs/sql/notifications_exchange_rates.sql
-- then run: NOTIFY pgrst, 'reload schema';
```

Verify the table exists:
```sql
SELECT COUNT(*) FROM public.notifications;
```

If the table is missing, `useNotifications.ts` silently falls back to `MOCK_NOTIFICATIONS` — users see stale fake data with no error displayed.

### Provision invoice_sequences on a fresh environment

`invoice_sequences` is also outside the numbered migrations. If missing, INV issuance returns HTTP 503 with message:
> "Thiếu bảng invoice_sequences. Chạy docs/supabase_schema_patch_invoice_courses.sql"

Run in Supabase SQL Editor:
```bash
# file: docs/supabase_schema_patch_invoice_courses.sql
```

Also run the atomic RPCs SQL (if missing, INV issue/revoke will fail):
```bash
# file: docs/supabase_schema_patch_db_audit_20260603.sql
```

Verify:
```sql
SELECT * FROM invoice_sequences LIMIT 1;
SELECT proname FROM pg_proc WHERE proname IN (
  'issue_course_invoice_atomic', 'revoke_course_invoice_atomic', 'request_ar_invoice_atomic'
);
```

### Use bulk-issue invoices

`POST /api/v1/invoice-courses/bulk-issue` continues on per-item errors and returns HTTP 200 even with partial failures. Always check the response body:

```json
{ "issued": [...], "issued_count": 2, "error_count": 1, "errors": [...] }
```

A non-zero `error_count` on an HTTP 200 means some invoices were NOT issued.

---

## Gotchas & past incidents

1. **Address-validation divergence (ongoing risk)** — FE `getInvoiceBlockers` and BE `_invoice_address_complete` are intentionally duplicated (BE comment at `activation_routes.py:795` notes "Khớp logic FE getInvoiceBlockers (ActivationTab.tsx)"). If a new country is added to `CountryCombo.tsx` but not to the BE `FOREIGN_COUNTRY_NAMES` set, that customer is incorrectly treated as domestic and blocked at INV issuance. Always update both when adding countries.

2. **notifications table missing after sandbox reset (2026-06 pattern)** — `docs/sql/notifications_exchange_rates.sql` is outside numbered migrations. After a sandbox DB reset, the `notifications` table does not exist. `useNotifications.ts` catches any 404/500/undefined error and silently shows `MOCK_NOTIFICATIONS` — there is no visible error to the user. The comment in the hook says "Production thực sự sẽ không bao giờ rơi vào nhánh này" but a missing table proves otherwise.

3. **ar_rejected notification: no backend insert** — `useNotifications.ts` mock includes an `ar_rejected` kind. The backend has no `_insert_ar_rejected_notification` function. Only `ar_confirmed` has a backend insert (`activation_routes.py:680`). If you expect rejection notifications, you must add the backend insert.

4. **Zalo activation_request_created is non-blocking** — The Zalo enqueue inside AR creation is wrapped in `try/except` and only prints on failure (`activation_routes.py:1058`). A UNIQUE constraint violation on `source_table+source_id+event_type` is silently swallowed as idempotent.

5. **activation-urgent-remind to wrong Zalo group** — `OPS_GROUP_TEAM_CODE = "Inhouse 2"` is hardcoded in `activation_routes.py:37`. If this team code no longer exists or `is_active=false` in `zalo_team_groups`, the reminder returns `"skipped_no_group"` with no error raised. Verify with:
   ```sql
   SELECT team_code, is_active FROM zalo_team_groups WHERE team_code = 'Inhouse 2';
   ```

6. **invoice-remind is in payment_request_routes.py, not activation_routes.py** — The two reminder systems have different tables and locations: `invoice_reminders` (sale → accountant, 24h throttle) lives in `payment_request_routes.py`; `activation_reminders` (sale → Ops, 15-min throttle) lives in `activation_routes.py`.

7. **Legacy M3/M4 boundary** — `invoice_routes.py` + `Module3Tab.tsx` + `Module4Tab.tsx` are all still registered and live in production. They operate on `don_hang` (different table, different status vocabulary). Never add B3/B4 features to `invoice_routes.py`. The migration path from M3/M4 to B3/B4 is not yet defined — do not assume `don_hang` will be deprecated soon.

8. **Concurrent PATCH without expected_updated_at** — The `PATCH /active-requests/{ar_id}` endpoint accepts an optional `expected_updated_at` field. If omitted, optimistic concurrency is skipped and concurrent saves silently last-write-wins. The guarded path uses RPC `replace_active_request_uids_data_guarded`.

9. **TOP1-02 migration missed on sandbox reset (2026-06-23)** — When resetting the sandbox DB, replay the FULL migration history (numbered migrations + `docs/sql/notifications_exchange_rates.sql` + `docs/supabase_schema_patch_invoice_courses.sql` + `docs/supabase_schema_patch_db_audit_20260603.sql`). A partial replay once left 5 instalment columns missing.

---

## Volatile facts (as of 2026-07-04)

- **`OPS_GROUP_TEAM_CODE = "Inhouse 2"`** (`activation_routes.py:37`) — hardcoded. Verify the team is active:
  ```sql
  SELECT team_code, is_active FROM zalo_team_groups WHERE team_code = 'Inhouse 2';
  ```

- **`FOREIGN_COUNTRY_NAMES` sync between FE and BE** — FE derives the set dynamically from `CountryCombo.tsx`; BE has a hardcoded set in `activation_routes.py:753`. Verify they are in sync whenever `CountryCombo.tsx` is updated:
  ```bash
  grep -c "name" frontend/src/components/payment-request/CountryCombo.tsx
  grep -c '"' backend/activation_routes.py | head -5  # rough count check
  ```

- **`invoice_sequences` table may not exist on newly provisioned environments** — verify:
  ```sql
  SELECT * FROM invoice_sequences LIMIT 1;
  ```

- **Postgres RPCs `issue_course_invoice_atomic`, `revoke_course_invoice_atomic`, `request_ar_invoice_atomic`** — may be absent after a schema reset. Verify:
  ```sql
  SELECT proname FROM pg_proc WHERE proname IN (
    'issue_course_invoice_atomic', 'revoke_course_invoice_atomic', 'request_ar_invoice_atomic'
  );
  ```

- **`notifications` table** — outside numbered migrations; may be absent after sandbox reset. Verify:
  ```sql
  SELECT to_regclass('public.notifications');
  ```

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
- If FE touched: `cd frontend && npx tsc -b`
- Run address-validation unit tests (ground truth for `getInvoiceBlockers`): `cd frontend && npm run test -- --reporter=dot ActivationTab.invoiceBlockers 2>&1 | grep -E "PASS|FAIL|Error"`
- Check FE/BE country-list parity (rough count): `grep -c '"name"' frontend/src/components/payment-request/CountryCombo.tsx` vs `grep -c '"' backend/activation_routes.py | head -3`

**Tier 2 — when touching INV issuance, AR status machine, or address logic:**
- Verify all three atomic RPCs exist on the target Supabase instance (SQL Editor):
  ```sql
  SELECT proname FROM pg_proc WHERE proname IN (
    'issue_course_invoice_atomic', 'revoke_course_invoice_atomic', 'request_ar_invoice_atomic'
  );
  ```
  Expected: 3 rows. Fewer = stop and run `docs/supabase_schema_patch_db_audit_20260603.sql`.
- Verify `invoice_sequences` and `notifications` tables exist: `SELECT to_regclass('public.invoice_sequences'), to_regclass('public.notifications');` — both must be non-null.
- After any address-logic change: re-run the full unit test suite (`cd frontend && npm run test`) and confirm `ActivationTab.invoiceBlockers.test.ts` is green.

**Tier 3 — before merge/deploy only:**
- Smoke-test AR creation on sandbox end-to-end: create a test AR, assign `order_id` to all courses, press "Xuất HĐ", confirm status reaches `ready_invoice` and INV code is issued.
- Confirm `OPS_GROUP_TEAM_CODE = "Inhouse 2"` Zalo group is active: `SELECT team_code, is_active FROM zalo_team_groups WHERE team_code = 'Inhouse 2';`
- Verify `activation_routes.py` is registered via `register_activation_routes()` in `main.py` (the 2026-06-19 indent bug silently dropped 10/14 routes).

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** filter command output for errors — e.g. `2>&1 | grep -iE "error|fail|traceback|503|missing"` — instead of dumping full logs into context.
