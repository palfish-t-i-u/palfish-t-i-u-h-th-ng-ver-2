# TODO — PalFish GMV Reconciliation

> **Quy tắc:** Thêm task mới vào cuối danh sách. Khi hoàn thành, điền `completed_at` và đổi `status` → `done`. Không xóa task đã done (giữ lịch sử).  
> **Đọc nhanh:** chỉ xem dòng `pending` / `in_progress` — phần `done` giữ lịch sử, không cần đọc lại.

**Định dạng thời gian:** `YYYY-MM-DD HH:mm` (giờ địa phương UTC+7 trừ khi ghi chú khác).

**Trạng thái:** `pending` | `in_progress` | `done` | `cancelled`

---

## Module 1 — App tạo mã & dashboard

| ID | Task | Status | created_at | completed_at | Ghi chú |
|----|------|--------|------------|--------------|---------|
| M1-01 | Chạy SQL patch `supabase_schema_patch.sql` | done | 2026-05-20 14:00 | 2026-05-20 14:30 | Success, no rows returned |
| M1-02 | Cấu hình `backend/.env` + `frontend/.env.local` (Supabase keys) | done | 2026-05-20 14:30 | 2026-05-20 23:00 | service_role + anon |
| M1-03 | Chạy local: backend (`run.ps1`) + frontend (`npm run dev`) | done | 2026-05-20 15:00 | 2026-05-20 23:15 | Windows: `python -m uvicorn` |
| M1-04 | Test Sign up → confirm email → auto login | done | 2026-05-20 22:00 | 2026-05-20 23:30 | Supabase Auth email OK |
| M1-05 | Test Sign in magic link | done | 2026-05-20 22:00 | 2026-05-20 23:30 | |
| M1-06 | Test Tab 1: tạo đơn + QR + Info Code | done | 2026-05-20 20:00 | 2026-05-20 23:45 | Lưu Supabase `khach_hang` + `don_hang` |
| M1-07 | Test Tab 2: đơn hiện bảng, cột tách, up bill | done | 2026-05-20 20:00 | 2026-05-20 23:50 | |
| M1-08 | Nghiệm thu CK thật qua QR (tiền vào + auto `tien_ve`) | pending | 2026-05-20 23:50 | | Nghẽn: lỗi bank app "Ngân hàng nhận lệnh" — xem M1-09 |
| M1-09 | Xác nhận STK VietQR công ty với Giang | in_progress | 2026-05-20 23:55 | | Code/env: MB `970422` / `1680011668899`; chờ nghiệm thu CK + PayOS |
| M1-10 | Sửa UI dropdown địa chỉ tràn viền | done | 2026-05-20 23:20 | 2026-05-21 00:05 | `min-width: 0`, flex |
| M1-11 | Hỗ trợ dark mode (input/select đọc được) | done | 2026-05-20 23:40 | 2026-05-21 00:10 | `gmv-theme.css` |
| M1-12 | PayOS webhook + đối soát (`api_pipe/payos_webhook.py`, commit `gg`) | done | 2026-05-21 18:00 | 2026-05-21 19:30 | Giang: khớp mã+tiền; `main.py` gọi `handle_payos_webhook` |
| M1-13 | `GET /crm/customers` + combobox UID Tab 1 | done | 2026-05-21 18:00 | 2026-05-21 19:30 | Fallback `khach_hang` theo sale; TODO CRM API |
| M1-14 | Bill Storage + nén ảnh client | done | 2026-05-21 18:00 | 2026-05-21 19:30 | `POST /orders/{id}/bill` + `supabase_storage_setup.md` |
| M1-15 | Signup Google-first + Confirm email OFF | done | 2026-05-21 18:00 | 2026-05-21 19:30 | `SignUpPage`, `AUTH_SETUP.md` §0 |
| M1-16 | Lỗi tạo đơn rõ + Copy QR (`apiErrors`, `PaymentModal`) | done | 2026-05-21 18:00 | 2026-05-21 19:30 | Gộp `formatApiError` (Giang) + retry Render |
| M1-17 | Tab Lịch sử PayOS (`PayosHistoryTab`) | done | 2026-05-21 18:00 | 2026-05-21 19:30 | `GET /payos/transactions`, badge `khop`/`sai_tien` |
| M1-18 | FE production API URL (`apiBaseUrl.ts`) | done | 2026-05-21 19:00 | 2026-05-21 19:30 | Commit `gg` (Giang) — fix lỗi port 8000 trên Vercel |
| M1-19 | Nút Hủy đơn Tab 2 (`POST /orders/{id}/cancel`, `trang_thai=huy`) | done | 2026-05-21 21:00 | 2026-05-21 21:45 | Chặn hủy khi `tien_ve=true`; row dim + badge |
| M1-20 | UI sidebar (`AppShell`) + flatten Quản lý quyền | done | 2026-05-21 21:00 | 2026-05-21 21:45 | Nhân sự Sale / Tài khoản Auth trên sidebar |
| M1-21 | UI refresh — design tokens + `components/ui` | done | 2026-05-21 22:30 | 2026-05-21 23:30 | Brand `#7260ff`; `docs/DESIGN.md`; mobile bottom nav |

