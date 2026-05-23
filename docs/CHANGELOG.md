# Nhật ký thay đổi code

> **Quy tắc:** Chỉ được **thêm** entry mới vào cuối file. **Không được xóa** hoặc sửa entry cũ.

---

## 2026-05-20 — Git setup

- Khởi tạo repo, đồng bộ branch `main` với remote `origin/main`
- Thêm `.gitignore` (ignore `references/`, `node_modules`, `.env`, `.env.local`)

---

## 2026-05-20 — Frontend scaffold

- Tạo `frontend/` bằng Vite + React 19 + TypeScript
- Cài Tailwind CSS, React Router, TanStack Query, Supabase JS, Axios
- Thêm `frontend/src/lib/supabase.ts` — Supabase client
- Thêm `frontend/src/lib/api.ts` — Axios client + JWT interceptor + endpoint stubs (infoCode, webhook, crm)
- Thêm `frontend/vite.config.ts` — proxy `/api` → `:8000`, Vitest config (threads pool cho Windows)
- Thêm `frontend/vercel.json` — SPA rewrite cho Vercel
- Thêm `frontend/.env.example`

---

## 2026-05-20 — QA / Testing

- Cài Vitest, React Testing Library, MSW
- Thêm `frontend/src/test/setup.ts`, `frontend/src/test/msw/handlers.ts`, `frontend/src/test/msw/server.ts`
- Thêm `frontend/src/lib/api.test.ts` — 4 contract tests (infoCode create/status, webhook events, CRM activate)
- Thêm `.github/workflows/frontend-ci.yml` — CI: install → typecheck → build → test

---

## 2026-05-20 — Backend scaffold (deploy-ready)

- Tạo `backend/main.py` — FastAPI stub với CORS + `/healthz`
- Tạo `backend/Dockerfile` — python:3.12-slim + uvicorn
- Tạo `backend/requirements.txt` — fastapi, uvicorn, supabase, httpx, python-dotenv
- Tạo `backend/.env.example`
- Tạo `render.yaml` — Render deploy config cho backend

---

## 2026-05-20 — Auth UI (Login + Sign-up)

- Thêm `frontend/src/hooks/useAuth.tsx` — AuthProvider context (Supabase magic link + Google OAuth + dev bypass)
- Thêm `frontend/src/pages/LoginPage.tsx` — Welcome Back, email login, Google login, link sign-up
- Thêm `frontend/src/pages/SignUpPage.tsx` — Form đăng ký (email, họ tên CRM, SĐT, chọn team)
- Cập nhật `frontend/src/App.tsx` — ProtectedRoute + GuestRoute routing
- Cập nhật `frontend/src/main.tsx` — bọc AuthProvider + QueryClientProvider + BrowserRouter

---

## 2026-05-20 — Tab 1 & Tab 2 (port từ train.html)

- Thêm `frontend/src/components/Tab1Form.tsx` — Form tạo đơn hàng (UID lookup, upload bill, tạo đơn)
- Thêm `frontend/src/components/Tab2Table.tsx` — Bảng quản lý đơn (Excel import xlsx, QR modal, checkbox trạng thái)
- Thêm `frontend/src/pages/MainPage.tsx` — Tab bar + header + điều phối Tab 1/2
- Cài package `xlsx` cho Excel import

---

## 2026-05-20 — Bug fixes & cải thiện auth

- Sửa dev mode: không auto-login khi mở app → mặc định hiện `/login`
- Sửa regex detect Supabase URL (loại trừ `placeholder.supabase.co`)
- Đổi `useAuth.ts` → `useAuth.tsx` (JSX trong file .ts gây lỗi Vite parse)
- Hỗ trợ `VITE_SUPABASE_PUBLISHABLE_KEY` làm fallback cho `VITE_SUPABASE_ANON_KEY`
- Sửa lỗi TypeScript build (`as unknown as User` cho dev mock user)
- Thêm `frontend/.env.local` (gitignored) với placeholder values cho local dev

---

## 2026-05-20 — Tài liệu

- Thêm `docs/PROJECT.md` — mô tả dự án, kiến trúc, tiến độ, hướng dẫn chạy local
- Thêm `docs/CHANGELOG.md` — nhật ký thay đổi code (file này)

---

## 2026-05-20 — Module 1: Backend Supabase + Orders API

