# Unified Permission System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the frontend permission matrix and backend hardcoded role checks into a single source of truth by adding a `min_role` scope to each permission cell.

**Architecture:** Add `min_role` column to `department_permissions` table. Backend `_compute_permissions()` checks min_role against actor.role and downgrades access to "none" when the role is insufficient. All hardcoded `_require_ops()` and `_require_bc03_actor()` calls are replaced with matrix-based `require_module_access()`. Frontend PermissionsTab adds a scope dropdown to each cell.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript (frontend), Supabase Postgres (DB)

**Constraint:** No TDD — implement directly, verify with manual testing and existing test suite.

---

### Task 1: Database migration — add `min_role` column

**Files:**
- Create: `docs/migrations/2026-06-05-add-min-role.sql`

This migration adds the `min_role` column to `department_permissions` on both production and sandbox Supabase instances. Default `'sale'` preserves current behavior.

- [ ] **Step 1: Create migration SQL file**

```sql
-- Add min_role column to department_permissions
-- Valid values: 'sale' (all users), 'leader' (leader+admin), 'manager' (admin only)
-- Default 'sale' = backward compatible (all roles get the permission)
ALTER TABLE department_permissions
  ADD COLUMN IF NOT EXISTS min_role TEXT NOT NULL DEFAULT 'sale';
```

Save to `docs/migrations/2026-06-05-add-min-role.sql`.

- [ ] **Step 2: Apply migration to sandbox Supabase**

Run via Supabase MCP `execute_sql` on project `pxgybyfiwywksesyogti` (palfish-gmv-sandbox):

```sql
ALTER TABLE department_permissions
  ADD COLUMN IF NOT EXISTS min_role TEXT NOT NULL DEFAULT 'sale';
```

- [ ] **Step 3: Apply migration to production Supabase**

Run via Supabase MCP `execute_sql` on project `jozcvbbypwvzaefteoxn` (project_palfish):

```sql
ALTER TABLE department_permissions
  ADD COLUMN IF NOT EXISTS min_role TEXT NOT NULL DEFAULT 'sale';
```