---

## Deploy & vận hành

| ID | Task | Status | created_at | completed_at | Ghi chú |
|----|------|--------|------------|--------------|---------|
| D-01 | Deploy frontend lên Vercel | done | 2026-05-21 00:15 | 2026-05-21 17:00 | `palfish-gmv-manager.vercel.app` |
| D-02 | Deploy backend lên Render | done | 2026-05-21 00:15 | 2026-05-21 17:00 | `palfish-gmv-api` |
| D-03 | Cấu hình Supabase Auth redirect URLs (production) | done | 2026-05-21 00:15 | 2026-05-21 17:00 | Site URL + redirect |
| D-04 | Set `VITE_API_BASE_URL` = URL Render trên Vercel | done | 2026-05-21 00:15 | 2026-05-21 17:00 | |
| D-05 | Set `FRONTEND_URL` trên Render = URL Vercel | done | 2026-05-21 00:15 | 2026-05-21 17:00 | Không slash cuối |
| D-06 | Smoke test production: auth + tạo đơn + Tab 2 | done | 2026-05-21 00:15 | 2026-05-21 17:00 | Google login OK; CK thật chưa |
| D-07 | Render: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | done | 2026-05-21 16:30 | 2026-05-21 17:00 | Fix `/me` 503 |
| D-08 | Resend Custom SMTP trên Supabase | done | 2026-05-21 16:00 | 2026-05-21 17:00 | Xem `AUTH_SETUP.md` |
| D-09 | Bật Google OAuth (Supabase + Google Cloud) | done | 2026-05-21 16:00 | 2026-05-21 17:00 | |
| D-10 | Chạy SQL patch v2 + seed `nhan_su_sale` | done | 2026-05-21 16:00 | 2026-05-21 17:00 | RLS enabled |

---

## Tích hợp sau Module 1 (Giang / team)

| ID | Task | Status | created_at | completed_at | Ghi chú |
|----|------|--------|------------|--------------|---------|
| I-01 | PayOS webhook → `giao_dich` + auto `tien_ve` | done | 2026-05-20 18:00 | 2026-05-21 19:30 | `api_pipe/payos_webhook.py` + Render env PAYOS_*; cấu hình callback PayOS dashboard |
| I-02 | CRM auto-activate sau thanh toán | pending | 2026-05-20 18:00 | | Endpoint `/crm/activate` stub sẵn |
| I-03 | Metabase: dropdown gói học tự động | pending | 2026-05-20 18:00 | | `METABASE_PACKAGES_QUESTION_ID` |
| I-04 | Bill upload → Supabase Storage (thay base64) | done | 2026-05-20 23:50 | 2026-05-21 18:50 | `POST /orders/{id}/bill` + FE fallback base64 |
| I-05 | Tab 2: inline edit + audit log thay đổi | pending | 2026-05-20 18:00 | | Wireframe |
| I-06 | Phân quyền Sale / Leader / Manager / System (API + UI) | done | 2026-05-20 18:00 | 2026-05-21 16:00 | `rbac.py`, tab Quản lý quyền |

