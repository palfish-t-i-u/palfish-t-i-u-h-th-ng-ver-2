# HANDOFF PROMPTS — BE: Task 1, 2, 3, 4

> Dành cho: Backend developer
> Codebase: `palfish-t-i-u-h-th-ng-ver-2/backend/`
> Stack: Python FastAPI + Supabase (PostgreSQL)
> Ngày: 28/05/2026 — v2

---

## TASK 1 — Phân quyền xem Payment Requests theo cấp độ

### Bối cảnh nghiệp vụ
3 cấp user sử dụng module Quản lý Thanh toán:
- **Sale**: chỉ xem/thao tác PR do **chính mình** tạo
- **Sale Leader**: xem/thao tác PR của **toàn bộ sale trong team mình**
- **System / Ops**: xem **tất cả** PR

Hiện tại `GET /payment-requests` trả về toàn bộ data không phân biệt role.

### File cần sửa
```
backend/payment_request_routes.py   ← dòng 955: list_payment_requests()
backend/rbac.py                     ← dòng 164: visible_creator_emails() — ĐÃ CÓ SẴN
```

### Code hiện tại cần thay đổi

**`rbac.py:164-196`** — hàm `visible_creator_emails()` logic đúng rồi, không cần sửa:
- `role = "system"` → return `None` (= không filter, xem all)
- `role = "sale"` → return `[actor.email]` (chỉ xem của mình)
- `role = "leader"` → query `nhan_su_sale` theo `team` + `sub_team` → return list emails cả team

**`payment_request_routes.py:955-1016`** — `list_payment_requests` THIẾU auth:
```python
@router.get("/payment-requests")
def list_payment_requests(state, uid, limit, offset):
    sb = _sb_or_503(get_supabase)
    query = sb.table("payment_requests").select("*")
    # ← KHÔNG CÓ resolve_actor, KHÔNG CÓ filter theo role
```

### Thay đổi cần thực hiện

#### 1.1 Thêm auth + filter vào `list_payment_requests`

```python
from fastapi import Header

@router.get("/payment-requests")
def list_payment_requests(
    state: str | None = Query(None),
    uid: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    authorization: str | None = Header(None),   # ← THÊM
):
    sb = _sb_or_503(get_supabase)
    actor = resolve_actor(sb, authorization)      # ← THÊM

    query = sb.table("payment_requests").select("*")

    # ---- THÊM BLOCK FILTER THEO ROLE ----
    allowed_emails = visible_creator_emails(sb, actor)
    if allowed_emails is not None:
        query = query.in_("sale_email", allowed_emails)
    # allowed_emails is None → system → không filter
    # ------------------------------------------

    # ... phần filter state, uid, order, range giữ nguyên ...
```

> **Cột filter:** `payment_requests.sale_email` — xác nhận cột này tồn tại (xem `supabase_schema_patch_payment_requests_email.sql`)

#### 1.2 Thêm auth vào các endpoint mutation

Áp dụng pattern kiểm tra quyền sau khi load resource:

```python
# Dùng cho PATCH, DELETE, cancel — sau khi load current_row:
allowed_emails = visible_creator_emails(sb, actor)
if allowed_emails is not None:
    row_email = (current_row.get("sale_email") or "").lower()
    if row_email not in [e.lower() for e in allowed_emails]:
        raise HTTPException(403, "Khong co quyen thao tac phieu nay")
```

Các route cần thêm:

| Endpoint | Dòng trong file | Cần thêm |
|---|---|---|
| `PATCH /payment-requests/{id}` | ~1018 | `resolve_actor` + check quyền |
| `POST /payment-requests/{id}/cancel` | ~1069 | `resolve_actor` + check quyền |
| `POST /payment-requests/{id}/payment-lines` | ~1172 | `resolve_actor` + check quyền |
| `POST /payment-requests` (create) | ~1157 | `resolve_actor` (không cần check, sale tạo PR mới là của mình) |

#### 1.3 Test

```bash
# Sale token — chỉ thấy PR của mình
curl -H "Authorization: Bearer <sale_token>" localhost:8000/api/v1/payment-requests
# Expect: chỉ có PR mà sale_email = email của sale

# Leader token — thấy PR cả team
curl -H "Authorization: Bearer <leader_token>" localhost:8000/api/v1/payment-requests
# Expect: PR của tất cả sale trong team của leader

# System token — thấy all
curl -H "Authorization: Bearer <system_token>" localhost:8000/api/v1/payment-requests
# Expect: tất cả PR
```