- Mở rộng `backend/main.py` — CRUD đơn qua Supabase (`khach_hang`, `don_hang`), `/packages`, `/webhook/bank-simulate`
- Thêm `backend/run.ps1` — kiểm tra `.env` + chạy uvicorn (Windows)
- Thêm `docs/supabase_schema_patch.sql` — cột `crm_uid`, `ma_don_hang`, `tien_ve`, `bill_image`, …
- `load_dotenv(..., override=True)` — ưu tiên file `.env` local

---

## 2026-05-20 — Module 1: Frontend Tab 1 / Tab 2 (production flow)

- `Tab1Form` — UID/tên tách, địa chỉ VN API, mã vùng SĐT, gói học API, bỏ cọc & bill Tab 1, `PaymentModal` VietQR + Info Code
- `Tab2Table` — cột tách, up bill, phân quyền ops tick tiền về, QR modal
- `MainPage` — fetch orders từ API; hooks `useCountryCodes`, `useVietnamAddress`; `types/order.ts`
- `frontend/src/lib/roles.ts` — `VITE_OPS_EMAILS`
- `frontend/src/constants/bank.ts` — VietQR URL builder

---

## 2026-05-20 — Auth & UX

- Sửa `useAuth.tsx` — dev bypass khi key placeholder; hỗ trợ publishable key
- Thêm `frontend/src/gmv-theme.css` + bọc `gmv-light-ui` — form đọc được khi browser dark mode
- `index.html` — `meta color-scheme light`
- Sửa layout dropdown địa chỉ (`min-width: 0`, flex)

---

## 2026-05-21 — Tài liệu & deploy guide

- Cập nhật `docs/PROJECT.md` — tiến độ Module 1, schema, phân công Minh
- Thêm `docs/TODO.md` — task có `created_at` / `completed_at`
- Thêm `docs/DEPLOY.md` — Vercel + Render + Supabase redirect
- Cập nhật `docs/SETUP_ENV.md` — lỗi Windows, Invalid API key, `run.ps1`

---

## 2026-05-21 — Phân quyền & bảng quản trị (draft)

- Thêm `scripts/extract_hierarchy.cjs` — đọc xlsx Metabase, trích cây Sale → Team → Sub-team theo logic `depart7 || (depart6=ONLINE ? HCM : depart6)` + `depart8` cho Inhouse 1
- Thêm `docs/team_hierarchy.json` + `docs/team_hierarchy.md` — 149 sale / 15 team, dùng để giải thích cấu trúc cho Kem
- Thêm `docs/WIREFRAMES.md` — ma trận phân quyền 4 cấp (Sale/Leader/Ops/System), logic phân team, schema `nhan_su_sale` + `don_hang_audit`, endpoint cần thêm, 6 câu hỏi chốt với QL
- Thêm `docs/wireframes.html` — bản vẽ trực quan 8 frame (ma trận phân quyền, cây team, Sale/Leader/Ops/Admin/Audit) để show sếp
- Cập nhật `docs/TODO.md` — block A-01..A-11 (bảng quản trị phụ trợ)

---

## 2026-05-21 — Tab phân quyền, Google OAuth, fix email rate limit

- Thêm `docs/AUTH_SETUP.md` — Resend SMTP (fix rate limit) + Google OAuth trên Supabase
- Thêm `docs/supabase_schema_patch_v2.sql` — `nhan_su_sale`, `don_hang_audit`, `sale_crm_name`
- Thêm `scripts/seed_nhan_su_sale.py` — seed 149 sale từ `team_hierarchy.json`
- Thêm `backend/rbac.py`, `backend/admin_routes.py` — JWT actor, `/me`, `/admin/sales`, `/admin/auth-users`, filter `/orders` theo role
- Cập nhật `backend/main.py` — RBAC orders + đăng ký admin routes
- Thêm `frontend/src/hooks/useMe.ts`, `types/profile.ts`, `pages/ProfilePage.tsx`, `pages/AdminPage.tsx` (2 subtab CRM vs Auth)
- Cập nhật `frontend/src/pages/MainPage.tsx` — 4 tab (Tab1/2, Thông tin cá nhân, Quản lý quyền)
- Cập nhật `frontend/src/lib/api.ts`, `useAuth.tsx` (Google `redirectTo`)
- Cập nhật `docs/WIREFRAMES.md` (4 cấp), `DEPLOY.md`, `SETUP_ENV.md`, `PROJECT.md`, `TODO.md`

