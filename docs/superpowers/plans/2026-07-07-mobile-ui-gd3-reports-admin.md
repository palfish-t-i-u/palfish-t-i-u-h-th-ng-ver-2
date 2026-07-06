# Mobile UI GĐ 3 — Báo cáo + Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all remaining screens mobile-responsive: reports keep horizontal scroll + sticky, admin/auth tables → card view, forms/config responsive, filter bars wrap.

**Architecture:** Same pattern as GĐ 0-2 — `useIsMobile()` hook + conditional render (table on desktop, RowCard on mobile). Reports (BC01/BC02/BC03) and PermissionsTab keep tables with `overflow-x-auto` + sticky columns — only fix filter/header wrapping. Admin tables (Zalo/DingTalk groups/outbox, AuthAccounts) get card view. Forms (ZaloConfig, DingTalkConfig, Module5Tab, ProfilePage) already use flex/grid with `flex-wrap` or `sm:` breakpoints — just verify and patch gaps. **GatewaySyncTab is DO NOT MODIFY.**

**Tech Stack:** React 19 + TypeScript + Tailwind CSS, `useIsMobile()` hook, `RowCard`/`RowCardList` primitives, CSS `@media (max-width: 767px)`.

**DO NOT modify:** `api.ts`, `GatewaySyncTab.tsx`, `card-recon/mockGatewayTxns.ts`, `crm-token-extension/*`

**Branch:** `mobile-ui-gd3` from `sandbox`. Squash merge back when complete.

**Commit rule:** Only `git add` specific files. NEVER use `git add -A` or `git add .`.

---

## File Structure

### New files (card components)
- `frontend/src/components/auth/AuthAccountCards.tsx` — Card view for AuthAccountsTab user list
- `frontend/src/components/admin/ZaloGroupCards.tsx` — Card view for ZaloGroupsTab
- `frontend/src/components/admin/ZaloOutboxCards.tsx` — Card view for ZaloOutboxTab
- `frontend/src/components/admin/DingTalkGroupCards.tsx` — Card view for DingTalkGroupsTab
- `frontend/src/components/admin/DingTalkOutboxCards.tsx` — Card view for DingTalkOutboxTab
- `frontend/e2e/mobile-admin.spec.ts` — E2E smoke test for GĐ 3 screens

### Modified files
- `frontend/src/components/AuthAccountsTab.tsx` — Add `useIsMobile`, conditional table/cards
- `frontend/src/components/admin/ZaloGroupsTab.tsx` — Add `useIsMobile`, conditional table/cards
- `frontend/src/components/admin/ZaloOutboxTab.tsx` — Add `useIsMobile`, conditional table/cards
- `frontend/src/components/admin/DingTalkGroupsTab.tsx` — Add `useIsMobile`, conditional table/cards
- `frontend/src/components/admin/DingTalkOutboxTab.tsx` — Add `useIsMobile`, conditional table/cards
- `frontend/src/components/reports/BC01SalesPerformance.tsx` — Hide description on mobile
- `frontend/src/components/reports/BC02KeyDataReport.tsx` — Hide description on mobile
- `frontend/src/components/ReportBC03Tab.tsx` — Hide description on mobile
- `frontend/src/components/permissions/PermissionsTab.tsx` — Hide description on mobile
- `frontend/src/components/admin/ZaloConfigTab.tsx` — Responsive form layout
- `frontend/src/components/admin/DingTalkConfigTab.tsx` — Responsive form layout
- `frontend/src/components/auth/auth-accounts.css` — Mobile CSS rules
- `frontend/src/components/permissions/permissions.css` — Mobile CSS rules

### Files NOT modified (already responsive or DO NOT MODIFY)
- `GatewaySyncTab.tsx` — DO NOT MODIFY
- `Module5Tab.tsx` — Already uses `sm:grid-cols-2` + `flex-wrap`, responsive OK
- `ProfilePage.tsx` — Already `max-w-lg` + `grid-cols-2`, responsive OK

---

### Task 0: Branch setup

**Files:**
- None (git only)

- [ ] **Step 1: Create branch**

```bash
git checkout sandbox
git pull origin sandbox
git checkout -b mobile-ui-gd3
```

- [ ] **Step 2: Commit empty marker**