### Lưu ý
- Import cần thêm ở đầu file: `from rbac import resolve_actor, visible_creator_emails` (kiểm tra đã import chưa)
- `visible_creator_emails()` query `nhan_su_sale` bằng `team` + `sub_team` của actor → **đảm bảo cột `team` trong `nhan_su_sale` đúng** cho mỗi leader
- Nếu actor.staff is None (user mới, chưa link nhân sự) → hàm fallback return `[actor.email]` → an toàn, không lộ data

---

## TASK 2 — Kết nối PayOS HCM (multi-bank)

### Bối cảnh nghiệp vụ
- Hiện tại chỉ có 1 tài khoản ngân hàng: **PalFish Hà Nội — MB Bank** (account `1680011668899`)
- Cần thêm tài khoản **PalFish HCM** với PayOS credentials riêng
- Khi tạo QR / payment link, BE phải dùng đúng PayOS credentials tương ứng với bank account được chọn
- FE sẽ gửi `bank_alias` lên để BE biết dùng credentials nào

### File cần sửa
```
backend/payos_qr.py                  ← hàm create_payos_payment_link(), _payos_headers()
backend/payment_request_routes.py    ← route tạo payment line
backend/.env                         ← thêm env vars HCM
```

### Thay đổi cần thực hiện

#### 2.1 Thêm env vars cho PayOS HCM

Thêm vào `backend/.env`:
```env
# PayOS HN (giữ nguyên, đây là default)
PAYOS_CLIENT_ID=bb782934-...
PAYOS_API_KEY=3f924572-...
PAYOS_CHECKSUM_KEY=3454b58a...

# PayOS HCM (mới)
PAYOS_HCM_CLIENT_ID=<từ PayOS dashboard HCM>
PAYOS_HCM_API_KEY=<từ PayOS dashboard HCM>
PAYOS_HCM_CHECKSUM_KEY=<từ PayOS dashboard HCM>
```

Thêm vào `render.yaml` service vars:
```yaml
- key: PAYOS_HCM_CLIENT_ID
  sync: false
- key: PAYOS_HCM_API_KEY
  sync: false
- key: PAYOS_HCM_CHECKSUM_KEY
  sync: false
```

#### 2.2 Sửa `payos_qr.py` — hỗ trợ multi-bank

```python
# === THÊM hàm helper chọn credentials ===

_HCM_ALIASES = {"palfish hcm", "hcm", "palfish hcm - mb bank"}

def _payos_credentials(bank_alias: str | None = None) -> tuple[str, str, str]:
    """Trả về (client_id, api_key, checksum_key) theo bank_alias."""
    alias = (bank_alias or "").strip().lower()
    if alias in _HCM_ALIASES:
        client_id = os.getenv("PAYOS_HCM_CLIENT_ID", "").strip()
        api_key = os.getenv("PAYOS_HCM_API_KEY", "").strip()
        checksum_key = os.getenv("PAYOS_HCM_CHECKSUM_KEY", "").strip()
        if all([client_id, api_key, checksum_key]):
            return client_id, api_key, checksum_key
        # fallback to HN nếu HCM chưa config
    # Default = HN
    client_id = os.getenv("PAYOS_CLIENT_ID", "").strip()
    api_key = os.getenv("PAYOS_API_KEY", "").strip()
    checksum_key = os.getenv("PAYOS_CHECKSUM_KEY", "").strip()
    if not all([client_id, api_key, checksum_key]):
        raise ValueError("PayOS chua duoc cau hinh")
    return client_id, api_key, checksum_key
```

#### 2.3 Sửa `create_payos_payment_link()` — nhận `bank_alias`

Dòng 67 hiện tại:
```python
async def create_payos_payment_link(amount: int, description_hint: str) -> dict[str, Any]:
    client_id = os.getenv("PAYOS_CLIENT_ID", "").strip()
    api_key = os.getenv("PAYOS_API_KEY", "").strip()
    checksum_key = os.getenv("PAYOS_CHECKSUM_KEY", "").strip()
```

