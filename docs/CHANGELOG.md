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

---

## 2026-05-24 — Type fixx ad rollup, BC02 Kho chung + scroll

**Frontend**
- `frontend/src/lib/typeFixx.ts` — `typeGocFromRow`: dưới `广告` chỉ tách cột riêng KOC/Lives/Offline/KFT/KET; subchannel khác gom Quảng cáo.
- `frontend/src/lib/bc02TypeMap.ts` — cùng logic; cột **Kho chung** (thay “Biển công cộng”).
- `frontend/src/components/reports/BC02KeyDataReport.tsx` — vùng bảng cố định `calc(100svh - 16rem)` — scroll ngang không cần kéo hết bảng dọc.

**Backend**
- `revenue_routes.py` — `_ledger_type_goc`, `_bc02_type_goc` mirror FE; BC02 label `Kho chung`.

**Scripts**
- `scripts/audit_type_fixx_range.py` — đối chiếu bucket Type fixx theo `pay_time`.
- `scripts/test_ad_rollup_rule.py` — kiểm tra rule rollup nhanh.

**Docs**
- `MODULE_SO_DOANH_THU.md` §2.4–§2.6, M5-11; `M5_OPERATIONS.md` smoke 3c–3d; `TODO.md` M5-11.

---

## 2026-05-24 — Gsheet import: parse VN Real Pay, đối chiếu Sổ

**Backend**
- `backend/gsheet_ledger_import.py` — `_parse_sheet_number()`: parse chuỗi VN `4.978.000` (tab HCM REV qua API); trước đó ~792 dòng HCM bị skip (VND=0).
- Re-import HCM REV prod: +792 dòng; Sổ khớp sheet live (14.610 dòng, 149,7 tỷ ₫, 42,35M RMB).

**Docs**
- `M5_GSHEET_IMPORT.md` — one-time import, row/column collapse, đối chiếu số, verify commands.
- `M5_OPERATIONS.md` — tag `import:gsheet:*`, link M5_GSHEET_IMPORT.

---

## 2026-05-25 — Đối chiếu GMV tab, DingTalk re-seed, M3 test

**Docs**
- Thêm `docs/M5_DOI_CHIEU.md` — ma trận nguồn đối chiếu; case 25/05 (21 vs 24 đơn); audit SM Hanoi / HCM REV; script list.
- `M5_GSHEET_IMPORT.md` — thẻ Sổ vs tab GMV; link re-seed DingTalk.
- `M5_OPERATIONS.md` — §2.3 re-seed DingTalk (`seed_dingtalk_ledger.py`); §3.1 xóa M3 test (SQL); tag `import:dingtalk:*`.
- `MODULE_SO_DOANH_THU.md` — sửa cột Pay Time = `pay_time`; §2.8 đối chiếu; lọc team vs GMV tab; xóa `tu_dong`.
- `BC01_DOI_CHIEU_THU_HIEN.md` — §8 tab GMV daily vs thẻ Sổ.
- `TODO.md` — M5-12 done; M5-13 re-seed pending; M5-14 xóa M3 UI pending.

**Scripts**
- `scripts/audit_day_20260525.py` — đối chiếu 1 ngày GMV tab / SM Hanoi / Sổ prod.

**Kết quả audit prod (25/05):** Sổ tay 24 = SM Hanoi 24; GMV tab 21 = Inhouse 1 only; 2 dòng M3 test 2k ₫.

---

## 2026-05-26 — Sửa doc kế hoạch 26/05 (đọc lại PDF)

**Docs**
- `MINH_TASKS_2026-05-26.md` — viết lại theo PDF: P0 sửa báo cáo trước UX; luồng PR→Activate→Order ID; phân công Minh/Hiếu/Giang; họp 8:30.
- `TODO.md` — block **Kế hoạch 26/05**: `F2605-P0-*`, `F2605-BANK-*`, `F2605-GOLIVE-*`, `F2605-BE-*`, `F2605-MINH-*` (sửa thứ tự + owner).

**Lỗi Codex trước đó:** gom hết vào UX Payment Request; thiếu P0 data fix, module bank, task Hiếu, backend Giang/Đức, ngữ cảnh go-live tuần này.

---

## 2026-05-26 — Prototype PalFish CRM.html + sơ đồ B1–B4