---

## Module phụ trợ — Bảng quản trị (Module 1/2)

| ID | Task | Status | created_at | completed_at | Ghi chú |
|----|------|--------|------------|--------------|---------|
| A-01 | Trích cây nhân sự sale từ Metabase (149 sale, 15 team) | done | 2026-05-21 10:30 | 2026-05-21 11:25 | `docs/team_hierarchy.{md,json}` + `scripts/extract_hierarchy.cjs` |
| A-02 | Wireframe draft + logic phân quyền (Sale/Leader/Ops/System) | done | 2026-05-21 10:00 | 2026-05-21 11:30 | `docs/WIREFRAMES.md` + `docs/wireframes.html` (mở bằng browser) |
| A-03 | Propose wireframe + 6 câu hỏi cho QL | done | 2026-05-21 11:30 | 2026-05-21 17:00 | 4 cấp + tab UI đã code; Leader list chờ QL |
| A-04 | Schema `nhan_su_sale` + `don_hang_audit` | done | 2026-05-21 11:30 | 2026-05-21 16:00 | `supabase_schema_patch_v2.sql` |
| A-05 | Endpoint `/admin/sales`, `/me`, `/admin/auth-users` | done | 2026-05-21 11:30 | 2026-05-21 16:00 | `admin_routes.py`; audit/dashboard sau |
| A-06 | Match login email → CRM-name + SĐT (onboard lần đầu) | done | 2026-05-21 11:30 | 2026-05-21 16:00 | `PATCH /me` + ProfilePage |
| A-07 | Tab Quản lý quyền + Thông tin cá nhân (2 subtab CRM/Auth) | done | 2026-05-21 11:30 | 2026-05-21 21:45 | `StaffCRMTab`, `AuthAccountsTab` trên sidebar (thay `AdminPage`) |
| A-12 | Resend SMTP + Google OAuth (docs) | done | 2026-05-21 15:00 | 2026-05-21 16:00 | `docs/AUTH_SETUP.md` — cấu hình dashboard |
| A-08 | Sync Metabase 24h/lần → `nhan_su_sale` | pending | 2026-05-21 11:30 | | Cron / Render scheduled job |
| A-09 | Giải thích cấu trúc team cho Kem (dùng `team_hierarchy.md`) | pending | 2026-05-21 11:30 | | Họp đầu giờ chiều |
| A-10 | Bám sát Kem khi code dashboard (QA cross-check nghiệp vụ) | pending | 2026-05-21 11:30 | | Tránh code lan man |
| A-11 | Tiếp tục kết nối POS (chờ API key) | pending | 2026-05-21 11:30 | | Theo tiến độ Giang |

---

## Loại trừ giai đoạn này

| ID | Task | Status | created_at | completed_at | Ghi chú |
|----|------|--------|------------|--------------|---------|
| X-01 | Module xuất file thuế (3 format NH) | cancelled | 2026-05-20 10:00 | 2026-05-22 12:00 | Thay bằng **Module 3 & 4** — spec `docs/MODULE_3_4.md` |

---

## Module 3 & 4 — Xuất hóa đơn thuế

> Spec đầy đủ: **`docs/MODULE_3_4.md`**. SQL: `supabase_schema_patch_v5.sql` (Tab1) rồi `supabase_schema_patch_v5_invoice.sql`.

