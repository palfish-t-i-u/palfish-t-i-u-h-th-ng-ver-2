# Workflow UI/UX — branch `ui/ux`

> **Mục đích:** Anh Minh code giao diện trên branch riêng; **Giang** và **Đức** review trên GitHub / URL live trước khi merge vào `main`.  
> **Repo làm việc:** https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2  
> **Branch:** https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2/tree/ui/ux  
> **Handoff BE:** `docs/FE_HANDOFF_BE_PROMPTS.md`

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
| **Framework** | Vite (từ `frontend/vercel.json`) |

**Env (Settings → Environment Variables)** — tick **Production** + **Preview**:

- `VITE_SUPABASE_URL` = `https://jozcvbbypwvzaefteoxn.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = anon key (Supabase → API)
- `VITE_OPS_EMAILS`, `VITE_BANK_*` — copy từ project cũ hoặc `frontend/.env.example`

Không bắt buộc set `VITE_API_BASE_URL` trên Vercel: build dùng `/api` (proxy Render).

### 2.1 Đưa UI lên production (quan trọng)

Push branch **`ui/ux`** chỉ tạo **Preview deployment** — prod URL **không** tự đổi nếu chưa Promote.

**Cách A — Promote (khuyến nghị, mọi gói Vercel):**

1. Vercel → project **`palfish-gmv-manager`** → **Deployments**.
2. Tìm deployment mới nhất: branch **`ui/ux`**, commit đúng.
3. Bấm **`⋯`** → **Promote to Production**.
4. Đợi badge **Current** chuyển sang deployment đó.
5. Mở `https://palfish-gmv-manager.vercel.app` → **Ctrl+Shift+R** (hard refresh).

**Cách B — Production Branch (nếu Settings → Git có mục này):**

- Set **Production Branch** = **`ui/ux`** → mỗi push branch đó có thể auto lên prod (tùy cấu hình team).

**Lưu ý:** Preview URL dài — login Google có thể redirect về **prod URL** (Supabase Site URL = prod). Đừng dùng preview để kết luận UI prod — luôn kiểm tra sau Promote.

Chi tiết Module 5 (seed, smoke test): **`docs/M5_OPERATIONS.md`** §1.

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
git checkout ui/ux
git pull origin ui/ux
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
git checkout ui/ux
git pull origin ui/ux
# ... sửa code trong frontend/src, frontend/src/gmv-*.css ...
git add .
git commit -m "ui: mô tả ngắn thay đổi"
git push origin ui/ux
```

1. Vercel tự build preview (1–3 phút).
2. **Promote to Production** (§2.1) nếu cần Hiền/Giang xem trên URL chính.
3. Mở `https://palfish-gmv-manager.vercel.app` — hard refresh — kiểm tra UI.
4. Báo Giang/Đức: link branch GitHub + “đã push + Promote”.

**Phạm vi nên sửa (UI/UX):**

- `frontend/src/**/*.tsx`, `frontend/src/gmv-theme.css`, `frontend/src/gmv-tokens.css`
- `frontend/src/components/ui/*`
- `docs/DESIGN.md`, `docs/WIREFRAMES.md` (nếu đổi spec UI)

**Tránh trên branch UI** (trừ khi đã thống nhật với Giang/Đức):

- `backend/`, `api_pipe/`, `docs/supabase_schema_patch*.sql`
- Đổi `vercel.json` destination Render (trừ khi cố ý đổi API)
- Xóa/sửa logic PayOS, webhook, RBAC backend

**Encoding tiếng Việt:** File `.tsx` UTF-8. Trước push: grep `ΓÇ|ß║|╞░|─É|┬` trong `frontend/src` → 0 match. Xem `FE_HANDOFF_BE_PROMPTS.md` §9.

---

## 5. Review cho Giang & Đức

### Cách xem code

1. GitHub → repo **ver-2** → branch **`ui/ux`** → tab **Commits** / **Compare** với `main`.
2. Hoặc mở PR: `ui/ux` → `main` (khuyến nghị để comment từng file).

### Cách xem chạy thật

- URL: https://palfish-gmv-manager.vercel.app (sau **Promote** deployment mới nhất — §2.1).
- Đăng nhập tài khoản Google đã có quyền (sale / system).

### Checklist review (Giang / Đức) — luồng B1–B4

- [ ] Tab **Quản lý thanh toán** (B1) — list, drawer, upload bill, KPI
- [ ] Tab **Đối soát giao dịch** (B2) — confirm/reject, bill thumb
- [ ] Tab **Kích hoạt khóa học** (B3) — 4 sub-tab, tạo AR
- [ ] Tab **Xuất hóa đơn** (B4) — bulk issue, ZIP 3 XLSX (không PDF)
- [ ] Text tiếng Việt hiển thị đúng (không ký tự `|`, `—` lạ)
- [x] Tab **Quản lý đơn** (legacy) — freeze cột — **Done** (PR #2)
- [x] Network `/api/me`, `/api/payment-requests` → không 500 hàng loạt

**Comment xong →** approve PR hoặc nhắn Minh merge.

---

## 6. Merge & nhánh khác

| Branch | Ai | Mục đích |
|--------|-----|----------|
| `ui/ux` | Minh | UI/UX B1–B4 — deploy Vercel preview/prod |
| `main` | Sau review | Ổn định, merge từ `ui/ux` |
| `giang-đức'back-and-fr` (hoặc tương tự) | Giang, Đức | Backend / tính năng — **không** merge thẳng vào UI branch |

**Sau khi merge `ui/ux` → `main`:** PR #2 (2026-05-23) đã merge UI shell cũ. Luồng PR mới tiếp tục trên **`ui/ux`** — prod cập nhật qua **Promote** (§2.1).

**Backend ver-2:** Module 5 API (`/revenue/*`) nằm repo ver-2. Render hiện deploy từ `palfish-gmv-manager` — cần **Manual Deploy** hoặc sync repo khi thêm route mới. Xem `docs/DEPLOY.md` §1.4, `docs/M5_OPERATIONS.md` §1C.

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

Cập nhật trạng thái trong **`docs/TODO.md`** — mục **UI/UX branch `ui/ux`**.

---

## 9. Liên kết nhanh

| | URL |
|---|-----|
| Repo ver-2 | https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2 |
| Branch UI | https://github.com/palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2/tree/ui/ux |
| App live | https://palfish-gmv-manager.vercel.app |
| Vercel project | https://vercel.com → `palfish-gmv-manager` |
| Supabase | https://supabase.com/dashboard/project/jozcvbbypwvzaefteoxn |
| Render API | https://palfish-gmv-api.onrender.com/healthz |

---

*Cập nhật: 2026-05-23 — Promote workflow; Module 5 MVP live; Tab2 sticky Done.*
