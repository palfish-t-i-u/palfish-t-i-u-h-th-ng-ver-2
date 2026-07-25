---
name: zalo-oa-notifications
description: Covers the Zalo OA group notification system: token lifecycle, outbox queue, retry, admin UI, test-send rules, UAT procedure, and archive cron. Use when adding new event types, debugging failed messages, rotating tokens, running UAT on sandbox, or maintaining the zalo_outbox table.
---

## Overview

The system sends real-time Zalo group messages to sales teams when payment/activation events fire.
Architecture: a DB trigger or Python route inserts a row into `zalo_outbox`; a background worker (`zalo_outbox_worker.py`) polls every 30 seconds in batches of 20, sends via `zalo_notifier.py`, and updates `sent_at` on success or schedules a retry on failure.

One Zalo OA (Official Account) named "Palfish Vietnam" (App ID `83298551201629166`, OA ID `953422767266282024`) is shared by both prod and sandbox environments.

---

## When to use / When NOT to use

**Use when:**
- A Zalo message failed (dead-message recovery, retry flow)
- Rotating or minting Zalo OA tokens
- Adding a new notification event type
- Running UAT on sandbox for Zalo notifications
- Scheduling or running `zalo_archive_cron.py` manually
- Debugging `zalo_outbox` growth or missing sent_at

**Do NOT use when:**
- Working on DingTalk notifications (architecturally parallel but fully separate; see `backend/dingtalk_notifier.py`)
- Working on in-app notifications (the `notifications` table, `notification_routes.py`)

---

## Ground truth

### Key files

| File | Role |
|------|------|
| `backend/zalo_notifier.py` | Only file that calls Zalo API. `send_text_to_group`, `send_image_to_group`, `refresh_access_token`, `start_zalo_token_refresh_task` (hourly loop, refreshes when expiry ≤ 6 h). |
| `backend/zalo_outbox_worker.py` | Background worker. `poll_and_send` runs every 30 s, batch 20. `RETRY_DELAYS = [30, 120, 300, 900]` s. `MAX_RETRIES = 4`. `FATAL_ZALO_ERRORS = {"-213", "-214", "-215"}`. |
| `backend/admin_routes.py` | All Zalo admin REST endpoints live here (no separate `zalo_routes.py`). Routes are registered around line 1329. Requires RBAC module `zalo`. |
| `backend/utils/zalo_message_builder.py` | Python message format builders (`build_payment_paid_message`, `build_course_activated_message`, `build_activation_urgent_reminder_message`, `build_activation_request_created_message`). Must stay in sync with SQL trigger functions. |
| `backend/migrations/2026-06-23-zalo-oa-tables.sql` | Creates `zalo_oa_credentials`, `zalo_team_groups`, `zalo_outbox` tables. SQL message builder functions. DB triggers `trg_payment_paid_zalo` and `trg_course_activated_zalo`. |
| `backend/migrations/2026-07-02-zalo-outbox-image-and-ar-created-event.sql` | Adds `image_url`, `image_sent_at`, `image_error` columns to `zalo_outbox`. Adds `activation_request_created` to the `event_type` CHECK constraint. **Both migrations must be applied.** |
| `backend/migrations/2026-07-04-zalo-phone-intl-format.sql` | Adds SQL `public.format_phone_intl` used by DB triggers. Mirror of `backend/utils/zalo_message_builder.py::format_phone_intl`. |
| `backend/scripts/zalo_archive_cron.py` | Weekly cron: deletes `zalo_outbox` rows where `sent_at` is not null and `sent_at < now() - 30 days`. **Not scheduled on Render.** |
| `docs/UAT_ZALO_RUNBOOK.md` | Step-by-step UAT runbook (6 steps). **Read before minting any new OAuth token.** |
| `scripts/uat_staging_zalo.py` | UAT script: inserts 4 synthetic outbox rows with prefix `🧪 [TEST UAT]\n`, embeds worker (8 ticks × 10 s), verifies DB. Blocks if `SUPABASE_URL` points to prod. |
| `frontend/src/components/admin/ZaloConfigTab.tsx` | Token status UI (good/expiring/expired), update credentials, test-send dropdown. |
| `frontend/src/components/admin/ZaloGroupsTab.tsx` | CRUD for `zalo_team_groups` (team_code PK, group_id, group_name, is_active). |
| `frontend/src/components/admin/ZaloOutboxTab.tsx` | Last 50 outbox rows + Retry button. |
| `frontend/src/lib/api/zaloAdmin.ts` | TypeScript bindings for all Zalo admin endpoints. |

