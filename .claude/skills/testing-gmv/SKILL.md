---
name: testing-gmv
description: Covers the full testing stack for the PalFish GMV app — Vitest unit tests (MSW mocks, frontend only), Playwright E2E tests (all projects/commands, auth session reuse, coverage inventory, non-coverage gaps), and backend pytest suite. Use when asked to run, write, debug, or extend any test; when onboarding to the test setup; or when choosing between unit vs E2E for a new feature.
---

## Overview

Two independent test harnesses:

1. **Frontend unit tests** — Vitest + @testing-library/react + MSW, run in Node (jsdom). Files: `frontend/src/**/*.{test,spec}.{ts,tsx}`. Playwright E2E files are explicitly excluded.
2. **Frontend E2E tests** — Playwright, 6 project groups (auth-setup, journeys, rbac-*, e2e). Live browser against a real Vite dev server + sandbox backend.
3. **Backend tests** — pytest, located under `backend/tests/`. Unit-style, fully mocked (no real Supabase), 338 tests as of 2026-07-04.

---

## When to use / When NOT to use

**Use this skill when:**
- Running or adding unit or E2E tests for any frontend module
- Debugging a test failure (missing MSW handler, auth session expired, missing `.env.e2e`)
- Extending E2E coverage to a new module
- Running backend pytest to verify a BE fix
- Setting up a fresh clone for the first time

**Do NOT use this skill for:**
- Deploying the app (see `deploying-gmv`)
- RBAC role definitions (see `rbac-and-auth-accounts`)
- Backend architecture or migration patterns (see `backend-conventions`)

---

## Ground truth

### Key frontend files (repo-relative)

| Path | Role |
|------|------|
| `frontend/package.json` | All test npm scripts (verified) |
| `frontend/vite.config.ts` | Vitest config: pool=threads, jsdom, setupFiles, include/exclude patterns |
| `frontend/playwright.config.ts` | Playwright: testDir=./e2e, outputDir=./e2e-results, 6 project groups, webServer auto-start |
| `frontend/.env.e2e.example` | Template for E2E credentials — copy to `.env.e2e` before first run |
| `frontend/.env.e2e` | Gitignored; hard-throws if missing at E2E startup |
| `frontend/e2e/auth.setup.ts` | Logs in, saves session to `e2e/.auth/user.json` |
| `frontend/e2e/auth-role.setup.ts` | Logs in with role-specific accounts, saves `e2e/.auth/{role}.json` |
| `frontend/e2e/helpers/env.ts` | `loadEnvE2e()` + `requireEnv()` — throws on missing or empty-string keys |
| `frontend/e2e/helpers/api-client.ts` | `E2eApiClient`: reads Supabase access_token from `user.json`, calls backend directly for journey setup/teardown |
| `frontend/e2e/helpers/cleanup.ts` | `CleanupRegistry`: LIFO teardown callbacks used in journey tests |
| `frontend/e2e/helpers/manual-cleanup.ts` | Standalone script for `npm run e2e:cleanup` |
| `frontend/e2e/helpers/navigation.ts` | `navigateTo()`, `expectModuleLoaded()`, `expectSidebarVisible/Hidden()` |
| `frontend/src/test/setup.ts` | Vitest global setup: imports jest-dom; `server.listen({ onUnhandledRequest: 'error' })` |
| `frontend/src/test/msw/handlers.ts` | MSW handlers (legacy endpoints only — see Gotchas) |
| `frontend/src/test/msw/server.ts` | `setupServer(...handlers)` export |

### Key backend files

| Path | Role |
|------|------|
| `backend/tests/` | All pytest files — 38 test files as of 2026-07-04 |
| `backend/tests/conftest.py` | Shared fixtures: `_env_defaults` (autouse), `mock_supabase` (chainable MagicMock) |
| `backend/tests/README.md` | Mapping of test class → task/owner (Đạt/Đức/Giang) |

### Env vars needed for E2E

All go in `frontend/.env.e2e` (gitignored):

```
E2E_EMAIL          # full-access account
E2E_PASSWORD
E2E_SALE_EMAIL     # role-specific (RBAC tests only)
E2E_SALE_PASSWORD
E2E_MARKETING_EMAIL
E2E_MARKETING_PASSWORD
E2E_CS_EMAIL
E2E_CS_PASSWORD
E2E_API_URL        # backend base URL; defaults to http://localhost:8000
```

Never commit secret values. The `.env.e2e.example` file shows the key names.

---

## Procedures

### 0. Fresh clone bootstrap (one-time setup)

Before running any tests on a fresh clone, install dependencies:

