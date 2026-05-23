# Cấu hình môi trường (local)

> **Làm UI trên ver-2:** clone `palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2`, branch `ui/ux-anh-minh` — checklist đổi máy: **`docs/WORKFLOW_UI_UX.md`**.  
> Deploy production: **`docs/DEPLOY.md`**. Task: **`docs/TODO.md`**.

## Bước 1 — Schema Supabase

1. Chạy `docs/supabase_schema_patch.sql` → **Success. No rows returned** là bình thường (DB mới).
2. Chạy `docs/supabase_schema_patch_v2.sql` (bảng `nhan_su_sale`, `don_hang_audit`).
3. Chạy `docs/supabase_schema_patch_v3.sql` — cột Module 1 (`crm_uid`, `created_by`, `bill_image`, …).
4. Chạy `docs/supabase_schema_patch_v4.sql` — CHECK `trang_thai` (`cho_thanh_toan`), cột `ghi_chu`.
5. Cuối SQL Editor: `NOTIFY pgrst, 'reload schema';` — bắt buộc sau ALTER (tránh PGRST204).
6. (Upload bill) `docs/supabase_storage_setup.md` — bucket `bills`.
7. Chẩn đoán: `docs/supabase_diagnose.sql` nếu lỗi cột.
8. Seed nhân sự VN: `cd backend` rồi `python ../scripts/seed_nhan_su_sale.py`. Script bỏ 6 sale Thailand/AU.

**Local backend `.env` — thêm (để thấy sidebar Quản lý quyền):**
```env
SYSTEM_ADMIN_EMAILS=anhminhcv0512@gmail.com,dinhgiang6492@gmail.com,hieuhn.mplanner@gmail.com
```

---

## Bước 2 & 3 — Lấy key trên Supabase

Vào project **jozcvbbypwvzaefteoxn** → **Project Settings** → **API** (hoặc **API Keys**).

| Biến | Lấy ở đâu | Dùng cho |
|------|-----------|----------|
| **Project URL** | `https://jozcvbbypwvzaefteoxn.supabase.co` | `SUPABASE_URL`, `VITE_SUPABASE_URL` |
| **anon** `public` | Tab **Legacy** → **anon** `service_role` hoặc **Publishable key** | `VITE_SUPABASE_ANON_KEY` (frontend) |
| **service_role** `secret` | Cùng trang → **service_role** (⚠️ không commit, không gửi chat) | `SUPABASE_SERVICE_ROLE_KEY` (backend) |

**Có** — `service_role` secret chính là key bạn hỏi (Legacy API keys → `service_role`).

Sau khi copy 2 secret, dán vào:

- `backend/.env` → `SUPABASE_SERVICE_ROLE_KEY=...`
- `frontend/.env.local` → `VITE_SUPABASE_ANON_KEY=...`

File mẫu đã tạo sẵn trong repo (gitignore); chỉ cần thay `PASTE_..._HERE`.

---

## Bước 4 — Tài khoản ops (3 email)

Quyền **tick "TT tiền về"** khi đăng nhập bằng một trong các email (đã cấu hình trong `.env`):

- `anhminhcv0512@gmail.com` — Pham Anh Minh
- `dinhgiang6492@gmail.com` — Dinh Giang
- `hieuhn.mplanner@gmail.com` — Hoang Ngoc Hieu

**Cách có tài khoản:**

1. Mở app → **Đăng ký** với từng email (magic link / Google).
2. Hoặc Supabase Dashboard → **Authentication** → **Users** → **Add user** / Invite.

Không tự tạo user chỉ bằng file `.env` — `.env` chỉ **cấp quyền ops** sau khi user đã tồn tại trong Auth.

**Backend** — gán quyền System (tab Quản lý quyền) trước khi có dòng trong `nhan_su_sale`:

```env
SYSTEM_ADMIN_EMAILS=anhminhcv0512@gmail.com,dinhgiang6492@gmail.com,hieuhn.mplanner@gmail.com
```

Hoặc `UPDATE nhan_su_sale SET role='system', email='...' WHERE crm_name='...';`

Auth SMTP + Google: **`docs/AUTH_SETUP.md`**.

### Phân biệt 3 biến email (Render / local)

| Biến | Nơi | Mục đích |
|------|-----|----------|
| `SYSTEM_ADMIN_EMAILS` | Backend (Render) | Role **System** tạm khi chưa có dòng `nhan_su_sale` → tab Quản lý quyền + subtab Auth |
| `OPS_EMAILS` | Backend (Render) | Tick **"Tiền về"** Tab 2 (`canConfirmPayment`) |
| `VITE_OPS_EMAILS` | Frontend | Fallback UI; production lấy từ `GET /me` |

Cùng list 3 email dev là OK giai đoạn setup. Sau này có thể tách (vd. Thu Hiền chỉ `OPS_EMAILS`).

### Test role Leader / Manager

1. System đổi role trên tab **Quản lý quyền** (dropdown) hoặc SQL:

```sql
UPDATE nhan_su_sale
SET role = 'leader', email = 'test@gmail.com', team = 'Inhouse 1', sub_team = 'Team 1'
WHERE crm_name = 'Le Kim Chi';
```