**Docs**
- Thêm `docs/PROTOTYPE_PAYMENT_FLOW.md` — Logic kết nối (many-to-many, B1–B4, Course code, map app cũ); UI modules từ HTML bundle.
- Cập nhật `MINH_TASKS_2026-05-26.md` §2 theo sơ đồ + prototype; thuật ngữ **Course code** (B3).
- `TODO.md` — `F2605-MINH-01`, `F2605-BE-03` dùng Course code.

**Prototype:** `c:\Users\silly\Downloads\PalFish CRM.html` — title *Quản lý thanh toán · PalFish GMV*; màn PR drawer, đối soát, Active Request, Sổ, payment method picker.

**Script:** `scripts/decode_crm_prototype.py` — tái trích xuất CSS modules.

---

## 2026-05-26 — Luồng B1–B4 UX feedback (branch `ui/ux`)

**Frontend**
- `PaymentRequestsTab` — bill upload API, email PR, format datetime, KPI/toolbar/table theo prototype
- `ReconciliationTab` — drawer rebuild; confirm/reject; bill thumb từ API
- `ActivationTab` — 4 sub-tab + KPI; `ARCreateModal`; navigate B4; tax ZIP export
- `InvoiceRequestTab` — bulk issue; tax ZIP; email từ PR
- `taxInvoiceXlsxExport.ts` — client-side 3 XLSX trong ZIP (adapt `invoice_routes.py`)
- `BillUploadZone`, `paymentRequestUtils.formatPaymentDateTime`, cross-tab nav `PaymentFlowContext`

**Backend (partial, cùng branch)**
- `payment_request_routes.py` — email field; bill upload endpoint
- SQL patches: `payment_lines_bill`, `payment_requests_email`, `active_requests`, `invoice_courses`

**Docs**
- `FE_HANDOFF_BE_PROMPTS.md` — handoff Giang/Đức
- `TODO.md` — cập nhật `F2605-MINH-*`

**Branch:** `ui/ux` (đổi tên từ `ui/ux-anh-minh`); merge `main` `dffdf2c` (bill upload B1)

---

## 2026-05-26 — Fix Vercel build ActivationTab

**Frontend**
- `ActivationTab.tsx` — guard `"attention" in tc`; import `findInvoiceRowKey` từ `paymentFlowUtils`

**Lý do:** `tsc -b` fail trên Vercel preview branch `ui/ux`.

---

## 2026-05-26 — Fix UTF-8 mojibake tab Quản lý thanh toán

**Nguyên nhân:** Chuỗi tiếng Việt hardcode trong 3 file TSX bị lưu sai encoding (commit `5d515aa`) → UI hiện ký tự `|`, `—`, box drawing; dữ liệu API không ảnh hưởng.

**Frontend**
- Sửa UTF-8: `PaymentRequestsTab.tsx`, `PaymentRequestDetailDrawer.tsx`, `QrViewModal.tsx`
- `frontend/index.html` — load Google Fonts Inter; `lang="vi"`
- `prototype-payments.css` — bỏ `font-feature-settings: "cv11", "ss01"` (tránh glyph lỗi khi fallback font)

**Docs**
- `FE_HANDOFF_BE_PROMPTS.md` §9 — quy tắc encoding cho dev UI

---

## 2026-05-26 — BE handoff merge vào `ui/ux` (commit `2f93684`)

**Nguồn:** `main` @ `2f936840d2421594db396a1b50863f4397f19e69` — fast-forward `ui/ux` từ `2db4745`.

**Backend**
- `activation_routes.py` — `POST /api/v1/active-requests` (standalone AR, `pr_id` nullable); `POST /api/v1/invoice-courses/export-batch` (ZIP 3 XLSX, persist mã M/PF); siết tạo AR gắn PR (PR phải paid).
- `payment_request_routes.py` — cash/card **không** auto `status=paid` khi tạo payment line (chờ kế toán confirm B2).

**Frontend**
- `PaymentFlowContext` — gọi `POST /active-requests` khi tạo AR không gắn PR.
- `api.ts` — `activeRequests.create`, `exportTaxBatch`.
- `paymentRequestUtils` / types — `customer_name`, `tax_invoice_code`, `tax_product_code`.
- `taxInvoiceXlsxExport.ts` — `downloadApiTaxZip()` (ZIP từ BE).
- `InvoiceRequestTab` — ưu tiên export batch BE, fallback client ZIP.

**Docs / SQL**
- `supabase_schema_patch_active_requests_nullable_pr.sql` — `pr_id` NULL + `customer_name` (bắt buộc chạy Supabase trước standalone AR).

