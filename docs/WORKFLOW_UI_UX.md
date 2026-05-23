# Workflow UI/UX — branch `ui/ux-anh-minh`

> **Mục đích:** Anh Minh code giao diện trên branch riêng; **Giang** và **Đức** review trên GitHub / URL live trước khi merge vào `main`.  
> **Repo làm việc:** https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2  
> **Branch:** https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2/tree/ui/ux-anh-minh

---

## 1. Kiến trúc (không đổi khi chỉ sửa UI)

| Thành phần | Nền tảng | Ghi chú |
|------------|----------|---------|
| Frontend | **Vercel** `palfish-gmv-manager.vercel.app` | Build từ repo **ver-2**, thư mục `frontend/` |
| Backend API | **Render** `palfish-gmv-api.onrender.com` | Vẫn deploy từ repo cũ / service hiện tại — **chưa** gắn ver-2 |
| Database + Auth | **Supabase** `jozcvbbypwvzaefteoxn` | DB **production** dùng chung — cẩn thận khi test tạo/hủy đơn |

FE production gọi API qua proxy: `vercel.json` rewrite `/api` → Render.

---

## 2. Cấu hình Vercel (làm một lần — hoặc kiểm tra khi đổi máy)

Project: **palfish-gmv-manager**

| Mục | Giá trị |
|-----|---------|
| **Git repository** | `palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2` |
| **Root Directory** | `frontend` |
| **Production Branch** | **`ui/ux-anh-minh`** ← push branch này = cập nhật site chính |
| **Framework** | Vite (từ `frontend/vercel.json`) |

**Đường dẫn dashboard:** Project → **Settings** → **Git** → Production Branch.

**Env (Settings → Environment Variables)** — tick **Production** + **Preview**:

- `VITE_SUPABASE_URL` = `https://jozcvbbypwvzaefteoxn.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = anon key (Supabase → API)
- `VITE_OPS_EMAILS`, `VITE_BANK_*` — copy từ project cũ hoặc `frontend/.env.example`

Không bắt buộc set `VITE_API_BASE_URL` trên Vercel: build dùng `/api` (proxy Render).

**Sau khi đổi Production Branch:** Deployments → deployment mới từ `ui/ux-anh-minh` → **Visit** → xác nhận UI mới.

---

## 3. Đổi máy — checklist (copy từng bước)

### 3.1 Phần mềm

- [ ] Git
- [ ] Node.js 20+ (`node -v`)
- [ ] Python 3.11+ (chỉ khi chạy backend local)
- [ ] Editor (Cursor / VS Code)

### 3.2 Clone & branch

```powershell
cd <thư-mục-làm-việc>
git clone https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2.git
cd palfish-t-i-u-h-th-ng-ver-2
git fetch origin
git checkout ui/ux-anh-minh
git pull origin ui/ux-anh-minh
```

### 3.3 Frontend local

```powershell
cd frontend
copy .env.example .env.local
```

Sửa `frontend/.env.local`:

| Biến | Giá trị |
|------|---------|
| `VITE_SUPABASE_URL` | `https://jozcvbbypwvzaefteoxn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key (Supabase Dashboard) |
| `VITE_API_BASE_URL` | `http://localhost:8000` (khi chạy BE local) **hoặc** `https://palfish-gmv-api.onrender.com` (chỉ FE, trỏ thẳng Render) |

```powershell
npm install
npm run dev
```

Mở http://localhost:5173 — đăng nhập Google (redirect localhost: xem `docs/AUTH_SETUP.md`).

### 3.4 Backend local (tùy chọn — khi cần sửa API)

```powershell
cd backend
copy .env.example .env
```

Điền `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYSTEM_ADMIN_EMAILS` (xem `docs/SETUP_ENV.md`).

```powershell
pip install -r requirements.txt
# Windows, từ thư mục backend:
.\run.ps1
```

### 3.5 Tài liệu trong repo

Đọc theo thứ tự khi làm UI:

1. **`docs/WORKFLOW_UI_UX.md`** (file này)
2. **`docs/DESIGN.md`** — tokens, màu `#7260ff`, component `components/ui/`
3. **`docs/WIREFRAMES.md`** — layout Tab 1/2, sidebar
4. **`docs/SETUP_ENV.md`** — env local chi tiết
5. **`docs/DEPLOY.md`** — Vercel / Render / Supabase production

---

## 4. Quy trình hàng ngày (Anh Minh)

