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

**Phân công:** Minh — Frontend, Backend, QA, Deploy, tab phân quyền. Giang — PayOS, STK/VietQR production, CRM.

---

### Phạm vi Module 1

**Đã có (local + production — smoke test 2026-05-21 OK):**

- **UI:** Sidebar (`AppShell`), design tokens `#7260ff` (`docs/DESIGN.md`, `components/ui/`); bottom nav mobile; nhóm **Quản lý quyền** → **Nhân sự Sale** + **Tài khoản Auth**
- Auth: **Google OAuth** (khuyến nghị), magic link, Resend SMTP; **Confirm email** tắt (`AUTH_SETUP.md` §0); redirect localhost trong Supabase Redirect URLs
- **Tạo đơn (Tab 1):** gợi ý UID, multi UID, đặt cọc, lead kênh, format VND; **Số buổi học** tự tính (`packageParse.ts`); SĐT +84 (9 số, bỏ 0) + whitelist đầu số; QR + **Copy**
- **Quản lý đơn (Tab 2):** bảng freeze 3 cột trái + 2 cột phải, scroll ngang giữa; up bill, **Hủy đơn**, tick tiền về/CRM; poll 15s
- **Lịch sử PayOS:** `GET /payos/transactions` — `khop` / `sai_tien` / `chua_xu_ly`
- **Thông tin cá nhân:** helper ghép CRM vs tên hiển thị (`PATCH /me`)
- RBAC 4 cấp; nhân sự VN (`vn_staff.py`); `SYSTEM_ADMIN_EMAILS` local + Render
- PayOS: `POST /webhook/payos` → `api_pipe/payos_webhook.py` (Giang); backend load `api_pipe/.env`
- FE production: `apiBaseUrl.ts` — không gọi nhầm `localhost:8000` trên Vercel
- Deploy Vercel + Render; repo `palfish-t-i-u/palfish-gmv-manager`

**Chưa / đang chờ:**

- CK thật qua QR nghiệm thu end-to-end (STK MB đã cấu hình code/env — Giang xác nhận PayOS + bank app)
- Droplist UID từ **CRM API / Metabase** thật (hiện fallback khách theo đơn sale đã tạo)
- Inline edit + audit log Tab 2 (bảng `don_hang_audit` đã tạo, chưa ghi log)
- Metabase gói học live (fallback 3 gói)
- Sync Metabase 24h cron
- Dashboard Leader (GMV tổng hợp team)
- CRM auto-activate sau thanh toán
- **Module 3 & 4** — xuất 3 file hóa đơn thuế (spec: **`docs/MODULE_3_4.md`**, SQL: `supabase_schema_patch_v5_invoice.sql`)

---

## Cấu trúc repo

