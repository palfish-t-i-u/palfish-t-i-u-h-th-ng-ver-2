# Bàn giao dự án — PalFish GMV Manager

> **Đối tượng:** Codex / agent AI tiếp quản bảo trì và phát triển.  
> **Cập nhật:** 2026-05-24 · branch `main` · commit gần nhất: `2c63e43`  
> **Ngôn ngữ UI:** Tiếng Việt · **Timezone vận hành:** UTC+7 (HCM)

---

## 1. Dự án là gì?

**PalFish GMV Manager** là web app nội bộ cho đội Sales PalFish Việt Nam:

1. **Tạo đơn + QR PayOS** → khách chuyển khoản với Info Code (`Thanh toan KHxxx`)
2. **Đối soát tiền về** qua PayOS webhook → cập nhật `don_hang.tien_ve`
3. **Quản lý đơn, biên lai, hủy đơn, tick CRM**
4. **Sổ doanh thu, báo cáo BC01/BC02/BC03**
5. **Đồng bộ CRM PalFish** (Module 5) + **Dashboard KPI Sale** (Module 6)

Không phải SaaS công khai — chỉ user có tài khoản Supabase Auth (Google OAuth chính).

---

## 2. Production & repo

| Thành phần | URL / Ghi chú |
|------------|----------------|
| **Frontend** | https://palfish-gmv-manager.vercel.app |
| **Backend API** | https://palfish-gmv-api.onrender.com |
| **Supabase** | Project `jozcvbbypwvzaefteoxn` |
| **GitHub (hiện tại)** | `palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2` |
| **API qua Vercel proxy** | `/api/*` → Render (xem `frontend/vercel.json`) |

**Deploy tự động:** push `main` → Vercel (FE) + Render (BE, plan free có thể sleep).

**Lưu ý docs cũ:** `docs/PROJECT.md`, `docs/DEPLOY.md` vẫn nhắc repo `palfish-gmv-manager` hoặc branch `ui/ux-anh-minh` — **đã merge vào `main`**. Ưu tiên file bàn giao này + code thực tế.

---

## 3. Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | React 19, Vite, TypeScript, Tailwind, Recharts |
| Backend | FastAPI, Python 3.11+, httpx, pandas (CRM sync) |
| DB + Auth | Supabase PostgreSQL + Supabase Auth |
| Thanh toán | PayOS v2 (`/payos/create-link`, webhook) |
| CRM nguồn | PalFish internal CRM (HTTP + cookie từ Chrome extension) |
| Deploy | Vercel (FE), Render Docker (BE), Supabase Edge Function (webhook tùy chọn) |

---

## 4. Cấu trúc repo (quan trọng)

```
palfish-gmv-manager/
├── frontend/                 # React SPA — deploy Vercel
│   ├── src/pages/MainPage.tsx    # Orchestrator: sidebar views, không React Router per-tab
│   ├── src/layouts/AppShell.tsx  # Sidebar + mobile bottom nav
│   ├── src/components/           # Tab1Form, Tab2Table, Module3–6, BC*, PayosHistoryTab
│   ├── src/lib/api.ts            # Axios client + endpoints.*
│   ├── src/lib/apiBaseUrl.ts     # /api prod, localhost:8000 dev
│   └── vercel.json               # Proxy /api → Render; /webhook/payos → Supabase EF
│
├── backend/
│   ├── main.py               # FastAPI entry: orders, PayOS, đăng ký router
│   ├── admin_routes.py       # /me, /admin/*
│   ├── crm_routes.py         # M5: sync, backfill, token, export
│   ├── crm_metrics.py        # Column mapping CRM, C4/C5/L3.3, sum_metrics
│   ├── dashboard_routes.py   # M6: daily_trends + live_summary (hybrid)
│   ├── report_routes.py      # BC03
│   ├── revenue_routes.py     # Sổ doanh thu, pivot BC01/BC02, GSheet sync
│   ├── invoice_routes.py     # M3/M4 hóa đơn
│   ├── rbac.py               # Sale / Leader / Manager / System
│   ├── run.ps1               # Chạy local Windows
│   └── Dockerfile            # Context = repo root (cần api_pipe/)
│
├── api_pipe/
│   └── payos_webhook.py      # ★ CANONICAL PayOS đối soát — backend import file này
│
├── supabase/functions/payos-webhook/  # Edge Function (always-on webhook + HMAC verify)
├── crm-token-extension/      # Chrome ext gửi cookie CRM → POST /system/update-crm-token
├── docs/                     # Spec, SQL patches, TODO, CHANGELOG
├── scripts/                  # Seed, audit, import one-off
├── render.yaml
└── open_guide.txt            # Quick start local (Windows)
```

