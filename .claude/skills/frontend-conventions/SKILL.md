---
name: frontend-conventions
description: Covers the frontend architecture contract for the PalFish GMV Manager React app — ViewId/tab wiring, lazyRetry pattern, PRELOAD_MAP, api.ts idiom, design tokens, auth/session handling, address dropdowns, orphaned components, UX debt, and the TERMINOLOGY RULE. Use when adding a new screen, writing a new component or API call, debugging auth/permission issues, or reviewing any frontend change.
---

## Overview

Single-page React 19 app (Vite + TypeScript + Tailwind CSS) served via Vercel. Navigation is sidebar-driven with a flat `ViewId` state in `MainPage` — no React Router sub-routes for individual modules, just a `switch` on `activeView`. Modules are code-split via `lazyRetry`. Auth and permission checking are layered: Supabase session → `useAuth` → `useMe` (loads `/me` profile) → `usePermission(moduleKey)`.

---

## When to use / When NOT to use

**Use** when:
- Adding a new screen/tab to the app (must follow ViewId + import + permission key + sidebar wiring)
- Writing a new component that calls the API (snake_case boundary, axios interceptor)
- Debugging auth, permissions, or isDevMode behavior
- Choosing colors, spacing, or UI primitives (design tokens)
- Handling errors from API calls
- Working with address fields (Tỉnh/Phường/Số nhà)

**Do NOT use** when:
- Working on the FastAPI backend — see `backend-conventions` skill
- Working on Zalo OA or DingTalk notification wiring — see those dedicated skills
- Working on database migrations — see `database-and-migrations` skill

---

## Terminology (MANDATORY — violating this is a bug)

| Correct term | Meaning | NEVER use |
|---|---|---|
| **PR** (Payment Request) | Core business object — one customer payment intent | "phiếu thu" |
| **lần thanh toán** | Payment line / installment within a PR (DB: `payment_lines`) | "payment attempt" in UI strings |
| **giao dịch cần đối soát** | Bank/card transaction waiting to be matched to a payment line | any informal synonym |

These terms apply to ALL UI strings, comments, docs, and handoff docs.

---

## Ground truth: key files

| File | Role |
|---|---|
| `frontend/src/pages/MainPage.tsx` | ViewId type, lazyRetry imports, PRELOAD_MAP, nav item list, renderActiveView switch |
| `frontend/src/App.tsx` | ProtectedRoute (checks `user` + `profile.isActivated`), GuestRoute, AuthFlowRoute, ErrorBoundary wrapper, `gmv-light-ui` root class |
| `frontend/src/lib/api.ts` | Axios singleton + all endpoint definitions; Bearer token injected at line 49 via interceptor |
| `frontend/src/lib/apiBaseUrl.ts` | URL resolution: prod → `/api` (Vercel proxy → Render), dev → `localhost:8000`, override via `VITE_API_BASE_URL` |
| `frontend/src/lib/apiErrors.ts` | `formatApiError()` — extracts FastAPI `detail`, returns Vietnamese Render cold-start message on `ERR_NETWORK` |
| `frontend/src/lib/supabase.ts` | Supabase JS client singleton; reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `frontend/src/hooks/useAuth.tsx` | AuthContext: session management, `isDevMode` detection, Google OAuth, password reset |
| `frontend/src/hooks/useMe.tsx` | MeContext: fetches `/me` on mount, stores `MeProfile` with `permissions` map |
| `frontend/src/hooks/usePermission.ts` | `usePermission(moduleKey)` → `{ level, canView, readOnly }` |
| `frontend/src/types/permissions.ts` | `AccessLevel`, `MODULE_LIST` (16 modules), `DEPARTMENT_LIST`, `DEFAULT_PERMISSIONS` matrix |
| `frontend/src/types/profile.ts` | `MeProfile` interface |
| `frontend/src/types/paymentRequest.ts` | snake_case API row types vs camelCase FE types |
| `frontend/src/gmv-tokens.css` | All `--gmv-*` CSS custom properties |
| `frontend/src/gmv-theme.css` | `.gmv-light-ui` — forces light mode |
| `frontend/src/components/ui/index.ts` | UI primitive barrel (Button, Input, Card, Badge, Table, Modal, PageSection) |
| `frontend/src/contexts/PaymentFlowContext.tsx` | Shared B1-B4 state — the only context besides Auth/Me |
| `frontend/src/components/ErrorBoundary.tsx` | Detects chunk-load errors; shows Vietnamese reload prompt |
| `frontend/src/hooks/useNotifications.ts` | Notification bell polling + MOCK_NOTIFICATIONS fallback (see Gotchas) |
| `frontend/src/data/vnProvinces.ts` | Static bundled VN province/ward data (v4.0.0) — DO NOT EDIT MANUALLY |
| `frontend/src/components/payment-request/VietnamAddressFields.tsx` | Address dropdown component using static `vnProvinces.ts` |
| `docs/DESIGN.md` | Design system spec: token table, component list, rules |
| `scripts/build-vn-provinces.mjs` | Script to regenerate `vnProvinces.ts` from upstream source |

