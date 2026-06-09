# Handoff BE: Thêm Mã số thuế cá nhân (TOP2-02)

> **Ngày**: 2026-06-09
> **Người giao**: Minh (DA)
> **Cho**: Giang hoặc Đạt (ai nhận trước)
> **Deadline**: Trước 14/06 (inhouse 2 test)

## Bối cảnh

Sau demo 9/6, phòng sale yêu cầu thêm field **mã số thuế cá nhân** (MST) vào Payment Request. Field này:
- **Không bắt buộc** (nullable)
- Nằm ở form tạo PR (B1) + detail drawer
- Phục vụ cho việc xuất hóa đơn (B4) sau này

## Cần sửa gì (3 việc)

### Việc 1: Thêm cột DB

**Bảng:** `payment_requests`

```sql
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS tax_id TEXT DEFAULT NULL;
```

Chạy trên cả **sandbox** và **production**.

### Việc 2: Sửa Pydantic model

**File:** `payment_request_routes.py`

Thêm field `tax_id` vào 2 class:

```python
# Line ~57 — class PaymentRequestCreate
class PaymentRequestCreate(BaseModel):
    # ... existing fields ...
    tax_id: str | None = None       # <-- THÊM

# Line ~67 — class PaymentRequestPatch
class PaymentRequestPatch(BaseModel):
    # ... existing fields ...
    tax_id: str | None = None       # <-- THÊM
```

### Việc 3: Sửa hàm insert + patch

**File:** `payment_request_routes.py`

**Insert** (`_payment_request_insert_row`, line ~622):
```python
# Sau dòng child_name (line ~655-657), thêm:
tax_id = _clean_text(body.tax_id)
if tax_id:
    row["tax_id"] = tax_id
```

**Patch** (`_payment_request_patch_row`, line ~661):
```python
# Sau dòng child_name (line ~700-701), thêm:
if body.tax_id is not None:
    patch["tax_id"] = _clean_text(body.tax_id) or None
```

## API contract (FE đã code sẵn)

### POST `/api/v1/payment-requests`
```json
{
  "uid": "123", "name": "Nguyễn A", "phone": "0383549120",
  "target": 12000000,
  "tax_id": "0123456789"   // optional, nullable
}
```

### PATCH `/api/v1/payment-requests/{id}`
```json
{
  "tax_id": "0123456789"   // optional, nullable — gửi "" để xóa
}
```

### GET `/api/v1/payment-requests` — response
```json
{
  "requests": [{
    "id": "PR-20260001-001",
    "tax_id": "0123456789",
    ...
  }]
}
```

## Test

1. Tạo PR mới có MST → DB phải lưu `tax_id`
2. Tạo PR mới không có MST → `tax_id` = NULL
3. PATCH PR: thêm MST → `tax_id` updated
4. PATCH PR: gửi `tax_id: ""` → `tax_id` = NULL

## FE đã xong

FE đã code sẵn field MST trên form tạo + drawer edit. Sau khi BE deploy, FE sẽ gửi `tax_id` trong payload — không cần sửa FE thêm.