**Không dùng nữa nhưng còn trong repo:** `api_pipe/app_payment.py`, docs nhắc `cau_hinh.py` (đã xóa).

---

## 5. Map Module → UI → API → DB

SPA một route `/` — đổi tab bằng `activeView` trong `MainPage.tsx`, **không** có URL riêng từng module.

| Module | Sidebar label | Component | Backend chính | Bảng DB |
|--------|---------------|-----------|---------------|---------|
| **M1** Tạo đơn | (Modal từ Tab 2) | `Tab1Form.tsx` | `POST /orders`, `POST /payos/create-link` | `khach_hang`, `don_hang` |
| **M2** Quản lý đơn | Quản lý mã QR | `Tab2Table.tsx` | `GET/PATCH /orders`, poll 15s | `don_hang` |
| **PayOS log** | Lịch sử PayOS | `PayosHistoryTab.tsx` | `GET /payos/transactions` | `giao_dich` |
| **M3** Xác nhận CRM | Xác nhận CRM | `Module3Tab.tsx` | `invoice_routes` | `don_hang` |
| **M4** Hóa đơn thuế | Xuất hóa đơn | `Module4Tab.tsx` | `invoice_routes` | `xuat_hoa_don_batch` |
| **Sổ DT** | Sổ doanh thu | `SoDoanhThuTab.tsx` | `revenue_routes` | `so_doanh_thu` |
| **BC01** | Báo cáo → BC01 | `BC01SalesPerformance.tsx` | `/revenue/pivot/sales-performance` | `so_doanh_thu` |
| **BC02** | Báo cáo → BC02 | `BC02KeyDataReport.tsx` | `/revenue/pivot/key-data` | `so_doanh_thu` |
| **BC03** | BC03 tổng bộ | `ReportBC03Tab.tsx` | `report_routes` + live KPI | `crm_sales_data`, settings |
| **M5** | Đồng bộ CRM | `Module5Tab.tsx` | `crm_routes` | `crm_sales_data`, `crm_tokens` |
| **M6** | Dashboard Sale | `Module6Tab.tsx` | `dashboard_routes` | `crm_sales_data` + live PalFish |
| **Admin** | Nhân sự / Auth | `StaffCRMTab`, `AuthAccountsTab` | `admin_routes` | `nhan_su_sale` |

**Phân quyền sidebar:** `profile.canConfirmPayment` → M3/M4/Sổ/Báo cáo/M5/M6; `canAccessAdmin` → Nhân sự; `canManageStaff` → Auth.

---

## 6. Luồng nghiệp vụ cốt lõi

### 6.1 Tạo đơn + thanh toán (M1 + M2)

```
Sale mở modal Tab1Form
  → POST /orders (tạo khach_hang + don_hang, info_code = "Thanh toan KHxxx")
  → POST /payos/create-link → PayOS API → QR EMV + checkoutUrl
  → Hiển thị InlinePaymentCard (Tab1) hoặc PaymentModal (Tab2 xem lại QR)

Khách CK / PayOS webhook
  → POST /webhook/payos (Render) hoặc Supabase Edge Function
  → api_pipe/payos_webhook.reconcile_bank_payment()
       · Tìm đơn: regex KH|DH trong description, ILIKE info_code
       · amount >= so_tien_can_thu → tien_ve=true, trang_thai=da_thanh_toan
       · INSERT giao_dich (trang_thai_doi_soat: khop | sai_tien | chua_xu_ly)

Tab2 poll GET /orders mỗi 15s → thấy tienVe=true
```

**PayOS QR:** Cả Tab1 và Tab2 đều dùng PayOS (commit `2c63e43`). Không còn VietQR tĩnh trong `PaymentModal`.

**Trạng thái đối soát (frontend filter):** `khop` | `sai_tien` | `chua_xu_ly`. Backend ghi lowercase; API list map legacy `DA_KHOP`… khi đọc/filter.