**Key DB tables (for reference; FE never queries directly except `crm_tokens` in Module5Tab):**
- `payment_requests`, `payment_lines`, `active_requests` — B1-B4 flow
- `bank_transactions` — SePay reconciliation
- `notifications` — notification bell (migration only in `docs/sql/notifications_exchange_rates.sql`, NOT in numbered sequence)
- `crm_tokens` — CRM access token; Module5Tab queries this directly via Supabase client

**Env var NAMES (never values):**
- `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_BANK_ACCOUNT_NUMBER`, `VITE_BANK_BIN`, `VITE_BANK_ACCOUNT_NAME`
- `E2E_EMAIL`, `E2E_PASSWORD` (in `frontend/.env.e2e`)

---

## Procedures

### Adding a new screen (tab)

1. Add the new `ViewId` string to the union type in `frontend/src/pages/MainPage.tsx` (lines 59-81 as of 2026-07-04).
2. Add a `lazyRetry(() => import("../components/MyNewTab"))` near the other lazy imports (lines 29-44).
3. If the screen should preload on sidebar hover, add to `PRELOAD_MAP` (lines 46-57). Eagerly-imported tabs (dashboard, module5, module6, authAccounts, permissions, Zalo/DingTalk) are NOT in PRELOAD_MAP.
4. Add the title/subtitle entry to the `TITLES` record.
5. Add a `case "myView": return <MyNewTab />;` in `renderActiveView()`.
6. Add a nav item in the `items` useMemo block, guarded by `can("myModuleKey")`. Choose the correct sidebar section.
7. Add the module key to `MODULE_LIST` in `frontend/src/types/permissions.ts` so the RBAC matrix covers it. **If the key is brand-new (not yet in the existing list), also add it to `DEFAULT_PERMISSIONS` in the same file** — omitting it from `DEFAULT_PERMISSIONS` means no role starts with access, which can be confusing when the permission matrix is first viewed. Example of what NOT to repeat: `dingtalk` was added to the nav but omitted from both `MODULE_LIST` and `DEFAULT_PERMISSIONS` as of 2026-07-04.
8. Inside the component, call `usePermission("myModuleKey")` and respect `readOnly`.

**Permission key aliasing:** Zalo tabs (`zaloConfig`, `zaloGroups`, `zaloOutbox`) all map to the single permission bit `"zalo"` via the `can()` function. DingTalk tabs (`dingtalkConfig`, `dingtalkGroups`, `dingtalkOutbox`) map to `"dingtalk"`. When adding a group of admin tabs that share one bit, replicate this pattern in `can()` at MainPage.tsx lines 266-269.

Note: `"dingtalk"` is NOT yet in `MODULE_LIST` or `DEFAULT_PERMISSIONS` (as of 2026-07-04). Adding new notification system tabs requires adding their key to both.

### Writing an API call

All API calls MUST go through the `api` axios instance in `frontend/src/lib/api.ts`. This instance has the Bearer token interceptor — never create a separate `axios.create()` that bypasses it.

```typescript
// Correct pattern — add to the endpoints object in api.ts
myModule: {
  list: (params: { foo: string }) =>
    api.get<{ items: MyApiRow[] }>("/api/v1/my-endpoint", { params }),
  create: (body: { field_name: string; other_field: number }) =>
    api.post<MyApiRow>("/api/v1/my-endpoint", body),
},
```

Payload field naming rule: request bodies and raw API response fields are **snake_case** (matching FastAPI/Pydantic). FE model types (`PaymentAttempt`, etc.) are **camelCase**. Conversion happens in utility files (e.g., `paymentRequestUtils.ts`).

**API endpoint prefix rule:** B1-B4 (payment/activation/invoice) use `/api/v1/` prefix. Legacy endpoints (revenue, dashboard, crm, invoice/don_hang) are at root path (e.g., `/orders`, `/revenue/ledger`). Check `api.ts` before assuming.

### Handling errors in a component

```typescript
import { formatApiError } from "../lib/apiErrors";

try {
  await endpoints.myModule.create(payload);
} catch (err) {
  setError(formatApiError(err, "Không thể tạo bản ghi"));
}
```

