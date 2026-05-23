# TODO — PalFish GMV Reconciliation

> **Quy tắc:** Thêm task mới vào cuối danh sách. Khi hoàn thành, điền `completed_at` và đổi `status` → `done`. Không xóa task đã done (giữ lịch sử).

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
| X-01 | Module xuất file thuế (3 format NH) | cancelled | 2026-05-20 10:00 | | Out of scope hiện tại |

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