**Webhook URL:** Có 2 đường — cấu hình PayOS Dashboard phải khớp một trong hai:
- Render: `https://palfish-gmv-api.onrender.com/webhook/payos`
- Vercel rewrite: `https://palfish-gmv-manager.vercel.app/webhook/payos` → Supabase EF (có verify HMAC)

Logic đối soát **chuẩn:** `api_pipe/payos_webhook.py`. Edge Function là bản copy TypeScript — khi sửa logic, **đồng bộ cả hai** hoặc chỉ dùng một URL.

### 6.2 CRM hybrid (M5 + M6 + BC03)

Kiến trúc sau commit `9efe053`:

| Nguồn | Dùng cho | Lưu DB? |
|-------|----------|---------|
| **Incremental sync** `POST /crm/sync` | 1 ngày → upsert `crm_sales_data` | Có |
| **Backfill** `POST /crm/sync/backfill` | Nhiều ngày song song (`concurrency` 5–8, max 31 ngày) | Có |
| **Live pull** `GET /dashboard/live_summary` | KPI cards, Top Sale real-time | **Không** |
| **DB query** `GET /dashboard/daily_trends` | Biểu đồ theo ngày | Đọc DB |

**Khóa DB:** `(sale_name, report_date)` — patch `docs/supabase_schema_patch_crm_hybrid.sql`.

**CRM token:** Chrome extension `crm-token-extension/` → `POST /system/update-crm-token` → bảng `crm_tokens`. M5 hiển thị `GET /crm/token-status`.

**Column mapping:** PalFish header EN/CN → snake_case trong `crm_routes.COLUMN_MAPPING` + `crm_metrics.CRM_COLUMNS`. Raw row lưu trong `raw_data` JSONB.

### 6.3 Công thức KPI Dashboard (M6) — đã xác nhận với team

| KPI | Công thức |
|-----|-----------|
| **C4** | `Σ total_connections / Σ total_call_time (C1) × 100` |
| **C5** | `Σ over_3min_connections / Σ total_call_time (C1) × 100` |
| **L3.3** | Mỗi ngày: `preview_rate × scheduled_classes / 100`; gom kỳ: `Σ preview_count / Σ scheduled × 100` |

**Không** dùng cột `Connection Rate` / `Over 3 Min.Rate` export CRM làm C4/C5 — mẫu số khác (Dials/Connections).

Code: `backend/crm_metrics.py` → `extract_row_metrics`, `sum_metrics`, `merge_sale_detail`.

---

## 7. Auth & RBAC

- **Login:** Supabase Auth — Google OAuth (khuyến nghị), magic link. Confirm email **tắt**.
- **JWT:** Frontend gắn `Authorization: Bearer` qua axios interceptor (`api.ts`).
- **Role:** Lấy từ `nhan_su_sale` theo email login. Fallback `sale`.
- **Cấp bậc:** `sale` < `leader` < `manager` < `system` (`rbac.py` `ROLE_RANK`).
- **System tạm:** email trong env `SYSTEM_ADMIN_EMAILS` (local + Render).
- **Tick tiền về thủ công:** `OPS_EMAILS` hoặc role ops/system → `can_confirm_payment()`.

Chi tiết setup: `docs/AUTH_SETUP.md`.

---

## 8. Chạy local

Xem `open_guide.txt`:

```powershell
# Terminal 1 — Backend
powershell -ExecutionPolicy Bypass -File "C:\job\palfish-gmv-manager\backend\run.ps1"

# Terminal 2 — Frontend
cd frontend; npm run dev
```

| Dịch vụ | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://127.0.0.1:8000 |
| Swagger | http://127.0.0.1:8000/docs |

