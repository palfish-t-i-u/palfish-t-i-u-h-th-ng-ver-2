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

## Type Checking

**IMPORTANT**: Always use `tsc -b` (build mode), NOT `tsc --noEmit`.
Vercel runs `tsc -b && vite build` — `tsc -b` is stricter than `--noEmit`
(enforces project references, declaration emit). Use:

```bash
cd frontend && npx tsc -b          # must pass before push
cd frontend && npm run build       # full Vercel-identical build
```

## Dev Server

```bash
cd frontend && npm run dev          # Vite on http://localhost:5173
cd backend && powershell ./run.ps1  # FastAPI on http://localhost:8000
```

Frontend `.env.local` points `VITE_API_BASE_URL` to either localhost:8000 (local backend) or the Render production API.

## Project Structure

**IMPORTANT — Trước khi sửa một module, đọc `MODULES.md` (root)**: bản đồ đầy đủ module → file (FE + BE + tests + docs). Đừng quét codebase để tìm file khi index đã có. Khi thêm/xóa/di chuyển file, cập nhật `MODULES.md`.

Tóm tắt module (chi tiết trong `MODULES.md`):
- **Bảng thông tin + Dashboard Sale** — DashboardTab, Module6Tab / `dashboard_routes.py`
- **Quản lý thanh toán B1–B4** — PaymentRequests → Đối soát → Kích hoạt → Xuất hóa đơn / `payment_request_routes.py`, `activation_routes.py`, `invoice_routes.py`
- **Đối soát thẻ mPOS/Payoo** — CardReconciliationTab, GatewaySyncTab / `gateway_routes.py`, `mpos_import.py`
- **Sổ doanh thu** — SoDoanhThuTab / `revenue_routes.py` + import GSheet/xlsx
- **Đồng bộ CRM (M5)** — Module5Tab / `crm_routes.py`
- **Báo cáo BC01/BC02/BC03** — reports/ / `revenue_routes.py`, `report_routes.py`
- **Thông báo Zalo + DingTalk** — admin/ / `zalo_notifier.py`, `dingtalk_notifier.py`, workers, `admin_routes.py`
- **RBAC + Auth** — permissions/, auth/ / `rbac.py`, `admin_routes.py`

Module có business rules riêng — CLAUDE.md trong thư mục tự load khi đọc file:
- `frontend/src/components/payment-request/CLAUDE.md` — PR lifecycle, allocation guard, stale content, bill soft-lock
- `frontend/src/components/admin/CLAUDE.md` — Zalo/DingTalk: token refresh, outbox retry, event routing

⚠️ Legacy không còn mount (xem cuối `MODULES.md`): Module3Tab, Module4Tab, PayosHistoryTab, DoanhThuSaleTab, StaffCRMTab.

### Key docs
- `docs/PROJECT.md` — Kiến trúc, tiến độ, schema, phân quyền
- `docs/SPEC_TEMPLATE.md` — Mẫu spec (dùng khi nhận prototype từ anh Hiếu)
- `docs/HUONG_DAN_XUAT_SPEC.md` — Prompt cho Claude Design xuất spec
- `docs/DESIGN.md` — Design tokens, UI components, rules
- `docs/learnings/` — Extracted reasoning from past solved problems (Problem/Trap/Insight/Rule format)

## Learning Law

**Before** starting a non-trivial bug fix or architecture change, check for prior learnings:
```bash
grep -rl "relevant_file_or_keyword" docs/learnings/
```
If hits found, read them first — past traps save hours.

**After** every non-trivial solved problem, run the `extract-approach` skill before moving on.
A solution without its learnings note is unfinished work.