**Ghi chú:** Tạo PR (B1) `POST /api/v1/payment-requests` **không** đổi trong commit này. Vercel prod đã deploy `2f93684` có thể hết lỗi B1 do deploy/backend khác — không chứng minh fix B1 từ diff này.

---

## 2026-05-27 — Task 2 FE: chọn gói học trong PR drawer mini-window

**Nguồn:** feedback Hiếu tối 27/05, branch `ui/ux` sau khi fast-forward `origin/main` commit `6376820`.

**Frontend**
- `PaymentRequestDetailDrawer.tsx` — mini-window "Kích hoạt khoá học" trong Payment Request drawer dùng `Combobox` để Sales chọn/gõ tìm gói học.
- `PaymentRequestsTab.tsx` / `PaymentFlowContext.tsx` — nối callback đổi gói từ drawer vào context.
- `lib/api.ts` / `types/paymentRequest.ts` — thêm client type/method cho `PATCH /api/v1/active-requests/{ar_id}`.
- `paymentRequestUtils.ts` — thêm helper update course package + build payload `uids_data` snake_case.
- `paymentRequestUtils.test.ts` — test helper đổi gói và payload snake_case.

**Verification**
- `npm run test -- src/components/payment-request/paymentRequestUtils.test.ts` pass.
- `npm test` pass 2 files / 6 tests.
- `npm run build` pass.

**Known blocker**
- FE đã chọn/gõ được gói, nhưng DB chưa lưu vì BE `PATCH /api/v1/active-requests/{ar_id}` chưa persist `uids_data`; UI báo "Đã đổi gói tạm trên giao diện; máy chủ chưa lưu được thay đổi gói học."
- Docs handoff cho Đức đã cập nhật request shape và acceptance trong `docs/HANDOFF_GIANG_DUC_2026-05-27.md`.

---

## 2026-05-27 — Task 2 FE: thêm nút Lưu cho mini-window Active Request

**Frontend**
- `PaymentRequestDetailDrawer.tsx` — chọn gói học trong mini-window chỉ cập nhật draft tại UI.
- Thêm nút **Lưu** ở header mini-window; nút chỉ bật khi có thay đổi và bấm nút mới gọi PATCH lưu Active Request.
- Giữ tách nghiệp vụ: Sales không nhập Order ID, không có nút "Xác nhận thông tin" của tab Kích hoạt khóa học.

**Verification**
- `npm test` pass 2 files / 6 tests.
- `npm run build` pass.

---

## 2026-05-28 — P0/P1 FE: mini-window Active Request + trạng thái kích hoạt

**Frontend**
- `PaymentRequestDetailDrawer.tsx` — mini-window hiển thị UID, SĐT format đầu số quốc gia, gói học, số tiền; đổi badge Sales thành "Chờ kích hoạt" / "Đã kích hoạt"; thêm icon Sửa, Lưu, Xoá AR, Xoá tên gói; thêm gói cho UID hiện có và thêm UID mới.
- `ActivationTab.tsx` — Order ID chuyển sang draft, Ops bấm **Lưu Order ID** mới PATCH; nút "Xuất HĐ" set cờ `invoiceRequestedAt` rồi mới mở B4.
- `paymentFlowUtils.ts` / `InvoiceRequestTab.tsx` — AR mới giữ ở `pending_order`; có Order ID nhưng chưa bấm Xuất HĐ không vào `ready_invoice`; tab B4 chỉ nhận course có `invoiceRequestedAt`.
- `PaymentFlowContext.tsx` / `api.ts` / types — thêm save full AR, optimistic delete AR, và field `invoice_requested_at` trong `uids_data.courses[]`.

**Docs**
- `TODO.md` — thêm block F2805-P0/P1.
- `HANDOFF_GIANG_DUC_2026-05-27.md` — cập nhật FE đã làm và BE còn cần persist delete/cancel AR + `invoice_requested_at`.

**Verification**
- `npm test -- paymentRequestUtils.test.ts paymentFlowUtils.test.ts` pass 2 files / 7 tests.
- `npm run build` pass.

**Known blocker**
- Xoá Active Request đang gọi optimistic `DELETE /api/v1/active-requests/{ar_id}`; cần Giang/Đức mở endpoint thật hoặc thống nhất soft-cancel.
- `invoice_requested_at` đang nằm trong JSONB `uids_data`; cần BE giữ field này khi PATCH để B4 không bị mất trạng thái sau reload.
---