| ID | Task | Status | created_at | completed_at | Ghi chú |
|----|------|--------|------------|--------------|---------|
| M3-01 | Chạy SQL v5 + v5_invoice + bucket `tax_exports` | pending | 2026-05-22 12:00 | | SQL prod done; cần bucket `tax_exports` private |
| M3-02 | `backend/tax_export.py` — 3 file Excel (openpyxl) | done | 2026-05-22 12:00 | 2026-05-22 18:00 | MVP flat header; layout mẫu → **M3-05** |
| M3-03 | API: pending-crm, crm-order, queue/unqueue, export-batch | done | 2026-05-22 12:00 | 2026-05-22 18:00 | + `POST /invoices/queue-batch` |
| M3-04 | FE `Tab3CRMConfirm.tsx` — nhập Order ID, parser, Xuất | done | 2026-05-22 12:00 | 2026-05-22 18:00 | Toolbar **Xuất hóa đơn** hàng loạt |
| M4-01 | FE `Tab4InvoiceQueue.tsx` — queue, Tải hóa đơn, Hủy queue | done | 2026-05-22 12:00 | 2026-05-22 18:00 | Zip 3 file / batch ngày |
| M4-02 | `MainPage` sidebar «Hóa đơn» + types/api | done | 2026-05-22 12:00 | 2026-05-22 18:00 | Icon M3 (clipboard) ≠ M4 (file↓) |
| M3-05 | Excel 3 file — format merged header như `Report/3 file thuế/` | pending | 2026-05-22 18:00 | | Backlog sau smoke round 2 |
| M34-01 | Smoke E2E: Tab1 → tiền về → M3 → M4 → mở 3 Excel | pending | 2026-05-22 12:00 | | Round 2: tải 3 file OK; retest bulk + floor tháng |
| M34-02 | Deploy M3/M4 prod (SQL + Render + Vercel) | pending | 2026-05-22 12:00 | | Sau commit round 2 |

**Phase 2 (không trong MVP):** fetch CRM theo Order ID; phân bổ 1 QR→N đơn; UID lock 24h — xem MODULE_3_4 §11.

---

## UI/UX — branch `ui/ux` (repo ver-2)

> Workflow: **`docs/WORKFLOW_UI_UX.md`**. Handoff BE: **`docs/FE_HANDOFF_BE_PROMPTS.md`**. Live: `palfish-gmv-manager.vercel.app`.

| ID | Task | Status | created_at | completed_at | Ghi chú |
|----|------|--------|------------|--------------|---------|
| UX-01 | Vercel: repo ver-2 + Root `frontend` | done | 2026-05-23 | 2026-05-23 | Promote deployment `ui/ux` — WORKFLOW §2 |
| UX-02 | Ghi doc workflow + checklist đổi máy | done | 2026-05-23 | 2026-05-23 | `WORKFLOW_UI_UX.md` |
| UX-03 | Giang/Đức: review PR UI → `main` | done | 2026-05-23 | 2026-05-23 | PR #2 (shell cũ); B1–B4 tiếp trên `ui/ux` |
| UX-04 | UI refresh theo `WIREFRAMES.md` / `DESIGN.md` (tab legacy) | in_progress | 2026-05-23 | | Tab2 Done; Tab1/sidebar còn lại |
| UX-05 | Đồng bộ doc `docs/` ver-2 | done | 2026-05-23 | 2026-05-26 | Cập nhật B1–B4 + encoding |
| UX-06 | Render: deploy BE payment-request routes prod | pending | 2026-05-23 | | Giang/Đức — xem FE_HANDOFF |
| UX-07 | Tab2: freeze cột + scroll | done | 2026-05-23 | 2026-05-23 | merged `main` |
| UX-08 | Port prototype B1–B4 (Payment flow UX feedback) | done | 2026-05-26 | 2026-05-26 | Commit `5d515aa`; branch `ui/ux` |
| UX-09 | Fix UTF-8 mojibake tab Quản lý thanh toán | done | 2026-05-26 | 2026-05-26 | 3 TSX + Inter font; CHANGELOG |
| UX-10 | Fix Vercel build `ActivationTab` TS | done | 2026-05-26 | 2026-05-26 | Push `ui/ux` |
| UX-11 | Promote Vercel + smoke B1–B4 prod | pending | 2026-05-26 | | Sau push encoding fix |
| UX-12 | Merge `main` @ `2f936840` (BE handoff) vào `ui/ux` local | done | 2026-05-26 21:30 | 2026-05-26 21:45 | Fast-forward `2db4745`→`2f93684`; CHANGELOG |
| UX-13 | `git push origin ui/ux` — đồng bộ remote + graph Git | pending | 2026-05-26 21:45 | | `ahead 1` sau merge |
| UX-14 | Supabase: chạy `active_requests_nullable_pr.sql` (dev + prod nếu standalone AR) | pending | 2026-05-26 21:45 | | FE_HANDOFF §3, §8 |
| UX-15 | Smoke: standalone AR + export-batch B4 + cash pending B2 | pending | 2026-05-26 21:45 | | Sau UX-13/14 |