```text
git checkout ui/ux-anh-minh
git pull origin ui/ux-anh-minh
# ... sửa code trong frontend/src, frontend/src/gmv-*.css ...
git add .
git commit -m "ui: mô tả ngắn thay đổi"
git push origin ui/ux-anh-minh
```

1. Vercel tự build (1–3 phút).
2. Mở https://palfish-gmv-manager.vercel.app — kiểm tra UI.
3. Báo Giang/Đức: link branch GitHub + “đã push, xem trên Vercel”.

**Phạm vi nên sửa (UI/UX):**

- `frontend/src/**/*.tsx`, `frontend/src/gmv-theme.css`, `frontend/src/gmv-tokens.css`
- `frontend/src/components/ui/*`
- `docs/DESIGN.md`, `docs/WIREFRAMES.md` (nếu đổi spec UI)

**Tránh trên branch UI** (trừ khi đã thống nhật với Giang/Đức):

- `backend/`, `api_pipe/`, `docs/supabase_schema_patch*.sql`
- Đổi `vercel.json` destination Render (trừ khi cố ý đổi API)
- Xóa/sửa logic PayOS, webhook, RBAC backend

---

## 5. Review cho Giang & Đức

### Cách xem code

1. GitHub → repo **ver-2** → branch **`ui/ux-anh-minh`** → tab **Commits** / **Compare** với `main`.
2. Hoặc mở PR: `ui/ux-anh-minh` → `main` (khuyến nghị để comment từng file).

### Cách xem chạy thật

- URL: https://palfish-gmv-manager.vercel.app (sau khi Vercel Production Branch = `ui/ux-anh-minh`).
- Đăng nhập tài khoản Google đã có quyền (sale / system).

### Checklist review (Giang / Đức)

- [ ] Tab **Tạo đơn** / **Quản lý đơn** — layout, mobile, không tràn bảng
- [ ] Không vỡ API: Network `/api/me`, `/api/orders` → 200
- [ ] PayOS / tick tiền về / CRM — hành vi giữ như trước (nếu không đổi spec)
- [ ] Sidebar, Hóa đơn thuế (nếu có thay đổi ở vùng đó)

**Comment xong →** approve PR hoặc nhắn Minh merge.

---

## 6. Merge & nhánh khác

| Branch | Ai | Mục đích |
|--------|-----|----------|
| `ui/ux-anh-minh` | Minh | UI/UX — deploy Vercel chính |
| `main` | Sau review | Ổn định, merge từ `ui/ux-anh-minh` |
| `giang-đức'back-and-fr` (hoặc tương tự) | Giang, Đức | Backend / tính năng — **không** merge thẳng vào UI branch |

**Sau khi merge `ui/ux-anh-minh` → `main`:**

- Giữ Production Branch = `ui/ux-anh-minh` **hoặc** đổi lại `main` (thống nhất một cách).
- Nếu đổi Production Branch về `main`: mỗi lần chỉ UI vẫn có thể merge PR vào `main` rồi push.

**Backend ver-2:** Khi Giang/Đức sẵn sàng đưa BE lên Render → cập nhật `docs/DEPLOY.md` §1 (đổi repo Render) — tách task, không gộp UI.

---

## 7. Smoke test nhanh (sau push hoặc đổi máy)

| # | Việc | Kỳ vọng |
|---|------|---------|
| 1 | https://palfish-gmv-manager.vercel.app | Load, không banner “Supabase chưa cấu hình” |
| 2 | Login Google | Vào app, sidebar hiện |
| 3 | Tab Quản lý đơn | Bảng có dữ liệu (hoặc empty, không 500) |
| 4 | DevTools → Network | `GET /api/me` → 200 |
| 5 | (Local) `npm run dev` | Login localhost OK |

Lỗi thường gặp: xem `docs/DEPLOY.md` §3.1 Troubleshooting.

---

## 8. Task theo dõi

Cập nhật trạng thái trong **`docs/TODO.md`** — mục **UI/UX branch `ui/ux-anh-minh`**.

---

## 9. Liên kết nhanh

| | URL |
|---|-----|
| Repo ver-2 | https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2 |
| Branch UI | https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2/tree/ui/ux-anh-minh |
| App live | https://palfish-gmv-manager.vercel.app |
| Vercel project | https://vercel.com → `palfish-gmv-manager` |
| Supabase | https://supabase.com/dashboard/project/jozcvbbypwvzaefteoxn |
| Render API | https://palfish-gmv-api.onrender.com/healthz |

---

*Cập nhật: 2026-05-23 — sau khi gắn ver-2 lên Vercel, Production Branch `ui/ux-anh-minh`.*
