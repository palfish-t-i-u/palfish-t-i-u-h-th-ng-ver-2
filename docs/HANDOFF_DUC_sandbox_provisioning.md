# HANDOFF — Đức: Provisioning hạ tầng Sandbox (Task 4)

> Phần code/config đã xong (Giang `01c9dc4` + Minh). File này chỉ còn **4 việc hạ tầng**, không cần code.
> Mục tiêu: có 1 môi trường sandbox độc lập (Supabase + Render + Vercel riêng) để test mà không đụng production.

## Cần có trước khi bắt đầu
- Quyền **Supabase** (tạo project mới) — org PalFish
- Quyền **Render** (tạo Web Service)
- Quyền **Vercel** (tạo project / set env)
- Connection string production Supabase (để dump schema) — hỏi Giang/Minh nếu chưa có
- Máy đã cài `psql` + `pg_dump` (PostgreSQL client) và Python 3.12 + `pip install -r backend/requirements.txt`

---

## BƯỚC 1 — Tạo Supabase sandbox project + migrate schema

### 1.1 Tạo project
1. Vào https://supabase.com → **New Project**
2. Tên: `palfish-gmv-sandbox` · Region: **Singapore (ap-southeast-1)** (giống prod) · đặt DB password mạnh → **lưu lại password**
3. Sau khi tạo xong, vào **Project Settings → API**, ghi lại:
   - `Project URL` → dùng cho `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (chỉ dùng ở BE, **không để lên FE**)
   - `anon` key → `VITE_SUPABASE_ANON_KEY`

### 1.2 Migrate schema — **Cách A (khuyến nghị): clone từ prod**
Lấy connection string ở **Project Settings → Database → Connection string → URI** (cả prod lẫn sandbox).

```bash
# 1) Dump schema (KHÔNG kèm data) từ PROD
pg_dump --schema-only --no-owner --no-acl \
  "postgresql://postgres.<PROD_REF>:<PROD_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  > schema_prod.sql

# 2) Nạp schema vào SANDBOX
psql \
  "postgresql://postgres.<SANDBOX_REF>:<SANDBOX_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  < schema_prod.sql
```
> Cách này đảm bảo schema sandbox **giống hệt** prod. Ưu tiên dùng cách này.

### 1.2 Migrate schema — **Cách B (fallback): chạy file patch thủ công**
Nếu không lấy được connection string prod: vào **Supabase SQL Editor** của sandbox, mở từng file trong `docs/` và chạy theo thứ tự, **bắt đầu bằng file base**:
```
supabase_schema_patch.sql          ← chạy ĐẦU TIÊN (tạo bảng gốc)
supabase_schema_patch_v2.sql ... v8_bill_images_activated_status.sql   ← rồi đến các vX theo số tăng dần
# sau đó các patch bổ sung:
supabase_schema_patch_active_requests*.sql
supabase_schema_patch_payment_requests*.sql   (gồm cả _email.sql — QUAN TRỌNG cho RBAC sale_email)
supabase_schema_patch_payment_lines_bill.sql
supabase_schema_patch_invoice_courses.sql
supabase_schema_patch_revenue_ledger_link.sql
supabase_schema_patch_bc03_monthly.sql
supabase_schema_patch_crm_*.sql
```
> Hầu hết dùng `IF NOT EXISTS` nên chạy lại an toàn. Nếu file nào báo lỗi thiếu bảng → bảng đó được tạo ở file khác, chạy file base/vX trước rồi quay lại.
> **Bắt buộc** có cột `payment_requests.sale_email` (file `..._payment_requests_email.sql` hoặc `..._sale_email.sql`) — RBAC Task 1 phụ thuộc vào nó.

### 1.3 Reload schema cache
Chạy trong SQL Editor sandbox (tránh lỗi PGRST204):
```sql
NOTIFY pgrst, 'reload schema';
```

---

## BƯỚC 2 — Thêm service sandbox vào `render.yaml`

Mở `render.yaml` (đang chỉ có 1 service `palfish-gmv-api`). **Thêm** block service thứ 2 bên dưới (giữ nguyên service cũ):

```yaml
  - type: web
    name: palfish-gmv-api-sandbox
    runtime: docker
    dockerfilePath: ./backend/Dockerfile
    dockerContext: .
    plan: free
    branch: sandbox          # deploy từ branch sandbox
    envVars:
      - key: APP_ENV
        value: sandbox       # BẬT chế độ sandbox (tự tắt PayOS/DingTalk production)
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: FRONTEND_URL
        sync: false
      - key: FRONTEND_URLS
        sync: false
      - key: SYSTEM_ADMIN_EMAILS
        sync: false
      - key: OPS_EMAILS
        sync: false
      - key: PAYOS_CLIENT_ID
        sync: false
      - key: PAYOS_API_KEY
        sync: false
      - key: PAYOS_CHECKSUM_KEY
        sync: false
    healthCheckPath: /healthz
    autoDeploy: true
