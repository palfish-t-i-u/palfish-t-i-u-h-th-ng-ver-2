# E2E User Journey Test Suite — Design Spec

**Date**: 2026-06-04  
**Approach**: User Journey Chains (Approach B)  
**Goal**: Detect operational bugs from user perspective across all modules

## Context

The app has 13 sidebar modules. Currently 2 E2E spec files exist covering Module 5 (CRM Sync) and Dashboard + Module 6 (Dashboard Sale). This design adds E2E coverage for the remaining 10 modules, organized as user journey chains that test cross-module data flow.

## Requirements

- **Data strategy**: Production data. Tests create records with `[E2E-TEST]` prefix, cleaned up in `afterAll`.
- **Test depth**: Full user journey — CRUD, state transitions, cross-module flows, edge cases.
- **RBAC**: Multi-role testing with 4 accounts (full-access, sale, marketing, cs).
- **Cleanup**: Automatic via `CleanupRegistry` + fallback manual script.

## Architecture

### File Structure

```
frontend/e2e/
├── auth.setup.ts                    # (existing) Login full-access account
├── auth-role.setup.ts               # NEW: Generic login for role-specific accounts
├── helpers/
│   ├── api-client.ts                # Direct API calls for setup/cleanup
│   ├── cleanup.ts                   # CleanupRegistry — afterAll cleanup
│   ├── navigation.ts                # Sidebar navigation helpers
│   └── assertions.ts                # Reusable UI assertions
├── journeys/
│   ├── payment-lifecycle.spec.ts    # B1→B2→B3→B4 full payment chain
│   ├── revenue-reporting.spec.ts    # Sổ doanh thu → BC03
│   ├── crm-dashboard.spec.ts       # Dashboard + M5 + M6 + DoanhThuSale
│   └── admin-smoke.spec.ts          # Auth accounts + Permissions smoke tests
├── rbac-visibility.spec.ts          # NEW: Multi-role sidebar visibility tests
├── crm-sync.spec.ts                 # (existing, unchanged)
├── dashboard-sales.spec.ts          # (existing, unchanged)
```

### Multi-Role Authentication

| Project | Env vars | Department | Storage state | Purpose |
|---------|----------|------------|---------------|---------|
| auth-setup | E2E_EMAIL / E2E_PASSWORD | hr/system | .auth/user.json | All journey chains |
| auth-sale | E2E_SALE_EMAIL / E2E_SALE_PASSWORD | sale | .auth/sale.json | RBAC visibility |
| auth-marketing | E2E_MARKETING_EMAIL / E2E_MARKETING_PASSWORD | marketing | .auth/marketing.json | RBAC visibility |
| auth-cs | E2E_CS_EMAIL / E2E_CS_PASSWORD | cs | .auth/cs.json | RBAC visibility |

`auth-role.setup.ts` reads `role` from project config, looks up the matching env vars, and saves the session to the corresponding `.auth/{role}.json`.

## Journey Chains

### Chain 1: `payment-lifecycle.spec.ts`

Critical path: PR creation → payment → reconciliation → activation → invoice.

| # | Test | Type | Creates data |
|---|------|------|-------------|
| 1 | B1 Phiếu thu loads with full UI | Smoke | No |
| 2 | Create PR `[E2E-TEST] Nguyễn Văn A` | CRUD | Yes — PR |
| 3 | Add payment line to PR | CRUD | Yes — payment line |
| 4 | B2 Đối soát loads with full UI | Smoke | No |
| 5 | Confirm transaction in Đối soát | State transition | No |
| 6 | B3 Kích hoạt loads with full UI | Smoke | No |
| 7 | Create Active Request + activate course | CRUD + state | Yes — AR |
| 8 | B4 Xuất hóa đơn loads with full UI | Smoke | No |
| 9 | Request invoice for activated course | CRUD | Yes — invoice request |
| 10 | afterAll: cleanup all [E2E-TEST] records | Cleanup | Deletes all |