## 2026-05-28 — FE merge `main@3c0c579` + Active Request feedback P0/P1

- Merge `origin/main@3c0c579` vào `ui/ux`, giữ phần main cho Order ID persistence, Active Request drawer save và multi-bill.
- Payment Request mini-window: hiển thị UID, SĐT format `+country_code`, gói học, số tiền; thêm icon Sửa, Lưu, Xóa AR, Xóa tên gói; không show Order ID cho Sales.
- Đổi Sales wording: AR mới hiển thị “Chờ kích hoạt khóa học”; course badge “Chờ kích hoạt” / “Đã kích hoạt”.
- B4 gating FE: tab hóa đơn chỉ nhận course có `invoiceRequestedAt`; nút “Xuất HĐ” ở Active Request set `invoice_requested_at` qua PATCH `uids_data`.
- Cập nhật `docs/TODO.md` và handoff Giang/Đức cho BE blockers: delete/cancel AR, persist `invoice_requested_at`.

---

## 2026-05-29 — Activation routes + idempotent import + sandbox

**Backend**
- `activation_routes.py` — module quản lý course activation và CRM order matching logic.
- `gsheet_ledger_import.py` / `xlsx_ledger_import.py` — idempotent import: `UNFORMATTED_VALUE`, dedup `import:%`, nan fingerprint.

**Frontend**
- Lazy load main page views (`perf: lazy load`).
- Sandbox environment bootstrap: banner đọc `VITE_APP_ENV`.

**Docs**
- `PLAN_30-05-2026.md` — kế hoạch 30/05, trạng thái cuối ngày 29/05.
- UAT cleanup scripts + sale_email schema patch docs.

---

## 2026-05-30 — Dashboard gamification + PalFish branding

**Frontend**
- `DashboardTab.tsx` — gamification summary, today-honors, personalization logic, event carousel, current_user rank card.
- PalFish app logo và favicon (`feat(branding)`).
- Active Request PR drawer mở rộng kích thước.

**Backend**
- `dashboard_routes.py` — `GET /api/v1/dashboard/summary` mock gamification API, today-honors API.
- `get_top_sales` RPC cho vinh danh dashboard.

**Git**
- Feature branches: `feature-duc` (dashboard gamification handoff), `feature-kem` (vinh danh RPC), `feature-dat` (dashboard real data).
- Sandbox branch merge workflow.

---

## 2026-05-30..06-01 — Task 5/9: Active Request mini card + allocation guard

**Frontend**
- `ActiveRequestMiniCardV2` — Pulse redesign, allocation guard, remove-UID button, scrollable mini card body, inline pencil icon thay text "bút chì".
- Fix close allocation loopholes: chặn sửa khi tất cả courses đã khoá trừ khi `remaining > 0`.
- Fix scroll trap AR UID list — let drawer body scroll naturally.

**Backend**
- `activation_routes.py` — cap activation allocation by received amount.
- Sync Sổ doanh thu khi B3 course gets CRM `order_id`.

**Docs**
- `CODEX_PROMPT_2026-05-30.md` — consolidated handoff: branch audit, task status, Codex prompt.

---

## 2026-06-01..02 — Permissions dynamic RBAC + auth accounts upgrade

**Frontend**
- `permissions/PermissionsTab.tsx` — department×module matrix UI, personal overrides.
- `permissions/OverrideDrawer.tsx`, `permissions/StaffPickerModal.tsx` — override tab UI + readOnly mode hook.
- `auth/AccountDetailDrawer.tsx`, `auth/CrmLinkModal.tsx`, `auth/CreateAccountModal.tsx`, `auth/DeleteAccountsModal.tsx` — auth accounts upgrade: detail drawer, CRM linking/unlinking, bulk delete.
- `AuthAccountsTab.tsx` — unlink CRM button, empty state matching prototype.
- Sidebar wired to dynamic permissions from API.
- Fix permissions blank page for sale users; fix action button flash; enforce readOnly across all tabs with write actions.
- Fix department label thay role trong header badge; store canonical department keys thay Vietnamese labels.
- Fix auth tab refocus causing full-page reload (`useMe` loading gate).

**Backend**
- `admin_routes.py` — dynamic RBAC matrix, personal overrides, bulk delete auth users, CRM unlink logic.
- `rbac.py` — dynamic me permissions endpoint.
- RBAC scope enforced on payment request APIs.
- Password recovery flow + OTP setup.

