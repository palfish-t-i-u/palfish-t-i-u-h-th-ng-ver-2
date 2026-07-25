---
name: dingtalk-notifications
description: Covers the DingTalk group-robot notification system — tables, OAuth2 token, worker, admin UI, and key differences vs Zalo. Use when adding a new event type, configuring a team's DingTalk group, debugging delivery failures, or modifying the outbox worker.
---

## Overview

DingTalk notifications fire in parallel with Zalo whenever a payment is marked paid or a course is activated. Unlike Zalo — which holds a single global OA token per-DB — DingTalk uses **one Enterprise Internal App** (OAuth2) shared across all teams, but routes messages to different groups via per-team `open_conversation_id` stored in `dingtalk_team_groups`.

Auth: `POST https://api.dingtalk.com/v1.0/oauth2/accessToken` → cached access token (2h, refreshed 300s before expiry) → `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` with `x-acs-dingtalk-access-token` header.

The system has three layers:
1. **DB triggers** — enqueue rows into `dingtalk_outbox` on state transitions in `payment_lines` / `active_requests`.
2. **Background worker** — polls `dingtalk_outbox` every 30 s and calls the DingTalk API.
3. **Admin UI** — three tabs (Cấu hình / Nhóm thông báo / Outbox) gated behind permission key `dingtalk`.

---

## When to use / When NOT to use

**Use this skill when:**
- Adding a new notification event type (requires a DB migration to update the CHECK constraint).
- Configuring or rotating credentials for a team group.
- Debugging why a message is not delivered (outbox status, retries, dead rows).
- Working on `backend/dingtalk_notifier.py`, `backend/dingtalk_outbox_worker.py`, or the three `frontend/src/components/admin/DingTalk*Tab.tsx` files.
- Comparing DingTalk vs Zalo behaviour before making a change that should apply to both.

**Do NOT use when:**
- Working on Zalo OA (see `zalo-oa-notifications` skill).
- Making changes to payment or activation business logic that happen to trigger DingTalk notifications — use the payment or activation skills for those entry points.

---

## Ground truth

### Key files (repo-relative paths)

| Path | Purpose |
|------|---------|
| `backend/dingtalk_notifier.py` | OAuth2 token + `send_group_message(open_conversation_id, message)` |
| `backend/dingtalk_outbox_worker.py` | Async background worker; polls + drains `dingtalk_outbox` |
| `backend/admin_routes.py` (lines ~1543–1670) | REST endpoints for groups CRUD, outbox view, test send |
| `backend/migrations/2026-06-26-dingtalk-tables.sql` | DDL: `dingtalk_team_groups`, `dingtalk_outbox`, DB triggers, trigger functions |
| `backend/migrations/2026-07-11-dingtalk-enterprise-robot.sql` | ALTER: drop `webhook_url/secret`, add `open_conversation_id` |
| `backend/activation_routes.py` (line 37: `OPS_GROUP_TEAM_CODE`) | Enqueues `activation_urgent_reminder` to DingTalk (best-effort) |
| `frontend/src/components/admin/DingTalkConfigTab.tsx` | Test-send UI |
| `frontend/src/components/admin/DingTalkGroupsTab.tsx` | Groups CRUD UI (desktop) + `DingTalkGroupCards.tsx` (mobile) |
| `frontend/src/components/admin/DingTalkOutboxTab.tsx` | Outbox monitor UI (desktop) + `DingTalkOutboxCards.tsx` (mobile) |
| `frontend/src/lib/api/dingtalkAdmin.ts` | All FE API calls for DingTalk admin |
| `frontend/src/pages/MainPage.tsx` (lines ~265–354) | Permission gating + nav wiring for DingTalk tabs |
| `frontend/src/components/admin/CLAUDE.md` | Context doc: arch overview, DingTalk vs Zalo table, group mapping, go-live checklist |

### DB tables

| Table | Key columns | Notes |
|-------|-------------|-------|
| `dingtalk_team_groups` | `team_code` (PK), `open_conversation_id` (NOT NULL), `group_name`, `is_active` | `team_code` must exactly match `nhan_su_sale.team` — trigger uses direct equality, no normalization |
| `dingtalk_outbox` | `id`, `event_type`, `source_table`, `source_id`, `team_code`, `message`, `sent_at`, `retries`, `next_retry_at`, `last_error`, `dingtalk_message_id` | `UNIQUE(source_table, source_id, event_type)` prevents duplicate enqueue |

### Current group mapping (as of 2026-07-11)

