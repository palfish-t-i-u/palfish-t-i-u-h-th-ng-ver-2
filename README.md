# PalFish GMV Manager (ver-2)

Web app nội bộ cho đội **Sales & Ops PalFish**: quản lý luồng thanh toán Payment Request (many-to-many), đối soát GMV (chuyển khoản SePay + thẻ mPOS/Payoo), kích hoạt khóa học, xuất hóa đơn thuế, sổ doanh thu, báo cáo và thông báo tự động (Zalo OA / DingTalk).

| Môi trường | Production | Sandbox |
|------------|-----------|---------|
| Frontend (Vercel) | [palfish-gmv-manager.vercel.app](https://palfish-gmv-manager.vercel.app) | palfish-gmv-manager-sandbox |
| Backend API (Render) | [palfish-gmv-api.onrender.com](https://palfish-gmv-api.onrender.com) | Render sandbox service |
| Database & Auth | Supabase PostgreSQL + Auth (project `jozc…`) | Supabase project `pxgy…` |
| Repo | [palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2](https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2) | branch `sandbox` |

> **Cập nhật:** 2026-08-05 · Bản đồ module→file: [`MODULES.md`](MODULES.md) · Task board: [`docs/TODO.md`](docs/TODO.md) · Nhật ký: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Kiến trúc](#kiến-trúc)
- [Module & tính năng](#module--tính-năng)
- [Luồng Payment Request (B1–B4)](#luồng-payment-request-b1b4)
- [Branch & môi trường](#branch--môi-trường)
- [Cấu trúc repo](#cấu-trúc-repo)
- [Chạy local](#chạy-local)
- [Kiểm thử](#kiểm-thử)
- [Deploy & tài liệu](#deploy--tài-liệu)
- [Đội ngũ](#đội-ngũ)

---

## Tổng quan

Hệ thống thay thế quy trình theo dõi GMV thủ công bằng một web app tập trung:

- **Sales** tạo Payment Request, gửi QR/nội dung CK cho khách, báo đơn kích hoạt khóa học.
- **Ops / Kế toán** đối soát tiền về (SePay webhook + thẻ mPOS/Payoo), xác nhận giao dịch, xuất hóa đơn thuế, quản lý sổ doanh thu.
- **Leader / Manager** xem dashboard hiệu suất, bảng xếp hạng, báo cáo BC01/BC02/BC03 (giới hạn theo team qua RBAC).
- **System admin** cấu hình phân quyền, tài khoản, kênh thông báo Zalo/DingTalk.

Thanh toán dùng **VietQR self-gen + SePay** để tự động khớp nội dung chuyển khoản (PayOS đã ngừng dùng — xem [ghi chú legacy](#legacy--không-còn-mount)).

---

## Kiến trúc

| Layer | Stack |
|-------|-------|
| Frontend | React 19, Vite, TypeScript, Tailwind, TanStack Query, React Router 7, Recharts |
| Backend | FastAPI, Supabase client, Pandas, openpyxl |
| Thanh toán | VietQR self-gen + **SePay** webhook (biến động số dư); thẻ qua extension mPOS/Payoo |
| Thông báo | Zalo OA, DingTalk enterprise robot, in-app notification bell |
| Auth & RBAC | Supabase Auth (JWT) · 5 vai trò: `sale → ops → leader → manager → system` |
| CI | GitHub Actions — [`frontend-ci.yml`](.github/workflows/frontend-ci.yml) (typecheck + test + build) |

```
   Sales / Ops / Leader          React 19 SPA (Vercel)
   ─────────────────────────►    AppShell + RBAC sidebar
                                          │  JWT (Supabase Auth)
                                          ▼
                                  FastAPI (Render)
                                  12 routers · rbac.py
                                    │              │
       SePay webhook ──────────────►│              │◄────────── mPOS / Payoo
       (biến động số dư)            │              │            (đối soát thẻ)
                                    ▼              ▼
                            Supabase (PostgreSQL + Auth)
                                    │
       Zalo OA · DingTalk · in-app bell  ◄──  outbox workers
```

---

## Module & tính năng

Chi tiết file của từng module xem [`MODULES.md`](MODULES.md).

| # | Module | Thành phần chính | Trạng thái |
|---|--------|------------------|------------|
| 1 | **Bảng thông tin** (Dashboard gamification) | `DashboardTab` — BXH, vinh danh, event carousel, rank card | ✅ Live |
| 2 | **Dashboard Sale** (M6 hiệu suất) | `Module6Tab` + `dashboard_routes.py` | ✅ Live |
| 3 | **Quản lý thanh toán** (B1–B4) | PaymentRequests → Đối soát → Kích hoạt → Xuất HĐ | ✅ Live |
| 4 | **Đối soát thẻ** (mPOS / Payoo) | `CardReconciliationTab`, `GatewaySyncTab` + `gateway_routes.py` | ✅ Live |
| 5 | **Sổ doanh thu** | `SoDoanhThuTab` + `revenue_routes.py` (import GSheet/xlsx, tỷ giá theo ngày) | ✅ Live |
| 6 | **Đồng bộ CRM** (M5) | `Module5Tab` + `crm_routes.py` (hybrid sync + auto-detect missing days) | ✅ Live |
| 7 | **Báo cáo** BC01 / BC02 / BC03 | `ReportsHub` + `report_routes.py` | ✅ Live |
| 8 | **Thông báo** Zalo + DingTalk + in-app | `admin/` + `zalo_notifier.py`, `dingtalk_notifier.py`, outbox workers | ✅ Live |
| 9 | **Phân quyền** (RBAC) + Auth accounts | `permissions/`, `AuthAccountsTab` + `rbac.py`, `admin_routes.py` | ✅ Live |

**Đang backlog** (xem [`docs/TODO.md`](docs/TODO.md)): xuất Excel sổ doanh thu, audit-log ghi thao tác PATCH. **On-hold** (chờ API Metabase): sync nhân sự tự động, dropdown gói học từ CRM.

---

## Luồng Payment Request (B1–B4)

```
B1  Tạo PR (UID, khách hàng, số tiền target) ─────────► PR-ID
         │
B2  Thêm payment_lines (VietQR / tiền mặt / thẻ / trả góp)
         │  SePay webhook khớp nội dung CK → xác nhận / từ chối
         │  (đối soát thẻ mPOS/Payoo qua GatewaySync)
         │  tiền đủ 100%
B3  Active Request ──► báo đơn kích hoạt ──► Ops nhập Order ID CRM
         │
B4  Xuất hóa đơn thuế (theo AR, xuất Excel / gửi email·Zalo)
```

Rules chi tiết: [`frontend/src/components/payment-request/CLAUDE.md`](frontend/src/components/payment-request/CLAUDE.md) · [`activation/CLAUDE.md`](frontend/src/components/activation/CLAUDE.md) · spec: [`docs/PROTOTYPE_PAYMENT_FLOW.md`](docs/PROTOTYPE_PAYMENT_FLOW.md)

---

## Branch & môi trường

| Branch | Vai trò |
|--------|---------|
| `main` | Production — Vercel (project `palfish-gmv-manager`) + Render prod promote từ đây |
| `sandbox` | Staging thật — Vercel sandbox + Render sandbox + Supabase `pxgy…` (dùng cho E2E, chụp ảnh HDSD) |

Có **2 project Vercel, 2 service Render, 2 project Supabase** (prod + sandbox) tách biệt hoàn toàn. Chi tiết deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md).

> Các branch `feature-*`, `ui/ux`, `test-integration-final`… là lịch sử phát triển, đã merge hoặc archive — không dùng cho luồng mới.

---

## Cấu trúc repo

```
palfish-t-i-u-h-th-ng-ver-2/
├── frontend/                      React app (Vite)
│   ├── src/components/            Tab theo module + payment-request/, activation/, admin/, reports/…
│   ├── src/contexts/             PaymentFlowContext (state B1–B4)
│   ├── src/content/help/         Nội dung HDSD (route /docs/*)
│   ├── src/lib/api.ts            Axios + tất cả endpoint groups
│   └── e2e/                      Playwright (spec + journeys + mobile + rbac)
├── backend/
│   ├── main.py                   FastAPI entry, CORS, đăng ký 12 router, startup tasks
│   ├── payment_request_routes.py B1/B2 — PR CRUD, payment lines, tạo hộ/chuyển giao
│   ├── sepay_routes.py           SePay webhook + đối soát bank transactions
│   ├── gateway_routes.py         Đối soát thẻ mPOS/Payoo · mpos_import.py (parser)
│   ├── activation_routes.py      B3 — Active Request, append bé/gói, match CRM
│   ├── invoice_routes.py         B4 — xuất hóa đơn thuế
│   ├── revenue_routes.py         Sổ doanh thu + BC01/BC02 · report_routes.py (BC03)
│   ├── crm_routes.py             Đồng bộ CRM · crm_metrics.py (mapping cột)
│   ├── dashboard_routes.py       Dashboard gamification + hiệu suất
│   ├── admin_routes.py           RBAC matrix, auth users, Zalo/DingTalk config
│   ├── zalo_notifier.py · dingtalk_notifier.py + *_outbox_worker.py
│   ├── rbac.py                   Phân quyền JWT (resolve_actor, ROLE_RANK)
│   ├── migrations/               35+ file SQL có ngày tháng
│   └── run.ps1                   Chạy local (Windows)
├── api_pipe/                     Gateway đứng riêng (app_payment, payos_webhook — legacy)
├── docs/                         Spec, TODO, deploy, learnings/
├── scripts/                      Seed, build data, sync Lark
├── supabase/functions/           Edge functions
├── MODULES.md                    Bản đồ module ↔ file (đọc trước khi sửa)
└── render.yaml                   Render deploy config
```

Migration SQL nằm trong `backend/migrations/*.sql` (đặt tên theo ngày, chạy trên Supabase SQL Editor). Cuối mỗi patch: `NOTIFY pgrst, 'reload schema';`

---

## Chạy local

Chi tiết: [`docs/SETUP_ENV.md`](docs/SETUP_ENV.md). Yêu cầu: **Node.js 20+**, **Python 3.12+**, tài khoản Supabase.

### Backend — FastAPI (`http://127.0.0.1:8000`)

```powershell
cd backend
Copy-Item .env.example .env      # điền SUPABASE_SERVICE_ROLE_KEY + SePay/…
.\run.ps1
# healthcheck: http://127.0.0.1:8000/healthz
```

### Frontend — Vite (`http://localhost:5173`)

```powershell
cd frontend
Copy-Item .env.example .env.local   # VITE_SUPABASE_* + VITE_API_BASE_URL + VITE_BANK_*
npm install
npm run dev
```

---

## Kiểm thử

```powershell
cd frontend
npm run test        # Unit — Vitest + Testing Library + MSW
npx tsc -b          # Typecheck (build mode — bắt buộc pass trước khi push)
npm run build       # Build Vercel-identical (tsc -b && vite build)
npm run e2e         # E2E — Playwright (cần .env.e2e)
```

E2E theo project: `e2e` · `e2e:mobile` · `e2e:journeys` · `e2e:rbac`. Xem báo cáo: `npm run e2e:report`. Chi tiết: [`CLAUDE.md`](CLAUDE.md).

---

## Deploy & tài liệu

| Tài liệu | Nội dung |
|----------|----------|
| [`MODULES.md`](MODULES.md) | **Bản đồ module ↔ file** — đọc trước khi sửa bất kỳ module nào |
| [`docs/PROJECT.md`](docs/PROJECT.md) | Kiến trúc, schema, phân quyền |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Deploy Vercel + Render (prod & sandbox) |
| [`docs/AUTH_SETUP.md`](docs/AUTH_SETUP.md) | Supabase Auth, Google OAuth |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design tokens (brand `#7260ff`), UI components |
| [`docs/MODULE_SO_DOANH_THU.md`](docs/MODULE_SO_DOANH_THU.md) · [`docs/M5_OPERATIONS.md`](docs/M5_OPERATIONS.md) | Sổ doanh thu + vận hành |
| [`docs/TODO.md`](docs/TODO.md) | Task board (nguồn tiến độ) |
| [`docs/learnings/`](docs/learnings/) | Bài học rút ra từ các bug/quyết định đã xử lý |

### Biến môi trường chính

**Backend** (`backend/.env` — xem [`.env.example`](backend/.env.example)): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `SYSTEM_ADMIN_EMAILS`, `OPS_EMAILS`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_API_TOKEN`, `SEPAY_ALLOWED_IPS`, `GATEWAY_EXTENSION_INGEST_TOKEN`, `ZALO_OA_*`, `DINGTALK_*`. *(PayOS legacy — mặc định `USE_PAYOS=false`.)*

**Frontend** (`frontend/.env.local` — xem [`.env.example`](frontend/.env.example)): `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OPS_EMAILS`, `VITE_BANK_BIN`, `VITE_BANK_ACCOUNT_NO`, `VITE_BANK_ACCOUNT_NAME`.

---

## Đội ngũ

| Vai trò | Phạm vi |
|---------|---------|
| **Minh** | FE/BE chính, UI/UX, deploy, QA, kiến trúc |
| **Giang** | Backend — SePay/thanh toán, webhook, PR routes |
| **Đức** | Backend — integration, Supabase, migrations |
| **Đạt** | Backend — auth, activation, tỷ giá |
| **Kem** | Backend — Pandas/Supabase (dashboard, CRM) |
| **Hiếu** | Product owner — spec, prototype, UX feedback |

---

## Legacy — không còn mount

Các thành phần dưới đây đã ngừng dùng, **không sửa khi làm feature mới** (xem cuối [`MODULES.md`](MODULES.md)): `Module3Tab`, `Module4Tab` (thay bằng ActivationTab / InvoiceRequestTab), `PayosHistoryTab` (PayOS → SePay), `DoanhThuSaleTab` (thay bằng BC01), `StaffCRMTab`.

---

## Ghi chú bảo mật

Dự án nội bộ PalFish — **không public**. Không commit `.env`, service role key, SePay/Zalo/DingTalk secrets. Supabase dùng key format mới (`sb_secret_` / `sb_publishable_`) sau đợt rotate; RLS đã bật trên các bảng nhạy cảm.
