# Bàn giao dự án — PalFish GMV Manager

> **Đối tượng:** Codex / Gemini / agent AI tiếp quản bảo trì và phát triển.  
> **Cập nhật:** 2026-05-26 · production `main` · **WIP:** `feature-duc` (B3) + `feature-kem` (B1/B2)  
> **Ngôn ngữ UI:** Tiếng Việt · **Timezone vận hành:** UTC+7 (HCM)

**⚠️ Đọc file này thay vì suy luật từ `docs/PROJECT.md` / commit cũ.**  
Sau ngày 2026-05-27, `main` = bản production đầy đủ (đã merge `ui/ux-anh-minh`). Một lần push nhầm bản cũ lên `main` đã được khôi phục bằng merge `891a623`.

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

**Nguồn code production (2026-05-27):** chỉ **`main`**. Branch `ui/ux-anh-minh` đã merge xong — **không** deploy/promote từ branch đó nữa trừ khi team tách lại workflow.

**Lưu ý docs cũ:** `docs/PROJECT.md`, `docs/DEPLOY.md`, `docs/WORKFLOW_UI_UX.md` vẫn nhắc repo cũ hoặc “Promote từ preview branch” — **ưu tiên file bàn giao này + code trên `main`**.

---

## 3. Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | React 19, Vite, TypeScript, Tailwind, Recharts |
| Backend | FastAPI, Python 3.11+, httpx, pandas (CRM sync) |
| DB + Auth | Supabase PostgreSQL + Supabase Auth |
| Thanh toán | PayOS v2 + **VietQR fallback** nếu PayOS lỗi (Tab2 modal) |
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
│   ├── payos_qr.py           # Parse EMV QR → transferContent (tag 62)
│   ├── xlsx_ledger_import.py # Import Excel vào Sổ doanh thu
│   ├── admin_routes.py       # /me, /admin/*
│   ├── crm_routes.py         # M5: sync, backfill, token, export
│   ├── crm_metrics.py        # Column mapping CRM, C4/C5/L3.3, sum_metrics
│   ├── dashboard_routes.py   # M6: daily_trends + live_summary (hybrid)
│   ├── report_routes.py      # BC03
│   ├── revenue_routes.py     # Sổ doanh thu, pivot BC01/BC02, GSheet sync
│   ├── invoice_routes.py     # M3/M4 hóa đơn
│   ├── activation_routes.py  # ★ B3 Active Request (feature-duc, chưa merge main)
│   ├── rbac.py               # Sale / Leader / Manager / System
│   ├── run.ps1               # Chạy local Windows
│   └── Dockerfile            # Context = repo root (cần api_pipe/)
│
├── frontend/src/components/ui/
│   ├── Combobox.tsx          # Sổ doanh thu / form chọn gói
│   └── DataBar.tsx           # Thanh % trong báo cáo
│
├── frontend/src/lib/
│   ├── ledgerCellStyle.ts    # Màu loại nhập / phương thức TT (Sổ)
│   └── loaiLabel.ts          # Nhãn song ngữ loại giao dịch
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
| **M2** Quản lý đơn | Quản lý mã QR | `Tab2Table.tsx` | `GET/PATCH /orders` (+ `trangThaiThuTuc`), poll 15s | `don_hang` |
| **PayOS log** | Lịch sử PayOS | `PayosHistoryTab.tsx` | `GET /payos/transactions` | `giao_dich` |
| **M3** Xác nhận CRM | Xác nhận CRM | `Module3Tab.tsx` | `invoice_routes` | `don_hang` |
| **M4** Hóa đơn thuế | Xuất hóa đơn | `Module4Tab.tsx` | `invoice_routes` | `xuat_hoa_don_batch` |
| **BC01** | Báo cáo → BC01 | `BC01SalesPerformance.tsx` | `/revenue/pivot/sales-performance` | `so_doanh_thu` — header 2 dòng, sparkline, grand total |
| **BC02** | Báo cáo → BC02 | `BC02KeyDataReport.tsx` | `/revenue/pivot/key-data` | `so_doanh_thu` |
| **BC03** | BC03 tổng bộ | `ReportBC03Tab.tsx` | `report_routes` + live KPI | `crm_sales_data`, settings — sticky header, filter team |
| **Sổ DT** | Sổ doanh thu | `SoDoanhThuTab.tsx` | `revenue_routes` | `so_doanh_thu` — filter team, màu loại/PTTT, Combobox gói |
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
  → POST /payos/create-link → PayOS API
       · qrCode (EMV), checkoutUrl, transferContent (parse tag 62 qua payos_qr.py)
  → Tab1: InlinePaymentCard — luôn PayOS
  → Tab2 xem lại QR: PaymentModal — PayOS trước, VietQR fallback nếu API lỗi