Sửa thành:
```python
async def create_payos_payment_link(
    amount: int,
    description_hint: str,
    bank_alias: str | None = None,      # ← THÊM
) -> dict[str, Any]:
    client_id, api_key, checksum_key = _payos_credentials(bank_alias)  # ← SỬA
```

#### 2.4 Sửa `_payos_headers()` — nhận `bank_alias`

Dòng 134 hiện tại:
```python
def _payos_headers() -> dict[str, str]:
    client_id = os.getenv("PAYOS_CLIENT_ID", "").strip()
    api_key = os.getenv("PAYOS_API_KEY", "").strip()
```

Sửa thành:
```python
def _payos_headers(bank_alias: str | None = None) -> dict[str, str]:
    client_id, api_key, _ = _payos_credentials(bank_alias)
    return {
        "x-client-id": client_id,
        "x-api-key": api_key,
        "Content-Type": "application/json",
    }
```

#### 2.5 Sửa `fetch_payos_payment()` + `confirm_payos_webhook_url()`

Các hàm dùng `_payos_headers()` cần pass `bank_alias` nếu cần query trạng thái của payment link HCM:

```python
async def fetch_payos_payment(order_code: str, bank_alias: str | None = None) -> ...:
    ...
    headers=_payos_headers(bank_alias),
    ...
```

#### 2.6 Sửa `payment_request_routes.py` — truyền `bank_alias` khi tạo payment line

Trong route `create_payment_line` (~dòng 1172), khi gọi `create_payos_payment_link`:
- Lấy `bank_alias` từ request body (FE gửi lên)
- Truyền vào hàm PayOS

```python
# Trong PaymentLineCreate model — thêm field:
bank_alias: str | None = None

# Trong route handler:
payos_data = await create_payos_payment_link(
    amount=body.amount,
    description_hint=...,
    bank_alias=body.bank_alias,       # ← THÊM
)
```

**Lưu trữ bank_alias** vào `payment_lines` table để sau này biết line này dùng bank nào:
```python
# Khi insert payment_line row:
row["bank_alias"] = body.bank_alias or "PalFish Hà Nội - MB Bank"
```
> Cần thêm cột `bank_alias TEXT` vào bảng `payment_lines` nếu chưa có.

#### 2.7 Đăng ký webhook cho PayOS HCM

Trong `main.py:1227` — `_register_payos_webhook_on_startup`:
- Hiện tại chỉ đăng ký webhook cho 1 bộ credentials
- Cần đăng ký thêm cho HCM:

```python
@app.on_event("startup")
async def _register_payos_webhook_on_startup() -> None:
    from payos_qr import confirm_payos_webhook_url

    webhook_url = ...  # giữ nguyên logic lấy URL

    if not webhook_url:
        return

    # Đăng ký cho HN (default)
    try:
        result = await confirm_payos_webhook_url(webhook_url)
        print(f"[payos/HN] confirm-webhook -> {result.get('code')}")
    except Exception as exc:
        print(f"[payos/HN] confirm-webhook skipped: {exc}")

    # Đăng ký cho HCM (nếu có config)
    try:
        result = await confirm_payos_webhook_url(webhook_url, bank_alias="HCM")
        print(f"[payos/HCM] confirm-webhook -> {result.get('code')}")
    except Exception as exc:
        print(f"[payos/HCM] confirm-webhook skipped: {exc}")
```

### Test
```bash
# Tạo payment line với bank HN (default)
curl -X POST localhost:8000/api/v1/payment-requests/<pr_id>/payment-lines \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000000, "method": "qr"}'
# Expect: QR dùng credentials HN

# Tạo payment line với bank HCM
curl -X POST localhost:8000/api/v1/payment-requests/<pr_id>/payment-lines \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000000, "method": "qr", "bank_alias": "PalFish HCM - MB Bank"}'
# Expect: QR dùng credentials HCM
```

### Lưu ý
- PayOS mỗi merchant account (Client ID) có webhook URL riêng — webhook endpoint BE nhận chung nhưng cần phân biệt bank khi reconcile
- Nếu PayOS HCM chưa có credentials → fallback về HN (đã xử lý trong `_payos_credentials`)
- Schema migration: `ALTER TABLE payment_lines ADD COLUMN IF NOT EXISTS bank_alias TEXT DEFAULT 'PalFish Hà Nội - MB Bank';`

