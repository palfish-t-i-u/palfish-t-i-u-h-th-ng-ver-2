# PalFish GMV Reconciliation

## Tech Stack
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS
- **Backend**: Python / FastAPI (deployed on Render)
- **Database**: Supabase (Postgres + Auth)
- **Unit tests**: Vitest + @testing-library/react + MSW
- **E2E tests**: Playwright

## Running Tests

### Unit tests
```bash
cd frontend && npm run test        # run once
cd frontend && npm run test:watch  # watch mode
```

### E2E tests (Playwright)

**Prerequisites**: `frontend/.env.e2e` must exist with `E2E_EMAIL` and `E2E_PASSWORD` set (copy from `.env.e2e.example`).

```bash
cd frontend

# Run all E2E tests headless (fast, token-optimized output)
npm run e2e

# Run with browser visible (debug / demo)
npm run e2e:headed

# Run specific test file
npx playwright test e2e/crm-sync.spec.ts
npx playwright test e2e/dashboard-sales.spec.ts

# Open HTML report (screenshots + video + trace)
npm run e2e:report

# Visual test runner (interactive UI)
npm run e2e:ui

# Record new tests by clicking in browser
npm run e2e:codegen
```

**Test structure**:
- `e2e/auth.setup.ts` — Login once, reuse session for all tests
- `e2e/crm-sync.spec.ts` — Module 5: Đồng bộ CRM (6 tests)
- `e2e/dashboard-sales.spec.ts` — Bảng thông tin + Dashboard Sale (8 tests)

**Output**:
- `e2e-results/` — screenshots, videos, traces per test
- `e2e-report/` — HTML report (open with `npm run e2e:report`)

When user says "chạy test" or "run test" without specifying type:
1. Run unit tests first: `cd frontend && npm run test`
2. Then run E2E: `cd frontend && npm run e2e`
3. If E2E fails, show the error and suggest `npm run e2e:report` to view details

When user says "chạy e2e" or "test e2e":
1. Run `cd frontend && npm run e2e`
2. Report pass/fail count
3. If failures, suggest `npm run e2e:headed` or `npm run e2e:report`

## Dev Server

```bash
cd frontend && npm run dev          # Vite on http://localhost:5173
cd backend && powershell ./run.ps1  # FastAPI on http://localhost:8000
```

Frontend `.env.local` points `VITE_API_BASE_URL` to either localhost:8000 (local backend) or the Render production API.

## Project Structure

- `frontend/src/components/Module5Tab.tsx` — M5: Đồng bộ CRM
- `frontend/src/components/Module6Tab.tsx` — M6: Dashboard Sale (hiệu suất)
- `frontend/src/components/DashboardTab.tsx` — Bảng thông tin (gamification)
- `frontend/src/lib/api.ts` — All API endpoints
- `backend/crm_routes.py` — CRM sync backend
- `backend/dashboard_routes.py` — Dashboard backend
