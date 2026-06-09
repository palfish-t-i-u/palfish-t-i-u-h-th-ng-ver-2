# Handoff BE: Loại KH cá nhân / doanh nghiệp (TOP2-03)

> **Ngày**: 2026-06-09
> **Người giao**: Minh (DA)
> **Cho**: Đạt
> **Deadline**: Trước 14/06 (inhouse 2 test)

## Bối cảnh

Sau demo 9/6, phòng sale yêu cầu phân biệt khách hàng **cá nhân** vs **doanh nghiệp** trên Payment Request. Nếu là doanh nghiệp, cần lưu thêm **tên công ty**. Phục vụ cho xuất hóa đơn (B4).

## Cần sửa gì (3 việc)

### Việc 1: Thêm 2 cột DB

**Bảng:** `payment_requests`

```sql
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT NULL;

COMMENT ON COLUMN payment_requests.customer_type IS 'individual hoặc business';
COMMENT ON COLUMN payment_requests.company_name IS 'Tên công ty — chỉ có khi customer_type = business';
```

Giá trị `customer_type`:
- `'individual'` — Cá nhân (default, cho tất cả PR cũ)
- `'business'` — Doanh nghiệp

Chạy trên cả **sandbox** và **production**.

### Việc 2: Sửa Pydantic model

**File:** `payment_request_routes.py`

Thêm 2 field vào 2 class:

```python
# class PaymentRequestCreate
class PaymentRequestCreate(BaseModel):
    # ... existing fields ...
    customer_type: str | None = "individual"   # <-- THÊM
    company_name: str | None = None            # <-- THÊM

# class PaymentRequestPatch
class PaymentRequestPatch(BaseModel):
    # ... existing fields ...
    customer_type: str | None = None           # <-- THÊM
    company_name: str | None = None            # <-- THÊM
```

### Việc 3: Sửa hàm insert + patch

**File:** `payment_request_routes.py`

**Insert** (`_payment_request_insert_row`, line ~622):
```python
# Sau block tax_id, thêm:
ct = _clean_text(body.customer_type) or "individual"
if ct not in ("individual", "business"):
    raise HTTPException(400, "customer_type phai la 'individual' hoac 'business'")
row["customer_type"] = ct
if ct == "business":
    company = _clean_text(body.company_name)
    if company:
        row["company_name"] = company
```

**Patch** (`_payment_request_patch_row`, line ~661):
```python
# Sau block tax_id, thêm:
if body.customer_type is not None:
    ct = _clean_text(body.customer_type) or "individual"
    if ct not in ("individual", "business"):
        raise HTTPException(400, "customer_type phai la 'individual' hoac 'business'")
    patch["customer_type"] = ct
    # Nếu chuyển về cá nhân → xóa company_name
    if ct == "individual":
        patch["company_name"] = None
if body.company_name is not None:
    patch["company_name"] = _clean_text(body.company_name) or None
```

## API contract (FE đã code sẵn)

### POST `/api/v1/payment-requests`
```json
{
  "uid": "123", "name": "Nguyễn A", "phone": "0383549120",
  "target": 12000000,
  "customer_type": "business",     // optional, default "individual"
  "company_name": "Công ty ABC"    // optional, chỉ khi business
}
```

### PATCH `/api/v1/payment-requests/{id}`
```json
{
  "customer_type": "business",
  "company_name": "Công ty XYZ"
}
```

Khi `customer_type` chuyển từ `business` → `individual`:
- BE tự set `company_name = NULL`
- FE gửi: `{ "customer_type": "individual" }` (không gửi `company_name`)

### GET `/api/v1/payment-requests` — response
```json
{
  "requests": [{
    "id": "PR-20260001-001",
    "customer_type": "business",
    "company_name": "Công ty ABC",
    ...
  }]
}
```

## Test

1. Tạo PR cá nhân (default) → `customer_type = 'individual'`, `company_name = NULL`
2. Tạo PR doanh nghiệp + tên cty → `customer_type = 'business'`, `company_name = 'Cty ABC'`
3. PATCH: đổi từ cá nhân → doanh nghiệp + company_name
4. PATCH: đổi từ doanh nghiệp → cá nhân → `company_name` tự xóa
5. Gửi `customer_type = "invalid"` → trả 400

## FE đã xong

FE đã code sẵn radio selector (Cá nhân / Doanh nghiệp) + field tên công ty (hiện khi chọn DN). Sau khi BE deploy, tự hoạt động — không cần sửa FE thêm.