**Docs**
- `supabase_schema_patch_db_audit_20260603.sql` — DB audit SQL migration.

---

## 2026-06-02 — Dashboard refactor + sub-team + test accounts

**Frontend**
- `DashboardTab.tsx` — refactor today-honors + monthly ranking pagination; 4 events from prototype + per-event styling; compact layout; timezone fix.
- `SignUpPage.tsx` — sub-team selection dropdown.
- Profile, permissions, dashboard — add `subTeam` field.
- Real-time data fetching + refetch on focus cho multiple components.
- Test data visibility toggle cho payment requests.

**Backend**
- `dashboard_routes.py` — team/subteam details; Vietnam date → UTC for accurate transaction queries; monthly ranking from `so_doanh_thu`.
- `scripts/create_test_accounts.py` — script tạo 2 designated testing accounts trên Supabase.
- `is_test` flag across routes.
- `gsheet_ledger_import.py` / `xlsx_ledger_import.py` — thêm `created_at` timestamp khi insert.

---

## 2026-06-03 — Backend audit handoff + DB atomic fixes

**Docs**
- `HANDOFF_BE_AUDIT_2026-06-03.md` — kiểm tra 13 module backend, 22 issues (7 DB + 7 AUTH + 8 OTHER), phân công Đức/Đạt/Giang.
- `backend/tests/` — 31 test cases verify toàn bộ 22 audit tasks.

**Backend (audit fixes — sandbox branch)**
- `activation_routes.py` — secure endpoints: thêm `resolve_actor()` cho GET/POST/DELETE/PATCH active-requests (AUTH-01).
- `report_routes.py` — auth check BC03 (AUTH-02).
- `crm_routes.py` — auth CRM token update (AUTH-03).
- `payment_request_routes.py` — auth PATCH status + sync-pending + delete bill (AUTH-04).
- `dashboard_routes.py` — auth team/nhân sự list (AUTH-05); row cap analytics (DB-06).
- `main.py` — verify PayOS webhook signature (OTHER-01).
- `rpc_helpers.py` — atomic JSONB RPCs cho AR course patches (DB-04); Postgres sequence allocators cho mã đơn/hoá đơn/PR (DB-01..03).
- `revenue_routes.py` — bounded query BC01/BC02 (DB-07).
- `admin_routes.py` — partial result bulk delete (OTHER-06).
- `env_utils.py` — default `APP_ENV=development` (OTHER-07).
- `vn_staff.py` — case-insensitive team filter + env config (OTHER-08).

**SQL**
- `supabase_schema_patch_db_audit_20260603.sql` — Postgres sequences `don_hang_seq`, `invoice_code_seq`, `product_code_seq`, `payment_request_seq`; atomic RPC functions.

---

## 2026-06-03..04 — Module 5 CRM sync + BC03 + sandbox merges

**Backend**
- `crm_routes.py` — hybrid CRM sync, CRM token encryption (`Fernet`), autonomous sync.
- `report_routes.py` — BC03 daily backfill, monthly report.
- `dashboard_routes.py` — Dashboard Sale VN table, split APIs.
- `crm_metrics.py` — CRM sales data upsert after export.
- `Module5Tab.tsx` — update styles, improve token status display.

**SQL**
- `supabase_schema_patch_crm_*.sql` — CRM hybrid, record type, sales data, period, sale_date, tokens.
- `supabase_schema_patch_bc03_monthly.sql` — BC03 monthly report table.

**Git**
- Feature branch merges into `sandbox`: `feature-kem` (OTHER-01..08), `feature-duc` (DB audit RPC), `feature-dat` (auth secure).

---

## 2026-06-04..05 — Ledger search + batch team lookup + perf

**Backend**
- `revenue_routes.py` — `search` param cho `_ledger_query`; `load_team_map()` batch lookup thay N+1 queries.
- SQL migration: indexes cho search + team lookup.

**Frontend**
- `SoDoanhThuTab.tsx` — debounced search bar cho Sổ doanh thu.
- `AppShell.tsx` — preload lazy chunks on nav hover (eliminate module switch delay).

**Docs**
- `docs/SPEC_TEMPLATE.md` + `docs/HUONG_DAN_XUAT_SPEC.md` — spec template cho prototype-to-spec workflow.

---

## 2026-06-05 — Unified permission system + MeProvider

**Frontend**
- `useMe` → shared `MeProvider` context (single `/me` fetch, no duplicate calls).