### DB tables

| Table | Purpose |
|-------|---------|
| `zalo_oa_credentials` | Single-row (by convention) storing `app_id`, `app_secret`, `access_token`, `refresh_token`, `expires_at`. |
| `zalo_team_groups` | Maps `team_code` (PK) → `group_id` (Zalo internal group ID). |
| `zalo_outbox` | Async message queue. UNIQUE constraint on `(source_table, source_id, event_type)` for idempotency. |

### Env vars (names only, never values)

```
ZALO_OA_APP_ID          (or ZALO_OA_ID)
ZALO_OA_APP_SECRET
ZALO_OA_ACCESS_TOKEN    (fallback when DB row absent)
ZALO_OA_REFRESH_TOKEN   (fallback when DB row absent)
ZALO_OA_TOKEN_EXPIRES_AT
SUPABASE_URL            (determines prod vs sandbox)
SUPABASE_SERVICE_ROLE_KEY
```

The worker and admin routes prefer the `zalo_oa_credentials` DB row over env vars when Supabase is available.

---

## Procedures

### 1. Token rotation / UAT on sandbox (the only safe procedure)

**Read `docs/UAT_ZALO_RUNBOOK.md` in full before starting.**

Summary of the 6-step procedure:

1. Anh Hiếu mints a new token pair for sandbox via `https://developers.zalo.me/tools/explorer/access-token` → copies the OAuth `code`.
2. Exchange code for `access_token` + `refresh_token`:
   ```bash
   cd backend
   python -c "
   import httpx
   code = 'PASTE_CODE_HERE'
   r = httpx.post(
       'https://oauth.zaloapp.com/v4/oa/access_token',
       data={'code': code, 'app_id': '83298551201629166', 'grant_type': 'authorization_code'},
       headers={'secret_key': 'PASTE_APP_SECRET_HERE'},
       timeout=15,
   )
   print(r.json())
   "
   ```
   **From this moment prod tokens are revoked. The 15-minute clock starts.**
3. Paste new tokens into sandbox DB (`zalo_oa_credentials` row, `expires_at = now + 24h`).
4. Run UAT:
   ```bash
   python scripts/uat_staging_zalo.py --all
   ```
5. Mint a **second** new token pair for prod (repeat steps 1-2). Paste into prod DB. Prod worker resumes within ~30 s.
6. Delete sandbox credentials row to prevent future accidental token races:
   ```bash
   curl -X DELETE "$SANDBOX_SB_URL/rest/v1/zalo_oa_credentials?id=eq.1" \
     -H "apikey: $SANDBOX_SB_KEY" \
     -H "Authorization: Bearer $SANDBOX_SB_KEY"
   ```

### 2. Retrying a dead outbox message

A "dead message" is a row where `retries >= 4` and `sent_at IS NULL`.

Via admin UI: open ZaloOutboxTab, click **Retry**. This resets `retries=0, last_error=null, sent_at=null, next_retry_at=now()`. The worker picks it up on the next 30 s poll.

**HARD RULE:** If the message being retried is a test message (i.e., it was inserted for testing, not a real event), you must ensure the `message` column contains the prefix `🧪 [TEST]` before clicking Retry. The retry endpoint (`POST /api/v1/admin/zalo-outbox/{msg_id}/retry`) does NOT add any prefix automatically — it sends the message exactly as stored.

If the prefix is missing, add it first via Supabase SQL Editor (use the correct project — sandbox: `pxgybyfiwywksesyogti`, prod: `jozcvbbypwvzaefteoxn`):

```sql
-- Add test prefix to a specific unsent row
UPDATE zalo_outbox
SET message = '🧪 [TEST]' || E'\n' || message
WHERE id = '<msg_id>'   -- replace with actual UUID
  AND sent_at IS NULL;  -- safety guard: only affects unsent rows

-- Confirm the update before retrying:
SELECT id, LEFT(message, 50) AS msg_preview, sent_at
FROM zalo_outbox
WHERE id = '<msg_id>';
```

Only after verifying the prefix is present: click Retry in the ZaloOutboxTab.

### 3. Running the archive cron manually

The cron is not scheduled. Run it manually against the target environment:

```bash
cd E:/PalFish/DA/pf-gmv-reconciliation/palfish-t-i-u-h-th-ng-ver-2/backend
# Set env vars for the target environment first (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
python scripts/zalo_archive_cron.py
```

