# Deploy web app — PalFish GMV Reconciliation

App gồm **2 phần** deploy riêng:

| Phần | Nền tảng | File cấu hình |
|------|----------|----------------|
| Frontend (React SPA) | **Vercel** | `frontend/vercel.json` |
| Backend (FastAPI) | **Render** | `render.yaml`, `backend/Dockerfile` |
| Database + Auth | **Supabase** (đã có) | Dashboard Supabase |

Thứ tự khuyến nghị: **Backend (Render) trước** → lấy URL API → **Frontend (Vercel)** → **Supabase redirect URLs**.

---

## 0. Điều kiện trước khi deploy

- [x] Code push GitHub `palfish-t-i-u/palfish-gmv-manager` (BE Render — lịch sử)
- [x] FE Vercel: repo **`palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2`**, branch UI/UX: **`ui/ux-anh-minh`** — xem **`docs/WORKFLOW_UI_UX.md`**
- [x] PR #2 merge `ui/ux-anh-minh` → `main` (2026-05-23) — **Done**
- [x] Chạy `supabase_schema_patch.sql` + `v2` + **`v3`** + **`v4`** + **`v7`** (Module 5 Sổ — `supabase_schema_patch_v7_so_doanh_thu.sql`; prod: v3 bắt buộc nếu chỉ có v2; sau ALTER → `NOTIFY pgrst, 'reload schema'`)
- [x] Seed `nhan_su_sale` (`scripts/seed_nhan_su_sale.py`) hoặc **Sync Metabase now** (System)
- [x] Test local Module 1 pass
- [x] Supabase URL, anon key, service_role key

**Production URLs (hiện tại):**

| Dịch vụ | URL |
|---------|-----|
| Frontend | `https://palfish-gmv-manager.vercel.app` |
| Backend | `https://palfish-gmv-api.onrender.com` (tên service có thể khác) |
| GitHub FE (UI/UX) | `https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2` — branch `ui/ux-anh-minh` |
| GitHub BE (Render) | `https://github.com/palfish-t-i-u/palfish-gmv-manager` |

---

## 1. Deploy Backend — Render

### 1.0 Repo GitHub org `palfish-t-i-u`

Repo: **`palfish-t-i-u/palfish-gmv-manager`**. Render/Vercel connect org repo qua GitHub App (Settings → Applications → Render/Vercel → grant repo).

*(Ghi chú lịch sử: repo trước đây `dogtoro/palfish-t-i-u-h-th-ng`, đã chuyển org + đổi tên.)*

### 1.1 Tạo service