**State transitions tested**: PR pending → short/done, transaction pending → confirmed, AR pending_order → activated, course → invoiced.

**Cleanup order** (reverse dependency): delete invoice request → delete AR → cancel PR (cascades payment lines).

### Chain 2: `revenue-reporting.spec.ts`

| # | Test | Type | Creates data |
|---|------|------|-------------|
| 1 | Sổ doanh thu loads (cards, table, filters) | Smoke | No |
| 2 | Create ledger entry `[E2E-TEST] Revenue` | CRUD | Yes — ledger row |
| 3 | Edit ledger entry amount | CRUD | No |
| 4 | Filter by team + search `[E2E-TEST]` + date range | Interaction | No |
| 5 | BC03 loads (month selector, staff filter, tabs) | Smoke | No |
| 6 | BC03 data display (Revenue / Trial / Referral tabs) | Interaction | No |
| 7 | afterAll: delete [E2E-TEST] ledger entries | Cleanup | Deletes all |

### Chain 3: `admin-rbac.spec.ts`

Split into two files:

**`admin-smoke.spec.ts`** (runs once, full-access account, in `journeys` project):

| # | Test | Type |
|---|------|------|
| 1 | Auth Accounts page loads (table, search, filters) | Smoke |
| 2 | Permissions matrix loads (departments × modules grid) | Smoke |

**`rbac-visibility.spec.ts`** (runs per-role via rbac-* projects):

| # | Test | Type | Account |
|---|------|------|---------|
| 1 | Correct sidebar items visible for this role | RBAC | per-project |
| 2 | Restricted sidebar items hidden for this role | RBAC | per-project |
| 3 | Read-only mode: no create/edit/delete buttons on accessible modules | RBAC | per-project |

Expected visibility per role:

| Module | sale | marketing | cs |
|--------|------|-----------|-----|
| Bảng thông tin | full | read | read |
| Quản lý thanh toán | full | hidden | hidden |
| Đối soát giao dịch | full | hidden | hidden |
| Sổ doanh thu | read | full | hidden |
| Tài khoản Auth | hidden | hidden | hidden |
| Thông tin cá nhân | full | full | full |

**No cleanup needed** — all RBAC tests are read-only.

### Chain 4: `crm-dashboard.spec.ts`

Extends existing coverage without modifying existing spec files.

| # | Test | Type |
|---|------|------|
| 1 | Dashboard gamification sections (existing coverage, new file) | Smoke |
| 2 | DoanhThuSale pivot table loads | Smoke |
| 3 | DoanhThuSale date range switching | Interaction |
| 4 | StaffCRM page loads (if visible) | Smoke |

**No cleanup needed** — read-only tests.

## Helpers

### `api-client.ts`

Authenticated HTTP client using token from stored Playwright session.

```
E2eApiClient
  ├── createPR(data) → { id }
  ├── cancelPR(id) → void
  ├── deleteActiveRequest(arId) → void
  ├── createLedgerEntry(data) → { id }
  ├── deleteLedgerEntry(id) → void
  ├── listAuthUsers() → AuthUser[]
  └── findAndCleanTestData(prefix) → CleanupReport
```

API base URL from `E2E_API_URL` env var (default: `http://localhost:8000`).

### `cleanup.ts`

```
CleanupRegistry
  ├── register(fn: () => Promise<void>)  — called during tests
  └── runAll() → { success, failed }     — called in afterAll
```

Each test registers cleanup callbacks. `afterAll` runs all registered callbacks. Failures are logged but don't throw (best-effort cleanup).

### `manual-cleanup.ts`

Standalone script for emergency cleanup:
```bash
npx tsx e2e/helpers/manual-cleanup.ts
```

Finds all records matching `[E2E-TEST]` prefix and `E2E-UID-*` UIDs, deletes them via API.

### `navigation.ts`