---

## TASK 3 — Xoá dữ liệu test, cập nhật dữ liệu thực tế

### Bối cảnh
Trước khi bàn giao cho sale dùng thực tế, cần xoá hết data test/mock tạo trong quá trình dev.

### File cần quan tâm
```
backend/payment_request_routes.py    ← thêm filter deleted_at
docs/supabase_diagnose.sql           ← SQL helper có sẵn
```

### Bước thực hiện

#### 3.1 Backup database

Trên Supabase Dashboard → Project Settings → Backups → tạo manual backup.
Hoặc: `pg_dump postgresql://...connection_string... > backup_28_05_2026.sql`

#### 3.2 Xem trước data test (chưa xoá)

```sql
-- Liệt kê PR có dấu hiệu test
SELECT id, pr_name, sale_email, amount, state, created_at
FROM payment_requests
WHERE
    lower(pr_name) SIMILAR TO '%(test|thử|demo|mock|fake|sample|abc|xxx)%'
    OR amount IN (1, 1000, 2000, 9999, 10000)
    OR lower(sale_email) IN (
        'anhminhcv0512@gmail.com',
        'dinhgiang6492@gmail.com',
        'hieuhn.mplanner@gmail.com'
    )
    OR lower(customer_name) SIMILAR TO '%(test|thử|demo|khách thử|kh thử)%'
ORDER BY created_at DESC;

-- Đếm
SELECT COUNT(*) as total_test FROM payment_requests
WHERE
    lower(pr_name) SIMILAR TO '%(test|thử|demo|mock|fake|sample|abc|xxx)%'
    OR amount IN (1, 1000, 2000, 9999, 10000)
    OR lower(sale_email) IN (
        'anhminhcv0512@gmail.com',
        'dinhgiang6492@gmail.com',
        'hieuhn.mplanner@gmail.com'
    )
    OR lower(customer_name) SIMILAR TO '%(test|thử|demo|khách thử|kh thử)%';
```

> ⚠️ **Review kết quả với anh Hiếu / team lead** trước khi thực thi xoá

#### 3.3 Thêm cột soft-delete (nếu chưa có)

```sql
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE payment_lines ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE active_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
```

#### 3.4 Soft-delete

```sql
-- Payment lines liên quan
UPDATE payment_lines SET deleted_at = now()
WHERE payment_request_id IN (
    SELECT id FROM payment_requests
    WHERE
        lower(pr_name) SIMILAR TO '%(test|thử|demo|mock|fake|sample|abc|xxx)%'
        OR amount IN (1, 1000, 2000, 9999, 10000)
        OR lower(sale_email) IN (
            'anhminhcv0512@gmail.com',
            'dinhgiang6492@gmail.com',
            'hieuhn.mplanner@gmail.com'
        )
        OR lower(customer_name) SIMILAR TO '%(test|thử|demo|khách thử|kh thử)%'
) AND deleted_at IS NULL;

-- Payment requests
UPDATE payment_requests SET deleted_at = now()
WHERE (
    lower(pr_name) SIMILAR TO '%(test|thử|demo|mock|fake|sample|abc|xxx)%'
    OR amount IN (1, 1000, 2000, 9999, 10000)
    OR lower(sale_email) IN (
        'anhminhcv0512@gmail.com',
        'dinhgiang6492@gmail.com',
        'hieuhn.mplanner@gmail.com'
    )
    OR lower(customer_name) SIMILAR TO '%(test|thử|demo|khách thử|kh thử)%'
) AND deleted_at IS NULL;

-- Active requests test
UPDATE active_requests SET deleted_at = now()
WHERE lower(customer_name) SIMILAR TO '%(test|thử|demo|mock)%'
AND deleted_at IS NULL;
```

#### 3.5 Cập nhật BE — exclude soft-deleted

Trong `payment_request_routes.py`, thêm filter vào **mọi query select**:

```python
# list_payment_requests (~dòng 963):
query = sb.table("payment_requests").select("*").is_("deleted_at", "null")

# Tương tự cho query payment_lines (~dòng 991):
line_res = (
    sb.table("payment_lines")
    .select("*")
    .in_("payment_request_id", pr_ids)
    .is_("deleted_at", "null")       # ← THÊM
    .execute()
)
```