```bash
git commit --allow-empty -m "chore: branch mobile-ui-gd3 from sandbox"
```

---

### Task 1: BC01 + BC02 + BC03 — hide description on mobile

**Files:**
- Modify: `frontend/src/components/reports/BC01SalesPerformance.tsx`
- Modify: `frontend/src/components/reports/BC02KeyDataReport.tsx`
- Modify: `frontend/src/components/ReportBC03Tab.tsx`

Per spec: reports keep table + scroll ngang + sticky. Only chỉnh filter/header wrap. BC01/BC02 filter bars already use `flex flex-wrap` → nothing to fix there. Just hide verbose description on mobile.

- [ ] **Step 1: BC01 — add useIsMobile, wrap description**

Import `useIsMobile` (default import from `../../hooks/useIsMobile`). Call `const isMobile = useIsMobile()` inside component. Wrap the `<p>` tag containing description text (lines ~106-110, the paragraph explaining "Hiệu suất bán hàng…") with `{!isMobile && (...)}`.

Find this pattern in BC01SalesPerformance.tsx:
```tsx
// Before the filter bar, there's a <p> with description text.
// Wrap it: {!isMobile && <p className="...">...</p>}
```

- [ ] **Step 2: BC02 — same pattern**

Same approach for BC02KeyDataReport.tsx. Import `useIsMobile`, wrap description `<p>` with `{!isMobile && ...}`.

- [ ] **Step 3: BC03 — same pattern**

ReportBC03Tab.tsx (1612 lines). Import `useIsMobile` from `../hooks/useIsMobile`. Find description text near top of return JSX and wrap with `{!isMobile && ...}`.

- [ ] **Step 4: Type check**

```bash
cd frontend && npx tsc -b
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/reports/BC01SalesPerformance.tsx frontend/src/components/reports/BC02KeyDataReport.tsx frontend/src/components/ReportBC03Tab.tsx
git commit -m "style(mobile): hide report descriptions on mobile (BC01/BC02/BC03)"
```

---

### Task 2: AuthAccountsTab mobile card view

**Files:**
- Create: `frontend/src/components/auth/AuthAccountCards.tsx`
- Modify: `frontend/src/components/AuthAccountsTab.tsx`
- Modify: `frontend/src/components/auth/auth-accounts.css`

AuthAccountsTab has 9-column table (Email, Họ tên, SĐT, Đội, Team, CRM liên kết, Đăng nhập cuối, Vai trò, Trạng thái). Each row opens a drawer via `onClick={() => setDrawerUser(u)}`.

Types needed: `AuthUserRow` from `../../types/profile`.

- [ ] **Step 1: Create AuthAccountCards.tsx**

```tsx
import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";
import type { AuthUserRow } from "../../types/profile";

interface Props {
  users: AuthUserRow[];
  onSelect: (u: AuthUserRow) => void;
  statusOf: (u: AuthUserRow) => { label: string; cls: string };
  deptLabel: (u: AuthUserRow) => string;
  emptyText?: string;
}

export default function AuthAccountCards({ users, onSelect, statusOf, deptLabel, emptyText }: Props) {
  return (
    <RowCardList empty={emptyText ?? "Không có tài khoản nào."}>
      {users.map((u) => {
        const st = statusOf(u);
        return (
          <RowCard
            key={u.id}
            title={u.crmName || u.fullName || u.email}
            value={u.role}
            onClick={() => onSelect(u)}
            badges={
              <>
                <Badge tone={st.cls === "aa-status active" ? "ok" : st.cls === "aa-status suspended" ? "danger" : "neutral"}>
                  {st.label}
                </Badge>
                <Badge tone="neutral">{deptLabel(u)}</Badge>
              </>
            }
            meta={[
              { label: "Email", value: u.email },
              { label: "SĐT", value: u.phone || "—" },
              { label: "Team", value: u.team || "—" },
              { label: "CRM", value: u.crmName ? "Đã ghép" : "Chưa" },
              ...(u.lastSignIn
                ? [{ label: "Đăng nhập cuối", value: new Date(u.lastSignIn).toLocaleDateString("vi-VN") }]
                : []),
            ]}
          />
        );
      })}
    </RowCardList>
  );
}
```

