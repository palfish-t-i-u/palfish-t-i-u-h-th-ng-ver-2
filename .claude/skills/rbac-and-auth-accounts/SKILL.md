---
name: rbac-and-auth-accounts
description: Covers RBAC roles, sub-team data scoping, JWT verification path, SYSTEM_ADMIN_EMAILS bypass, the is_activated signup gate, admin activation runbook, backfill script, and how to add a permission key to the dynamic permissions matrix. Use when implementing or debugging access control, onboarding a new user, adding a new module permission key, or investigating a 403 error.
---

## Overview

The app enforces a 4-level role hierarchy plus an orthogonal activation gate. Every authenticated request passes through `resolve_actor()` in `backend/rbac.py`, which:

1. Extracts the Bearer token from the `Authorization` header.
2. Calls Supabase `/auth/v1/user` (synchronous httpx, 15 s timeout) to get the user's JWT metadata.
3. Queries `nhan_su_sale` by email to get the canonical role from the database.
4. Checks `is_activated` from JWT metadata; if false and not bypassed, returns HTTP 403.
5. Returns an `Actor` dataclass used throughout every route.

**Role hierarchy** (`ROLE_RANK` in `backend/rbac.py`):

| Role    | Rank | Notes |
|---------|------|-------|
| sale    | 1    | Default for any unknown role string |
| ops     | 2    | Orthogonal to leader — same rank, different scope semantics |
| leader  | 2    | Scoped to own team + sub_team |
| manager | 3    | Scoped to own team (all sub_teams) |
| system  | 4    | Full access; `admin` in JWT/DB is normalized to `system` |

The string `"admin"` in either JWT `user_metadata.role` or `nhan_su_sale.role` is normalized to `"system"` by `_normalize_role()`. Any unrecognized string normalizes to `"sale"`.

---

## When to use / When NOT to use

**Use when:**
- Implementing a new route and deciding which `require_min_role()` / `require_module_access()` call to add.
- An unactivated user reports seeing a bare 403 on first login.
- Onboarding a new environment (running the backfill script on a fresh Supabase project).
- Adding a new permission key to the dynamic matrix (new module/tab).
- Debugging a permission issue where a user has the wrong role or unexpected access.

**Do NOT use for:**
- Payment or SePay reconciliation logic (see B2 skill).
- Google Sheets import or CRM sync auth (separate skills).
- Zalo/DingTalk outbox worker (separate skills).

---

## Ground truth

### Key files (repo-relative paths)

| File | Purpose |
|------|---------|
| `backend/rbac.py` | `Actor` dataclass, `resolve_actor()`, `ROLE_RANK`, `enforce_report_scope()`, `scope_sale_names()`, `visible_creator_emails()` |
| `backend/admin_routes.py` | `_compute_permissions()`, `require_module_write()`, `require_module_access()`, `MODULE_LIST`, `DEFAULT_DEPT_PERMISSIONS`, `/me`, `/admin/auth-users` CRUD |
| `backend/migrate_activate_existing_users.py` | One-shot backfill script (sets `is_activated` on all existing Supabase Auth users) |
| `frontend/src/hooks/useAuth.tsx` | Sets `is_activated: false` on every `signUp` call (line 137) |
| `frontend/src/hooks/useMe.tsx` | Reads `is_activated` from `user_metadata` to surface it in `profile` |
| `frontend/src/components/auth/AccountDetailDrawer.tsx` | Admin toggle for `is_activated` per user |
| `frontend/src/components/auth/AuthAccountsTab.tsx` | `/admin/auth-users` list + CRUD UI |
| `frontend/src/components/permissions/PermissionsTab.tsx` | Dynamic RBAC matrix UI |
| `frontend/src/types/permissions.ts` | `MODULE_LIST`, `DEPARTMENT_LIST`, `DEFAULT_PERMISSIONS` (FE-side constants) |

### DB tables

