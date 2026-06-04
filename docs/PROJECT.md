# PalFish GMV Reconciliation Automation

## Dự án là gì?

**PalFish GMV Reconciliation Automation** là web app nội bộ hỗ trợ đội Sales PalFish theo dõi và đối chiếu đơn hàng / doanh thu (GMV). Luồng: tạo Info Code + QR → khách chuyển khoản → đối soát (`giao_dich`) → dashboard Tab 2 → (sau) CRM.

### Kiến trúc tổng quan

```
Sales (Tab 1) ──► Supabase (khach_hang, don_hang)
                        ▲
                        │ PayOS webhook → api_pipe/payos_webhook.py
                        │ (khớp mã KH/DH + đúng số tiền mới bật tien_ve)
              Bank/PayOS ──► giao_dich ──► Tab 2 (poll 15s) + tab Lịch sử PayOS
                        │
                        └── RBAC (Sale / Leader / Manager / System)
```

| Thành phần | Công nghệ | Production |
|------------|-----------|------------|
| Frontend | React 19 + Vite + TypeScript + Tailwind | [palfish-gmv-manager.vercel.app](https://palfish-gmv-manager.vercel.app) |
| Backend API | FastAPI + Supabase client | Render (`palfish-gmv-api`) |
| Database & Auth | Supabase PostgreSQL + Auth | Project `jozcvbbypwvzaefteoxn` |
| QR thanh toán | VietQR (`img.vietqr.io`) | `VITE_BANK_*` |

**Phân công:** Minh — Frontend, QA, Deploy, UI/UX. Giang — PayOS, CRM sync, webhook, encrypt. Đức — DB audit, RPC, dashboard gamification. Đạt — Auth/RBAC, permission endpoints.

---

### Phạm vi Module 1

**Đã có (local + production — smoke test 2026-05-21 OK):**

- **UI:** Sidebar (`AppShell`), design tokens `#7260ff` (`docs/DESIGN.md`, `components/ui/`); bottom nav mobile; PalFish branding (logo + favicon)
- Auth: **Google OAuth** (khuyến nghị), magic link, Resend SMTP; **Confirm email** tắt (`AUTH_SETUP.md` §0); password recovery + OTP
- **Tạo đơn (Tab 1):** gợi ý UID, multi UID, đặt cọc, lead kênh, format VND; **Số buổi học** tự tính (`packageParse.ts`); SĐT +84 (9 số, bỏ 0) + whitelist đầu số; QR + **Copy**
- **Quản lý đơn (Tab 2):** bảng freeze 3 cột trái + 2 cột phải, scroll ngang giữa; up bill, **Hủy đơn**, tick tiền về/CRM; poll 15s
- **Payment Request (B1–B4):** PR drawer + mini-window Active Request; allocation guard; QR / cash / card; reconciliation confirm/reject
- **Lịch sử PayOS:** `GET /payos/transactions` — `khop` / `sai_tien` / `chua_xu_ly`; PayOS webhook signature verification
- **Dashboard:** gamification summary, today-honors, event carousel, monthly BXH, current_user rank card, team/subteam details
- **Permissions:** dynamic RBAC matrix (department×module), personal overrides, readOnly mode; sidebar wired to API
- **Auth Accounts:** detail drawer, CRM linking/unlinking, bulk delete, sub-team selection
- **Module 5:** Sổ doanh thu + Sales Performance pivot; CRM hybrid sync + autonomous sync; BC03 daily backfill + monthly
- RBAC dynamic; nhân sự VN (`vn_staff.py` case-insensitive + env config); `SYSTEM_ADMIN_EMAILS` local + Render
- PayOS: webhook + signature verify; backend load `api_pipe/.env`
- Backend audit: 22 issues fixed (DB sequences, auth endpoints, encrypt CRM token, audit log delete, atomic JSONB RPCs) — xem `HANDOFF_BE_AUDIT_2026-06-03.md`
- **E2E Testing:** Playwright — CRM Sync (6 tests) + Dashboard Sales (8 tests)
- Deploy Vercel + Render; sandbox branch workflow

**Chưa / đang chờ:**

- CK thật qua QR nghiệm thu end-to-end (STK MB đã cấu hình code/env — Giang xác nhận PayOS + bank app)
- Inline edit + audit log Tab 2 (bảng `don_hang_audit` đã tạo, chưa ghi log)
- Siết CORS Vercel regex (AUTH-06 — cần test preview URLs)
- DB-05: Transaction wrap KPI save
- OTHER-02: Trùng mã QR PayOS (sequence hoặc random suffix)
- Excel layout merged header Module 3 (M3-05)
- Module bank — kết nối biến động số dư (Giang/Đức)

---

## Cấu trúc repo

```
pf-gmv-reconciliation/
├── frontend/
│   ├── src/layouts/           AppShell.tsx (sidebar + dynamic permissions)
│   ├── src/pages/             MainPage (lazy load), ProfilePage, LoginPage, SignUpPage
│   ├── src/components/        Tab1/2, PayosHistoryTab, DashboardTab, Module3-6Tab, SoDoanhThuTab, DoanhThuSaleTab
│   ├── src/components/payment-request/  PaymentRequestsTab, ReconciliationTab, ActivationTab, InvoiceRequestTab, drawers
│   ├── src/components/auth/   AccountDetailDrawer, CrmLinkModal, CreateAccountModal, DeleteAccountsModal
│   ├── src/components/permissions/  PermissionsTab, OverrideDrawer, StaffPickerModal
│   ├── src/components/reports/  BC01SalesPerformance, BC02KeyDataReport, BC03Placeholder, ReportsHub
│   ├── src/components/ui/     Button, Card, Table, Modal, Badge, Combobox, Tooltip, … (design system)
│   ├── src/hooks/             useAuth, useMe, usePermissions
│   ├── e2e/                   Playwright tests (auth.setup, crm-sync, dashboard-sales)
│   └── vercel.json
├── backend/
│   ├── main.py                # FastAPI + Supabase + PayOS webhook (signature verify)
│   ├── rbac.py                # Dynamic RBAC + JWT
│   ├── admin_routes.py        # /me, /admin/*, CRM link/unlink, bulk delete
│   ├── activation_routes.py   # B3: Active Request, course activation, CRM order matching
│   ├── payment_request_routes.py  # B1: PR CRUD, payment lines, reconciliation
│   ├── revenue_routes.py      # M5: Sổ doanh thu, pivot, BC01/BC02
│   ├── report_routes.py       # BC03 daily/monthly
│   ├── dashboard_routes.py    # Gamification, BXH, team/subteam
│   ├── invoice_routes.py      # M3/M4: export batch, tax ZIP
│   ├── crm_routes.py          # CRM hybrid/autonomous sync, token encrypt
│   ├── crm_metrics.py         # CRM sales data upsert
│   ├── rpc_helpers.py         # Atomic JSONB RPCs, Postgres sequence allocators
│   ├── analytics_limits.py    # Row caps for dashboard/reports
│   ├── env_utils.py           # APP_ENV (default=development)
│   ├── payos_qr.py            # PayOS QR link creation
│   ├── vn_staff.py            # VN personnel filter (case-insensitive + env)
│   ├── tests/                 # 31 audit test cases (test_audit_auth/db/other)
│   ├── scripts/               # create_test_accounts, seed_sandbox_data, etc.
│   ├── run.ps1                # Chạy local (Windows)
│   └── Dockerfile
├── api_pipe/
│   ├── payos_webhook.py       # PayOS → giao_dich / don_hang (legacy, dùng chung backend)
│   └── .env                   # SUPABASE_* + PAYOS_* (backend tự load)
├── docs/
│   ├── PROJECT.md             File này
│   ├── CHANGELOG.md           Nhật ký code (chỉ thêm entry)
│   ├── TODO.md                Task board
│   ├── HANDOFF_BE_AUDIT_2026-06-03.md  Backend audit 22 issues
│   ├── SETUP_ENV.md, DEPLOY.md, AUTH_SETUP.md, DESIGN.md
│   ├── supabase_schema_patch*.sql     # v1..v8, CRM, BC03, DB audit, etc.
│   └── MODULE_SO_DOANH_THU.md, MODULE_3_4.md, M5_*.md
├── scripts/
│   ├── seed_nhan_su_sale.py, seed_so_doanh_thu.py
│   ├── extract_hierarchy.cjs, audit_*.py
│   └── decode_crm_prototype.py
├── render.yaml
└── train.html
```

---

## Schema Supabase (tóm tắt)

| Bảng | Vai trò |
|------|---------|
| `khach_hang` | KH: `crm_uid`, địa chỉ, SĐT |
| `don_hang` | Đơn: `info_code`, `tien_ve`, `bill_image`, `sale_crm_name`, …; M3/M4: `crm_order_id`, `ma_san_pham`, `cho_xuat_hoa_don`, … |
| `xuat_hoa_don_batch` | Batch xuất 3 file Excel + zip (M4) — sau patch v5_invoice |
| `giao_dich` | Tiền thật vào bank — khớp `info_code` |
| `nhan_su_sale` | 149 sale / 15 team — role, team, email link (patch v2) |
| `don_hang_audit` | Audit log đơn (schema sẵn, chưa ghi từ app) |
| `payment_requests` | Phiếu thu (B1); `sale_email`, `customer_email`, `status` |
| `payment_lines` | Các lần thanh toán: QR / cash / card; `bill_images` |
| `active_requests` | Yêu cầu kích hoạt (B3); `uids_data` JSONB; `pr_id` nullable |
| `so_doanh_thu` | Sổ doanh thu M5; import gsheet/xlsx/dingtalk/tay |
| `crm_sales_data` | CRM sales data upsert; `crm_tokens` cho sync |
| `bc03_monthly` | BC03 daily backfill + monthly report |
| `don_hang_seq` / `invoice_code_seq` / `payment_request_seq` | Postgres sequences — chống trùng mã (DB audit) |

Patch (SQL Editor, thứ tự): **v1** → **v2** → **v3** → **v4** → **v5** → **v5_invoice** → **v6** → **v7** (Sổ) → **v8** (bill_images + activated) → **payment_requests** → **active_requests** → **crm_\*** → **bc03_monthly** → **db_audit_20260603** (sequences + RPCs). Cuối mỗi patch: `NOTIFY pgrst, 'reload schema'`. Xem `supabase_diagnose.sql` nếu lỗi cột.

---

## Phân quyền (4 cấp)

| Cấp | Sidebar Quản lý quyền | Tab 2 đơn |
|-----|----------------------|-----------|
| Sale | Không | Chỉ đơn mình tạo |
| Sale Leader | Không | Đơn sub-team |
| Sale Manager | **Nhân sự Sale** (xem) | Đơn cả team |
| System | **Nhân sự Sale** + **Tài khoản Auth** | Tất cả + tick tiền về |

Gán role: System → tab Quản lý quyền, hoặc `UPDATE nhan_su_sale SET role=...`. Env `SYSTEM_ADMIN_EMAILS` (Render) = System tạm khi chưa có dòng CRM.

Chi tiết: `docs/WIREFRAMES.md`.

---

## Tiến độ (cập nhật 2026-06-04)

### Hoàn thành

| Hạng mục | Chi tiết |
|----------|----------|
| Module 1 E2E | Tạo đơn, QR, Tab 2, bill, PayOS tab, hủy đơn — prod + local |
| Payment Request B1–B4 | PR drawer, mini-window AR, allocation guard, QR/cash/card, reconciliation, invoice export |
| Module 3 & 4 MVP | Export batch, tax ZIP, CRM order matching |
| Module 5 | Sổ doanh thu, Sales Performance pivot, CRM sync, BC01/BC02 |
| Dashboard gamification | BXH, today-honors, event carousel, current_user rank, team/subteam |
| Permissions dynamic RBAC | Department×module matrix, personal overrides, readOnly mode |
| Auth accounts upgrade | Detail drawer, CRM linking/unlinking, bulk delete, sub-team |
| Backend audit (22/22 tasks) | DB sequences, auth endpoints, encrypt CRM token, audit log, atomic RPCs, webhook signature — `HANDOFF_BE_AUDIT_2026-06-03.md` |
| CRM hybrid sync | Autonomous sync, BC03 daily/monthly, CRM sales data upsert |
| E2E testing | Playwright: CRM Sync (6 tests) + Dashboard Sales (8 tests) |
| PalFish branding | Logo, favicon |
| UI design system | `gmv-tokens`, `components/ui`, brand tím — `docs/DESIGN.md` |
| Production deploy | Vercel + Render + sandbox branch workflow |

### Đang chờ

| Hạng mục | Ghi chú |
|----------|---------|
| CK thật / nghiệm thu QR | STK MB trong env; PayOS + bank app — Giang |
| AUTH-06: Siết CORS Vercel regex | Cần test Vercel preview URLs trước deploy |
| DB-05: Transaction wrap KPI save | Đức |
| OTHER-02: Trùng mã QR PayOS | Cần sequence hoặc random suffix |
| M3-05: Excel layout merged header | `Report/3 file thuế/` |
| Module bank — biến động số dư | Giang/Đức — `F2605-BANK-*` |
| Audit log Tab 2 | Schema có, code chưa |
| A2 Phase FE fixes | F2705-A2-01..11 — CSS, reject, copy, multi-bill |

---

## Chạy local

Chi tiết: **`docs/SETUP_ENV.md`**.

```powershell
cd backend; .\run.ps1
cd frontend; npm run dev   # package.json trong frontend/ — không chạy ở repo root
```

Local: `http://localhost:5173` (hoặc 5174/5175 nếu port bận). Cần `SYSTEM_ADMIN_EMAILS` trong `backend/.env` để thấy sidebar Quản lý quyền.

- Frontend: http://localhost:5173  
- Backend: http://localhost:8000/healthz  

---

## Biến môi trường

### Frontend (`frontend/.env.local`)

| Biến | Mô tả |
|------|--------|
| `VITE_API_BASE_URL` | Backend URL (không slash cuối) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | anon key |
| `VITE_OPS_EMAILS` | Email tick "tiền về" (fallback UI) |
| `VITE_BANK_BIN` | Napas BIN (mặc định `970422` MB) |
| `VITE_BANK_ACCOUNT_NO` | Số TK thu tiền |
| `VITE_BANK_ACCOUNT_NAME` | Tên chủ TK / pháp nhân (VietQR) |
| `VITE_BANK_DISPLAY_NAME` | Tên ngân hàng hiển thị |
| `VITE_BANK_BRANCH` | Chi nhánh (modal + copy CK) |

### Backend (`backend/.env` / Render)

| Biến | Mô tả |
|------|--------|
| `SUPABASE_URL` | Bắt buộc production |
| `SUPABASE_SERVICE_ROLE_KEY` | Bắt buộc — `/me`, admin API |
| `FRONTEND_URL` | CORS — **không** slash cuối |
| `SYSTEM_ADMIN_EMAILS` | Email → role System (tạm) |
| `OPS_EMAILS` | Email tick tiền về (backend) |
| `PAYOS_CLIENT_ID` | PayOS (có thể đặt trong `api_pipe/.env` — backend load cả hai) |
| `PAYOS_API_KEY` | |
| `PAYOS_CHECKSUM_KEY` | |
| `FRONTEND_URLS` | Thêm origin Vercel phụ (cách nhau dấu phẩy), tùy chọn |

**Frontend:** `VITE_API_BASE_URL` tùy chọn trên Vercel — nếu trống, build production dùng `https://palfish-gmv-api.onrender.com` (`apiBaseUrl.ts`).

---

## Deploy & Auth

- Deploy: **`docs/DEPLOY.md`**
- Resend + Google: **`docs/AUTH_SETUP.md`**

---

## Liên kết

- GitHub FE (ver-2): https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2
- GitHub BE (Render): https://github.com/palfish-t-i-u/palfish-gmv-manager
- Supabase ref: `jozcvbbypwvzaefteoxn`
- Task board: `docs/TODO.md`
- Backend audit: `docs/HANDOFF_BE_AUDIT_2026-06-03.md`
- Module 3 & 4: `docs/MODULE_3_4.md`
- Module 5: `docs/MODULE_SO_DOANH_THU.md`
- UI / tokens: `docs/DESIGN.md`
- Branches: `main` (production), `sandbox` (integration), `feature-duc` / `feature-dat` / `feature-kem` (dev)