Áp dụng tương tự trong:
- `activation_routes.py` — query `active_requests`
- Bất kỳ route nào query `payment_requests` hoặc `payment_lines`

#### 3.6 Kiểm tra dữ liệu nhân sự

```sql
-- Nhân sự active thiếu email
SELECT crm_name, team, role FROM nhan_su_sale
WHERE (email IS NULL OR email = '') AND is_active = true;

-- Nhân sự sale thiếu leader_email (leader sẽ không thấy họ)
SELECT crm_name, email, team FROM nhan_su_sale
WHERE role = 'sale'
  AND (leader_email IS NULL OR leader_email = '')
  AND is_active = true;

-- Tổng quan theo team
SELECT team, role, COUNT(*) as count FROM nhan_su_sale
WHERE is_active = true
GROUP BY team, role
ORDER BY team, role;
```

### Checklist
- [ ] Backup DB đã tạo
- [ ] SQL xác định test data đã chạy → review với team
- [ ] Soft-delete đã thực hiện
- [ ] BE đã thêm `.is_("deleted_at", "null")` ở mọi query
- [ ] `nhan_su_sale` đã kiểm tra — đủ email, role, leader_email

---

## TASK 4 — Tạo môi trường Sandbox

### Bối cảnh
Cần tách biệt production và development: sandbox riêng để dev tính năng mới, test xong mới publish lên production.

### Kiến trúc mục tiêu

```
PRODUCTION (hiện tại)                    SANDBOX (mới)
├── FE: Vercel (main)                    ├── FE: Vercel (sandbox branch)
├── BE: Render palfish-gmv-api           ├── BE: Render palfish-gmv-api-sandbox
│   plan: free → nâng starter            │   plan: free
│   Dockerfile: uvicorn 1 worker         │   Dockerfile: giống prod
└── DB: Supabase jozcvbb...              └── DB: Supabase palfish-gmv-sandbox
```

### Bước thực hiện

#### 4.1 Tạo Supabase Sandbox

1. https://supabase.com → New Project → tên `palfish-gmv-sandbox`
2. Ghi lại: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
3. Clone schema:

```bash
# Export schema prod (không data)
pg_dump --schema-only --no-owner --no-acl \
  "postgresql://postgres.[prod-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  > schema_export.sql

# Import vào sandbox
psql \
  "postgresql://postgres.[sandbox-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  < schema_export.sql
```

Hoặc chạy thủ công: lần lượt execute các file `docs/supabase_schema_patch*.sql` trên Supabase SQL Editor sandbox.

#### 4.2 Seed data mẫu cho sandbox

```sql
-- Insert vài nhân sự test
INSERT INTO nhan_su_sale (crm_name, display_name, email, role, team, is_active)
VALUES
  ('Dev Sale', 'Dev Sale', 'dev-sale@palfish.com', 'sale', 'Inhouse 1', true),
  ('Dev Leader', 'Dev Leader', 'dev-leader@palfish.com', 'leader', 'Inhouse 1', true),
  ('Dev System', 'Dev System', 'anhminhcv0512@gmail.com', 'system', 'System', true);
```

#### 4.3 Tạo `.env.sandbox` cho BE

```env
# === SUPABASE SANDBOX ===
SUPABASE_URL=https://[sandbox-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[sandbox-service-role-key]

# === APP ===
FRONTEND_URL=https://palfish-gmv-git-sandbox-[team].vercel.app
ENVIRONMENT=sandbox

# === AUTH ===
OPS_EMAILS=anhminhcv0512@gmail.com,dinhgiang6492@gmail.com,hieuhn.mplanner@gmail.com
SYSTEM_ADMIN_EMAILS=anhminhcv0512@gmail.com,dinhgiang6492@gmail.com,hieuhn.mplanner@gmail.com

# === PAYOS SANDBOX ===
PAYOS_CLIENT_ID=[payos-sandbox-client-id]
PAYOS_API_KEY=[payos-sandbox-api-key]
PAYOS_CHECKSUM_KEY=[payos-sandbox-checksum-key]

# HCM sandbox (nếu cần)
PAYOS_HCM_CLIENT_ID=
PAYOS_HCM_API_KEY=
PAYOS_HCM_CHECKSUM_KEY=

# === METABASE (tắt trên sandbox) ===
METABASE_BASE_URL=
METABASE_EMAIL=
METABASE_PASSWORD=
```