`formatApiError` extracts the FastAPI `detail` string and gives a human-readable Render cold-start message on `ERR_NETWORK`.

### Using design tokens

Use `gmv-*` Tailwind classes and CSS variables — never hard-code hex in components.

```tsx
// Correct
<div className="bg-gmv-canvas shadow-gmv-1 rounded-gmv-lg text-gmv-text">
  <Button variant="primary">Xác nhận</Button>
</div>

// Incorrect
<div style={{ background: "#fff", color: "#333" }}>
```

Key tokens (from `docs/DESIGN.md` and `frontend/src/gmv-tokens.css`):

| Token | Value | Purpose |
|---|---|---|
| `--gmv-primary` | `#7260ff` | CTA, active nav, accent |
| `--gmv-primary-soft` | `#eeebff` | Nav active bg, card header |
| `--gmv-canvas` | `#ffffff` | Cards, sidebar, inputs |
| `--gmv-bg` | `#f6f7fb` | Page background |
| `--gmv-text` | `rgba(0,0,0,0.65)` | Body text |
| `--gmv-muted` | `#5c7db8` | Subtitles, table headers |
| `--gmv-ok` / `--gmv-warn` / `--gmv-danger` | semantic | Status badges |
| `--gmv-radius-lg/md/sm` | 16/8/4px | CTA / input / tag |

Rules: no gradient; no `style={{}}` new inline styles; use semantic colors for status (never repurpose purple for status).

### Working with address fields (Tỉnh / Phường / Số nhà)

Address dropdowns use **static bundled JSON** — no external API calls.

- Source: `frontend/src/data/vnProvinces.ts` (v4.0.0, 34 tỉnh, 3321 phường/xã)
- Component: `frontend/src/components/payment-request/VietnamAddressFields.tsx`
- To rebuild the data: `node scripts/build-vn-provinces.mjs` (then commit the regenerated file)

Address validation rules (FE-only, no BE enforcement):
- Vietnamese customers: Tỉnh + Phường + Số nhà are all required to create a PR and to export invoices
- Overseas (OV) customers: only country is required

### Auth session handling

- `useAuth()` provides `user`, `session`, `loading`, `isDevMode`, sign-in/sign-out helpers
- `useMe()` provides `profile` (MeProfile with `permissions` map), `loading`, `refresh()`
- `isDevMode` is `true` when `VITE_SUPABASE_URL` fails the regex or key is placeholder/missing. In dev mode: all auth is bypassed, `DEV_PROFILE` is injected (role=system, department=null, permissions=`{}`), all tabs are visible
- Supabase key format: accepts both JWT-format legacy keys AND `sb_publishable_*` keys (checked in `useAuth.tsx` lines 11-21). Legacy JWT anon keys were disabled 2026-06-16 after a leak — use only `sb_publishable_*` in new environments
- New user accounts require admin activation (`is_activated` flag). Unactivated users (role != system) are redirected to `PendingActivationPage` by `ProtectedRoute` (App.tsx line 35)

### Type checking before push

```bash
cd frontend && npx tsc -b          # MUST pass — Vercel runs this
cd frontend && npm run build       # Full Vercel-identical build
```

`tsc --noEmit` is NOT sufficient — Vercel runs `tsc -b` (project references, stricter). Always use `tsc -b`.

---

## Orphaned components (NOT reachable via navigation)

These files exist but are NOT wired into `MainPage.tsx` (no ViewId, no import, no nav item). Do not assume they are reachable:

- `frontend/src/components/DoanhThuSaleTab.tsx` — Sales Performance pivot (API endpoints exist in `api.ts` at `/revenue/pivot` and `/revenue/pivotSalesPerformance`, but the tab has no nav path as of 2026-07-04)
- `frontend/src/components/admin/ExchangeRatesPanel.tsx` — In-app exchange rate config UI (task VAC-05 open; hard-coded 3700 fallback remains in 3 backend locations; `exchange_rates` table exists but is seeded by a non-numbered migration in `docs/sql/notifications_exchange_rates.sql`)

---

## Gotchas and past incidents

**useNotifications MOCK fallback trap** — `frontend/src/hooks/useNotifications.ts` falls back to `MOCK_NOTIFICATIONS` on any 404, 500, or network error from `GET /api/v1/notifications`. Users see stale mock data (including an `ar_rejected` kind that has no backend insert) if the `notifications` table was never created. The `notifications` table migration lives ONLY in `docs/sql/notifications_exchange_rates.sql`, NOT in the numbered migration sequence — easy to miss on sandbox reset.