```
navigateTo(page, sidebarLabel)        — click sidebar item, wait for load
expectModuleLoaded(page, heading)     — verify h1/h2 heading visible
expectSidebarVisible(page, label)     — assert sidebar item exists
expectSidebarHidden(page, label)      — assert sidebar item NOT in DOM
```

### `assertions.ts`

```
expectToast(page, text)               — toast notification appeared
waitForLoaded(page)                   — loading spinner resolved
expectEmptyState(page, text?)         — empty state message visible
expectTableRows(page, minCount)       — table has >= N rows
```

## Test Data Conventions

| Field | Convention | Purpose |
|-------|-----------|---------|
| Customer name | `[E2E-TEST] Nguyễn Văn A` | Identifiable in UI + API search |
| Phone | `0900000001` | Reserved test range |
| Email | `e2e-test-*@palfish.test` | Non-deliverable domain |
| UID | `E2E-UID-{timestamp}` | Unique per run, searchable |
| Notes | `[E2E-AUTO] Created by Playwright` | Cleanup script identifier |

## Playwright Config

### Projects

```
auth-setup          → login full-access → .auth/user.json
auth-sale           → login sale        → .auth/sale.json
auth-marketing      → login marketing   → .auth/marketing.json
auth-cs             → login cs          → .auth/cs.json
journeys            → testDir: e2e/journeys, depends: auth-setup
rbac-sale           → testMatch: rbac-visibility, depends: auth-sale
rbac-marketing      → testMatch: rbac-visibility, depends: auth-marketing
rbac-cs             → testMatch: rbac-visibility, depends: auth-cs
e2e                 → (existing tests, unchanged)
```

### Execution Order

```
Phase 1 (serial):   auth-setup
Phase 2 (parallel): auth-sale, auth-marketing, auth-cs
Phase 3 (serial):   journeys (payment → revenue → crm-dashboard)
Phase 4 (parallel): rbac-sale, rbac-marketing, rbac-cs
Phase 5 (serial):   e2e (existing)
```

Journey chains run serial (`fullyParallel: false`) — later tests depend on data from earlier tests within the same chain. RBAC tests run parallel — read-only visibility checks.

### npm Scripts

| Script | Command | When to use |
|--------|---------|------------|
| `e2e` | `playwright test --project=e2e` | Existing tests only |
| `e2e:journeys` | `playwright test --project=journeys` | Business flow regression |
| `e2e:rbac` | `playwright test --project=rbac-*` | After permission changes |
| `e2e:all` | `playwright test` | Full regression before release |
| `e2e:cleanup` | `tsx e2e/helpers/manual-cleanup.ts` | Emergency data cleanup |
| `e2e:headed` | `playwright test --headed` | Debug with browser visible |
| `e2e:report` | `playwright show-report e2e-report` | View last HTML report |
| `e2e:ui` | `playwright test --ui` | Interactive test runner |

## `.env.e2e` Variables

```
E2E_EMAIL=               # Full-access account (existing)
E2E_PASSWORD=
E2E_SALE_EMAIL=           # Sale department
E2E_SALE_PASSWORD=
E2E_MARKETING_EMAIL=      # Marketing department
E2E_MARKETING_PASSWORD=
E2E_CS_EMAIL=             # CS department
E2E_CS_PASSWORD=
E2E_API_URL=http://localhost:8000
```

## Test Count Summary

| Spec file | Tests | Data created | Cleanup |
|-----------|-------|-------------|---------|
| payment-lifecycle | 10 | PR, payment line, AR, invoice | afterAll + manual |
| revenue-reporting | 7 | Ledger entry | afterAll + manual |
| admin-smoke | 2 | None | None |
| rbac-visibility | 3 × 3 roles = 9 | None | None |
| crm-dashboard | 4 | None | None |
| **Total new** | **32** | | |
| Existing (unchanged) | 14 | None | None |
| **Grand total** | **46** | | |