| team_code | open_conversation_id | Group name |
|-----------|----------------------|------------|
| `Inhouse 1` | `cidUr6KB4Nh7vsrOfVmmtBFGw==` | VN - HN IH1 |
| `Inhouse 2` | `cid5++0sv26KzD+4ztFSHKBCA==` | VN - HN IH2 + Offline |
| `HN Offline Store` | `cid5++0sv26KzD+4ztFSHKBCA==` | VN - HN IH2 + Offline |

### Allowed `event_type` values (CHECK constraint)

```
payment_paid
course_activated
activation_urgent_reminder
```

Adding any other value raises a DB constraint violation. New type requires a migration altering the CHECK.

### Environment variables

| Var | Value | Notes |
|-----|-------|-------|
| `DINGTALK_CLIENT_ID` | `dingsifssh3zhp57nf9y` | App Key (Client ID) of GMV_Notifier app |
| `DINGTALK_CLIENT_SECRET` | `<secret>` | App Secret — get từ DingTalk Developer Console → GMV_Notifier → App Secret |
| `DINGTALK_ROBOT_CODE` | `dingsifssh3zhp57nf9y` | Same as CLIENT_ID (DingTalk robot code = App Key) |
| `DINGTALK_WORKER_ENABLED` | `true` | Must be `true` to start worker on app startup |
| `DINGTALK_ALERT_CONVERSATION_ID` | optional | Group ID nhận alert khi Zalo token refresh fail |

### Permission key

`"dingtalk"` covers all three tabs (Cấu hình / Nhóm thông báo / Outbox). BE: `require_module_access(sb, actor, "dingtalk")`.

---

## Procedures

### 1. Add a new team's DingTalk group

Get `open_conversation_id` for the DingTalk group (via DingTalk Developer Console or DingTalk MCP). Robot "GMV-Notifier" must already be added to the group (Enterprise Internal App, không cần webhook URL/secret).

Use admin UI (Nhóm thông báo tab) or API:

```bash
curl -X POST https://<backend-url>/api/v1/admin/dingtalk-groups \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "team_code": "Inhouse 1",
    "open_conversation_id": "cidXXXXXXXXXX",
    "group_name": "VN - HN IH1",
    "is_active": true
  }'
```

`team_code` must exactly match `nhan_su_sale.team` (case-sensitive, no normalization in trigger).

### 2. Update open_conversation_id for a team

```bash
curl -X PATCH https://<backend-url>/api/v1/admin/dingtalk-groups/Inhouse%201 \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"open_conversation_id": "cidNEWVALUE"}'
```

Worker reads `open_conversation_id` from DB on every send — no restart needed.

### 3. Test send to a group

Use Cấu hình tab → chọn team → nhập message → "Test Gửi DingTalk". Response shows `processQueryKey` on success. Synchronous call, không qua outbox.

### 4. Force-retry a stuck outbox message

Outbox tab → click "Retry". Resets `retries=0`, `last_error=null`, `sent_at=null`, `next_retry_at=now`.

Via API:
```bash
curl -X POST https://<backend-url>/api/v1/admin/dingtalk-outbox/<id>/retry \
  -H "Authorization: Bearer <jwt>"
```

### 5. Add a new event type

```sql
ALTER TABLE public.dingtalk_outbox
  DROP CONSTRAINT dingtalk_outbox_event_type_check,
  ADD CONSTRAINT dingtalk_outbox_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'payment_paid'::text,
      'course_activated'::text,
      'activation_urgent_reminder'::text,
      'new_event_type'::text
    ])
  );
```

Apply sandbox first, verify INSERT succeeds, then prod.

### 6. Flush stale outbox rows before enabling worker

Run này trước lần đầu bật worker (tránh flood group bằng tin cũ):

```sql
UPDATE public.dingtalk_outbox
   SET retries = 99, next_retry_at = NULL,
       last_error = 'Skipped: queued while worker disabled'
 WHERE sent_at IS NULL AND created_at < now() - interval '1 day';
```

---

## Gotchas & past incidents

### Dead-message infinite retry (2026-07-04) — FIXED

**Status: FIXED** in `01c5d1f` (2026-07-11). Worker now has `.or_(f"retries.is.null,retries.lt.{MAX_RETRIES}")` guard — exhausted rows (retries >= 4) no longer re-selected.

### Enterprise Robot requires internal group (không phải external/public group)

DingTalk Enterprise Internal App robot chỉ hoạt động trong **internal group** (nhóm nội bộ trong org). External group hoặc group không có org context = robot không gửi được. Verify nhóm là internal trước khi lấy `open_conversation_id`.

### OAuth2 token cached thread-safe (2h TTL)

`dingtalk_notifier.get_access_token()` dùng `threading.Lock()` + module-level cache. Token sống ~7200s, refreshes 300s trước hết hạn. Không cần refresh thủ công. Nếu `CLIENT_SECRET` sai → mọi send đều fail với auth error.