| Table | Purpose |
|-------|---------|
| `nhan_su_sale` | Canonical staff roster: `email`, `role`, `team`, `sub_team`, `crm_name`, `is_active`, `manager_email`, `leader_email` |
| `department_permissions` | Dynamic matrix rows: `department`, `module_key`, `access_level`, `min_role` |
| `permission_overrides` | Per-user overrides: `user_email`, `module_key`, `access_level` |

`is_activated` is NOT a DB column — it lives exclusively in Supabase Auth `user_metadata`.

### Env vars (names only)

| Var | Purpose |
|-----|---------|
| `SYSTEM_ADMIN_EMAILS` | Comma-separated emails that bypass `is_activated` check and always get `role=system` if not found in `nhan_su_sale` |
| `OPS_EMAILS` | Comma-separated emails that gain `can_confirm_payment` without needing `ops` role |
| `SUPABASE_URL` | Used by `_auth_user_from_jwt()` to call `/auth/v1/user` |
| `SUPABASE_SERVICE_ROLE_KEY` | Must start with `sb_secret_` (legacy `eyJ` keys disabled 2026-06-16) |

---

## Procedures

### 1. JWT verification path

Every route that needs auth calls:

```python
actor = resolve_actor(sb, authorization)
# or, for endpoints that must work before activation:
actor = resolve_actor(sb, authorization, allow_unactivated=True)
```

`resolve_actor()` flow in `backend/rbac.py`:

1. `_extract_bearer(authorization)` → strips `Bearer ` prefix.
2. `_auth_user_from_jwt(token)` → `GET {SUPABASE_URL}/auth/v1/user` with `Authorization: Bearer <token>` + `apikey: <SERVICE_KEY>`. Returns user dict or `None`.
3. `_lookup_staff(sb, email)` → queries `nhan_su_sale`. DB role overrides JWT role.
4. Activation gate: if `is_activated != True` AND email not in `SYSTEM_ADMIN_EMAILS` AND role != `"system"` AND `allow_unactivated=False` → raise HTTP 403 `"Tài khoản chưa được kích hoạt. Vui lòng liên hệ admin."`.

Routes that currently pass `allow_unactivated=True`: `GET /me`, `PATCH /me`, and the final read in `PATCH /me` (three call-sites in `admin_routes.py` around lines 514, 523, 563).

### 2. Activation gate: what happens on new signup

Both email/password and Google OAuth signups:
- Email signup: `useAuth.tsx` explicitly sets `data: { ...meta, is_activated: false }` on `supabase.auth.signUp()`.
- Google OAuth: no `user_metadata` is set at OAuth time, so `is_activated` defaults to falsy.

In both cases `resolve_actor()` will return HTTP 403 on the first real API call. The user sees the message `"Tài khoản chưa được kích hoạt. Vui lòng liên hệ admin."` There is no "pending activation" UI — users get a raw error until an admin activates them.

Exception: emails listed in `SYSTEM_ADMIN_EMAILS` are never blocked regardless of `is_activated`.

### 3. Admin activation runbook

1. Navigate to the app → sidebar → **Tài khoản Auth** (requires `system` role or `authAccounts=full` permission).
2. Find the user in the list. The `isActivated` column shows current status.
3. Open the user's detail drawer (click the row).
4. **Before activating a Sale-department account:** link their CRM name first. The PATCH endpoint enforces: `is_activated=true` on a sale-department account without a linked `crm_name` → HTTP 400 `"Cần liên kết CRM ... trước khi kích hoạt tài khoản"`.
5. Toggle the "Kích hoạt" switch → calls `PATCH /admin/auth-users/{user_id}` with `{ is_activated: true }`.
6. The endpoint writes `is_activated: true` into Supabase Auth `user_metadata` via `sb.auth.admin.update_user_by_id()`.

API requirements for `PATCH /admin/auth-users/{user_id}`:
- Caller must have `role >= system` (`require_min_role(actor, "system")`).
- Body schema: `AuthUserPatchBody` (any combination of `is_activated`, `role`, `crmName`, `banned`, etc.).

### 4. Backfill script for existing users