---

## Module 5 — Sổ doanh thu & Sales Performance

> Spec: **`docs/MODULE_SO_DOANH_THU.md`**. Vận hành seed/deploy: **`docs/M5_OPERATIONS.md`**. Tỷ giá mặc định **1 RMB = 3.700 VND**. Pivot tháng = **ngày tiền về**.

| ID | Task | Status | created_at | completed_at | Ghi chú |
|----|------|--------|------------|--------------|---------|
| M5-01 | SQL bảng `so_doanh_thu` + audit | done | 2026-05-23 | 2026-05-23 | v7 prod OK |
| M5-02 | API Sổ + hook M3 + DELETE dòng tay | done | 2026-05-23 | 2026-05-23 | `revenue_routes.py`; Render cần redeploy khi thêm route |
| M5-03 | FE tab **Sổ doanh thu** (Hiền/System) | done | 2026-05-23 | 2026-05-23 | Modal + bảng read-only — `LedgerFormModal.tsx` |
| M5-04 | FE tab **Sales Performance** (pivot) | done | 2026-05-23 | 2026-05-23 | Đổi tên từ Doanh thu Sale — `DoanhThuSaleTab.tsx` |
| M5-08 | UI Hiếu: cột chính HNxHCM, modal, scroll, VND sep, xóa tay | done | 2026-05-23 | 2026-05-23 | Xem MODULE §2.3 |
| M5-10 | Thẻ tổng hợp Sổ + Type fixx + cột CK/Order ID + filter hôm nay | done | 2026-05-23 | 2026-05-23 | MODULE §2.4–§2.5; `typeFixx.ts`, paginate BE |
| M5-11 | Type fixx `广告`+`loai_2` rollup; lọc `pay_time`; BC02 Kho chung + scroll | done | 2026-05-24 | 2026-05-24 | MODULE §2.5–§2.6; audit `scripts/audit_type_fixx_range.py` |
| M5-05 | Xuất Excel Sổ + pivot | pending | 2026-05-23 | | |
| M5-06 | Import lịch sử `HNxHCM GMV.xlsx` | pending | 2026-05-23 | | Script sẵn: `scripts/seed_so_doanh_thu.py --xlsx` — xem M5_OPERATIONS §2.2 |
| M5-07 | Cấu hình tỷ giá theo thời điểm (System) | pending | 2026-05-23 | | Phase 2 |
| M5-09 | Promote Vercel sau push UI M5 (không chỉ preview) | pending | 2026-05-23 | | WORKFLOW §2.1, M5_OPERATIONS §1 |
| M5-12 | Doc đối chiếu GMV tab / DingTalk / thẻ Sổ | done | 2026-05-25 | 2026-05-25 | `docs/M5_DOI_CHIEU.md`; audit 25/05 |
| M5-13 | Re-seed Sổ từ DingTalk xlsx (purge gsheet) | pending | 2026-05-25 | | = `F2605-P0-03`; backup + approve |
| M5-14 | Xóa dòng M3 test (`tu_dong`) qua UI/API | pending | 2026-05-25 | | Hiện chỉ SQL — `M5_OPERATIONS.md` §3.1 |