This deletes all `zalo_outbox` rows where `sent_at IS NOT NULL AND sent_at < now() - 30 days`. It does NOT touch unsent rows (sent_at IS NULL).

### 4. Adding a new event type

1. Add the new value to the `event_type` CHECK constraint in a new numbered migration (see `backend/migrations/2026-07-02-*` for the pattern).
2. Write a Python builder in `backend/utils/zalo_message_builder.py` that returns `{"message": str, "canonical_team_code": str}`.
3. Write a corresponding SQL trigger function and mirror it in the migration. Keep Python and SQL format output identical.
4. Register enqueue logic (DB trigger or Python route).
5. Add a UAT case to `scripts/uat_staging_zalo.py`.
6. Apply migration to sandbox first, then prod after main merge.

### 5. Test-send via admin UI

Go to ZaloConfigTab, select a group from the dropdown, click **Test Send**. This calls `POST /api/v1/admin/zalo-config/test`, which calls `send_text_to_group` directly — it does NOT write to `zalo_outbox`. It is fire-and-forget: no retry, no audit trail.

---

## Event types

| event_type | Trigger | Message prefix |
|-----------|---------|---------------|
| `payment_paid` | DB trigger `trg_payment_paid_zalo` (payment_lines → status='paid') | `💰 ĐÃ VÀO - KH {name}` |
| `course_activated` | DB trigger `trg_course_activated_zalo` (active_requests → status='activated') | `✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC` |
| `activation_urgent_reminder` | Python route (activation_routes.py), manually triggered by sale | `⚡ Cần kích hoạt khóa học GẤP` |
| `activation_request_created` | Python route (activation_routes.py), on AR creation | `🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-xxxx` |

---

## Gotchas & past incidents

**[2026-07-04] Test message mistaken for real notification.**
Team re-fired a test outbox row via the Retry button. The stored `message` had no test prefix. Real team members received it and had to recall the message. Rule established: any test outbox row must carry `🧪 [TEST]` in the message text before the worker sends it. The `uat_staging_zalo.py` script enforces `TEST_PREFIX = "🧪 [TEST UAT]\n"` at insert time (line 41). The retry endpoint does NOT enforce this — caller responsibility.

**Minting a new OAuth token immediately revokes all existing tokens for the same OA.**
Prod and sandbox share one OA. Minting sandbox tokens kills prod tokens; minting prod tokens kills sandbox tokens. Whoever mints last holds the valid pair. During UAT: prod is down from the moment the sandbox token is minted until prod tokens are restored (Bước 5). Plan for ~15-minute prod outage when running UAT. Messages queue in `zalo_outbox` and will drain once prod tokens are restored.

**`zalo_routes.py` does not exist.** CLAUDE.md mentions it but the file was never created. All Zalo admin endpoints are in `backend/admin_routes.py` starting at line 1329. Do not create `zalo_routes.py`.

**Two migrations must both be applied.** The `activation_request_created` event type and the `image_url/image_sent_at/image_error` columns were added in the 2026-07-02 migration, not the original 2026-06-23 migration. Inserting an `activation_request_created` row will fail with a CHECK constraint violation if only the first migration is applied.

**`_format_vnd` and `_format_vnd_dots` must not be merged.** `payment_paid` messages use comma-separator format (`1,500,000đ`); `activation_request_created` uses dot-separator format (`8.500.000 VNĐ`). Evidence: `zalo_message_builder.py` lines 43-62.

**`upsert_zalo_config` race condition.** The POST `/api/v1/admin/zalo-config` endpoint deletes all rows (`DELETE WHERE id != 0`) then inserts the new row synchronously. A concurrent worker poll that reads credentials between DELETE and INSERT will get `ZaloAPIError: Chua cau hinh Zalo OA credentials`. The window is very short; if credentials are being saved frequently, this can cause spurious worker failures.

**`expires_at` in DB is always `now() + 25 hours`** regardless of Zalo's actual `expires_in`. Set by `admin_routes.py` line 1480. The automatic refresh loop (`start_zalo_token_refresh_task`) checks every hour and refreshes if expiry is within 6 hours — so auto-refresh triggers ~19 hours after credentials are saved, regardless of actual Zalo token lifetime.

**FATAL error codes shortcut retries.** Zalo error codes `-213`, `-214`, `-215` immediately set `retries = MAX_RETRIES (4)` without exhausting normal attempts. Normal errors follow exponential backoff: 30 s, 2 min, 5 min, 15 min. Evidence: `zalo_outbox_worker.py` lines 12 and 92-106.