Run this once when adding the activation gate to a new environment (or after a sandbox DB reset):

```bash
cd backend
# Dry-run first — prints planned changes without writing
python migrate_activate_existing_users.py

# Apply when satisfied
python migrate_activate_existing_users.py --apply
```

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`.

Tiers applied:
- **Tier A** — email in `SYSTEM_ADMIN_EMAILS` → `is_activated=True`
- **Tier B** — email linked in `nhan_su_sale` (has a non-empty `crm_name`) → `is_activated=True`
- **Tier C** — everyone else → `is_activated=False` (explicit, for consistency)

Users whose current value already matches the target tier are skipped.

### 5. Sub-team data scoping

`enforce_report_scope(actor, requested_team)` returns `(team_filter, sub_team_filter)`:

| Role | team_filter | sub_team_filter |
|------|------------|----------------|
| system / ops | requested_team (or None) | None |
| manager | actor's team (hard-forced) | None (all sub-teams) |
| leader / sale | actor's team (hard-forced) | actor's sub_team |

If a manager or leader/sale account has no `team` in `nhan_su_sale`, the function raises HTTP 403 — the account must be linked first.

`visible_creator_emails(sb, actor)` returns the set of `email` values in `nhan_su_sale` visible to the actor for filtering `don_hang.created_by`:
- `system` / `ops` → `None` (= all)
- `sale` → `[actor.email]`
- `leader` → emails in same team + sub_team
- `manager` → emails in same team

### 6. Adding a new permission key to the dynamic matrix

Both the backend and frontend must be updated in lockstep.

**Step 1 — Backend (`backend/admin_routes.py`)**

Add the new key to `MODULE_LIST` (around line 143):
```python
MODULE_LIST = [
    ...
    "your_new_module_key",   # <-- add here
]
```

Add defaults for every department in `DEFAULT_DEPT_PERMISSIONS` (same file, around line 168). You must set a value for all four departments (`sale`, `hr`, `marketing`, `cs`) or `_compute_permissions()` will return `"none"` for unspecified departments:
```python
DEFAULT_DEPT_PERMISSIONS = {
    "sale": { ..., "your_new_module_key": "none" },
    "hr":   { ..., "your_new_module_key": "full" },
    ...
}
```

**Step 2 — Frontend (`frontend/src/types/permissions.ts`)**

Add the module to `MODULE_LIST` with a label, description, and section:
```typescript
export const MODULE_LIST: ModuleDef[] = [
  ...
  { key: "your_new_module_key", label: "Display Name", description: "Short description", section: "Section Name" },
];
```

Add the key to `DEFAULT_PERMISSIONS` for all four departments:
```typescript
export const DEFAULT_PERMISSIONS = {
  sale: { ..., your_new_module_key: "none" },
  hr:   { ..., your_new_module_key: "full" },
  ...
};
```

**Step 3 — Seed the DB**

After deploying, visit the Permissions tab in the app. If `department_permissions` rows are missing, the tab auto-calls `POST /admin/permissions/seed`. Alternatively call it directly:
```bash
curl -X POST https://<app-url>/admin/permissions/seed \
  -H "Authorization: Bearer <system-token>"