```bash
# Frontend dependencies (must run before any test command)
cd frontend && npm install

# Playwright browser binaries (only needed once per machine)
cd frontend && npx playwright install

# Backend dependencies (only if running pytest locally)
pip install -r backend/requirements.txt
# Then for the two xlrd-dependent tests:
pip install xlrd
```

These are one-time steps per machine. After completing, proceed to the procedures below.

### 1. Bootstrap `.env.e2e` on a fresh clone (MANDATORY before first E2E run)

Convention: auto-create from example using sandbox test credentials — **do not stop to ask the user**.

```bash
cp frontend/.env.e2e.example frontend/.env.e2e
```

Then fill in known sandbox accounts:
- `E2E_EMAIL=test.admin@dev` (full-access / admin)
- `E2E_PASSWORD=<sandbox password — ask Minh via Zalo; these are test-only credentials managed by the team>`
- `E2E_SALE_EMAIL=test.user@dev` (Sale role)
- `E2E_SALE_PASSWORD=<same source>`
- `E2E_MARKETING_EMAIL`, `E2E_CS_EMAIL` and their passwords: same source

The role-specific accounts must also exist in Supabase prod project `jozcvbbypwvzaefteoxn` (Auth dashboard). If auth-setup fails, verify the accounts there first.

Sandbox app: https://palfish-gmv-manager-sandbox.vercel.app/

### 2. Run Vitest unit tests

```bash
# Run once (CI-style)
cd frontend && npm run test

# Watch mode (development)
cd frontend && npm run test:watch

# Browser UI for visual inspection
cd frontend && npm run test:ui
```

Vitest only picks up `src/**/*.{test,spec}.{ts,tsx}`. Files under `e2e/` are explicitly excluded by `vite.config.ts`.

### 3. Run Playwright E2E

```bash
# Default: run the 'e2e' project (crm-sync, dashboard-sales,
# reconciliation-flow, referral-flow, rbac-visibility)
# auth-setup runs automatically first
cd frontend && npm run e2e

# Multi-step journey flows (B1→B2→B3→B4, Sổ doanh thu, admin smoke)
cd frontend && npm run e2e:journeys

# RBAC role-gating tests (3 roles × 1 spec = 3 projects)
cd frontend && npm run e2e:rbac

# Everything at once
cd frontend && npm run e2e:all

# All E2E tests with browser visible (debugging)
cd frontend && npm run e2e:headed

# Single spec file
cd frontend && npx playwright test e2e/crm-sync.spec.ts

# Interactive UI runner
cd frontend && npm run e2e:ui

# Record a new test by clicking
cd frontend && npm run e2e:codegen
```

### 4. View E2E results

```bash
# Open HTML report (screenshots, videos, traces per test)
cd frontend && npm run e2e:report
```

Artifacts accumulate in:
- `frontend/e2e-results/` — screenshots, videos, traces (never auto-purged)
- `frontend/e2e-report/` — HTML report

### 5. Clean up orphaned E2E test data

Run after an aborted journey test that left `[E2E-TEST]`-prefixed records in the sandbox:

```bash
cd frontend && npm run e2e:cleanup
```

### 6. Run backend pytest

```bash
# From repo root (NOT from inside backend/)
python -m pytest backend/tests/ -v

# Specific test file
python -m pytest backend/tests/test_audit_auth.py -v

# Specific test class
python -m pytest backend/tests/test_audit_auth.py::TestAUTH01_ActivationRequiresAuth -v
```

Install deps if missing: `pip install pytest httpx`.

Two tests currently fail due to missing `xlrd` (Excel reader not installed in this venv); all others pass. These are `TestParseSettlements.test_csv_parser_accepts_extension_export` and `TestAmbiguousDetection.test_ambiguous_detected_in_real_data`. Fix: `pip install xlrd`.

---

## E2E coverage inventory

### "chạy test" (user says run tests)
1. Run unit tests: `cd frontend && npm run test`
2. Then run E2E: `cd frontend && npm run e2e`
3. If E2E fails, suggest `npm run e2e:report` to view details.

### "chạy e2e" (user says run E2E)
1. `cd frontend && npm run e2e`
2. Report pass/fail count.
3. If failures: suggest `npm run e2e:headed` or `npm run e2e:report`.

### Covered modules