```
pf-gmv-reconciliation/
├── frontend/
│   ├── src/layouts/       AppShell.tsx (sidebar)
│   ├── src/pages/         MainPage, ProfilePage, LoginPage
│   ├── src/components/    Tab1/2, PayosHistoryTab, StaffCRMTab, AuthAccountsTab
│   ├── src/components/ui/ Button, Card, Table, Modal, … (design system)
│   ├── src/gmv-tokens.css + gmv-theme.css
│   ├── src/constants/bank.ts   VietQR (VITE_BANK_*)
│   ├── src/hooks/         useAuth, useMe
│   └── vercel.json
├── backend/
│   ├── main.py            # FastAPI + Supabase (+ webhook PayOS từ api_pipe)
│   ├── rbac.py            # Phân quyền JWT
│   ├── admin_routes.py    # /me, /admin/*, /crm/customers
│   ├── run.ps1            # Chạy local (Windows)
│   └── Dockerfile
├── api_pipe/
│   ├── payos_webhook.py   # PayOS → giao_dich / don_hang (dùng chung backend)
│   ├── cau_hinh.py        # Chạy webhook độc lập (port 8001, tùy chọn)
│   └── .env               # SUPABASE_* + PAYOS_* (backend tự load)
├── docs/
│   ├── PROJECT.md         File này
│   ├── CHANGELOG.md       Nhật ký code (chỉ thêm entry)
│   ├── TODO.md            Task board
│   ├── SETUP_ENV.md       Local
│   ├── DEPLOY.md          Vercel + Render
│   ├── AUTH_SETUP.md      Resend SMTP + Google OAuth
│   ├── DESIGN.md          Design tokens + UI rules (production)
│   ├── WIREFRAMES.md      Logic phân quyền + wireframe (draft)
│   ├── supabase_schema_patch.sql
│   ├── supabase_schema_patch_v2.sql
│   ├── supabase_schema_patch_v3.sql
│   ├── supabase_schema_patch_v4.sql
│   ├── supabase_schema_patch_v5.sql      # Tab1: dat_coc, lead_kenh, uid_phu
│   ├── supabase_schema_patch_v5_invoice.sql  # M3/M4 hóa đơn
│   ├── MODULE_3_4.md                     # Spec triển khai M3/M4 (đọc trước khi code)
│   ├── supabase_diagnose.sql
│   └── supabase_storage_setup.md
├── scripts/
│   ├── seed_nhan_su_sale.py
│   └── extract_hierarchy.cjs
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

Patch (SQL Editor, thứ tự): **v1** → **v2** → **v3** → **v4** → **v5** (Tab1 feedback 22/05) → **v5_invoice** (M3/M4). Cuối mỗi patch: `NOTIFY pgrst, 'reload schema'`. Xem `supabase_diagnose.sql` nếu lỗi cột.

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

## Tiến độ (cập nhật 2026-05-22 — M3/M4 MVP + test feedback round 2)

### Hoàn thành

| Hạng mục | Chi tiết |
|----------|----------|
| Module 1 E2E | Tạo đơn, QR, Tab 2, bill, PayOS tab, hủy đơn — prod + local |
| UI sidebar | `AppShell`, flatten Quản lý quyền |
| UI design system | `gmv-tokens`, `components/ui`, brand tím — `docs/DESIGN.md` |
| VietQR defaults | MB Bank `970422` / `1680011668899` — override `VITE_BANK_*` |
| Production deploy | Vercel + Render, Docker context `.`, `python-multipart` |
| Schema prod | v3 + v4 + `NOTIFY pgrst`; `crm_uid`, `created_by`, `bill_image` |
| PayOS + P3 | Webhook Giang, copy QR, signup Google-first |
| RBAC + VN staff | `vn_staff.py`; local `SYSTEM_ADMIN_EMAILS` |
| Module 3 & 4 MVP | `Tab3CRMConfirm`, `Tab4InvoiceQueue`, `invoice_routes`, `tax_export.py` — spec `MODULE_3_4.md` |
| M3 bulk xuất + parser floor tháng | Toolbar **Xuất hóa đơn**, `queue-batch`, `floor(tuần/4)` |

### Đang chờ / backlog M3-M4

| Hạng mục | Ghi chú |
|----------|---------|
| Bucket `tax_exports` (Supabase) | TODO M3-01 |
| Excel layout merged header như mẫu | TODO M3-05 — `Report/3 file thuế/` |
| Smoke E2E prod sau deploy round 2 | TODO M34-01 |

### Đang chờ

| Hạng mục | Ghi chú |
|----------|---------|
| CK thật / nghiệm thu QR | STK MB trong env; PayOS + bank app — Giang |
| UID CRM từ API CRM/Metabase | Fallback `/crm/customers` |
| Audit log Tab 2 | Schema có, code chưa |
| Cron sync Metabase 24h | A-08 |
| Lọc hết tên nước ngoài (Josh, tiếng Trung) | Tạm chấp nhận — `TODO` B-08 |

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

- GitHub FE (ver-2, UI/UX): https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2 — branch `ui/ux-anh-minh`
- GitHub BE (Render): https://github.com/palfish-t-i-u/palfish-gmv-manager
- Workflow UI/UX + đổi máy: `docs/WORKFLOW_UI_UX.md`
- Supabase ref: `jozcvbbypwvzaefteoxn`
- Task board: `docs/TODO.md`
- Module 3 & 4 (xuất hóa đơn): `docs/MODULE_3_4.md`
- UI / tokens: `docs/DESIGN.md`