---

## 2026-05-21 — Cập nhật tài liệu (production + RBAC)

- Cập nhật `docs/PROJECT.md` — tiến độ production, 4 tab UI, schema v2, phân quyền 4 cấp, URL Vercel/Render/GitHub
- Cập nhật `docs/TODO.md` — D-01..D-10, A-03 done; backlog B-01..B-04
- Cập nhật `docs/DEPLOY.md` — repo `palfish-t-i-u/palfish-gmv-manager`, env bắt buộc Render, troubleshooting CORS/`/me`, checklist [x]
- Cập nhật `docs/SETUP_ENV.md` — phân biệt `SYSTEM_ADMIN_EMAILS` / `OPS_EMAILS` / `VITE_OPS_EMAILS`; hướng test Leader/Manager
- Cập nhật `docs/WIREFRAMES.md` — đánh dấu phần đã implement vs backlog
- Cập nhật `docs/AUTH_SETUP.md` — sender Resend, troubleshooting

---

## 2026-05-21 — P3 backend fixes

- `backend/main.py`: merge PayOS webhook handler từ `api_pipe/cau_hinh.py` vào `/webhook/payos` — grep cả `DH\d+` và `KH\d+`, lookup `don_hang` theo `ma_don_hang` hoặc `info_code`, lưu đầy đủ field vào `giao_dich`, cập nhật `tien_ve` + `trang_thai=da_thanh_toan` khi khớp.
- `backend/main.py`: thêm `GET /payos/transactions?limit=&from=&to=&status=&q=` — join `giao_dich` với `don_hang` lấy `ma_don_hang`, RBAC sale/leader/manager/system qua `visible_creator_emails`.
- `backend/main.py`: thêm `POST /orders/{id}/bill` (multipart `file`) → upload Supabase Storage bucket `bills` → cập nhật `don_hang.bill_image = public URL`. Backward-compat base64 vẫn hoạt động.
- `backend/admin_routes.py`: thêm `GET /crm/customers?q=&limit=` (fallback: `khach_hang` JOIN `don_hang.created_by` theo RBAC; TODO swap sang CRM API thật).
- `backend/.env.example` + `render.yaml`: thêm `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`.
- Thêm `docs/supabase_storage_setup.md` — hướng dẫn tạo bucket `bills` + policy.

---

## 2026-05-21 — P3 frontend fixes (user test batch)

- `SignUpPage` + `useAuth`: Google CTA chính, form email thu gọn, lỗi SMTP/rate-limit rõ, auto-login khi Supabase tắt Confirm email.
- `Tab1Form`: lỗi tạo đơn hiện `detail` từ API + retry 3s khi Render cold start; combobox UID CRM (`/crm/customers`).
- `Tab2Table`: nén ảnh bill JPEG 1280px; upload Storage `POST /orders/{id}/bill` fallback base64 PATCH.
- `PaymentModal`: nút Copy từng field + Copy tất cả + Copy link QR (Tab 1 & Tab 2).
- `PayosHistoryTab` + `MainPage`: tab **Lịch sử PayOS** (`GET /payos/transactions`).
- `frontend/src/lib/api.ts`: `payos.transactions`, `crm.searchCustomers`, `orders.uploadBill`.

---

## 2026-05-21 — Gộp P3 fixes trên nền commit `gg` (Giang)

- Giữ nguyên `api_pipe/payos_webhook.py` + webhook PayOS của Giang (khớp mã + kiểm tra số tiền).
- Giữ `apiBaseUrl.ts`, `apiErrors.ts`, poll Tab 2, CORS — không ghi đè.
- Thêm lại: tab Lịch sử PayOS, copy QR, UID gợi ý, bill nén/Storage, signup Google-first; `GET /payos/transactions`, `GET /crm/customers`, `POST /orders/{id}/bill`.
- Tab PayOS dùng trạng thái `khop` / `sai_tien` / `chua_xu_ly` (theo logic Giang).

---

## 2026-05-21 — Đồng bộ tài liệu (post-merge `gg` + P3)