| Spec file | Project | Tests | What it covers |
|-----------|---------|-------|----------------|
| `e2e/crm-sync.spec.ts` | e2e | 6 | Module 5 (Đồng bộ CRM): token status, quick-date buttons, LẤY DỮ LIỆU, token refresh |
| `e2e/dashboard-sales.spec.ts` | e2e | 5 | Bảng thông tin gamification (3 tests) + Module 6 Dashboard Sale KPI filters (2 tests) |
| `e2e/reconciliation-flow.spec.ts` | e2e | 4 | B2 Đối soát: Chuyển khoản / mPOS / Payoo tabs open; modal for needs_review row |
| `e2e/referral-flow.spec.ts` | e2e | 4 | B3 Activation: drawer open, referral panel, credit-referral disabled guard |
| `e2e/rbac-visibility.spec.ts` | rbac-sale/marketing/cs | 9 | Sidebar visible/hidden items and read-only CRUD state per role |
| `e2e/journeys/payment-lifecycle.spec.ts` | journeys | serial | B1→B2→B3→B4 full flow; creates/cleans `[E2E-TEST]` data |
| `e2e/journeys/revenue-reporting.spec.ts` | journeys | serial | Sổ doanh thu CRUD + BC03 tabs |
| `e2e/journeys/admin-smoke.spec.ts` | journeys | serial | Auth Accounts table + Permissions matrix |
| `e2e/journeys/crm-dashboard.spec.ts` | journeys | serial | Dashboard gamification, BC01 pivot, BC02 date filter, M6 KPI cards |

### NOT covered (explicit gaps as of 2026-07-04)

- Zalo admin tabs (ZaloConfigTab, ZaloGroupsTab, ZaloOutboxTab)
- DingTalk admin tabs
- Payment QR drawer (VietQR generation, SePay match feedback)
- DoanhThuSaleTab (Sales Performance pivot) — note: this component is also orphaned from MainPage.tsx nav
- DingTalk sync / SePay webhook feedback
- Address dropdown UI interactions
- Notification bell

---

## Jargon

| Term | Meaning |
|------|---------|
| auth-setup project | Playwright project running `auth.setup.ts` once; saves full-access Supabase session to `e2e/.auth/user.json` |
| storageState | Playwright mechanism serializing cookies + localStorage to JSON; downstream projects load it to skip login |
| journeys project | Serial multi-step E2E flows creating real data in sandbox; under `e2e/journeys/` |
| e2e project | Playwright project running the single-module smoke specs |
| rbac-* projects | Three Playwright projects (rbac-sale/marketing/cs) running `rbac-visibility.spec.ts` with role-specific sessions |
| CleanupRegistry | LIFO callback stack in journey tests; `runAll()` called in `test.afterAll` |
| MSW | Mock Service Worker — Node HTTP interception for Vitest unit tests; handlers in `src/test/msw/handlers.ts` |
| onUnhandledRequest: 'error' | MSW setting: unmatched HTTP requests throw immediately; every API call a component makes needs a handler |
| [E2E-TEST] prefix | String prepended to data created in journey tests; used by `manual-cleanup.ts` to find and delete records |
| pool: threads | Vitest worker pool mode; chosen because forks pool crashes on Windows paths with non-ASCII chars (Vietnamese dirs) |

---

## Gotchas & past incidents

1. **`.env.e2e` does not exist in fresh clone.** `loadEnvE2e()` hard-throws `Missing .env.e2e`. Convention: auto-create from example — never stop to ask the user. Sandbox accounts: `test.admin@dev` / `test.user@dev`.

2. **MSW handlers cover only legacy endpoints.** `src/test/msw/handlers.ts` handles `GET /orders`, `POST /info-code`, `GET /info-code/:code/status`, `GET /webhook/events`, `POST /crm/activate`. These predate the current FastAPI route structure. When writing unit tests for newer modules (B1-B4, Zalo, mPOS, etc.), add corresponding handlers here. If a handler is missing, Vitest will throw `Error: [MSW] Request … is unhandled` because `onUnhandledRequest: 'error'` is set in `setup.ts`.

3. **Playwright runs serially, workers=1.** `playwright.config.ts` sets `fullyParallel: false, workers: 1` to prevent sandbox data races. Do not change this.

4. **E2E on localhost dev = FAKE auth, no real JWT (2026-07-23).** Default config spawns `npm run dev`; the local FE in dev mode logs in with a `dev_user` localStorage stub — `e2e/.auth/user.json` gets NO Supabase token, so every call to the real Render BE returns 401 and PaymentRequestsTab shows "GET /payment-requests chưa sẵn sàng" with an empty table. To smoke a feature against the DEPLOYED sandbox (real FE + BE + Supabase auth), run with `--config playwright.sandbox.config.ts` (baseURL = sandbox Vercel, no webServer). Side effect: table shows a placeholder `<tr>` while loading/empty — specs must filter real rows, e.g. `page.locator("table tbody tr").filter({ hasText: /PR-/ })`, or the first `.click()` lands on the placeholder.