**Chunk-load fail after Vercel deploy (TODO, unresolved as of 2026-07-04)** — `lazyRetry` wraps all heavy tabs with 2 retries and 1s delay. `ErrorBoundary` catches unrecoverable chunk errors and shows a Vietnamese reload prompt. However, `retryImport` does NOT auto-reload once — it only retries the same stale chunk URL. A one-shot `window.location.reload()` inside `retryImport` after all retries are exhausted is a pending TODO.

**Tab-switch loading flash (UX debt, unresolved as of 2026-07-04)** — Buttons and content briefly flash on browser tab return. A fix plan exists (2 fixes, 7 files) but has not been applied. `useRefetchOnFocus` has a 30s cooldown before it re-fetches, which prevents excessive API calls but means data may be 30s stale after a long tab switch.

**PR-0080/0081 cross-PR drawer bug (2026-06-26)** — Two PRs with the same amount led to the UI attributing payment to the wrong PR. DB and SePay matching were correct; the bug is FE state/drawer confusion. Unresolved as of 2026-07-04.

**Light-mode enforcement must not be removed** — `App.tsx` wraps the root `<div>` with `className="gmv-light-ui min-h-screen"`. This class in `gmv-theme.css` forces `color-scheme: light` and overrides input/select backgrounds. Removing it breaks the app in OS dark mode.

**PRELOAD_MAP is not exhaustive** — `dashboard`, `module5`, `module6`, `authAccounts`, `permissions`, and all Zalo/DingTalk tabs are NOT in PRELOAD_MAP (they are eagerly imported or small enough to skip preload). Do not expect hover-preload to work for these.

**PaymentFlowContext is the only shared data context for B1-B4** — B1-B4 tabs (PaymentRequestsTab, ReconciliationTab, ActivationTab, InvoiceRequestTab) consume shared state from `PaymentFlowContext`. Tabs must NOT fetch data independently; they consume from context. `reconCard` cross-navigates to `gatewaySync` via `onGoToSync` prop — an exception to the normal `setActiveView` pattern.

**M3/M4 legacy modules co-exist with B3/B4** — `Module3Tab.tsx` and `Module4Tab.tsx` are wired in `MainPage.tsx` as ViewIds `module3` and `module4`. These are now the canonical B3 (Kích hoạt khóa học) and B4 (Xuất hóa đơn) steps — the labels map to activation and invoice despite the "Module3/4" naming. New features go in `activation_routes.py` (not the legacy `invoice_routes.py`/`don_hang` path).

---

## Volatile facts (as of 2026-07-04)

- **Render API URL**: `https://palfish-gmv-api.onrender.com` — re-verify in `frontend/src/lib/apiBaseUrl.ts`
  ```bash
  grep PRODUCTION_API_DIRECT frontend/src/lib/apiBaseUrl.ts
  ```
- **React/Vite/TypeScript versions** (React 19, Vite, TypeScript) — re-verify:
  ```bash
  grep -E '"react"|"vite"|"typescript"' frontend/package.json
  ```
- **MODULE_LIST count** (16 modules as of 2026-07-04) — re-verify:
  ```bash
  grep -c "key:" frontend/src/types/permissions.ts
  ```
- **vnProvinces.ts version** (v4.0.0, 34 tỉnh, 3321 phường/xã, generated 2026-06-28) — re-verify header comment:
  ```bash
  head -5 frontend/src/data/vnProvinces.ts
  ```
- **DEFAULT_PERMISSIONS matrix** — overridden by backend-stored matrix at runtime; check `/admin/permissions` endpoint for live state, not the static FE default.
- **`dingtalk` key absent from MODULE_LIST** — re-verify:
  ```bash
  grep dingtalk frontend/src/types/permissions.ts
  ```

---

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
```bash
cd frontend && npx tsc -b
```
Must pass before any push. `tsc --noEmit` is not sufficient — use `tsc -b`.

**Tier 2 — when touching a specific component or API call:**
```bash
# Unit test for the touched component only (e.g. PaymentRequestsTab)
cd frontend && npm run test -- --reporter=verbose src/components/PaymentRequestsTab.test.tsx

# If a matching E2E spec exists for the module, run that spec only
cd frontend && npx playwright test e2e/reconciliation-flow.spec.ts
```
Never run the full test suite at Tier 2.

**Tier 3 — before merge/deploy only:**
```bash
cd frontend && npm run test          # full Vitest suite
cd frontend && npm run e2e           # default e2e project (auth-setup + 5 specs)
cd frontend && npm run build         # Vercel-identical build check
```

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** pipe command output through a filter — e.g. `2>&1 | grep -E "error TS|FAIL|Error"` — instead of dumping full compiler or test logs into context.