- [ ] **Step 4: Verify column exists on both**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'department_permissions' AND column_name = 'min_role';
```

Expected: one row with `data_type = 'text'`, `column_default = 'sale'`.

- [ ] **Step 5: Commit**

```bash
git add docs/migrations/2026-06-05-add-min-role.sql
git commit -m "db: add min_role column to department_permissions"
```

---

### Task 2: Backend — add `require_module_access()` and update `_compute_permissions()`

**Files:**
- Modify: `backend/admin_routes.py:208-263` (`_compute_permissions`, `require_module_write`)

This is the core backend change. Two things happen:
1. `_compute_permissions()` reads `min_role` from DB and downgrades access when actor's role is insufficient
2. A new `require_module_access()` function replaces hardcoded checks

- [ ] **Step 1: Import `_rank` in admin_routes.py**

At the top of `backend/admin_routes.py`, the existing import line:

```python
from rbac import (
    Actor,
    resolve_actor,
    require_min_role,
```

Add `_rank` to this import (it's already exported from rbac.py). Find the existing `from rbac import` block and add `_rank` to it.

- [ ] **Step 2: Add `ROLE_RANK` constant**

After the `ACCESS_LEVELS` constant (line 111 in `admin_routes.py`), add:

```python
VALID_MIN_ROLES = {"sale", "leader", "manager"}
```

- [ ] **Step 3: Update `_compute_permissions()` to read and apply `min_role`**

Replace the current `_compute_permissions()` function (lines 208-254) with:

```python
def _compute_permissions(sb, actor) -> dict[str, str]:
    if actor.role == "system" or actor.email.lower() in _system_admin_emails():
        return _permissions_with_level("full")

    department = _actor_department(actor)
    if not department:
        return _permissions_with_level("none")

    permissions = _permissions_with_level("none")
    defaults = DEFAULT_DEPT_PERMISSIONS.get(department, {})
    for module_key, access_level in defaults.items():
        if module_key in permissions and access_level in ACCESS_LEVELS:
            permissions[module_key] = access_level

    # Read department permissions from DB (includes min_role)
    min_roles: dict[str, str] = {}
    try:
        res = (
            sb.table("department_permissions")
            .select("module_key, access_level, min_role")
            .eq("department", department)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(500, f"Khong tai duoc phan quyen: {exc}") from exc

    for row in res.data or []:
        module_key = row.get("module_key")
        access_level = row.get("access_level")
        if module_key in permissions and access_level in ACCESS_LEVELS:
            permissions[module_key] = access_level
        mr = row.get("min_role", "sale")
        if mr in VALID_MIN_ROLES:
            min_roles[module_key] = mr

    # Downgrade access when actor's role is below min_role
    actor_rank = _rank(actor.role)
    for module_key, mr in min_roles.items():
        if actor_rank < _rank(mr):
            permissions[module_key] = "none"

    # Personal overrides take priority — bypass min_role
    try:
        overrides = (
            sb.table("permission_overrides")
            .select("module_key, access_level")
            .eq("user_email", actor.email.lower())
            .execute()
        )
        for row in overrides.data or []:
            mk = row.get("module_key")
            al = row.get("access_level")
            if mk in permissions and al in ACCESS_LEVELS:
                permissions[mk] = al
    except Exception:
        pass

    return permissions
```

- [ ] **Step 4: Add `require_module_access()` function**

After `require_module_write()` (around line 263), add:

```python
def require_module_access(sb, actor, module_key: str) -> str:
    """Check actor has at least 'read' on module_key. Returns the access level."""
    perms = _compute_permissions(sb, actor)
    level = perms.get(module_key, "none")
    if level == "none":
        raise HTTPException(403, f"Bạn không có quyền truy cập module này")
    return level
```

- [ ] **Step 5: Update `get_admin_permissions` endpoint to return `min_role`**

Replace the `get_admin_permissions` function (around line 968):

```python
@app.get("/admin/permissions")
def get_admin_permissions(authorization: str | None = Header(None)):
    sb = _sb_or_503(get_supabase)
    actor = resolve_actor(sb, authorization)
    require_min_role(actor, "system")

    res = sb.table("department_permissions").select("*").execute()
    matrix: dict[str, dict[str, str]] = {}
    min_roles: dict[str, dict[str, str]] = {}
    for dept in VALID_DEPARTMENTS:
        matrix[dept] = {mod: "none" for mod in MODULE_LIST}
        min_roles[dept] = {mod: "sale" for mod in MODULE_LIST}
    for r in res.data or []:
        dept = r["department"]
        if dept in matrix:
            matrix[dept][r["module_key"]] = r["access_level"]
            min_roles[dept][r["module_key"]] = r.get("min_role", "sale")
    return {"matrix": matrix, "minRoles": min_roles}
```

- [ ] **Step 6: Update `patch_admin_permissions` endpoint to accept `min_role`**

First update the `PermissionPatchBody` model (around line 83):

```python
class PermissionPatchBody(BaseModel):
    department: str
    module_key: str
    access_level: str
    min_role: str = "sale"
```

Then update the `patch_admin_permissions` function (around line 984):

```python
@app.patch("/admin/permissions")
def patch_admin_permissions(body: PermissionPatchBody, authorization: str | None = Header(None)):
    sb = _sb_or_503(get_supabase)
    actor = resolve_actor(sb, authorization)
    require_min_role(actor, "system")

    if body.access_level not in ("none", "read", "full"):
        raise HTTPException(400, "Invalid access level")
    mr = body.min_role if body.min_role in VALID_MIN_ROLES else "sale"

    sb.table("department_permissions").upsert({
        "department": body.department.strip(),
        "module_key": body.module_key.strip(),
        "access_level": body.access_level,
        "min_role": mr,
    }, on_conflict="department, module_key").execute()

    return {"ok": True}
```

- [ ] **Step 7: Commit**

```bash
git add backend/admin_routes.py
git commit -m "feat(rbac): add require_module_access and min_role to permission matrix"
```

---

### Task 3: Backend — replace hardcoded checks in `revenue_routes.py`

**Files:**
- Modify: `backend/revenue_routes.py`

Replace all 10 `_require_ops(actor)` calls with `require_module_access()` or `require_module_write()` from `admin_routes.py`.

- [ ] **Step 1: Add import**

At the top of `backend/revenue_routes.py`, add to the imports:

```python
from admin_routes import require_module_access, require_module_write
```

If there's already a `from admin_routes import ...` line, add these to it.

- [ ] **Step 2: Replace `_require_ops(actor)` in read endpoints**

Find and replace each occurrence:

| Line | Endpoint | Old | New |
|---|---|---|---|
| ~1278 | `list_ledger` | `_require_ops(actor)` | `require_module_access(sb, actor, "revenueLedger")` |
| ~1336 | `ledger_summary` | `_require_ops(actor)` | `require_module_access(sb, actor, "revenueLedger")` |
| ~1479 | `revenue_pivot_sales_performance` | `_require_ops(actor)` | `require_module_access(sb, actor, "bc01")` |
| ~1502 | `revenue_pivot_key_data` | `_require_ops(actor)` | `require_module_access(sb, actor, "bc02")` |
| ~1526 | `revenue_pivot` | `_require_ops(actor)` | `require_module_access(sb, actor, "bc01")` |

- [ ] **Step 3: Replace `_require_ops(actor)` in write endpoints**

| Line | Endpoint | Old | New |
|---|---|---|---|
| ~1355 | `create_ledger` | `_require_ops(actor)` | `require_module_write(sb, actor, "revenueLedger")` |
| ~1406 | `patch_ledger` | `_require_ops(actor)` | `require_module_write(sb, actor, "revenueLedger")` |
| ~1454 | `delete_ledger` | `_require_ops(actor)` | `require_module_write(sb, actor, "revenueLedger")` |
| ~1603 | `backfill_ledger_b3` | `_require_ops(actor)` | `require_module_write(sb, actor, "revenueLedger")` |
| ~1612 | `sync_ledger_from_gsheet` | `_require_ops(actor)` | `require_module_write(sb, actor, "revenueLedger")` |

Note: `require_module_write` already exists in `admin_routes.py` but its signature is `require_module_write(sb, actor, module_key)`. The existing version calls `_compute_permissions(sb, actor)` which now includes min_role logic.

- [ ] **Step 4: Remove the local `_require_ops` function**

Delete the `_require_ops` function at line 159-161 of `revenue_routes.py`:

```python
# DELETE THIS:
def _require_ops(actor) -> None:
    if not can_confirm_payment(actor):
        raise HTTPException(403, "Chỉ Thu Hiền / System được thao tác Sổ doanh thu")
```

- [ ] **Step 5: Commit**

```bash
git add backend/revenue_routes.py
git commit -m "feat(rbac): replace _require_ops with matrix-based access checks in revenue routes"
```

---

### Task 4: Backend — replace hardcoded checks in `report_routes.py`

**Files:**
- Modify: `backend/report_routes.py`

Replace all `_require_bc03_actor(actor)` calls (4 occurrences) with `require_module_access()`.

- [ ] **Step 1: Add import**

At the top of `backend/report_routes.py`, add:

```python
from admin_routes import require_module_access
```

- [ ] **Step 2: Replace all `_require_bc03_actor(actor)` calls**

There are 4 occurrences at lines ~431, ~503, ~543, ~570. Replace each with:

```python
require_module_access(sb, actor, "bc03")
```

Note: `sb` should already be available in each endpoint function (check that `_sb()` or equivalent has been called before this line — it has, as each endpoint starts with `sb = _sb()`).

- [ ] **Step 3: Remove the local `_require_bc03_actor` function**

Delete at line 31-33:

```python
# DELETE THIS:
def _require_bc03_actor(actor) -> None:
    if not can_confirm_payment(actor) and actor.role.lower() not in ("manager", "leader"):
        raise HTTPException(403, "Chỉ Leader/Manager/Ops được thao tác BC03")
```

- [ ] **Step 4: Commit**

```bash
git add backend/report_routes.py
git commit -m "feat(rbac): replace _require_bc03_actor with matrix-based access in report routes"
```

---

### Task 5: Frontend — update `api.ts` and `permissions` types

**Files:**
- Modify: `frontend/src/lib/api.ts:399-403`
- Modify: `frontend/src/types/permissions.ts`

- [ ] **Step 1: Add `MinRole` type to permissions.ts**

At the top of `frontend/src/types/permissions.ts`, after the `AccessLevel` type (line 14):

```typescript
export type MinRole = "sale" | "leader" | "manager";

export const MIN_ROLE_LIST: { value: MinRole; label: string }[] = [
  { value: "sale", label: "Tất cả" },
  { value: "leader", label: "Từ Leader" },
  { value: "manager", label: "Chỉ Admin" },
];

export const MIN_ROLE_LABELS: Record<MinRole, string> = {
  sale: "Tất cả",
  leader: "Từ Leader",
  manager: "Chỉ Admin",
};
```

- [ ] **Step 2: Update `patchPermission` in api.ts**

Update the `patchPermission` type in `frontend/src/lib/api.ts` (around line 399):

```typescript
patchPermission: (body: {
  department: string;
  module_key: string;
  access_level: string;
  min_role?: string;
}) => api.patch("/admin/permissions", body),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/permissions.ts frontend/src/lib/api.ts
git commit -m "feat(types): add MinRole type and update patchPermission API"
```

---

### Task 6: Frontend — update PermissionsTab UI with scope dropdown and tooltips

**Files:**
- Modify: `frontend/src/components/permissions/PermissionsTab.tsx`
- Modify: `frontend/src/components/permissions/permissions.css`

- [ ] **Step 1: Add min_role state and loading to PermissionsTab**

In `PermissionsTab.tsx`, add imports at the top:

```typescript
import {
  MODULE_LIST,
  MODULE_SECTIONS,
  DEPARTMENT_LIST,
  DEFAULT_PERMISSIONS,
  ACCESS_LABELS,
  cycleAccessLevel,
  type AccessLevel,
  type MinRole,
  MIN_ROLE_LIST,
  MIN_ROLE_LABELS,
} from "../../types/permissions";
import Tooltip from "../ui/Tooltip";
```

Add a new state variable next to `matrix` state (around line 33):

```typescript
const [minRoles, setMinRoles] = useState<Record<string, Record<string, MinRole>>>(() => {
  const init: Record<string, Record<string, MinRole>> = {};
  for (const dept of DEPARTMENT_LIST) {
    init[dept.key] = {};
    for (const mod of MODULE_LIST) {
      init[dept.key][mod.key] = "sale";
    }
  }
  return init;
});
```

- [ ] **Step 2: Update `loadMatrix` to read `minRoles` from API**

Replace the `loadMatrix` callback (lines 39-58):

```typescript
const loadMatrix = useCallback(async () => {
  try {
    const res = await endpoints.admin.permissions();
    const remote = res.data.matrix as Record<string, Record<string, AccessLevel>>;
    const remoteMinRoles = (res.data.minRoles ?? {}) as Record<string, Record<string, MinRole>>;
    const isEmpty = !remote || Object.values(remote).every(
      (mods) => Object.values(mods).every((l) => l === "none")
    );
    if (isEmpty) {
      await endpoints.admin.seedPermissions();
      const seeded = await endpoints.admin.permissions();
      setMatrix(seeded.data.matrix as Record<string, Record<string, AccessLevel>>);
      if (seeded.data.minRoles) setMinRoles(seeded.data.minRoles as Record<string, Record<string, MinRole>>);
    } else {
      setMatrix(remote);
      if (remoteMinRoles && Object.keys(remoteMinRoles).length > 0) setMinRoles(remoteMinRoles);
    }
  } catch {
    // API error → use defaults
  } finally {
    setLoaded(true);
  }
}, []);
```

- [ ] **Step 3: Add `handleMinRoleChange` handler**

After the `handleCycle` function (around line 90), add:

```typescript
async function handleMinRoleChange(dept: string, moduleKey: string, newRole: MinRole) {
  if (!canManage) return;
  const prev = minRoles[dept]?.[moduleKey] ?? "sale";
  setMinRoles((old) => {
    const updated = structuredClone(old);
    updated[dept] = { ...updated[dept], [moduleKey]: newRole };
    return updated;
  });
  try {
    await endpoints.admin.patchPermission({
      department: dept,
      module_key: moduleKey,
      access_level: matrix[dept]?.[moduleKey] ?? "none",
      min_role: newRole,
    });
  } catch {
    setMinRoles((old) => {
      const reverted = structuredClone(old);
      reverted[dept] = { ...reverted[dept], [moduleKey]: prev };
      return reverted;
    });
  }
}
```

- [ ] **Step 4: Update `handleCycle` to pass current min_role**

Update the existing `handleCycle` function to also send `min_role` when cycling:

```typescript
async function handleCycle(dept: string, moduleKey: string) {
  if (!canManage) return;
  const current = matrix[dept]?.[moduleKey] ?? "none";
  const next = cycleAccessLevel(current);
  setMatrix((prev) => {
    const updated = structuredClone(prev);
    updated[dept] = { ...updated[dept], [moduleKey]: next };
    return updated;
  });
  try {
    await endpoints.admin.patchPermission({
      department: dept,
      module_key: moduleKey,
      access_level: next,
      min_role: minRoles[dept]?.[moduleKey] ?? "sale",
    });
  } catch {
    setMatrix((prev) => {
      const reverted = structuredClone(prev);
      reverted[dept] = { ...reverted[dept], [moduleKey]: current };
      return reverted;
    });
  }
}
```

- [ ] **Step 5: Update legend with tooltips and scope row**

Replace the legend section (lines 172-190) with:

```tsx
{/* Legend */}
<div className="pm-legend">
  <span className="pm-legend-label">Chú giải:</span>
  <Tooltip content="Người dùng được xem dữ liệu và thực hiện mọi thao tác trong module này (tạo, sửa, xóa)">
    <span className="pm-access-badge full" style={{ cursor: "default" }}>
      <AccessIcon level="full" /> {ACCESS_LABELS.full}
    </span>
  </Tooltip>
  <Tooltip content="Người dùng chỉ được xem dữ liệu, không thể tạo mới, chỉnh sửa hoặc xóa">
    <span className="pm-access-badge read" style={{ cursor: "default" }}>
      <AccessIcon level="read" /> {ACCESS_LABELS.read}
    </span>
  </Tooltip>
  <Tooltip content="Module này bị ẩn hoàn toàn — người dùng không thấy trên thanh menu và không truy cập được">
    <span className="pm-access-badge none" style={{ cursor: "default" }}>
      <AccessIcon level="none" /> {ACCESS_LABELS.none}
    </span>
  </Tooltip>
  <span className="pm-legend-hint">— Click ô để xoay vòng quyền</span>
</div>
<div className="pm-legend">
  <span className="pm-legend-label">Phạm vi:</span>
  <Tooltip content="Tất cả người dùng trong bộ phận đều được hưởng quyền này, bao gồm User, Leader và Admin">
    <span className="pm-scope-badge sale" style={{ cursor: "default" }}>Tất cả</span>
  </Tooltip>
  <Tooltip content="Chỉ Leader và Admin trong bộ phận được hưởng quyền này. User (nhân viên thường) sẽ không thấy module này">
    <span className="pm-scope-badge leader" style={{ cursor: "default" }}>Từ Leader</span>
  </Tooltip>
  <Tooltip content="Chỉ Admin (quản lý cấp cao) trong bộ phận được hưởng quyền này. User và Leader đều không thấy">
    <span className="pm-scope-badge manager" style={{ cursor: "default" }}>Chỉ Admin</span>
  </Tooltip>
</div>
```

- [ ] **Step 6: Update matrix cell rendering to include scope dropdown**

Replace the cell rendering inside the matrix `<tbody>` (the `{DEPARTMENT_LIST.map((dept) => {` block, lines 236-249):

```tsx
{DEPARTMENT_LIST.map((dept) => {
  const level = matrix[dept.key]?.[mod.key] ?? "none";
  const mr = minRoles[dept.key]?.[mod.key] ?? "sale";
  return (
    <td key={dept.key}>
      <div className="pm-cell">
        <span
          className={`pm-access-badge ${level}`}
          onClick={() => handleCycle(dept.key, mod.key)}
          title={`Click để đổi quyền (hiện tại: ${ACCESS_LABELS[level]})`}
        >
          <AccessIcon level={level} />
          {ACCESS_LABELS[level]}
        </span>
        {level !== "none" && (
          <select
            className="pm-scope-select"
            value={mr}
            onChange={(e) => handleMinRoleChange(dept.key, mod.key, e.target.value as MinRole)}
          >
            {MIN_ROLE_LIST.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>
    </td>
  );
})}
```

- [ ] **Step 7: Add CSS for scope dropdown and badge**

Append to `frontend/src/components/permissions/permissions.css`:

```css
/* ── Scope dropdown inside matrix cell ── */
.pm-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.pm-scope-select {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border: 1px solid var(--gmv-border);
  border-radius: 8px;
  background: var(--gmv-canvas);
  color: var(--gmv-muted);
  cursor: pointer;
  text-align: center;
  outline: none;
  transition: border-color 0.15s;
}

.pm-scope-select:hover {
  border-color: var(--gmv-primary);
  color: var(--gmv-text);
}

.pm-scope-select:focus {
  border-color: var(--gmv-primary);
  box-shadow: 0 0 0 2px var(--gmv-primary-soft);
}

/* ── Scope badges in legend ── */
.pm-scope-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1.5px solid transparent;
}

.pm-scope-badge.sale {
  background: var(--gmv-primary-soft);
  color: var(--gmv-primary);
  border-color: var(--gmv-primary);
}

.pm-scope-badge.leader {
  background: #ede9fe;
  color: #6d28d9;
  border-color: #6d28d9;
}

.pm-scope-badge.manager {
  background: #fee2e2;
  color: #dc2626;
  border-color: #dc2626;
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/permissions/PermissionsTab.tsx frontend/src/components/permissions/permissions.css
git commit -m "feat(ui): add scope dropdown and tooltips to permission matrix"
```

---

### Task 7: Verification — build, test, and manual check

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Production build**

```bash
cd frontend && npx vite build --mode production
```

Expected: build succeeds, no chunk size regressions.

- [ ] **Step 3: Run unit tests**

```bash
cd frontend && npm run test
```

Expected: all 76 tests pass (no changes to tested components).

- [ ] **Step 4: Manual verification plan**

Test with 3 accounts (sale user, sale leader, admin):

1. **Admin account:** Open Phân quyền sử dụng → verify scope dropdown appears under each non-"none" cell → set "Bán hàng × BC01 = Chỉ xem, Từ Leader" → verify save works
2. **Sale leader account:** Refresh → BC01 should appear in sidebar → click → report loads without 403
3. **Sale user account:** Refresh → BC01 should NOT appear in sidebar (min_role = leader blocks it)
4. **Override test:** Add personal override for sale user email × BC01 = read → sale user should now see BC01 (override bypasses min_role)

- [ ] **Step 5: Commit all changes to sandbox, then main**

```bash
git checkout sandbox && git merge main --no-edit && git push origin sandbox
# After verification on sandbox:
git checkout main && git push origin main
```
