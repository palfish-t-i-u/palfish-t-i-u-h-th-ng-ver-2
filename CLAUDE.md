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

### Frontend key components
- `frontend/src/components/DashboardTab.tsx` — Bảng thông tin (gamification, BXH, events)
- `frontend/src/components/Module5Tab.tsx` — M5: Đồng bộ CRM
- `frontend/src/components/Module6Tab.tsx` — M6: Dashboard Sale (hiệu suất)
- `frontend/src/components/SoDoanhThuTab.tsx` — Sổ doanh thu
- `frontend/src/components/DoanhThuSaleTab.tsx` — Sales Performance pivot
- `frontend/src/components/PaymentRequestsTab.tsx` — B1: Phiếu thu
- `frontend/src/components/ReconciliationTab.tsx` — B2: Đối soát
- `frontend/src/components/ActivationTab.tsx` — B3: Kích hoạt khóa học
- `frontend/src/components/InvoiceRequestTab.tsx` — B4: Xuất hóa đơn
- `frontend/src/components/permissions/PermissionsTab.tsx` — Dynamic RBAC matrix
- `frontend/src/components/auth/` — Auth accounts management
- `frontend/src/components/reports/` — BC01, BC02, BC03 reports
- `frontend/src/lib/api.ts` — All API endpoints

### Backend key modules
- `backend/main.py` — FastAPI entry + PayOS webhook (signature verify)
- `backend/rbac.py` — Unified RBAC (4-level: sale/leader/manager/system) + sub-team scoping + JWT
- `backend/activation_routes.py` — B3: Active Request, course activation
- `backend/payment_request_routes.py` — B1: PR CRUD, payment lines
- `backend/revenue_routes.py` — M5: Sổ doanh thu, search, batch team lookup, BC01/BC02
- `backend/crm_routes.py` — CRM hybrid/autonomous sync
- `backend/dashboard_routes.py` — Gamification, BXH, team/subteam, sub-team scope enforcement
- `backend/report_routes.py` — BC03 daily/monthly
- `backend/rpc_helpers.py` — Atomic RPCs, Postgres sequences

### Key docs
- `docs/PROJECT.md` — Kiến trúc, tiến độ, schema, phân quyền
- `docs/SPEC_TEMPLATE.md` — Mẫu spec (dùng khi nhận prototype từ anh Hiếu)
- `docs/HUONG_DAN_XUAT_SPEC.md` — Prompt cho Claude Design xuất spec
- `docs/DESIGN.md` — Design tokens, UI components, rules