4. **Stale Vite dev server reuse.** Playwright's `webServer` config has `reuseExistingServer: true`. If port 5173 is already bound from a previous run, that server is reused without restart. If state feels stale, kill the existing process first.

5. **Session files invalidated by Supabase key rotation.** `e2e/.auth/user.json` and role JSON files are generated at runtime and gitignored. When Supabase JWT keys are rotated (as happened 2026-06-16), all session files become invalid. Fix: delete `e2e/.auth/*.json` (except `.auth.gitkeep`) and re-run auth-setup.

6. **auth.setup.ts expects `Bảng thông tin` heading on landing.** If the test account lands on a different page after login, auth-setup fails. The full-access account must land on the dashboard view.

7. **requireEnv throws on empty string**, not just undefined. Setting `E2E_EMAIL=` (blank) in `.env.e2e` will throw the same as omitting it entirely.

8. **Reconciliation-flow and referral-flow tests skip mutations.** They are open/read-only checks because they require pre-seeded sandbox data. Do not add mutation steps without seeding first.

9. **Journey tests call the real backend.** `E2eApiClient` uses `E2E_API_URL` (default `http://localhost:8000`). If the backend is down or pointing to production, journey tests fail or create orphaned production data.

10. **Backend `pytest` must run from repo root**, not from `backend/`. Running `cd backend && pytest` collects 0 tests (the tool registers no tests that way). Use `python -m pytest backend/tests/` from the repo root, or `cd backend && python -m pytest tests/`.

11. **Two backend tests fail due to missing `xlrd`.** `TestParseSettlements.test_csv_parser_accepts_extension_export` and `TestAmbiguousDetection.test_ambiguous_detected_in_real_data` fail with `ModuleNotFoundError: No module named 'xlrd'`. Install with `pip install xlrd` to fix.

12. **`tsc -b` not `tsc --noEmit`.** Before pushing, run `cd frontend && npx tsc -b`. Vercel runs `tsc -b && vite build`; `--noEmit` is less strict and misses project-reference errors.

---

## Volatile facts (as of 2026-07-04)

- **Playwright version: `^1.60.0`** (from `devDependencies` in `frontend/package.json`). Re-verify: `cat frontend/package.json | grep playwright`.
- **Sandbox test accounts** (`test.admin@dev`, `test.user@dev`, and role-specific accounts) must exist in Supabase prod project `jozcvbbypwvzaefteoxn`. Verify via Supabase Auth dashboard if auth-setup begins failing.
- **338 backend tests passing** (2 failing on `xlrd`, 16 skipped). Re-verify: `python -m pytest backend/tests/ -v 2>&1 | tail -5`.
- **Unit test files: 24** under `frontend/src/`. Re-verify: `find frontend/src -name "*.test.*" -o -name "*.spec.*" | grep -v e2e | wc -l`.
- **MSW version: `^2.14.6`** — uses `http` and `HttpResponse` from `msw` (v2 API, not v1 `rest`). Re-verify: `cat frontend/package.json | grep '"msw"'`.

---

## Validation loop

Run gates cheapest-first. Stop at the first failure — do not run higher tiers.

**Tier 1 — always (seconds):**
```bash
cd frontend && npx tsc -b
```
Required before every push. If `.env.e2e` is missing, auto-create it from `.env.e2e.example` with sandbox credentials — never stop to ask the user.

**Tier 2 — when touching a specific module's test:**
```bash
# Unit: single test file for the changed module
cd frontend && npm run test -- src/components/SomeTab.test.tsx

# E2E: single matching spec file (not the full suite)
cd frontend && npx playwright test e2e/crm-sync.spec.ts
# or: e2e/dashboard-sales.spec.ts / reconciliation-flow.spec.ts / referral-flow.spec.ts
```
For backend changes: `python -m pytest backend/tests/test_specific_file.py -v` (from repo root).

**Tier 3 — before merge/deploy only:**
```bash
cd frontend && npm run test          # full Vitest unit suite
cd frontend && npm run e2e           # auth-setup + all e2e project specs
python -m pytest backend/tests/ -v  # full pytest (from repo root)
```
Escalation order: unit → single E2E spec → full `npm run e2e`. Never jump to full suites before single-spec confirms the failure is real.

**Loop budget:** if the same gate fails twice in a row, STOP iterating. Report the failing output to the user verbatim and wait. Do not attempt a third blind fix.

**Output hygiene:** filter logs — e.g. `2>&1 | grep -E "FAIL|Error|failed"` — instead of dumping full Vitest or Playwright output into context. For E2E failures, direct the user to `npm run e2e:report` for screenshots and traces.