**Important:** Check `AuthUserRow` type for exact field names before implementing. Read `frontend/src/types/profile.ts` and `AuthAccountsTab.tsx` to verify field names like `lastSignIn`, `fullName`, `crmName`, `role`, `team`, `phone`. The code above uses names from the table columns in AuthAccountsTab.tsx — verify they match the type.

- [ ] **Step 2: Modify AuthAccountsTab.tsx**

Add imports at top:
```tsx
import useIsMobile from "../hooks/useIsMobile";
import AuthAccountCards from "./auth/AuthAccountCards";
```

Add inside component function:
```tsx
const isMobile = useIsMobile();
```

Replace the `<TableWrap>` block (lines ~376-451) with conditional:
```tsx
{!loading && (
  isMobile ? (
    <AuthAccountCards
      users={filtered}
      onSelect={setDrawerUser}
      statusOf={statusOf}
      deptLabel={deptLabel}
    />
  ) : (
    <TableWrap>
      {/* existing table unchanged */}
    </TableWrap>
  )
)}
```

Also wrap the description paragraph (if any) with `{!isMobile && ...}`.

- [ ] **Step 3: Add mobile CSS to auth-accounts.css**

Append before the closing of file:
```css
/* ── GĐ 3: Mobile accounting screens ── */
@media (max-width: 767px) {
  .aa-kpis { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .aa-search { max-width: none; min-width: 0; width: 100%; }
  .aa-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .aa-tab { padding: 8px 12px; font-size: 13px; white-space: nowrap; }
}
```

- [ ] **Step 4: Type check**

```bash
cd frontend && npx tsc -b
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/auth/AuthAccountCards.tsx frontend/src/components/AuthAccountsTab.tsx frontend/src/components/auth/auth-accounts.css
git commit -m "feat(mobile): AuthAccountsTab card view for mobile"
```

---

### Task 3: ZaloGroupsTab + ZaloOutboxTab mobile card view

**Files:**
- Create: `frontend/src/components/admin/ZaloGroupCards.tsx`
- Create: `frontend/src/components/admin/ZaloOutboxCards.tsx`
- Modify: `frontend/src/components/admin/ZaloGroupsTab.tsx`
- Modify: `frontend/src/components/admin/ZaloOutboxTab.tsx`

**ZaloGroupsTab** table: 6 columns (Team, Group ID, Tên nhóm, Active, Cập nhật, Thao tác). Has edit mode with inline editing. Read the component to understand `editingId`, `editDraft`, `handleSave`, `handleDelete`, `handleToggle` functions.

**ZaloOutboxTab** table: 9 columns (ID, Sự kiện, Group, Nội dung, 📎, Trạng thái, Tạo lúc, Gửi lúc, Thao tác). Has retry button.

- [ ] **Step 1: Create ZaloGroupCards.tsx**

Read `ZaloGroupsTab.tsx` fully first to understand the `ZaloGroup` type and row actions. The card should show:
- title: `group_name`
- value: `team_code`
- badges: active/inactive badge
- meta: Group ID, updated_at
- actions: Edit/Delete buttons (same as table row)

```tsx
import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";
import type { ZaloGroup } from "../../lib/api/zaloAdmin";

interface Props {
  groups: ZaloGroup[];
  loading: boolean;
  onEdit: (g: ZaloGroup) => void;
  onToggle: (g: ZaloGroup) => void;
  onDelete: (id: string) => void;
  formatDate: (iso: string | null) => string;
  canManage: boolean;
}

export default function ZaloGroupCards({ groups, loading, onEdit, onToggle, onDelete, formatDate, canManage }: Props) {
  return (
    <RowCardList empty={loading ? "Đang tải..." : "Chưa có nhóm Zalo nào."}>
      {groups.map((g) => (
        <RowCard
          key={g.id}
          title={g.group_name}
          value={g.team_code}
          badges={
            <Badge tone={g.is_active ? "ok" : "neutral"}>
              {g.is_active ? "Active" : "Inactive"}
            </Badge>
          }
          meta={[
            { label: "Group ID", value: g.group_id },
            { label: "Cập nhật", value: formatDate(g.updated_at) },
          ]}
          actions={
            canManage ? (
              <>
                <button type="button" className="text-xs text-blue-600 min-h-[44px] px-2" onClick={() => onEdit(g)}>Sửa</button>
                <button type="button" className="text-xs min-h-[44px] px-2" onClick={() => onToggle(g)}>
                  {g.is_active ? "Tắt" : "Bật"}
                </button>
                <button type="button" className="text-xs text-red-600 min-h-[44px] px-2" onClick={() => onDelete(g.id)}>Xóa</button>
              </>
            ) : undefined
          }
        />
      ))}
    </RowCardList>
  );
}
```