**Backend**
- `rbac.py` + `admin_routes.py` — unified permission system with `min_role` scope.

**Docs**
- Unified permissions design spec + implementation plan.

---

## 2026-06-05..06 — 4-level RBAC sub-team scoping

**Backend**
- `report_routes.py`, `dashboard_routes.py` — team scope enforcement (leader chỉ thấy data team mình).
- `revenue_routes.py` — sub-team scope trên ledger + QR data sources.

**Frontend**
- `PermissionsTab.tsx` — cập nhật labels + tooltips cho 4-level role system.
- `DashboardTab.tsx` — warning cho sub-team scoped users không có CRM data.
- `AuthAccountsTab.tsx` — ưu tiên CRM name thay Google profile name.

**Fix**
- Auto-correct GMV locale errors từ "All File Thu Hiền" (detect dấu phẩy thập phân VN).
- Permissions tab loading spinner fix (revert + reapply).

---

## 2026-06-06..08 — TOP1-01 Nội dung CK + TOP3 PayOS transfer content

**Frontend**
- `PaymentFlowContext.tsx` — transfer content format: base36 code + tên con + họ tên selector (first/last name).
- `CreatePaymentRequestModal.tsx` — child_name persistence, phone country prefix fix.
- `paymentRequest.ts` — `transferContent` field trên `PaymentAttempt`.

**Backend**
- `payment_request_routes.py` — persist `transfer_content` trong `payment_lines` table.
- Store PayOS `transfer_content` (with PayOS prefix) thay vì tự tạo description.

**Migration**
- `payment_lines.transfer_content` column.

**Fix**
- `tsc -b` build errors: test type, lazy type, onClick signature (`0bb0fa5`).
- ErrorBoundary + lazy retry prevent blank page after deploy (`23e3a4a`).

---

## 2026-06-08..09 — TOP2-01/02/03 Nguồn KH, MST, Loại KH

**Frontend**
- `CreatePaymentRequestModal.tsx` — lead_source dropdown, lead_channel input, customer_type toggle (cá nhân / doanh nghiệp), company_name + tax_id conditional fields.
- Dynamic MST label — đổi theo loại KH (CCCD/CMND vs Mã số thuế).
- `ActiveRequestApiRow` — thêm `lead_source`, `lead_channel` types.

**Backend**
- `payment_request_routes.py` — `lead_source`, `lead_channel`, `customer_type`, `company_name`, `tax_id` trên PaymentRequest CRUD.
- `_payment_request_insert_row` + `_payment_request_patch_row` — persist all TOP2 fields.

**Migration**
- `payment_requests` table: `lead_source`, `lead_channel`, `customer_type`, `company_name`, `tax_id` columns.

---

## 2026-06-09 — TOP1-02 Trả góp + Kế toán xác nhận

**Frontend**
- `CreatePaymentRequestModal.tsx` — installment form: platform, total amount, sale received fields (hiện khi method = installment).
- `ReconciliationTab.tsx` — accountant verification section trong B2 drawer: `verified_total` + `verified_received` inputs, purple bordered editable / green confirmed states.
- `PaymentFlowContext.tsx` — `confirmTransaction` nhận optional `verified` object.
- `api.ts` — `patchStatus` hỗ trợ extra verified fields.
- `paymentRequestUtils.ts` — `fromApiPaymentAttempt` map `verified_total` / `verified_received`.

**Backend**
- `PaymentLineCreate` model — `installment_platform`, `installment_total`, `sale_received` fields.
- `TransactionStatusPatch` model — `verified_total`, `verified_received` fields.
- `_serialize_payment_line` + `_serialize_payment_for_list` — serialize tất cả 5 fields mới.
- `create_payment_line` — insert installment fields khi method = installment.
- `patch_transaction_status` — update verified fields khi confirm.

**Migration**
- `payment_lines`: `installment_platform`, `installment_total`, `sale_received` columns.
- `payment_lines`: `verified_total`, `verified_received` columns.

---

## 2026-06-09..10 — Bug fixes từ test feedback

**Backend**
- `_serialize_payment_request` — thêm 5 fields bị thiếu: `customer_type`, `company_name`, `lead_source`, `lead_channel`, `tax_id`. Data đã lưu DB đúng nhưng serializer không trả về FE.

