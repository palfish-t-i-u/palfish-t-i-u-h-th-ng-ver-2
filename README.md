# PalFish GMV Manager (ver-2)

Web app nội bộ hỗ trợ đội Sales & Ops PalFish theo dõi đơn hàng, đối soát thanh toán (GMV), luồng Payment Request many-to-many, kích hoạt khóa học và xuất hóa đơn thuế.

| Môi trường | URL |
|------------|-----|
| Frontend (Vercel) | [palfish-gmv-manager.vercel.app](https://palfish-gmv-manager.vercel.app) |
| Backend API (Render) | [palfish-gmv-api.onrender.com](https://palfish-gmv-api.onrender.com) |
| Database & Auth | Supabase PostgreSQL + Auth |
| Repo | [palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2](https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2) |

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Kiến trúc](#kiến-trúc)
- [Tiến độ theo module](#tiến-độ-theo-module)
- [Luồng Payment Request (B1–B4)](#luồng-payment-request-b1b4)
- [Branch & quy trình làm việc](#branch--quy-trình-làm-việc)
- [Cấu trúc repo](#cấu-trúc-repo)
- [Chạy local](#chạy-local)
- [Deploy & tài liệu](#deploy--tài-liệu)
- [Đội ngũ](#đội-ngũ)

---

## Tổng quan

Hệ thống gồm **hai luồng song song**:

1. **Legacy (Tab 1–2):** 1 đơn hàng = 1 Info Code + 1 QR (`don_hang` / `khach_hang` / `giao_dich`).
2. **Mới (Quản lý thanh toán):** 1 Payment Request = nhiều lần thanh toán → Active Request → xuất hóa đơn (`payment_requests` / `payment_lines` / `active_requests`).

Công nghệ chính:

| Layer | Stack |
|-------|--------|
| Frontend | React 19, Vite, TypeScript, Tailwind, TanStack Query |
| Backend | FastAPI, Supabase client, Pandas |
| Thanh toán | PayOS, VietQR |
| CI | GitHub Actions (frontend typecheck + test + build) |

---

## Kiến trúc

```
Sales / Ops
    │
    ├─ Tab 1 (Tạo đơn) ──────────► don_hang + khach_hang
    │                                      ▲
    ├─ Tab 2 (Quản lý đơn) ◄───────────────┤ PayOS webhook → giao_dich
    │                                      │
    └─ Quản lý thanh toán (B1–B4) ──► payment_requests
              │                              │
              ├─ B2 payment_lines ◄──────────┤ PayOS / cash / thẻ
              ├─ B3 active_requests
              └─ B4 xuất HĐ ───────────────► invoice / tax export

RBAC: Sale → Leader → Manager → System (JWT Supabase Auth)
```

---

## Tiến độ theo module

> Cập nhật: **2026-05-28** · Chi tiết task: [`docs/TODO.md`](docs/TODO.md) · Nhật ký: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

### Module 1 — Tạo mã & dashboard đơn hàng

| Hạng mục | Trạng thái |
|----------|------------|
| Auth (Google OAuth, magic link) | ✅ Done |
| Tab 1: tạo đơn + QR + Info Code | ✅ Done |
| Tab 2: bảng đơn, up bill, hủy đơn, tick tiền về/CRM | ✅ Done |
| PayOS webhook + tab Lịch sử PayOS | ✅ Done |
| RBAC 4 cấp + Quản lý quyền | ✅ Done |
| Deploy Vercel + Render | ✅ Done |
| Nghiệm thu CK thật qua QR (bank app) | ⏳ Chờ |
| UID/gói học từ CRM API / Metabase live | ⏳ Backlog |
| Audit log Tab 2 (`don_hang_audit`) | ⏳ Schema có, chưa ghi |

### Module 3 & 4 — Xuất hóa đơn thuế

| Hạng mục | Trạng thái |
|----------|------------|
| API pending-crm, queue, export-batch | ✅ MVP Done |
| FE Tab 3 (CRM Order ID) + Tab 4 (queue zip) | ✅ Done |
| Excel 3 file merged header như mẫu | ⏳ M3-05 |
| Smoke E2E prod M3→M4 | ⏳ |

### Module 5 — Sổ doanh thu & Sales Performance

| Hạng mục | Trạng thái |
|----------|------------|
| Bảng `so_doanh_thu` + API + FE tab | ✅ Done |
| Pivot Sales Performance, Type fixx, BC02 | ✅ Done |
| Xuất Excel Sổ + pivot | ⏳ |
| Re-seed từ DingTalk xlsx | ⏳ P0 |

### Quản lý thanh toán — Payment Request flow (B1–B4)

| Bước | Mô tả | Trạng thái |
|------|--------|------------|
| **B1** | Tạo PR (KH + target) | ✅ FE + BE |
| **B2** | Nhiều lần thanh toán (QR/cash/thẻ/trả góp) | ✅ BE; PayOS tùy env |
| **B2** | Đối soát / xác nhận / từ chối giao dịch | ✅ FE; một số UX còn polish |
| **B3** | Active Request + Course code | 🔄 BE persist JSONB đang hoàn thiện |
| **B4** | Xuất hóa đơn theo AR | ✅ FE; cần BE `invoice_requested_at` |
| **PATCH PR** | Sửa thông tin KH → lưu DB | ✅ Trên `test-integration-final` / `main` |
| **Persistence audit** | Bỏ in-memory fallback `main.py` | 🔄 Đang làm trên branch riêng |

### UI/UX prototype (Hiếu)

| Hạng mục | Trạng thái |
|----------|------------|
| Port prototype B1–B4 (`PaymentRequestsTab`, drawer, …) | ✅ Done |
| Mini-window AR trong PR drawer | ✅ FE Done |
| Feedback 27–28/05 (date format, reject, QR copy, …) | 🔄 Phase A2 pending |

---

## Luồng Payment Request (B1–B4)

```
B1  Tạo PR (UID, KH, target) ──► PR-ID
         │
B2  Thêm payment_lines (QR / cash / thẻ) ──► received + state (pending/short/done/over)
         │ tiền đủ 100%
B3  Active Request ──► Course code ──► Ops nhập Order ID CRM
         │
B4  Xuất hóa đơn thuế
```

Spec chi tiết: [`docs/PROTOTYPE_PAYMENT_FLOW.md`](docs/PROTOTYPE_PAYMENT_FLOW.md)

---

## Branch & quy trình làm việc

| Branch | Mục đích |
|--------|----------|
| `main` | Production baseline (Vercel promote từ đây) |
| `test-integration-final` | Integration QA — merge BE/FE trước khi lên `main` |
| `ui/ux` / `ui/ux-anh-minh` | UI prototype + payment flow |
| `feature-kem` | Backend Kem/Giang — **rebase từ integration**, không merge nguyên khối nếu conflict |
| `feature-duc` | Integration Đức |

Quy tắc:

- Task board: cập nhật [`docs/TODO.md`](docs/TODO.md) khi done/pending.
- Handoff BE: [`docs/HANDOFF_GIANG_DUC_2026-05-27.md`](docs/HANDOFF_GIANG_DUC_2026-05-27.md)
- UI workflow: [`docs/WORKFLOW_UI_UX.md`](docs/WORKFLOW_UI_UX.md)

---

## Cấu trúc repo

```
palfish-t-i-u-h-th-ng-ver-2/
├── frontend/                 React app (Vite)
│   ├── src/components/       Tab1/2, PaymentRequestsTab, Module3/4/5, …
│   ├── src/contexts/         PaymentFlowContext
│   ├── src/lib/api.ts        Axios + endpoints
│   └── vercel.json
├── backend/
│   ├── main.py               FastAPI — orders, webhook, PayOS
│   ├── payment_request_routes.py   B1/B2 PR API
│   ├── activation_routes.py  B3 Active Request
│   ├── invoice_routes.py     M3/M4
│   ├── revenue_routes.py     M5 Sổ doanh thu
│   ├── rbac.py               Phân quyền JWT
│   └── run.ps1               Chạy local (Windows)
├── api_pipe/
│   └── payos_webhook.py      PayOS → giao_dich / don_hang
├── docs/                     Spec, TODO, SQL patches, deploy
├── scripts/                  Seed, E2E, audit
├── supabase/functions/       Edge functions (webhook)
└── render.yaml               Render deploy config
```

Schema SQL (chạy theo thứ tự trên Supabase SQL Editor):

`supabase_schema_patch.sql` → v2 → v3 → v4 → v5 → v5_invoice → `supabase_schema_patch_payment_requests.sql` → `active_requests_nullable_pr.sql`

Cuối mỗi patch: `NOTIFY pgrst, 'reload schema';`

---

## Chạy local

Chi tiết: [`docs/SETUP_ENV.md`](docs/SETUP_ENV.md)

### Yêu cầu

- Node.js 20+
- Python 3.12+
- Tài khoản Supabase (URL + anon key + service role key)

### Backend

```powershell
cd backend
Copy-Item .env.example .env   # điền SUPABASE_SERVICE_ROLE_KEY
.\run.ps1
# → http://127.0.0.1:8000/healthz
```

### Frontend

```powershell
cd frontend
Copy-Item .env.example .env.local   # VITE_SUPABASE_* + VITE_API_BASE_URL
npm install
npm run dev
# → http://localhost:5173
```

### Test

```powershell
cd frontend
npm run test
npm run build
```

E2E script (M1–M4): `scripts/e2e_m1_m4_flow.py`

---

## Deploy & tài liệu

| Tài liệu | Nội dung |
|----------|----------|
| [`docs/PROJECT.md`](docs/PROJECT.md) | Spec tổng quan, schema, RBAC |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Vercel + Render |
| [`docs/AUTH_SETUP.md`](docs/AUTH_SETUP.md) | Google OAuth, Resend SMTP |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design tokens `#7260ff` |
| [`docs/MODULE_3_4.md`](docs/MODULE_3_4.md) | Spec hóa đơn thuế |
| [`docs/MODULE_SO_DOANH_THU.md`](docs/MODULE_SO_DOANH_THU.md) | Module 5 |
| [`docs/M5_OPERATIONS.md`](docs/M5_OPERATIONS.md) | Vận hành Sổ doanh thu |
| [`docs/TODO.md`](docs/TODO.md) | Task board (nguồn tiến độ) |

### Biến môi trường chính

**Backend (`backend/.env`):**

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SYSTEM_ADMIN_EMAILS=...
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
FRONTEND_URL=http://localhost:5173
```

**Frontend (`frontend/.env.local`):**

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=http://localhost:8000
VITE_BANK_BIN=970422
VITE_BANK_ACCOUNT=1680011668899
```

---

## Đội ngũ

| Vai trò | Phạm vi |
|---------|---------|
| **Minh** | FE/BE chính, UI/UX, deploy, QA |
| **Giang** | PayOS, backend PR routes, webhook |
| **Đức** | Integration QA, Supabase, merge branches |
| **Hiếu** | FE prototype B1–B4, UX feedback |
| **Kem** | Backend Pandas/Supabase (branch `feature-kem`) |

---

## License & ghi chú

Dự án nội bộ PalFish — không public. Không commit `.env`, service role key, hoặc PayOS secrets.