> ⚠️ **KHÔNG commit `.env.sandbox` vào git** — thêm vào `.gitignore` nếu chưa có

#### 4.4 Deploy BE Sandbox lên Render

1. Render Dashboard → **New Web Service**
2. Connect cùng repo, branch `sandbox`
3. Tên: `palfish-gmv-api-sandbox`
4. Runtime: Docker
5. Dockerfile path: `./backend/Dockerfile`
6. Docker context: `.`
7. Plan: Free (sandbox)
8. Thêm env vars từ bước 4.3

Hoặc thêm vào `render.yaml`:
```yaml
  - type: web
    name: palfish-gmv-api-sandbox
    runtime: docker
    dockerfilePath: ./backend/Dockerfile
    dockerContext: .
    plan: free
    branch: sandbox
    envVars:
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: FRONTEND_URL
        sync: false
      - key: ENVIRONMENT
        value: sandbox
      - key: PAYOS_CLIENT_ID
        sync: false
      - key: PAYOS_API_KEY
        sync: false
      - key: PAYOS_CHECKSUM_KEY
        sync: false
      - key: PAYOS_HCM_CLIENT_ID
        sync: false
      - key: PAYOS_HCM_API_KEY
        sync: false
      - key: PAYOS_HCM_CHECKSUM_KEY
        sync: false
```

#### 4.5 Tạo `.env.sandbox` cho FE

```env
VITE_API_BASE_URL=https://palfish-gmv-api-sandbox.onrender.com
VITE_SUPABASE_URL=https://[sandbox-ref].supabase.co
VITE_SUPABASE_ANON_KEY=[sandbox-anon-key]
VITE_OPS_EMAILS=anhminhcv0512@gmail.com,dinhgiang6492@gmail.com,hieuhn.mplanner@gmail.com
VITE_BANK_BIN=970422
VITE_BANK_ACCOUNT_NO=1680011668899
VITE_BANK_ACCOUNT_NAME=CONG TY TNHH TRUONG QUOC TE PALFISH SINGAPORE - VIETNAM
VITE_BANK_DISPLAY_NAME=Ngan hang TMCP Quan Doi (MB Bank) [SANDBOX]
VITE_BANK_BRANCH=Hoan Kiem
```

Thêm scripts vào `frontend/package.json`:
```json
"dev:sandbox": "vite --mode sandbox",
"build:sandbox": "vite build --mode sandbox"
```

#### 4.6 Deploy FE Sandbox lên Vercel

Option A — Branch preview (đơn giản nhất):
1. Vercel Dashboard → Project Settings → Git
2. Production Branch = `main`
3. Push branch `sandbox` → Vercel auto-deploy preview URL
4. Vào Environment Variables → thêm các `VITE_*` sandbox, scope = **Preview**

Option B — Project riêng:
1. Vercel → New Project → cùng repo → branch `sandbox`
2. Tên: `palfish-gmv-sandbox`

#### 4.7 Tạo branch sandbox

```bash
git checkout -b sandbox
git push -u origin sandbox
```

Git workflow từ giờ:
```
feature/xxx  →  merge vào sandbox  →  test OK  →  merge vào main (production)
```

#### 4.8 (Optional) Banner nhận biết sandbox trong FE

```typescript
// App.tsx hoặc AppShell.tsx
const IS_SANDBOX = import.meta.env.MODE === 'sandbox'
  || window.location.hostname.includes('sandbox');

// Render banner nếu IS_SANDBOX:
// <div className="bg-yellow-400 text-center text-sm py-1 font-bold">
//   ⚠️ SANDBOX — Dữ liệu test, không phải production
// </div>
```

### Checklist
- [ ] Supabase sandbox project tạo xong, schema đã migrate
- [ ] BE sandbox deploy Render, `GET /healthz` trả 200
- [ ] FE sandbox deploy Vercel, truy cập được
- [ ] Test E2E: tạo PR → tạo QR → PayOS sandbox webhook nhận đúng
- [ ] Branch `sandbox` đã push lên remote
- [ ] Banner sandbox hiển thị đúng trên preview URL
- [ ] `.env.sandbox` đã thêm vào `.gitignore`