Khách CK / PayOS webhook
  → POST /webhook/payos (Render) hoặc Supabase Edge Function
  → api_pipe/payos_webhook.reconcile_bank_payment()
       · Tìm đơn: regex KH|DH trong description, ILIKE info_code
       · amount >= so_tien_can_thu → tien_ve=true, trang_thai=da_thanh_toan,
         trang_thai_thu_tuc=CHO_XAC_NHAN
       · INSERT giao_dich (trang_thai_doi_soat: khop | sai_tien | chua_xu_ly)

Tab2 poll GET /orders mỗi 15s → tienVe + trangThaiThuTuc
```

**PayOS QR (production hiện tại):**
- **Tab1 (`InlinePaymentCard`):** PayOS bắt buộc — hiển thị `transferContent` từ QR EMV nếu khác `infoCode`.
- **Tab2 (`PaymentModal`):** thử PayOS trước; nếu lỗi → **VietQR dự phòng** (`buildVietQrUrl` trong `constants/bank.ts`) — cần tick tiền về thủ công nếu không qua webhook PayOS.
- **`POST /payos/create-link`** trả thêm: `transferContent`, `paymentLinkId` (ngoài `qrCode`, `checkoutUrl`).

**Trạng thái đối soát (Tab Lịch sử PayOS):** `khop` | `sai_tien` | `chua_xu_ly`. Backend ghi lowercase; API list map legacy `DA_KHOP`… khi đọc/filter.

**Webhook URL:** Cấu hình PayOS Dashboard phải khớp **một** đường:
- Render: `https://palfish-gmv-api.onrender.com/webhook/payos`
- Vercel → Supabase EF: `https://palfish-gmv-manager.vercel.app/webhook/payos` (HMAC verify, Supabase JS v2 — commit `2816bd2`)

Logic đối soát **chuẩn:** `api_pipe/payos_webhook.py`. Edge Function là bản TypeScript song song — **đồng bộ khi sửa reconcile**.

Spec luồng thanh toán dài hạn (PR/Order): `docs/PROTOTYPE_PAYMENT_FLOW.md`.

### 6.1b Luồng mới B1–B4 (đang build — **chưa trên production `main`**)

Team đang rework Module 1–4 theo prototype Hiếu (`CRM Palfish (1)/`, `docs/PROTOTYPE_PAYMENT_FLOW.md`).  
**Hai luồng song song:** app production vẫn chạy `don_hang` (M1/M2 cũ); luồng PR mới test trên branch tích hợp.

| Bước | Nội dung | Owner branch | Trạng thái (2026-05-26) |
|------|----------|--------------|-------------------------|
| **B1** | Tạo Payment Request → `PR-2026-XXXX` | `feature-kem` (Kem/Giang) | Schema + API trên Supabase; FE prototype |
| **B2** | QR / lần thanh toán trong PR, đối soát | `feature-kem` | Đang làm |
| **B3** | Active Request, Course code, khớp Order ID CRM | `feature-duc` (Đức) | **Backend POST/PATCH test OK** — chưa merge, chưa FE |
| **B4** | Xuất hóa đơn từ PR + AR | Chưa assign xong | **Chưa code** |

**Quy trình test local (thống nhất team):**

```
feature-kem  ──┐
               ├── merge → main ──→ chạy local (run.ps1 + npm run dev)
feature-duc  ──┘
```

Remote đã có: `origin/feature-kem`, `origin/feature-duc`. **Chưa push production** — merge vào `main` chỉ để dev/UAT local.

**B3 API (đã implement trên `feature-duc`, file `backend/activation_routes.py`):**

| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/api/v1/payment-requests/{pr_id}/active-requests` | PR `state` ∈ {done, over} hoặc `received >= target` → tạo AR, sinh `CC-[PR_SEQ]-[001…]` |
| PATCH | `/api/v1/active-requests/{ar_id}/courses/{course_code}` | Body `{ order_id }` → JSONB atomic (RPC `patch_active_request_course_order`) |

**Test thật đã pass (Supabase dev):** `AR-2026-0002` · `PR-2026-9999` · `ready_invoice` · `ORD-CRM-88901` trên `CC-9999-001`.

**Chưa có:** `GET /active-requests`, B4 invoice API, FE Tab Active Request, commit git, deploy.

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
| `payment_requests` | **B1/B2 mới** — PR (Kem schema trên Supabase dev) |
| `active_requests` | **B3** — AR + `uids_data` JSONB (patch Đức) |

**Schema `payment_requests` thực tế trên Supabase dev** (2026-05-26 — **không** dùng bản Giang uuid/`trang_thai` cũ):

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | text | `PR-2026-XXXX` |
| `name`, `uid`, `phone`, `country`, `address`, `ward`, `province`, `note` | text | B1 |
| `target`, `received` | bigint | Số tiền |
| `state` | text | `pending` / `short` / `done` / `over` / `cancelled` |

**Schema `active_requests`:**

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `id` | text | `AR-2026-XXXX` |
| `pr_id` | text FK → `payment_requests.id` | **Phải text** — patch cũ nhầm uuid đã fix bằng `supabase_schema_patch_active_requests_pr_id_text.sql` |
| `uids_data` | jsonb | Mảng `[{ uid, courses: [{ code, name, amount, order_id }] }]` — snake_case |
| `status` | text | `pending_order` → `partial_order` → `ready_invoice` → `invoiced` |

SQL patches B3: `docs/supabase_schema_patch_active_requests.sql` (+ `_pr_id_text.sql` nếu đã chạy patch uuid).  
**Legacy bỏ qua:** `docs/supabase_schema_patch_activate_codes.sql` (bảng `activate_codes` từng thiết kế Codex — **không** dùng; thay bằng JSONB `active_requests`).

### Thứ tự patch (SQL Editor → `NOTIFY pgrst, 'reload schema'`)

1. `supabase_schema_patch.sql` (base)
2. `v2` → `v3` → `v4` → `v5` → `v5_invoice` (M3/M4)
3. `v6`, `v7_so_doanh_thu` (Sổ)
4. `supabase_schema_patch_crm_*.sql` (CRM tokens, record_type, hybrid unique key)
5. `supabase_schema_patch_bc03_monthly.sql`
6. **Chưa commit:** `supabase_schema_patch_revenue_ledger_link.sql` — hỏi team trước khi chạy prod
7. **Luồng PR (dev):** `supabase_schema_patch_active_requests.sql` — sau khi `payment_requests` Kem đã có

Diagnostic: `docs/supabase_diagnose.sql` (mục 4–5: `payment_requests` + `active_requests`).

---

## 11. API index (tra cứu nhanh)

Đầy đủ trong Swagger `/docs`. Client FE: `frontend/src/lib/api.ts` → `endpoints.*`.

| Nhóm | Endpoint quan trọng |
|------|---------------------|
| Orders | `GET/POST /orders` (có `trangThaiThuTuc`), `PATCH /orders/{id}`, `POST .../cancel`, `POST .../bill` |
| PayOS | `POST /payos/create-link` (+ `transferContent`), `POST /webhook/payos`, `GET /payos/transactions` |
| CRM M5 | `POST /crm/sync`, `POST /crm/sync/backfill`, `GET /crm/export-master`, `GET /crm/token-status` |
| Dashboard M6 | `GET /dashboard/live_summary`, `GET /dashboard/daily_trends`, `GET /dashboard/filters` |
| BC03 | `GET /reports/bc03`, `PUT /reports/bc03/monthly` |
| Revenue | `GET/POST/PATCH/DELETE /revenue/ledger`, `POST /revenue/ledger/sync-gsheet` |
| Admin | `GET/PATCH /me`, `/admin/sales`, `/admin/auth-users` |
| **Activation B3** *(feature-duc)* | `POST /api/v1/payment-requests/{pr_id}/active-requests`, `PATCH /api/v1/active-requests/{ar_id}/courses/{course_code}` |

**Supabase pagination:** CRM/dashboard query có page 1000 rows — logic paginate trong `crm_metrics.fetch_crm_sales_rows`.

---

## 12. Quy ước code (bắt buộc khi sửa)

1. **Minimal diff** — không refactor lan man; match style file xung quanh.
2. **Backend metrics CRM** — sửa `crm_metrics.py` trước; routes chỉ orchestrate.
3. **PayOS** — reconcile: `api_pipe/payos_webhook.py`; create-link + EMV parse: `backend/payos_qr.py` + `main.py`. Đồng bộ Edge Function nếu đổi reconcile.
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
| Docs stale | `PROJECT.md` / `WIREFRAMES.md` / `DEPLOY.md` chưa cập nhật post-merge |
| 3 webhook copies | `payos_webhook.py`, Edge Function, `app_payment.py` — chỉ file đầu là canonical |
| Render free tier sleep | Webhook có thể miss nếu chỉ trỏ Render — cân nhắc Supabase EF |
| PayOS vs VietQR Tab2 | Modal có fallback VietQR — không đồng nhất 100% với Tab1 |
| `docs/TODO.md` | M1-08 CK thật chưa nghiệm thu; I-02 CRM auto-activate stub |
| Metabase packages | Fallback hardcoded nếu thiếu env Metabase |
| Audit log Tab2 | Bảng `don_hang_audit` có schema, app chưa ghi |
| Push nhầm bản cũ | Đã fix 2026-05-27 — luôn verify `main` = `891a623+` trước khi deploy |
| Luồng PR vs `don_hang` | Production vẫn M1/M2 cũ; PR/AR chỉ trên branch tích hợp — đừng nhầm API |
| `activate_codes` vs `active_requests` | Doc/task cũ nhắc `activate_codes` — implementation hiện tại dùng JSONB `active_requests` |
| Swagger `/docs` 500 | Đã fix: `GsheetSyncBody` nested class → module level trong `revenue_routes.py` |
| `feature-duc` chưa commit | `activation_routes.py`, SQL patches, sửa `main.py` register — commit trước merge |

---

## 15. Lịch sử commit gần đây (context)

| Commit | Nội dung |
|--------|----------|
| `891a623` | **Merge `ui/ux-anh-minh` → `main`** — bản production đầy đủ (BC01/03, Sổ, PayOS+, M6 UI) |
| `28f2139` | Map `trangThaiThuTuc` trong `GET /orders` |
| `d7a4e1f` | PayOS `transferContent` từ EMV QR (`payos_qr.py`) |
| `f3a0baa` | File bàn giao Codex (doc này) |
| `2c63e43` | PayOS status khop/sai_tien/chua_xu_ly |
| `5a324ee` | Dashboard C4/C5 tính từ Total Call Time |
| `9efe053` | Hybrid CRM: daily_trends + live_summary, backfill |

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
| Sổ + GSheet sync | `docs/M5_GSHEET_IMPORT.md`, `docs/M5_OPERATIONS.md`, `docs/M5_DOI_CHIEU.md` |
| BC01 đối chiếu | `docs/BC01_DOI_CHIEU_THU_HIEN.md` |
| Luồng thanh toán PR/Order (prototype) | `docs/PROTOTYPE_PAYMENT_FLOW.md` |
| Task nội bộ | `docs/MINH_TASKS_2026-05-26.md` |
| Task board | `docs/TODO.md` |
| Wireframe phân quyền | `docs/WIREFRAMES.md` |

**File ưu tiên khi debug:**

- PayOS: `api_pipe/payos_webhook.py`, `backend/payos_qr.py`, `backend/main.py`
- Sổ / BC01: `backend/revenue_routes.py`, `frontend/src/lib/ledgerCellStyle.ts`
- CRM sync: `backend/crm_routes.py`
- Dashboard KPI: `backend/crm_metrics.py`, `backend/dashboard_routes.py`
- FE shell: `frontend/src/pages/MainPage.tsx`, `frontend/src/lib/api.ts`

---

## 17. Snapshot WIP — `feature-duc` (2026-05-26)

> **Mục đích:** Gemini / agent tiếp tục B3→B4 hoặc merge — đọc mục này trước khi code.

### File thay đổi (chưa commit trên `feature-duc`)

| File | Thay đổi |
|------|----------|
| `backend/activation_routes.py` | **Mới** — B3 POST/PATCH |
| `backend/main.py` | `register_activation_routes(app, _supabase)` |
| `backend/revenue_routes.py` | Fix OpenAPI: `GsheetSyncBody` module-level |
| `docs/supabase_schema_patch_active_requests.sql` | Bảng `active_requests` + RPC |
| `docs/supabase_schema_patch_active_requests_pr_id_text.sql` | Fix `pr_id` text FK |
| `docs/supabase_diagnose.sql` | Query cột PR + AR + enum |

### Việc tiếp theo (ưu tiên)

1. **Commit** B3 trên `feature-duc`
2. **GET** `/api/v1/active-requests` (+ filter `status`, join PR cho FE)
3. **B4** — invoice request từ AR `ready_invoice`; set `invoiced`
4. **Merge** `origin/feature-kem` + `feature-duc` → `main` → test B1→B2→B3 local
5. **FE** — nối prototype `CRM Palfish (1)/active-request.jsx` → API (Hiếu layout)

### Đối chiếu định hướng (`PROTOTYPE_PAYMENT_FLOW.md` / `MINH_TASKS_2026-05-26.md`)

| Yêu cầu thiết kế | Thực tế code | Lệch? |
|------------------|--------------|-------|
| B3 nested `uids` + courses trong JSONB | `active_requests.uids_data` | ✅ Khớp |
| Course code `CC-…-001` khi tạo AR | Sinh từ PR id (`PR-2026-9999` → `CC-9999-001`) | ✅ Khớp |
| snake_case API/DB | `order_id`, `uids_data`, … | ✅ Khớp |
| PATCH Order ID → status AR | `pending_order` / `partial_order` / `ready_invoice` | ✅ Đã test |
| B3 chỉ khi PR đủ tiền | Check `state` done/over + `received >= target` | ✅ Khớp |
| B4 xuất HĐ từ B1+B3 | Chưa implement | ⏳ Đúng roadmap, chưa làm |
| B1/B2 full API + FE | Kem — `feature-kem` | ⏳ Song song, merge sau |
| Thay `activate_codes` table | Dùng JSONB — bỏ patch `activate_codes.sql` | ⚠️ Doc TODO cũ chưa cập nhật |
| Production deploy B3 | Chưa — chỉ dev Supabase + local | ✅ Đúng — chưa go-live PR flow |

**Kết luận:** Backend B3 **đúng hướng prototype**, không lệch nghiệp vụ. Gap chính: **thiếu GET/B4/FE**, **chưa merge Kem**, **chưa commit**. M3/M4 cũ vẫn chạy độc lập — cần plan cutover sau UAT.

---

## 18. Checklist tiếp quản cho Codex / Gemini

- [ ] Clone repo, chạy local theo mục 8
- [ ] Có quyền Supabase dashboard (đọc schema, không cần service_role trong chat)
- [ ] Xác nhận Render/Vercel env vars còn đủ
- [ ] Xác nhận PayOS Dashboard webhook URL đang trỏ đâu (Render vs Supabase EF)
- [ ] Extension CRM token còn hoạt động với domain PalFish hiện tại
- [ ] Đọc mục 14 trước khi sửa PayOS / CRM metrics
- [ ] Sau sửa FE: `cd frontend && npm run build`
- [ ] Cập nhật `docs/CHANGELOG.md` + `docs/TODO.md` khi hoàn thành task lớn

---

## 19. Liên hệ / domain (tham khảo)

- Team PalFish nội bộ — phân công lịch sử: Minh (FE/BE/deploy), Giang/Kem (PayOS/STK + B1/B2 PR), Đức (B3 activation), Thu Hiền (SOP sync CRM + khớp Order ID).
- PalFish CRM: cookie-based, không public API doc — logic reverse-engineer trong `crm_routes.py`.

---

*Tài liệu này là nguồn bàn giao chính cho agent tiếp theo. Khi code lệch doc, **tin code** và cập nhật file này.*