**Frontend**
- `ReconciliationTab.tsx` — kế toán xác nhận section: di chuyển từ `drawer-foot` (sticky footer) lên main body. Tăng kích thước: border 2px, padding 16-18px, font 14-15px, labels bold.

**Chore**
- `.gitignore` — ignore `.vite/` cache directory.
- `CLAUDE.md` — ghi chú dùng `tsc -b` thay `tsc --noEmit`.

---

## 2026-06-10 — Feedback 10/6: Edit amount UX + Invoice remind + Smart throttle

**Frontend**
- `PaymentRequestDetailDrawer.tsx` — pencil icon size 12 + opacity 0.6 (rõ hơn); one-time onboarding tooltip (auto-show 600ms, auto-hide 5s, localStorage `pf-edit-amount-tip-shown`).
- `PaymentRequestDetailDrawer.tsx` — nút "Nhắc xuất hóa đơn" + hook `useInvoiceRemind` (fetch remind status, throttle 24h, send remind); dòng trạng thái "Đã nhắc kế toán lúc ... — bởi ..."; guard `activatedCount > 0`.
- `InvoiceRequestTab.tsx` — standalone banner (cam) hiện khi có pending reminders; KPI card "Sales đang nhắc" + icon chuông; row-level badge "Nhắc" trong tab pending.
- `api.ts` — `invoiceRemind.list(status?)` endpoint.
- `prototype-payments.css` — `.edit-amount-tip` tooltip bubble; `.remind-badge` orange pill; `.cell-name` flex layout.
- `constants/leadSource.ts` — fix Tiktokshop code `300531b` → `300551`.

**Backend**
- `payment_request_routes.py` — `_has_invoice_since(sb, pr_id, since)`: check nếu course nào được xuất HĐ (invoicedAt) sau datetime `since`. Smart throttle: cooldown 24h reset khi kế toán đã xuất HĐ → sale nhắc lại được cho course mới.
- `payment_request_routes.py` — fix `is_pending()`: check `course.invoiced` field thay vì AR status string (reminder biến mất khi AR activated nhưng chưa invoiced).
- `payment_request_routes.py` — fix column name `uids` → `uids_data` trong query invoice-reminders (Supabase PostgREST trả 400).

**Docs**
- `HANDOFF_DAT_INVOICE_REMIND.md` — §5–§7: smart throttle, FE complete, BE bugs fixed.
- `TODO.md` — block Feedback 10/6 (F1006-01..09).
- `CHANGELOG.md` — entry này.

---

## 2026-07-07 — Fix QR capture nhúng bitmap cũ (incident PR-2026-0135/0136)

**Root cause:** `html-to-image` cache resource theo URL đã cắt query params (`getCacheKey` trong `dataurl.js`). Mọi QR vietqr.io chỉ khác nhau ở query (`amount`, `addInfo`) → capture thứ 2 trong phiên nhúng bitmap QR của lần đầu. Incident tương tự 23/6 (PR-0080/0081).

**Frontend**
- `QrViewModal.tsx` — `toBlob` thêm `includeQueryParams: true` (fix root cause); refactor `handleCopyQr` inline fetch+verify; thêm `verifyQrBlob` helper + `"verifyfail"` UI state cho cả 2 nút.
- `qrVerify.ts` (mới) — EMV TLV parser (`parseEmvTlv`, `extractEmvAddInfo`, `extractEmvAmount`) + `verifyQrPayload` + `decodeQrFromBlob` (jsqr, retry scales). Fail-closed guardrail: mọi ảnh QR rời app phải decode khớp `code` + `amount` của line hiện tại.
- `QrViewModal.test.tsx` — GROUP 11 (regression `includeQueryParams`), GROUP 12 (guard behavior: mismatch/unreadable/ok cho cả 2 nút, 5 tests).
- `qrVerify.test.ts` (mới) — 8 unit tests EMV parser (incident case, malformed, missing tag).
- `e2e/qr-capture.spec.ts` (mới) — 3 E2E tests: tái hiện incident (2 QR captures same session), guard fail-closed; dùng `page.route` intercept vietqr.io để deterministic.
- `e2e/helpers/api-client.ts` — thêm `createPaymentLine()`.
- `payment-request/CLAUDE.md` (mới) — ghi chú guard architecture cho AI workers.

**Deps**
- `jsqr` (runtime, ~40KB lazy import) — decode QR từ blob trong browser.
- `qrcode`, `pngjs`, `@types/qrcode`, `@types/pngjs` (dev, chỉ E2E).