- `docs/PROJECT.md` — kiến trúc PayOS đã nối, 5 tab UI, env `PAYOS_*` / `apiBaseUrl`, tiến độ sau merge.
- `docs/TODO.md` — M1-12..M1-18, I-01 done; backlog B-05/B-06; gỡ block P3 trùng.
- `docs/DEPLOY.md` — env PayOS, troubleshooting P3, smoke test tab PayOS + bucket `bills`.
- `docs/SETUP_ENV.md` — bước bucket `bills`, `payos_webhook.py`, lỗi bill/PayOS local.
- `docs/WIREFRAMES.md` — đánh dấu P3/PayOS đã code vs backlog còn lại.
- `docs/AUTH_SETUP.md` — §0 Confirm email vs Secure email change; session Free plan.
- `docs/supabase_storage_setup.md` — link TODO/DEPLOY.

---

## 2026-05-21 — Prod feedback: schema v3, VN personnel, profile copy

- `docs/supabase_schema_patch_v3.sql` — idempotent ALTER Module 1 (`bill_image`, `crm_uid`, …) + `UPDATE` ẩn sale Thailand.
- `backend/vn_staff.py` — lọc nhân sự VN; `admin_routes` + `seed_nhan_su_sale.py` + sync `/admin/sales/sync`.
- `backend/main.py` — thông báo lỗi schema trỏ `supabase_schema_patch_v3.sql`.
- `frontend/src/pages/ProfilePage.tsx` — helper text ghép CRM vs tên hiển thị.
- `docs/SETUP_ENV.md` — bước migration v3.

---

## 2026-05-21 — Sidebar UI, hủy đơn, schema prod, deploy fixes

**Frontend**
- `AppShell.tsx` — sidebar nav (Tạo đơn, Quản lý đơn, Lịch sử PayOS, Thông tin cá nhân; nhóm **Quản lý quyền**: Nhân sự Sale, Tài khoản Auth).
- `MainPage.tsx` — bỏ tab ngang; `AdminPage.tsx` xóa → `StaffCRMTab.tsx`, `AuthAccountsTab.tsx`.
- `Tab2Table.tsx` — nút **Hủy** (`POST /orders/{id}/cancel`), badge Đã huỷ, disable khi `tien_ve`.
- `useAuth.tsx` — `redirectTo` / `emailRedirectTo` theo `window.location.origin` (local vs Vercel).
- `index.css` — bỏ `#root` width cố định 1126px.

**Backend**
- `POST /orders/{order_id}/cancel` — `trang_thai=huy`, RBAC, 409 nếu đã tiền về.
- `vn_staff.py` — lọc nhân sự VN trên `/admin/sales`.
- CORS: regex cho mọi port `localhost` (5173–5175).
- `requirements.txt` — `python-multipart` (upload bill).
- `backend/Dockerfile` + `render.yaml` — `dockerContext: .` (copy `api_pipe/`).

**Schema / docs**
- `supabase_schema_patch_v4.sql` — `trang_thai` CHECK + `ghi_chu`; `supabase_diagnose.sql`.
- Smoke test full flow OK sau v3 + `NOTIFY pgrst, 'reload schema'`.

**Docs sync:** `PROJECT.md`, `TODO.md`, `DEPLOY.md`, `SETUP_ENV.md`, `WIREFRAMES.md`, `AUTH_SETUP.md`.

---

## 2026-05-21 — UI refresh (design tokens) + VietQR MB Bank

**Frontend — UI**
- `gmv-tokens.css` + mở rộng `tailwind.config.js` (`gmv-*` colors, radius, shadow).
- `components/ui/` — Button, Input, Select, Textarea, Card, Badge, Table, Modal, PageSection.
- Reskin: `AppShell` (brand `#7260ff`, bottom nav `< md`), `LoginPage`, `SignUpPage`, `Tab1Form`, `Tab2Table`, `PaymentModal`, `PayosHistoryTab`, `ProfilePage`, `StaffCRMTab`, `AuthAccountsTab`.
- Xóa `App.css` (Vite boilerplate); thu gọn `index.css`.
- `docs/DESIGN.md` — token reference + UI rules.

**Frontend — VietQR**
- `constants/bank.ts` — mặc định MB Bank Napas `970422`, STK `1680011668899`, `VITE_BANK_BRANCH`.
- `PaymentModal` — hiển thị + copy: tên TK, ngân hàng, chi nhánh, số TK.
- `frontend/.env.example`, `docs/DEPLOY.md`, `docs/SETUP_ENV.md` — đồng bộ `VITE_BANK_*`.

**Docs sync:** `PROJECT.md`, `TODO.md`, `WIREFRAMES.md`, `DESIGN.md`.