**Important:** Check the actual `ZaloGroup` type in `frontend/src/lib/api/zaloAdmin.ts` for exact field names (`id`, `group_id`, `group_name`, `team_code`, `is_active`, `updated_at`). Verify callback signatures match what ZaloGroupsTab provides.

- [ ] **Step 2: Create ZaloOutboxCards.tsx**

Read `ZaloOutboxTab.tsx` fully. The card should show:
- title: event_type + source reference
- value: status badge
- meta: group, message (truncated), created_at, sent_at
- actions: retry button for failed

```tsx
import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";

interface OutboxRow {
  id: string;
  event_type: string;
  source_table: string;
  source_id: string;
  group_id: string;
  message: string;
  image_url: string | null;
  sent_at: string | null;
  retries: number;
  created_at: string;
}

interface Props {
  rows: OutboxRow[];
  loading: boolean;
  onRetry: (id: string) => void;
  formatDate: (iso: string) => string;
}

export default function ZaloOutboxCards({ rows, loading, onRetry, formatDate }: Props) {
  return (
    <RowCardList empty={loading ? "Đang tải..." : "Chưa có tin nhắn nào."}>
      {rows.map((r) => {
        const isSent = !!r.sent_at;
        const isDead = !r.sent_at && r.retries >= 4;
        return (
          <RowCard
            key={r.id}
            title={r.event_type}
            badges={
              <Badge tone={isSent ? "ok" : isDead ? "danger" : "warn"}>
                {isSent ? "Đã gửi" : isDead ? "Thất bại" : "Chờ gửi"}
              </Badge>
            }
            meta={[
              { label: "Group", value: r.group_id },
              { label: "Nội dung", value: r.message.slice(0, 60) + (r.message.length > 60 ? "…" : "") },
              { label: "Tạo lúc", value: formatDate(r.created_at) },
              ...(r.sent_at ? [{ label: "Gửi lúc", value: formatDate(r.sent_at) }] : []),
              ...(r.image_url ? [{ label: "📎", value: "Có ảnh" }] : []),
            ]}
            actions={
              !isSent && !isDead ? (
                <button type="button" className="text-xs text-blue-600 min-h-[44px] px-2" onClick={() => onRetry(r.id)}>
                  Gửi lại
                </button>
              ) : undefined
            }
          />
        );
      })}
    </RowCardList>
  );
}
```

**Important:** Verify the actual row type. ZaloOutboxTab may import a specific type from `zaloAdmin.ts` — use that instead of the inline interface above. Read `frontend/src/lib/api/zaloAdmin.ts` to check.

- [ ] **Step 3: Modify ZaloGroupsTab.tsx**

Add imports:
```tsx
import useIsMobile from "../../hooks/useIsMobile";
import ZaloGroupCards from "./ZaloGroupCards";
```

Add `const isMobile = useIsMobile();` inside component.

Wrap `<table>` (line ~192) with conditional: `isMobile ? <ZaloGroupCards ... /> : <table>...</table>`.

Pass the right callbacks — read the component to identify `handleSave`, `handleDelete`, `handleToggle`, `startEdit`, and `canManage` props. The card's `onEdit` should trigger `startEdit(g)` or similar.

- [ ] **Step 4: Modify ZaloOutboxTab.tsx**

Same pattern. Import `useIsMobile` + `ZaloOutboxCards`. Wrap `<table>` with conditional. Pass `onRetry` callback.

- [ ] **Step 5: Type check**

```bash
cd frontend && npx tsc -b
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/ZaloGroupCards.tsx frontend/src/components/admin/ZaloOutboxCards.tsx frontend/src/components/admin/ZaloGroupsTab.tsx frontend/src/components/admin/ZaloOutboxTab.tsx
git commit -m "feat(mobile): Zalo Groups + Outbox card view for mobile"
```