```

**Step 4 — Protect the route**

In the new route handler, call:
```python
require_module_access(sb, actor, "your_new_module_key")   # read or full
# or
require_module_write(sb, actor, "your_new_module_key")    # full only
```

Note: the FE `MODULE_LIST` in `permissions.ts` currently does NOT include `permissions` or `dingtalk` as entries (as of 2026-07-04), while the BE `MODULE_LIST` in `admin_routes.py` does. These two lists are not guaranteed in sync — always check both when adding a new key.

---

## Gotchas & past incidents

- **Google OAuth gets `is_activated=false` too.** Unlike email signup (which explicitly sets the flag), Google OAuth arrives with no `is_activated` in metadata. The result is the same: user gets HTTP 403 on first API call. There is no "pending activation" UI message for Google users — they see the same bare 403 as email users. No auto-activation exists for OAuth signups.

- **`allow_unactivated=True` is rare.** Only `GET /me`, `PATCH /me`, and the internal re-read in `PATCH /me` use it. All other routes block unactivated users. Do not add `allow_unactivated=True` to new routes without explicit product approval.

- **CRM link required before activating sale accounts.** `PATCH /admin/auth-users/{id}` with `is_activated=true` raises HTTP 400 if the account has `department=sale` (or no department) and no CRM name is linked. The admin must first set `crmName` in the same PATCH call or in a prior call.

- **Unlink CRM auto-deactivates.** When `PATCH /admin/auth-users/{id}` is called with the unlink-CRM signal, the handler forcibly sets `is_activated=False` (line 867 in `admin_routes.py`). This is intentional.

- **`nhan_su_sale.role` overrides JWT role.** If a staff row exists in `nhan_su_sale`, its `role` column wins over `user_metadata.role`. If the DB row is stale (wrong role), the fix is to update `nhan_su_sale`, not the JWT metadata.

- **FE and BE `MODULE_LIST` can diverge.** The BE list (`admin_routes.py:143`) contains `permissions` and `dingtalk`; the FE list (`permissions.ts:44`) does not include those two as of 2026-07-04. The FE only renders what is in its own `MODULE_LIST`. Always update both files when adding a key.

- **`department_permissions` table miss on sandbox reset.** If sandbox DB is reset, the `department_permissions` and `permission_overrides` tables must be recreated (migration replay). The PermissionsTab auto-seeds rows only if the tables exist and are empty.

---

## Volatile facts

- **`SYSTEM_ADMIN_EMAILS` value** (as of 2026-07-04): do not hardcode. Re-verify with:
  ```bash
  # On Render dashboard → Environment for the target service
  # Or locally:
  grep SYSTEM_ADMIN_EMAILS backend/.env
  ```

- **Supabase key format** (as of 2026-07-04): `sb_secret_*` or `sb_publishable_*` only. Legacy `eyJ...` keys were disabled globally on 2026-06-16. The `/healthz` endpoint validates this at startup. Re-verify:
  ```bash
  curl https://<app-url>/healthz | python -m json.tool
  # expect "key_looks_valid": true
  ```

- **`allow_unactivated` route list** (as of 2026-07-04): exactly 3 call-sites in `admin_routes.py` (lines ~514, ~523, ~563). Re-verify:
  ```bash
  grep -n "allow_unactivated=True" backend/admin_routes.py
  ```

- **FE `MODULE_LIST` vs BE `MODULE_LIST` sync status** (as of 2026-07-04): check both after any new module is added:
  ```bash
  grep -A1 '"key":' frontend/src/types/permissions.ts | grep key
  grep -E '^\s+"[a-zA-Z]' backend/admin_routes.py | grep -A30 'MODULE_LIST'
  ```

---

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
```bash
cd frontend && npx tsc -b
# Verify FE and BE MODULE_LIST stay in sync after any new key
grep -c '"key":' frontend/src/types/permissions.ts
grep -n "allow_unactivated=True" backend/admin_routes.py
```

**Tier 2 — when touching RBAC routes or permission keys:**
```bash
# Backend: targeted pytest for the auth/RBAC file changed
python -m pytest backend/tests/test_audit_auth.py -v   # from repo root

# Frontend: RBAC visibility E2E spec (tests sidebar gating per role)
cd frontend && npx playwright test e2e/rbac-visibility.spec.ts
```
Do not run `npm run e2e:rbac` (all 3 role projects) at Tier 2 — use the single spec.

**Tier 3 — before merge/deploy only:**
```bash
python -m pytest backend/tests/ -v           # full pytest from repo root
cd frontend && npm run e2e:rbac              # all 3 role-gating projects
cd frontend && npm run build                 # confirm no TS regressions
```

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** filter pytest output — `2>&1 | grep -E "FAILED|ERROR|passed|failed"` — instead of dumping the full verbose log into context.