---

## 2026-05-23 — UI/UX PR #2 + doc task sync

**Frontend — Tab 2**
- `Tab2Table.tsx` — freeze 3 cột trái + 2 phải, scroll ngang.
- `components/ui/Table.tsx` — export `stickyTableHead*` / `stickyTableCell*`.
- `gmv-theme.css` — `.gmv-table-scroll` scrollbar styled.

**Git**
- PR #2 merge `ui/ux-anh-minh` → `main` (no conflict).

**Docs sync:** `TODO.md` (UX-03, UX-05, UX-07 done), `WORKFLOW_UI_UX.md`, `WIREFRAMES.md`, `PROJECT.md`, `DESIGN.md`, `DEPLOY.md`.

---

## 2026-05-23 — Spec Module 5 (Sổ doanh thu + Doanh thu Sale)

- Thêm `docs/MODULE_SO_DOANH_THU.md` — 2 tab, map team, tỷ giá 3700, pivot theo ngày tiền về.
- Cập nhật `docs/TODO.md` — block M5-01..M5-07.

---

## 2026-05-23 — Module 5 MVP (Sổ doanh thu + Doanh thu Sale)

**Backend**
- `revenue_routes.py` — CRUD `/revenue/ledger`, pivot `/revenue/pivot`, sync M3 → Sổ.
- `invoice_routes.py` — hook sau `m3-approve` + bulk.

**Frontend**
- `SoDoanhThuTab.tsx`, `DoanhThuSaleTab.tsx` — sidebar nhóm Doanh thu (Ops/System).
- `types/revenue.ts`, `api.ts` endpoints.

**Docs:** `TODO.md` M5-01..04 done.

---

## 2026-05-23 — Module 5 UI Hiếu + vận hành

**Frontend**
- `LedgerFormModal.tsx` — form thêm/sửa dòng Sổ (popup, giống QR Tab 2).
- `SoDoanhThuTab.tsx` — bảng read-only cột chính HNxHCM; **+ Thêm dòng**, **Chỉnh sửa**, **Xóa** (chỉ TAY); VND separator; `TableScrollWrap`.
- `DoanhThuSaleTab.tsx`, `MainPage.tsx` — đổi tên tab **Sales Performance**.
- `frontend/src/lib/vndFormat.ts` — `formatVndInput`, `formatVndNumber`.
- `frontend/src/lib/api.ts` — `deleteLedger`.

**Backend**
- `revenue_routes.py` — `DELETE /revenue/ledger/{id}` (chỉ `loai_nhap=tay`).

**Scripts**
- `scripts/seed_so_doanh_thu.py` — `--backfill-m3`, `--xlsx`, `--limit`, `--dry-run`.
- `scripts/cleanup_so_doanh_thu.py` — `--all`, `--keep-import-only`, `--before`, `--dry-run`.

**Docs**
- `docs/M5_OPERATIONS.md` — deploy Promote, seed, cleanup, smoke test Sổ.
- Cập nhật `MODULE_SO_DOANH_THU.md`, `WORKFLOW_UI_UX.md` (Promote), `DEPLOY.md` (v7, `/revenue/*`), `TODO.md` (M5-08).

---

## 2026-05-23 — Module 5.1 Sổ: thẻ tổng hợp, Type fixx, lọc hôm nay

**Frontend**
- `LedgerSummaryCards.tsx` — Tổng GMV, Số đơn, 5 thẻ pivot Type (Other / Kho chung / Ads / Renew / Refer).
- `frontend/src/lib/typeFixx.ts` — map Type gốc → Type fixx (sheet Hiếu Trang tính5 C→D) → pivot 5 cột.
- `frontend/src/lib/ledgerSource.ts` — gom bucket thẻ từ dòng Sổ.
- `SoDoanhThuTab.tsx` — cột Nội dung CK, ID đơn hàng; filter mặc định **hôm nay**; Hôm nay / Reset bộ lọc; Type hiển thị sau fixx.

**Backend**
- `revenue_routes.py` — `infoCode` join `don_hang`; `_fetch_so_doanh_thu` paginate (tránh giới hạn 1000 dòng PostgREST).

**Docs**
- `MODULE_SO_DOANH_THU.md` §2.4–§2.5, M5-10; `TODO.md` M5-10; `M5_OPERATIONS.md` smoke + import full.