1. Đăng nhập [render.com](https://render.com) → **New** → **Blueprint** hoặc **Web Service**.
2. Connect repo GitHub `palfish-t-i-u/palfish-gmv-manager`.
3. Nếu dùng Blueprint: Render đọc `render.yaml` ở root → tạo service `palfish-gmv-api`.
4. Nếu tạo tay:
   - **Root Directory:** (để trống hoặc repo root)
   - **Dockerfile Path:** `backend/Dockerfile`
   - **Docker Context:** `.` (repo root — bắt buộc, copy `api_pipe/` cho PayOS)

### 1.2 Biến môi trường (Render Dashboard → Environment)

| Key | Giá trị |
|-----|--------|
| `SUPABASE_URL` | `https://jozcvbbypwvzaefteoxn.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret (**bắt buộc** — thiếu → `/me` 503) |
| `FRONTEND_URL` | `https://palfish-gmv-manager.vercel.app` — **không** slash `/` cuối |
| `SYSTEM_ADMIN_EMAILS` | Email System tạm, vd. `anhminhcv0512@gmail.com,...` |
| `OPS_EMAILS` | Email tick tiền về, cùng list ops |
| `PAYOS_CLIENT_ID` | Copy từ `api_pipe/.env` (hoặc PayOS dashboard) |
| `PAYOS_API_KEY` | |
| `PAYOS_CHECKSUM_KEY` | |
| `FRONTEND_URLS` | (tùy chọn) thêm domain Vercel preview, cách nhau dấu phẩy |

Backend tự `load_dotenv` **`api_pipe/.env`** rồi `backend/.env` — có thể đặt PayOS chỉ trong `api_pipe/.env`.

Tùy chọn Metabase (gói học):

| Key | Giá trị |
|-----|--------|
| `METABASE_BASE_URL` | `https://metabase.ibanyu.com` |
| `METABASE_EMAIL` | (nếu có) |
| `METABASE_PASSWORD` | (secret) |
| `METABASE_PACKAGES_QUESTION_ID` | (question id) |

### 1.3 Kiểm tra

- URL dạng: `https://palfish-gmv-api.onrender.com` (tên có thể khác)
- Mở: `https://<render-url>/healthz`
- Kỳ vọng: `{"status":"ok","supabase_configured":true,"payos_configured":true,...}`

**Lưu ý:** Plan free Render có thể **sleep** sau idle — request đầu có thể chậm ~30s. FE đã retry 3s khi tạo đơn; Tab 2 poll 15s sau CK.

**PayOS:** Dashboard PayOS → Webhook URL = `https://<render-url>/webhook/payos`.

### 1.4 Module 5 — route `/revenue/*` (Sổ doanh thu)

API: `GET/POST/PATCH/DELETE /revenue/ledger`, `GET /revenue/pivot`. Code trong repo **ver-2** (`backend/revenue_routes.py`).

1. Render → service **`palfish-gmv-api`** → kiểm tra repo/branch team đang dùng.
2. Sau khi merge code M5 → **Manual Deploy** nếu auto-deploy chưa chạy.
3. Mở `https://palfish-gmv-api.onrender.com/docs` — phải thấy `/revenue/ledger`.
4. Supabase prod: chạy **`docs/supabase_schema_patch_v7_so_doanh_thu.sql`** (một lần). **Không** chạy lại v6 nếu DB đã có cột M3/M4.

Thiếu route → tab Sổ báo "Không tải được" (404), dù FE đã Promote. Chi tiết: **`docs/M5_OPERATIONS.md`**.

---

## 2. Deploy Frontend — Vercel

### 2.0 Repo trên Vercel (ver-2 + branch UI)

- **Repo FE:** `palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2` (GitHub App org `palfish-t-i-u` phải grant repo này).
- **Branch làm việc UI:** `ui/ux-anh-minh` — chi tiết **`docs/WORKFLOW_UI_UX.md`**.
- **Prod URL cập nhật:** push branch → build preview → **Promote to Production** (WORKFLOW §2.1). Một số gói Vercel không có mục Production Branch — Promote là bắt buộc.
- Repo cũ `palfish-gmv-manager` vẫn dùng cho **Render** (backend) nếu chưa đổi repo Render sang ver-2.

### 2.1 Import project

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → import repo GitHub.
2. **Root Directory:** `frontend`
3. Framework: **Vite** (Vercel tự detect từ `vercel.json`)

### 2.2 Environment Variables (Vercel → Settings → Environment Variables)

Repo đã cấu hình **`vercel.json`**: proxy `/api` → Render và `VITE_API_BASE_URL=/api` (cùng domain, không CORS).

| Key | Production value |
|-----|------------------|
| `VITE_API_BASE_URL` | `https://<render-backend-url>` (không slash cuối) |
| `VITE_SUPABASE_URL` | `https://jozcvbbypwvzaefteoxn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |
| `VITE_OPS_EMAILS` | `anhminhcv0512@gmail.com,dinhgiang6492@gmail.com,hieuhn.mplanner@gmail.com` |
| `VITE_BANK_BIN` | `970422` (MB Bank) |
| `VITE_BANK_ACCOUNT_NO` | `1680011668899` |
| `VITE_BANK_ACCOUNT_NAME` | Tên tài khoản / pháp nhân (CONG TY TNHH TRUONG QUOC TE…) |
| `VITE_BANK_DISPLAY_NAME` | Tên ngân hàng (MB Bank) |
| `VITE_BANK_BRANCH` | Chi nhánh (Hoàn Kiếm) |

### 2.3 Deploy

- **Deploy** → đợi build (`npm run build`)
- URL production: `https://<project>.vercel.app`

### 2.4 Cập nhật Render CORS

Quay lại Render → `FRONTEND_URL` = URL Vercel vừa deploy → **Save** → redeploy nếu cần.

---

## 3. Supabase Auth — URL production

**Authentication** → **URL Configuration**:

| Mục | Giá trị |
|-----|---------|
| **Site URL** | `https://palfish-gmv-manager.vercel.app` |
| **Redirect URLs** | `https://palfish-gmv-manager.vercel.app/**`, `http://localhost:5173/**`, `5174/**`, `5175/**`, `127.0.0.1:5173/**` |

**SMTP (fix rate limit)** + **Google OAuth**: **`docs/AUTH_SETUP.md`**.

Sau khi đổi env Render → **Manual Deploy** (env mới không áp dụng service đang chạy).

---

## 3.1 Troubleshooting production

| Triệu chứng | Nguyên nhân | Fix |
|-------------|-------------|-----|
| `/me` CORS error, preflight 400 | `FRONTEND_URL` có `/` cuối hoặc sai domain | Sửa env, redeploy Render |
| Banner "Supabase chưa cấu hình", role `(sale)` | Render thiếu `SUPABASE_*` keys | Thêm keys, redeploy |
| Sidebar Quản lý quyền không hiện | `/me` fail, role `sale`, hoặc thiếu `SYSTEM_ADMIN_EMAILS` local | Render/local env; CORS localhost; đăng xuất → login lại |
| `column crm_uid / created_by does not exist` | Chưa chạy v3 trên DB | `supabase_schema_patch_v3.sql` + `NOTIFY pgrst, 'reload schema'` |
| Login local nhảy về vercel.app | Redirect URLs thiếu localhost | `AUTH_SETUP.md` — thêm `localhost:5175/**` |
| `email rate limit exceeded` | Supabase built-in SMTP | Resend Custom SMTP — `AUTH_SETUP.md` |
| Google `provider is not enabled` | Chưa bật Google trên Supabase | `AUTH_SETUP.md` §2 |
| Alert "Kiểm tra backend port 8000" trên Vercel | `VITE_API_BASE_URL` trỏ localhost hoặc Render sleep | Set env Render URL hoặc đợi wake; đã có `apiBaseUrl.ts` fallback |
| `Error sending confirmation email` | Confirm email bật + SMTP | Tắt Confirm email — `AUTH_SETUP.md` §0; ưu tiên Google |
| Upload bill fail | Bucket `bills` chưa tạo | Chạy `docs/supabase_storage_setup.md` trên Supabase |
| PayOS tab trống | Chưa có webhook / chưa có `giao_dich` | Cấu hình PayOS callback; test CK |
| Prod UI cũ sau login Google | Chưa Promote deployment mới; OAuth redirect về prod URL cũ | Vercel → Deployments → **Promote to Production** → Ctrl+Shift+R |
| Tab Sổ "Không tải được" / Xóa 404 | Render thiếu `/revenue/*` | Redeploy BE + kiểm tra `/docs`; chạy SQL v7 |
| Preview Vercel khác prod | Preview ≠ Production deployment | Luôn test trên `palfish-gmv-manager.vercel.app` sau Promote |

---

---

## 4. Smoke test production

1. `GET https://<render-url>/healthz` → `supabase_configured: true`, `payos_configured: true`
2. **Đăng ký / đăng nhập Google** (Confirm email đã tắt — `AUTH_SETUP.md` §0)
3. Sidebar: badge `system`/`manager`; mục **Nhân sự Sale** / **Tài khoản Auth** (Quản lý quyền)
4. **Tạo đơn:** UID, tạo đơn → QR → **Copy**
5. **Quản lý đơn:** up bill, **Hủy** đơn (chưa tiền về), poll tiền về
6. **Lịch sử PayOS:** giao dịch + badge đối soát
7. **Thông tin cá nhân:** ghép CRM nếu chưa link

---

## 5. Checklist nhanh

```
[x] Render: service live, /healthz OK, SUPABASE_* set
[x] Vercel: palfish-gmv-manager.vercel.app
[x] VITE_API_BASE_URL → Render
[x] FRONTEND_URL (no trailing slash)
[x] Supabase Site URL + Redirect URLs
[x] Resend SMTP + Google OAuth
[x] SQL patch v2 + v3 + v4 + NOTIFY pgrst
[x] PayOS code + env; Docker context `.`; python-multipart
[x] FE sidebar UI + smoke E2E (2026-05-21)
[x] FE design tokens + MB VietQR env (`DESIGN.md`, `VITE_BANK_*`)
[ ] PayOS dashboard webhook URL → Render (nếu chưa)
[ ] Nghiệm thu CK thật qua QR MB (Giang + PayOS)
```

---

## 6. Tài liệu liên quan

- **UI/UX branch + đổi máy + Promote:** `docs/WORKFLOW_UI_UX.md`
- **Module 5 vận hành (seed, cleanup, smoke):** `docs/M5_OPERATIONS.md`
- **Spec Sổ + Sales Performance:** `docs/MODULE_SO_DOANH_THU.md`
- Cấu hình local: `docs/SETUP_ENV.md`
- Auth SMTP + Google: `docs/AUTH_SETUP.md`
- Tiến độ & kiến trúc: `docs/PROJECT.md`
- UI / design tokens: `docs/DESIGN.md`
- Task theo dõi: `docs/TODO.md`