---

### Task 4: DingTalkGroupsTab + DingTalkOutboxTab mobile card view

**Files:**
- Create: `frontend/src/components/admin/DingTalkGroupCards.tsx`
- Create: `frontend/src/components/admin/DingTalkOutboxCards.tsx`
- Modify: `frontend/src/components/admin/DingTalkGroupsTab.tsx`
- Modify: `frontend/src/components/admin/DingTalkOutboxTab.tsx`

Same pattern as Zalo tabs. DingTalk groups have: team_code, group_name, webhook (masked), active, actions. DingTalk outbox: ID, created_at, event_type, team_code, message, status, last_error, retry.

- [ ] **Step 1: Create DingTalkGroupCards.tsx**

Read `DingTalkGroupsTab.tsx` to understand the group type and actions (edit, toggle active, delete). Card shows:
- title: group_name
- value: team_code
- badges: active/inactive
- meta: webhook (masked)
- actions: edit/toggle/delete

Follow the same RowCard pattern as ZaloGroupCards but adapted for DingTalk fields.

- [ ] **Step 2: Create DingTalkOutboxCards.tsx**

Read `DingTalkOutboxTab.tsx`. Card shows:
- title: event_type
- badges: status (sent/pending/failed badge)
- meta: team_code, message (truncated), created_at, last_error
- actions: retry button

- [ ] **Step 3: Modify DingTalkGroupsTab.tsx**

Import `useIsMobile` + `DingTalkGroupCards`. Conditional render.

- [ ] **Step 4: Modify DingTalkOutboxTab.tsx**

Import `useIsMobile` + `DingTalkOutboxCards`. Conditional render.

- [ ] **Step 5: Type check**

```bash
cd frontend && npx tsc -b
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/DingTalkGroupCards.tsx frontend/src/components/admin/DingTalkOutboxCards.tsx frontend/src/components/admin/DingTalkGroupsTab.tsx frontend/src/components/admin/DingTalkOutboxTab.tsx
git commit -m "feat(mobile): DingTalk Groups + Outbox card view for mobile"
```

---

### Task 5: PermissionsTab + ZaloConfigTab + DingTalkConfigTab mobile CSS

**Files:**
- Modify: `frontend/src/components/permissions/PermissionsTab.tsx`
- Modify: `frontend/src/components/permissions/permissions.css`
- Modify: `frontend/src/components/admin/ZaloConfigTab.tsx`
- Modify: `frontend/src/components/admin/DingTalkConfigTab.tsx`

Per spec: PermissionsTab keeps table with scroll ngang (ma trận quyền). Just fix header/filter wrap + hide description.

ZaloConfigTab and DingTalkConfigTab are form-based — ensure form fields stack vertically on mobile.

- [ ] **Step 1: PermissionsTab — hide description on mobile**

Import `useIsMobile` from `../../hooks/useIsMobile`. Add `const isMobile = useIsMobile()`. Wrap description text with `{!isMobile && ...}`.

- [ ] **Step 2: permissions.css — add mobile rules**

Append:
```css
@media (max-width: 767px) {
  .pm-kpis { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .pm-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .pm-tab { padding: 8px 12px; font-size: 13px; white-space: nowrap; }
}
```

Check if `.pm-tabs` and `.pm-tab` class names exist in permissions.css first. If they use different names, adapt accordingly.

- [ ] **Step 3: ZaloConfigTab — responsive form**

Read the full component. If it uses inline styles with fixed widths or multi-column layout, add `useIsMobile` and conditionally adjust. If it's already a single-column form with `<label>` blocks, it may already be responsive — verify on 375px viewport first.

Key changes likely needed:
- Import `useIsMobile` from `../../hooks/useIsMobile`
- Wrap description/explanation paragraphs with `{!isMobile && ...}`
- Ensure form inputs use `w-full` or `max-w-full` on mobile

- [ ] **Step 4: DingTalkConfigTab — responsive form**

Same approach. Read the 112-line component and fix any fixed-width or multi-column layout issues for mobile.

- [ ] **Step 5: Type check**