**`zalo_outbox` GET endpoint has no pagination.** Returns the last 50 rows ordered by `created_at DESC`. Without the archive cron running, the table grows unbounded and older failures become invisible in the admin UI.

**`source_id` UUID from `active_requests.id` (TEXT).** The DB trigger converts via `md5(NEW.id)::uuid`. Python side (activation_routes.py) does `str(uuid.UUID(hashlib.md5(ar_id.encode()).hexdigest()))`. Both must produce the same value or the UNIQUE constraint on `(source_table, source_id, event_type)` will allow duplicate insertions.

**Zero-width space in `payment_paid` message.** A U+200B character is appended after the phone number. This prevents Zalo Web's phone-hyperlink auto-detection from swallowing the trailing newline (dính dòng bug, 2026-07-04). Do not remove it.

---

## Volatile facts (as of 2026-07-04)

- **Zalo OA App ID**: `83298551201629166` — hard-coded in `docs/UAT_ZALO_RUNBOOK.md` and `scripts/uat_staging_zalo.py` line 40. Re-verify at `developers.zalo.me` if OA is ever changed.
  ```bash
  grep -r "83298551201629166" scripts/ docs/
  ```

- **TOKEN_REFRESH_WINDOW constant vs. effective value**: `zalo_notifier.py` line 22 defines `TOKEN_REFRESH_WINDOW = timedelta(days=7)`, but the call site `start_zalo_token_refresh_task` passes `within_hours=6` (line 455). The constant is NOT the effective refresh window — 6 hours is. Re-verify:
  ```bash
  grep -n "within_hours" backend/zalo_notifier.py
  ```

- **RETRY_DELAYS**: `[30, 120, 300, 900]` seconds — `zalo_outbox_worker.py` line 7. Re-verify if retry behavior seems wrong:
  ```bash
  grep -n "RETRY_DELAYS" backend/zalo_outbox_worker.py
  ```

- **`zalo_archive_cron.py` is UNSCHEDULED**: `render.yaml` contains no cron job entry for it (confirmed 2026-07-04). The outbox grows unbounded without manual intervention. Re-verify:
  ```bash
  grep -i "cron\|archive" render.yaml
  ```

- **SQL trigger format vs. Python builder format**: the SQL functions in `2026-06-23-zalo-oa-tables.sql` may differ from the current Python builders after subsequent migrations. The canonical live format is defined by the latest migration applied. Check DB trigger body directly if message format discrepancy is suspected:
  ```sql
  SELECT prosrc FROM pg_proc WHERE proname = 'build_payment_paid_message';
  ```

---

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
- If FE touched: `cd frontend && npx tsc -b`.
- Verify retry and refresh constants still match documented values:
  ```bash
  grep -n "RETRY_DELAYS\|MAX_RETRIES" backend/zalo_outbox_worker.py
  grep -n "within_hours" backend/zalo_notifier.py
  grep -i "cron\|archive" render.yaml
  ```
- Confirm `zalo_routes.py` does NOT exist (all Zalo endpoints live in `admin_routes.py` ~line 1329).

**Tier 2 — when touching outbox worker, message builders, or running a test-send:**
- Any test-send via ZaloConfigTab or `uat_staging_zalo.py` MUST have `🧪 [TEST]` prepended to the message.
  Before retrying any outbox row in the admin UI, verify the prefix is present:
  ```sql
  SELECT id, LEFT(message, 60) AS msg_preview, sent_at FROM zalo_outbox WHERE id = '<msg_id>';
  ```
  Only click Retry AFTER confirming the prefix. The retry endpoint does NOT add the prefix automatically.
- **NEVER mint a new OAuth token as a validation step.** Minting immediately revokes ALL existing tokens for the shared OA — prod goes down the moment sandbox tokens are minted. Token rotation follows `docs/UAT_ZALO_RUNBOOK.md` only.
- Run `python scripts/uat_staging_zalo.py --all` on sandbox (not prod) to verify worker delivery end-to-end.

**Tier 3 — before merge/deploy only:**
- Apply both required migrations to sandbox first (`2026-06-23-zalo-oa-tables.sql` then `2026-07-02-zalo-outbox-image-and-ar-created-event.sql`); verify `activation_request_created` passes the CHECK constraint.
- Confirm SQL trigger body matches Python builder output: run the SQL check above in sandbox Supabase SQL Editor.
- Verify `zalo_archive_cron.py` is still unscheduled in `render.yaml` before deploying (it must remain manual).

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** filter/grep command output for errors instead of dumping full logs into context.