---

## Backlog (thêm mới)

| ID | Task | Status | created_at | completed_at | Ghi chú |
|----|------|--------|------------|--------------|---------|
| B-01 | PayOS webhook production (Giang) | done | 2026-05-21 17:00 | 2026-05-21 18:50 | Merge vào `backend/main.py` + env Render |
| B-02 | Ghi audit log từ Tab 2 / PATCH đơn | pending | 2026-05-21 17:00 | | Bảng `don_hang_audit` sẵn |
| B-03 | Dashboard Leader (GMV team) | pending | 2026-05-21 17:00 | | Wireframe §4.2 |
| B-04 | Verify domain Resend (tránh spam) | pending | 2026-05-21 17:00 | | Thay `onboarding@resend.dev` — ưu tiên thấp nếu dùng Google + Confirm email OFF |
| B-05 | Chạy SQL bucket `bills` trên Supabase production | done | 2026-05-21 19:30 | 2026-05-21 21:45 | Upload bill prod OK sau patch schema |
| B-06 | Smoke test P3 + sidebar UI (prod/local) | done | 2026-05-21 19:30 | 2026-05-21 21:45 | Tab 1/2, PayOS, bill, profile, quản lý quyền — ổn |
| B-07 | Chạy schema v3/v4 trên Supabase prod | done | 2026-05-21 22:00 | 2026-05-21 21:45 | `crm_uid`, `created_by`, `bill_image`; + `NOTIFY pgrst` |
| B-08 | Re-seed nhân sự VN (`seed_nhan_su_sale.py`) sau v3 | pending | 2026-05-21 22:00 | | Tùy chọn — API đã lọc VN; vài tên Trung/Josh còn hiện |
| B-09 | Deploy: Docker context + `python-multipart` | done | 2026-05-21 21:00 | 2026-05-21 21:30 | `render.yaml` dockerContext `.`; `requirements.txt` |
| B-10 | Local: Supabase redirect localhost + `SYSTEM_ADMIN_EMAILS` | done | 2026-05-21 21:00 | 2026-05-21 21:45 | `AUTH_SETUP.md`; `backend/.env` |

---

## Kế hoạch 26/05 — go-live tuần này (PDF feedback 25/05)

> Nguồn: `E:\PalFish\DA\Report\Feedback công việc 25_05 và kế hoạch làm việc 26_05.pdf`  
> Chi tiết Minh: `docs/MINH_TASKS_2026-05-26.md`  
> **Họp 26/05 8:30** — rework Module 1–2–3–4 (Payment Request many-to-many)

### P0 — Làm ngay (bôi vàng PDF)

| ID | Task | Status | Owner | Ghi chú |
|----|------|--------|-------|---------|
| F2605-P0-01 | Sửa lỗi dữ liệu **tất cả báo cáo** (~5% lệch thập phân/ngày) | pending | Minh | Re-seed DingTalk; `M5_DOI_CHIEU.md` |
| F2605-P0-02 | Xóa dòng M3 test khỏi Sổ prod | pending | Minh/Ops | SQL — `M5_OPERATIONS.md` §3.1 |
| F2605-P0-03 | Re-seed Sổ từ DingTalk xlsx (backup trước) | pending | Minh/Ops | `M5-13`; approve QL |
| F2605-P0-04 | Rà chênh lệch báo cáo **tháng 1–2–3** | pending | Minh | PDF yêu cầu kiểm soát quá khứ |

### Module đối chiếu bank (Giang / Đức)