**Env bắt buộc:**
- `backend/.env` hoặc `api_pipe/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYOS_*`
- `frontend/.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Backend load dotenv: **`api_pipe/.env` trước**, rồi `backend/.env` (override).

**PayOS local:** Cần ngrok → cập nhật webhook PayOS Dashboard (xem `open_guide.txt`).

**Test webhook giả:** `POST /webhook/bank-simulate` với `{ description, amount }`.

---

## 9. Deploy checklist

### Render (backend)
- Dockerfile context = **repo root** (copy `api_pipe/`)
- Env: `SUPABASE_*`, `FRONTEND_URL`, `PAYOS_*`, `SYSTEM_ADMIN_EMAILS`, `OPS_EMAILS`
- Health: `GET /healthz`

### Vercel (frontend)
- Root: `frontend/`
- `VITE_API_BASE_URL=/api` (rewrite trong `vercel.json`)
- Sau push UI: kiểm tra build CI `.github/workflows/frontend-ci.yml` (`tsc -b && vite build`)

### Supabase
- Chạy SQL patches theo thứ tự (mục 10)
- Edge Function: `supabase functions deploy payos-webhook` (nếu dùng webhook qua Vercel)
- Redirect URLs: localhost + production Vercel URL

Chi tiết: `docs/DEPLOY.md`, `docs/M5_OPERATIONS.md` (Promote Vercel nếu preview branch).

---

## 10. Database — bảng & SQL patches

### Bảng chính

| Bảng | Vai trò |
|------|---------|
| `khach_hang` | CRM UID, SĐT, địa chỉ |
| `don_hang` | Đơn sale: info_code, tien_ve, bill_image, trang_thai, … |
| `giao_dich` | Log PayOS/bank, trang_thai_doi_soat |
| `nhan_su_sale` | 149 sale, team, role, email |
| `crm_sales_data` | Snapshot CRM theo ngày (sale_name, report_date, raw_data) |
| `crm_tokens` | Cookie PalFish CRM |
| `so_doanh_thu` | Sổ doanh thu Module 5.1 |
| `bc03_monthly_settings` | KPI thủ công BC03 |

### Thứ tự patch (SQL Editor → `NOTIFY pgrst, 'reload schema'`)

1. `supabase_schema_patch.sql` (base)
2. `v2` → `v3` → `v4` → `v5` → `v5_invoice` (M3/M4)
3. `v6`, `v7_so_doanh_thu` (Sổ)
4. `supabase_schema_patch_crm_*.sql` (CRM tokens, record_type, hybrid unique key)
5. `supabase_schema_patch_bc03_monthly.sql`
6. **Chưa commit:** `supabase_schema_patch_revenue_ledger_link.sql` — hỏi team trước khi chạy prod

Diagnostic: `docs/supabase_diagnose.sql`.

---

## 11. API index (tra cứu nhanh)

Đầy đủ trong Swagger `/docs`. Client FE: `frontend/src/lib/api.ts` → `endpoints.*`.

| Nhóm | Endpoint quan trọng |
|------|---------------------|
| Orders | `GET/POST /orders`, `PATCH /orders/{id}`, `POST .../cancel`, `POST .../bill` |
| PayOS | `POST /payos/create-link`, `POST /webhook/payos`, `GET /payos/transactions` |
| CRM M5 | `POST /crm/sync`, `POST /crm/sync/backfill`, `GET /crm/export-master`, `GET /crm/token-status` |
| Dashboard M6 | `GET /dashboard/live_summary`, `GET /dashboard/daily_trends`, `GET /dashboard/filters` |
| BC03 | `GET /reports/bc03`, `PUT /reports/bc03/monthly` |
| Revenue | `GET/POST/PATCH/DELETE /revenue/ledger`, `POST /revenue/ledger/sync-gsheet` |
| Admin | `GET/PATCH /me`, `/admin/sales`, `/admin/auth-users` |

**Supabase pagination:** CRM/dashboard query có page 1000 rows — logic paginate trong `crm_metrics.fetch_crm_sales_rows`.

---

## 12. Quy ước code (bắt buộc khi sửa)

1. **Minimal diff** — không refactor lan man; match style file xung quanh.
2. **Backend metrics CRM** — sửa `crm_metrics.py` trước; routes chỉ orchestrate.
3. **PayOS** — sửa `api_pipe/payos_webhook.py`; `main.py` chỉ wrap. Đồng bộ Edge Function nếu đổi reconcile.
4. **Frontend API** — thêm endpoint vào `api.ts` + types `types/order.ts` hoặc `types/revenue.ts`.
5. **Tiếng Việt UI** — label user-facing giữ tiếng Việt; code/comments có thể EN/VN mix như hiện tại.
6. **Design system** — dùng `components/ui/*`, tokens `gmv-tokens.css`, brand `#7260ff` (`docs/DESIGN.md`).
7. **RBAC** — mọi list nhạy cảm filter qua `visible_creator_emails()` hoặc `require_min_role()`.
8. **Commit** — chỉ khi user yêu cầu; message dạng `fix:` / `feat:` ngắn, mô tả *why*.

---

## 13. CI & chất lượng

- **GitHub Actions:** `.github/workflows/frontend-ci.yml` — `npm run build` (TypeScript strict).
- **Lỗi hay gặp:** type FE lệch response backend → build Vercel fail (vd. commit `e83e08b` fix `k` undefined BC03).
- **Backend:** không có CI tự động — test tay qua `/docs` hoặc script trong `scripts/`.

---

## 14. Nợ kỹ thuật & cạm bẫy

| Vấn đề | Ghi chú |
|--------|---------|
| Docs stale | `PROJECT.md` vẫn ghi VietQR primary; `WIREFRAMES.md` map Tab1 → PaymentModal cũ |
| 3 webhook copies | `payos_webhook.py`, Edge Function, `app_payment.py` — chỉ file đầu là canonical |
| Render free tier sleep | Webhook có thể miss nếu chỉ trỏ Render — cân nhắc Supabase EF |
| `docs/TODO.md` | M1-08 CK thật chưa nghiệm thu; I-02 CRM auto-activate stub |
| Metabase packages | Fallback hardcoded nếu thiếu env Metabase |
| Audit log Tab2 | Bảng `don_hang_audit` có schema, app chưa ghi |
| Dual repo history | FE từng ở branch `ui/ux-anh-minh` — đã merge `main` |

---

## 15. Lịch sử commit gần đây (context)

| Commit | Nội dung |
|--------|----------|
| `2c63e43` | PayOS: status khop/sai_tien/chua_xu_ly; PaymentModal → PayOS |
| `5a324ee` | Dashboard C4/C5 tính từ Total Call Time |
| `9efe053` | Hybrid CRM: daily_trends + live_summary, backfill song song |
| `7fa40c7` | Merge UI/UX branch vào main |
| `45af051` | CRM autonomous sync, BC03, Dashboard Sale VN |

CHANGELOG chi tiết: `docs/CHANGELOG.md` (chỉ append, không sửa entry cũ).

---

## 16. Tài liệu đọc theo tình huống

| Cần làm gì | Đọc file |
|------------|----------|
| Setup lần đầu | `docs/SETUP_ENV.md`, `open_guide.txt` |
| Deploy prod | `docs/DEPLOY.md` |
| Auth Google/SMTP | `docs/AUTH_SETUP.md` |
| UI/UX rules | `docs/DESIGN.md`, `docs/WORKFLOW_UI_UX.md` |
| M3/M4 hóa đơn | `docs/MODULE_3_4.md` |
| Sổ + GSheet sync | `docs/M5_GSHEET_IMPORT.md`, `docs/M5_OPERATIONS.md` |
| Task board | `docs/TODO.md` |
| Wireframe phân quyền | `docs/WIREFRAMES.md` |

**File ưu tiên khi debug:**

- PayOS: `api_pipe/payos_webhook.py`, `backend/main.py` (create-link, list transactions)
- CRM sync: `backend/crm_routes.py`
- Dashboard KPI: `backend/crm_metrics.py`, `backend/dashboard_routes.py`
- FE shell: `frontend/src/pages/MainPage.tsx`, `frontend/src/lib/api.ts`

---

## 17. Checklist tiếp quản cho Codex

- [ ] Clone repo, chạy local theo mục 8
- [ ] Có quyền Supabase dashboard (đọc schema, không cần service_role trong chat)
- [ ] Xác nhận Render/Vercel env vars còn đủ
- [ ] Xác nhận PayOS Dashboard webhook URL đang trỏ đâu (Render vs Supabase EF)
- [ ] Extension CRM token còn hoạt động với domain PalFish hiện tại
- [ ] Đọc mục 14 trước khi sửa PayOS / CRM metrics
- [ ] Sau sửa FE: `cd frontend && npm run build`
- [ ] Cập nhật `docs/CHANGELOG.md` + `docs/TODO.md` khi hoàn thành task lớn

---

## 18. Liên hệ / domain (tham khảo)

- Team PalFish nội bộ — phân công lịch sử: Minh (FE/BE/deploy), Giang (PayOS/STK), Thu Hiền (SOP sync CRM hàng ngày).
- PalFish CRM: cookie-based, không public API doc — logic reverse-engineer trong `crm_routes.py`.

---

*Tài liệu này là nguồn bàn giao chính cho agent tiếp theo. Khi code lệch doc, **tin code** và cập nhật file này.*