2. User **đăng xuất → đăng nhập lại** (JWT không tự đổi role).
3. **Leader**: không tab Quản lý quyền. **Manager**: tab có, không subtab Auth. **System**: cả hai subtab.

---

## Bước 5 — VietQR

Copy từ `frontend/.env.example` → `frontend/.env.local`. Build Vite chỉ đọc biến lúc **start dev** / **build** — đổi `.env.local` xong cần restart `npm run dev`.

| Biến | Mô tả | Mặc định trong code (`constants/bank.ts`) |
|------|--------|-------------------------------------------|
| `VITE_BANK_BIN` | Napas BIN | `970422` (MB Bank) |
| `VITE_BANK_ACCOUNT_NO` | Số TK thu tiền | `1680011668899` |
| `VITE_BANK_ACCOUNT_NAME` | Tên chủ TK / pháp nhân (VietQR `accountName`) | Công ty TNHH… |
| `VITE_BANK_DISPLAY_NAME` | Tên ngân hàng (UI + copy) | MB Bank |
| `VITE_BANK_BRANCH` | Chi nhánh (modal thanh toán) | `Hoàn Kiếm` |

QR URL: `https://img.vietqr.io/image/{BIN}-{STK}-compact2.png?amount=…&addInfo=…&accountName=…`

Production: set cùng bộ biến trên **Vercel** — `docs/DEPLOY.md` § Frontend env.

---

## Bước 6 — Nối `api_pipe` (PayOS / đối soát bank)

Folder **`api_pipe/`** chứa webhook PayOS ghi vào Supabase (`giao_dich`, cập nhật `don_hang.tien_ve`).

| File | Vai trò |
|------|---------|
| `api_pipe/payos_webhook.py` | Webhook PayOS (Giang): bóc mã KH/DH, khớp số tiền → `giao_dich` + `tien_ve` |
| `api_pipe/.env` | `SUPABASE_*`, `PAYOS_*` (copy từ `.env.example`) |
| `backend/main.py` | `load_dotenv(api_pipe/.env)` + `POST /webhook/payos` → `handle_payos_webhook` |

**Một Supabase cho cả app:** dùng cùng `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` trong `backend/.env` và `api_pipe/.env` (hoặc chỉ backend — đã đủ nếu backend load được api_pipe).

**PayOS callback URL (production):** trỏ về backend, ví dụ `https://<backend-host>/webhook/payos`.

Chạy pipe riêng (debug PayOS, port 8001):

```powershell
cd api_pipe
pip install fastapi uvicorn python-dotenv supabase
uvicorn cau_hinh:app --reload --port 8001
```

---

## Chạy

```powershell
# Terminal 1 — backend (đã gắn api_pipe)
cd backend
pip install -r requirements.txt

# Cách 1 (khuyên dùng): script tự kiểm tra .env rồi chạy
.\run.ps1

# Cách 2: tay
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 — frontend (phải vào thư mục frontend — không có package.json ở repo root)
cd frontend
npm install
npm run dev
# → http://localhost:5173 (hoặc 5174/5175). Supabase Redirect URLs phải có localhost — AUTH_SETUP.md
```

Nếu báo `uvicorn is not recognized`: pip đã cài nhưng thư mục Scripts chưa có trong PATH — lệnh `python -m uvicorn` luôn chạy được.

Kiểm tra: mở `http://localhost:8000/healthz` → JSON có `"status":"ok"`.  
Nếu `"supabase_key_valid_format": false` → kiểm tra lại đã dán **service_role** (không nhầm anon), không có dấu ngoặc kép thừa, không còn chữ `PASTE_`.

### Lỗi thường gặp (Windows)

| Lỗi | Cách xử lý |
|-----|------------|
| `uvicorn is not recognized` | Dùng `python -m uvicorn ...` hoặc `.\run.ps1` |
| `/healthz` → **Internal Server Error** | Tiến trình **cũ** vẫn chạy code cũ trên port 8000. Tắt hết (Ctrl+C), hoặc: `Get-NetTCPConnection -LocalPort 8000` rồi kill PID, chạy lại `.\run.ps1` |
| `/healthz` → `supabase_configured: false` | `backend/.env` vẫn là `PASTE_...` — dán lại **service_role** (chuỗi JWT dài ~200 ký tự), **Save** file |
| `Invalid API key` khi tạo đơn | Không nhầm anon key; không có dấu `"` bọc key trong `.env` |
| Frontend chạy mà tạo đơn fail | Backend terminal 1 phải đang chạy, `VITE_API_BASE_URL=http://localhost:8000` |
| Upload bill 500 / Storage error | Chưa có bucket `bills` | `docs/supabase_storage_setup.md` |
| Tab PayOS trống local | Chưa CK / chưa `PAYOS_*` | Điền `api_pipe/.env`; test webhook hoặc insert `giao_dich` tay |

### Lỗi `Invalid API key` ở Login/SignUp

1. Mở `frontend/.env.local`, kiểm tra **trên file đã lưu**:
   - `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<anon/public hoặc publishable key>`
2. Không dùng placeholder như `PASTE_ANON_PUBLIC_KEY_HERE`.
3. Sau khi sửa env, **tắt hẳn** `npm run dev` rồi chạy lại (Vite chỉ đọc env lúc khởi động).
