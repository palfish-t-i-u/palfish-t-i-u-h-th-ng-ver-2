# Unified Permission System — Design Spec

**Date:** 2026-06-05
**Status:** Approved

## Problem

The app has two disconnected permission systems that contradict each other:

1. **Permission matrix** (frontend only): `department_permissions` table maps department x module to access_level (full/read/none). Frontend uses this to show/hide sidebar items and action buttons. Backend does not check it.

2. **Hardcoded role checks** (backend only): `_require_ops()`, `_require_bc03_actor()`, `require_min_role()` in Python code. Frontend does not know about these.

This causes three concrete bugs:

- **BC01/BC02/BC03 show in sidebar but return 403.** Matrix says "Bán hàng x BC01 = Chỉ xem" so frontend shows the menu item. But backend calls `_require_ops()` which only allows system/ops roles — sales leaders get a 403 error.

- **No way to differentiate sale vs leader within a department.** The matrix has no role dimension. Setting "Bán hàng x BC01 = Chỉ xem" applies to ALL sales users equally — no way to say "only leaders and above."

- **Role system (User/Leader/Admin) is disconnected.** The 3-tier role set in Tài khoản Auth affects data scope (which orders you see) and some hardcoded gates, but the permission matrix ignores it entirely.

## Solution

Add a **"Phạm vi" (scope)** dimension to each cell in the permission matrix. Each cell stores both the access level AND the minimum role required.

### Data Model

Add one column to `department_permissions`:

```sql
ALTER TABLE department_permissions
  ADD COLUMN min_role TEXT NOT NULL DEFAULT 'sale';
```

Valid values: `sale` (everyone) | `leader` (leader and above) | `manager` (admin only).

Default `'sale'` ensures backward compatibility — all existing cells keep their current behavior.

`permission_overrides` table is unchanged. Personal overrides bypass min_role (highest priority).

### Priority Order (unchanged)

```
1. Permission override (per email)      — highest, ignores min_role
2. Department permission + min_role check
3. Hardcode defaults (fallback)          — lowest
```

## Backend Changes

### New function: `require_module_access(actor, module_key)`

Replaces all hardcoded permission checks for module access. Reads the permission matrix and checks both access_level and min_role.

### `_compute_permissions()` change

When computing effective permissions for `/me`, add a min_role check:

```
1. Determine department (e.g., "sale")
2. Read matrix: sale x bc01 = (read, leader)
3. Compare role: user.role="sale" < min_role="leader" → downgrade to "none"
4. Check override: no override for this email → keep "none"
5. Return to frontend: { bc01: "none" }
```

Frontend receives the same shape `{ module: access_level }` as before. No frontend components need changes except PermissionsTab.

### Hardcode replacements

| Endpoint | Current check | New check |
|---|---|---|
| GET `/revenue/pivot/sales-performance` | `_require_ops(actor)` | `require_module_access(actor, "bc01")` |
| GET `/revenue/pivot/key-data` | `_require_ops(actor)` | `require_module_access(actor, "bc02")` |
| GET `/revenue/pivot` | `_require_ops(actor)` | `require_module_access(actor, "bc01")` |
| GET `/revenue/ledger` | `_require_ops(actor)` | `require_module_access(actor, "revenueLedger")` |
| GET `/revenue/ledger/summary` | `_require_ops(actor)` | `require_module_access(actor, "revenueLedger")` |
| POST `/revenue/ledger` | `_require_ops(actor)` | `require_module_write(actor, "revenueLedger")` |
| PATCH `/revenue/ledger/{id}` | `_require_ops(actor)` | `require_module_write(actor, "revenueLedger")` |
| DELETE `/revenue/ledger/{id}` | `_require_ops(actor)` | `require_module_write(actor, "revenueLedger")` |
| POST `/revenue/ledger/backfill-b3` | `_require_ops(actor)` | `require_module_write(actor, "revenueLedger")` |
| POST `/revenue/ledger/sync-gsheet` | `_require_ops(actor)` | `require_module_write(actor, "revenueLedger")` |
| GET/POST `/report/bc03/*` | `_require_bc03_actor(actor)` | `require_module_access(actor, "bc03")` |

### Hardcodes that stay

These are system-level operations, not module access:

- `require_min_role("system")` — admin routes (manage accounts, seed data, edit permission matrix)
- `require_min_role("manager")` — CRM admin, bulk delete accounts
- `visible_creator_emails()` — data scope (sale sees own orders, leader sees team)

## Frontend Changes

### Only `PermissionsTab.tsx` changes

All other components (`usePermission()`, `useMe()`, sidebar, action buttons) receive the final computed permission from backend — same shape as before, no changes needed.

### UI: permission cell

Each cell in the matrix gets a scope dropdown below the access level:

```
+------------------+     +------------------+     +------------------+
|  V Toan quyen    |     |  * Chi xem       |     |  X Khong co quyen|
|  Tat ca v        |     |  Tu Leader v     |     |                  |
+------------------+     +------------------+     +------------------+
```

- Top: click to cycle access level (unchanged behavior)
- Bottom: dropdown to select scope (Tat ca / Tu Leader / Chi Admin)
- When access_level = "none": dropdown hidden (not relevant)

### UI: legend update

Current legend row has 3 badges. Add a second row for scope:

```
Chu giai:  [V Toan quyen]  [* Chi xem]  [X Khong co quyen]
Pham vi:   [Tat ca]  [Tu Leader]  [Chi Admin]
```

Each badge in the legend has a tooltip explaining its meaning in business terms:

**Access level tooltips:**
- Toan quyen: "Nguoi dung duoc xem du lieu va thuc hien moi thao tac trong module nay (tao, sua, xoa)"
- Chi xem: "Nguoi dung chi duoc xem du lieu, khong the tao moi, chinh sua hoac xoa"
- Khong co quyen: "Module nay bi an hoan toan — nguoi dung khong thay tren thanh menu va khong truy cap duoc"

**Scope tooltips:**
- Tat ca: "Tat ca nguoi dung trong bo phan deu duoc huong quyen nay, bao gom User, Leader va Admin"
- Tu Leader: "Chi Leader va Admin trong bo phan duoc huong quyen nay. User (nhan vien thuong) se khong thay module nay"
- Chi Admin: "Chi Admin (quan ly cap cao) trong bo phan duoc huong quyen nay. User va Leader deu khong thay"

### API change

PATCH `/admin/permissions` request body adds `min_role`:

```json
{ "department": "sale", "module_key": "bc01", "access_level": "read", "min_role": "leader" }
```

GET `/admin/permissions` response includes `min_role` for each row.

## Migration

### Database

One ALTER TABLE statement. Default value ensures backward compatibility.

### Suggested initial configuration

After deploy, admin should set these based on current business rules:

| Cell | Access | min_role | Business reason |
|---|---|---|---|
| sale x bc01 | read | leader | Sales performance report — team leads track performance |
| sale x bc02 | read | leader | Key data report — leaders analyze pipeline |
| sale x bc03 | read | leader | Summary report — management level |
| sale x revenueLedger | full | manager | Revenue ledger — only Thu Hien / senior management operates |

All other cells keep min_role = "sale" (everyone).

### Rollback

Column `min_role` defaults to `'sale'`. To rollback: backend ignores the column → original behavior restored. No data deletion needed.

## Out of Scope

- Data scope (which orders a user sees) — stays hardcoded in `visible_creator_emails()`
- Admin-level system routes — stay gated by `require_min_role("system"/"manager")`
- `permission_overrides` table — no schema change