| ID | Task | Status | Owner | Ghi chú |
|----|------|--------|-------|---------|
| F2605-BANK-01 | Module bank — kết nối biến động số dư | pending | Giang/Đức | Deadline PDF: 26/05 |
| F2605-BANK-02 | Logic so sánh tiền thật vs Sổ doanh thu | pending | Giang/Đức | |
| F2605-BANK-03 | CK tay ngoài QR — thu qua email/parse số dư (dự kiến QL) | pending | Giang/Đức | PDF: QL tự cấu hình |

### Go-live tuần đầu

| ID | Task | Status | Owner | Ghi chú |
|----|------|--------|-------|---------|
| F2605-GOLIVE-01 | Hướng dẫn sử dụng cơ bản cho sale | pending | Hiếu | |
| F2605-GOLIVE-02 | Thu feedback đội sale sau go-live | pending | Hiếu | |

### Luồng thanh toán mới — backend (Giang / Đức)

| ID | Task | Status | Owner | Ghi chú |
|----|------|--------|-------|---------|
| F2605-BE-01 | Schema + API **Payment Request** (PR ID) | in_progress | Giang/Đức | `ui/ux` @ `2f93684`; smoke prod |
| F2605-BE-02 | Mã thanh toán lẻ / Info Code (vd. TTPR…) gắn PR | done | Giang/Đức | `payment-lines` + PayOS |
| F2605-BE-03 | **Course code** (B3) — mở khi PR thu đủ 100%; link xuất HĐ | in_progress | Giang/Đức | AR routes + export-batch |
| F2605-BE-04 | Module xác nhận **tiền mặt** | done | Giang/Đức | Cash/card `pending` @ `2f93684` |
| F2605-BE-05 | Tích hợp **thẻ tín dụng / trả góp** | pending | Giang/Đức | |
| F2605-BE-06 | PayOS **PalFish Saigon** — chỉ team HCM tạo QR HCM | pending | Giang/Đức | Pháp nhân HCM riêng |
| F2605-BE-07 | Khớp **Order ID CRM** với Activate Code (matching) | pending | Giang/Đức | Bước cuối — Thu Hiền |

### UX / QA — Minh (sau P0)

> Map 1:1 với `MINH-01`…`MINH-10` trong `docs/MINH_TASKS_2026-05-26.md`

| ID | Task | Status | created_at | Ghi chú |
|----|------|--------|------------|---------|
| F2605-MINH-01 | Sơ đồ UX PR → mã thanh toán → Course code → Order ID | done | 2026-05-26 | `PROTOTYPE_PAYMENT_FLOW.md` |
| F2605-MINH-02 | Wireframe Payment Request list/detail | done | 2026-05-26 | `PaymentRequestsTab` + drawer |
| F2605-MINH-03 | Wireframe modal thêm lần thanh toán | done | 2026-05-26 | QR / cash / thẻ / CK |
| F2605-MINH-04 | Wireframe UI đối soát tiền | done | 2026-05-26 | `ReconciliationTab` |
| F2605-MINH-05 | Wireframe Activate Code — xuất HĐ không cần CRM Order ID | done | 2026-05-26 | `ActivationTab` + `InvoiceRequestTab` |
| F2605-MINH-06 | UX Sổ — auto dòng khi tiền về + Ops duyệt | pending | 2026-05-26 | + feedback Thu Hiền |
| F2605-MINH-07 | Đổi nhãn BC02 — không gọi Key Data đầy đủ | pending | 2026-05-26 | |
| F2605-MINH-08 | UX chọn tài khoản HN / HCM | pending | 2026-05-26 | |
| F2605-MINH-09 | Catalog tên sản phẩm HĐ (dropdown TTS) | pending | 2026-05-26 | `ke-hoach-cai-thien-feedback-thu-hien.md` |
| F2605-MINH-10 | Checklist UAT go-live với Giang & Đức | pending | 2026-05-26 | |