### `team_code` exact match — không normalize

DB trigger: `WHERE team_code = v_sale_team`. `v_sale_team` lấy từ `nhan_su_sale.team`. Nếu `nhan_su_sale` có `"Inhouse 1"` nhưng `dingtalk_team_groups` lưu `"inhouse_1"` → silent skip (RAISE WARNING, không error). Luôn verify bằng: `SELECT DISTINCT team FROM nhan_su_sale` trước khi insert vào `dingtalk_team_groups`.

### DingTalk vs Zalo: global app credentials vs per-team token

DingTalk: 1 OAuth2 app (CLIENT_ID/SECRET) cho tất cả team, routing via `open_conversation_id`. Zalo: 1 OA access_token global, minting token mới = revoke token cũ ngay lập tức. Không bao giờ mint lại Zalo token khi không cần.

### `activation_urgent_reminder` sends to `OPS_GROUP_TEAM_CODE = "Inhouse 2"` only

Hardcode ở `activation_routes.py:37`. Nếu `"Inhouse 2"` không có trong `dingtalk_team_groups` với `is_active=true` → silent skip.

### DB triggers reuse Zalo message builder functions

`fn_payment_paid_dingtalk_notify()` và `fn_course_activated_dingtalk_notify()` call `build_payment_paid_message` và `build_course_activated_message` — Postgres functions từ Zalo migration (`2026-06-23-zalo-oa-tables.sql`). Fresh DB: apply Zalo migration trước.

### FE tabs có cặp desktop/mobile

`DingTalkGroupsTab.tsx` + `DingTalkGroupCards.tsx`, `DingTalkOutboxTab.tsx` + `DingTalkOutboxCards.tsx`. Sửa column/field phải sửa cả hai.

### DingTalk tabs NOT in PRELOAD_MAP

`MainPage.tsx` PRELOAD_MAP không gồm `dingtalkConfig/Groups/Outbox` — lazy load on first navigation, không preload on hover.

---

## Volatile facts (as of 2026-07-11)

- **Worker retry constants**: `MAX_RETRIES=4`, `RETRY_DELAYS=[30, 120, 300, 900]` s, `POLL_INTERVAL=30` s, `BATCH_SIZE=20`. Re-verify: `grep -n "MAX_RETRIES\|RETRY_DELAYS\|POLL_INTERVAL" backend/dingtalk_outbox_worker.py`
- **Allowed event types**: `payment_paid`, `course_activated`, `activation_urgent_reminder`. Re-verify: `grep -A 6 "event_type_check" backend/migrations/2026-06-26-dingtalk-tables.sql`
- **OPS_GROUP_TEAM_CODE**: `"Inhouse 2"`. Re-verify: `grep "OPS_GROUP_TEAM_CODE" backend/activation_routes.py`
- **Worker startup**: gated by `DINGTALK_WORKER_ENABLED=true` in `backend/main.py` (~line 1367–1382). Re-verify: `grep -n "DINGTALK_WORKER_ENABLED" backend/main.py`
- **Dead-row guard**: present in worker. Re-verify: `grep -n "retries.is.null\|retries.lt" backend/dingtalk_outbox_worker.py`
- **Group mapping**: 3 rows in `dingtalk_team_groups` (Inhouse 1, Inhouse 2, HN Offline Store). Re-verify: `SELECT team_code, is_active FROM dingtalk_team_groups;`

---

## Validation loop

Run gates cheapest-first. Stop at first failure.

**Tier 1 — always (seconds):**
- If FE touched: `cd frontend && npx tsc -b`.
- Verify worker constants: `grep -n "MAX_RETRIES\|RETRY_DELAYS\|POLL_INTERVAL" backend/dingtalk_outbox_worker.py`
- Dead-row guard present: `grep -n "retries.is.null\|retries.lt" backend/dingtalk_outbox_worker.py`
- team_code match: `SELECT DISTINCT team FROM nhan_su_sale ORDER BY team` vs `SELECT team_code FROM dingtalk_team_groups` — phải là superset.

**Tier 2 — khi sửa worker, credentials, hoặc group mapping:**
- Test send từ Cấu hình tab (sandbox). `processQueryKey` non-empty = success.
- Verify `open_conversation_id` không bị trả về trong GET `/api/v1/admin/dingtalk-groups` response — check response body.
- Sau khi update `open_conversation_id`, chờ 30s + check outbox next row có `sent_at` không null.

**Tier 3 — trước merge/deploy:**
- New `event_type` CHECK migration: apply sandbox, INSERT test row, verify no constraint error.
- Zalo migration applied trước DingTalk migration trên fresh DB.

**Loop budget:** cùng 1 gate fail 2 lần liên tiếp → STOP, báo output thật cho user, chờ.