```bash
cd frontend && npx tsc -b
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/permissions/PermissionsTab.tsx frontend/src/components/permissions/permissions.css frontend/src/components/admin/ZaloConfigTab.tsx frontend/src/components/admin/DingTalkConfigTab.tsx
git commit -m "style(mobile): PermissionsTab scroll fix + Zalo/DingTalk config responsive"
```

---

### Task 6: E2E smoke test + final verification

**Files:**
- Create: `frontend/e2e/mobile-admin.spec.ts`

- [ ] **Step 1: Create E2E test**

```tsx
import { expect, test, type Page } from "@playwright/test";

async function openViaThem(page: Page, name: RegExp) {
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: "Thêm" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
  await sheet.getByRole("button", { name }).click();
  await expect(sheet).toBeHidden();
}

test.describe("Mobile GĐ3: Báo cáo + Admin", () => {
  test("Báo cáo BC01: bảng scroll ngang, không tràn", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Báo cáo/);
    // BC01 is likely the first sub-tab under Báo cáo
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Tài khoản Auth: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Tài khoản Auth/);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Phân quyền: bảng scroll ngang, không tràn ngoài", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Phân quyền/);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });
});
```

**Important:** The exact button names in the "Thêm" sheet may differ. Read the accessibility snapshot to verify. Also check if "Báo cáo" has sub-items that need expanding first (it has a `›` chevron in the nav sheet). Adjust navigation accordingly.

- [ ] **Step 2: Run tsc -b**

```bash
cd frontend && npx tsc -b
```

- [ ] **Step 3: Run unit tests**

```bash
cd frontend && npm run test
```

- [ ] **Step 4: Verify on dev server**

Start dev server, check each modified screen at 375px mobile viewport:
1. BC01/BC02/BC03 — description hidden, table scrolls horizontally
2. AuthAccountsTab — cards on mobile, table on desktop
3. ZaloGroupsTab — cards on mobile
4. ZaloOutboxTab — cards on mobile
5. DingTalkGroupsTab — cards on mobile
6. DingTalkOutboxTab — cards on mobile
7. PermissionsTab — table scrolls, filter wraps
8. ZaloConfigTab — form stacks vertically
9. DingTalkConfigTab — form stacks
10. ProfilePage — already responsive (verify)
11. Module5Tab — already responsive (verify)

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/mobile-admin.spec.ts
git commit -m "test(e2e): mobile admin screens smoke test (GĐ 3)"
```

---

## Spec Verification Checklist

After all tasks, verify against spec §4.2 GĐ 3:

| Spec Item | Task |
|---|---|
| BC01/BC02/BC03 giữ bảng + scroll ngang + sticky, chỉnh filter/header wrap | Task 1 — description hidden; tables already have `TableScrollWrap` with `overflow-auto` |
| Zalo hub (Config/Groups/Outbox) | Task 3 (Groups+Outbox cards), Task 5 (Config form) |
| DingTalk hub | Task 4 (Groups+Outbox cards), Task 5 (Config form) |
| AuthAccountsTab | Task 2 — card view |
| PermissionsTab (ma trận quyền → scroll ngang) | Task 5 — keep table scroll, fix filter/tabs |
| Module5Tab (CRM sync) | Already responsive — `sm:grid-cols-2` + `flex-wrap` |
| GatewaySync | DO NOT MODIFY |
| Profile | Already responsive — `max-w-lg` + `grid-cols-2` |

## Notes for implementer

1. **Import style**: `useIsMobile` is a **default export**: `import useIsMobile from "..."` (NOT `{ useIsMobile }`)
2. **Badge tones**: `"primary" | "neutral" | "ok" | "warn" | "danger"` — NO "warning", "success", or "outline"
3. **Button variants**: `"primary" | "secondary" | "ghost" | "danger" | "ok"` — NO "outline"
4. **Commit only specific files** — dirty working tree has `crm-token-extension/*`, `GatewaySyncTab.tsx`, `mockGatewayTxns.ts`, `palfish-gmv-sync.zip` that must NOT be committed
5. **Read before write**: Always read the full target file before modifying — don't assume field names or function signatures
6. **Touch target**: All action buttons on mobile must have `min-h-[44px]` for touch