```

Sau đó trên **Render Dashboard** → service `palfish-gmv-api-sandbox` → **Environment** → nhập giá trị thật cho các key `sync: false` (lấy từ Bước 1.1). **Để trống `PAYOS_*`** để ép dùng mock (sandbox không charge tiền thật).

> Cần tạo branch `sandbox` trước (xem Bước 4) thì Render mới deploy được.

**Kiểm tra:** sau deploy, mở `https://palfish-gmv-api-sandbox.onrender.com/healthz` → phải thấy `"app_env": "sandbox", "sandbox": true`.

---

## BƯỚC 3 — Deploy Vercel sandbox + điền env

**Cách đơn giản nhất — dùng branch preview:**
1. Vercel Dashboard → project FE hiện tại → **Settings → Git** → đảm bảo Production Branch = `main`
2. **Settings → Environment Variables** → thêm các biến sau, scope chọn **Preview** (hoặc tạo project riêng nếu muốn tách hẳn):

```
VITE_APP_ENV=sandbox
VITE_API_BASE_URL=https://palfish-gmv-api-sandbox.onrender.com
VITE_SUPABASE_URL=https://<SANDBOX_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<sandbox anon key>
VITE_OPS_EMAILS=anhminhcv0512@gmail.com,dinhgiang6492@gmail.com,hieuhn.mplanner@gmail.com
VITE_BANK_BIN=970422
VITE_BANK_ACCOUNT_NO=1680011668899
VITE_BANK_ACCOUNT_NAME=CONG TY TNHH TRUONG QUOC TE PALFISH SINGAPORE - VIETNAM
VITE_BANK_DISPLAY_NAME=Ngan hang TMCP Quan Doi (MB Bank) [SANDBOX]
VITE_BANK_BRANCH=Hoan Kiem
```
3. Push branch `sandbox` → Vercel tự build preview URL.

> `VITE_APP_ENV=sandbox` sẽ kích hoạt **banner vàng ⚠️ SANDBOX** trên UI (đã code sẵn) — để không nhầm với production.

---

## BƯỚC 4 — Tạo branch + điền secrets + chạy seed

### 4.1 Tạo branch sandbox
```bash
git checkout main && git pull
git checkout -b sandbox
git push -u origin sandbox
```
> Workflow từ giờ: `feature/* → merge vào sandbox → test → merge vào main (production)`.

### 4.2 Tạo file secrets local để chạy seed
Tạo `backend/.env.sandbox` (KHÔNG commit — đã có trong .gitignore). Copy từ template `backend/.env.sandbox.example` rồi điền giá trị thật:
```bash
cp backend/.env.sandbox.example backend/.env.sandbox
# mở backend/.env.sandbox, điền:
#   APP_ENV=sandbox
#   SUPABASE_URL=<sandbox url>
#   SUPABASE_SERVICE_ROLE_KEY=<sandbox service role key>
```

### 4.3 Chạy seed (dry-run trước, rồi --apply)
```bash
cd backend   # script tự load backend/.env.sandbox
# Xem trước (không ghi DB):
python scripts/seed_sandbox_data.py
# Ghi data mẫu vào sandbox DB:
python scripts/seed_sandbox_data.py --apply
```
Seed sẽ tạo: nhân sự sale/leader/system mẫu + vài payment_requests/lines + active_requests + KPI BC03 (idempotent — chạy lại không nhân đôi).

---

## CHECKLIST NGHIỆM THU

- [ ] Supabase sandbox project tạo xong, schema migrate đầy đủ (có bảng `payment_requests` + cột `sale_email`)
- [ ] `NOTIFY pgrst, 'reload schema'` đã chạy
- [ ] `render.yaml` thêm service `palfish-gmv-api-sandbox`, đã set env thật trên Render
- [ ] `GET /healthz` của BE sandbox trả `"sandbox": true`
- [ ] Branch `sandbox` đã push; Vercel preview chạy được, **hiện banner ⚠️ SANDBOX**
- [ ] `seed_sandbox_data.py --apply` chạy xong, đăng nhập sandbox thấy data mẫu
- [ ] Tạo thử 1 Payment Request trên sandbox → KHÔNG ảnh hưởng production; PayOS không bắn webhook thật (log `[sandbox] PayOS confirm-webhook skipped`)

## LƯU Ý AN TOÀN
- Sandbox **không** dùng PayOS/DingTalk production (code đã tự tắt khi `APP_ENV=sandbox`) — để `PAYOS_*` trống.
- `service_role` key chỉ đặt ở Render (BE), tuyệt đối không đưa vào Vercel/FE.
- Không commit `backend/.env.sandbox` / `frontend/.env.sandbox` (đã gitignore).
- File cần xem: `backend/scripts/seed_sandbox_data.py`, `backend/env_utils.py`, `backend/.env.sandbox.example`, `frontend/.env.sandbox.example`.
