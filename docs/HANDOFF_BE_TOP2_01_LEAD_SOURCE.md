# TOP2-01: Nguồn KH & Kênh (Lead Source / Channel) — BE Handoff

## Mô tả
FE đã implement cascading dropdown Nguồn KH → Kênh ở **2 nơi**:
1. **Form tạo/sửa PR** — trường `lead_source` + `lead_channel` trên payment_requests
2. **Kích hoạt gói học (B3)** — per-course `lead_source` + `lead_channel` trong `uids_data[].courses[]` của active_requests

## 1. Bảng `payment_requests`

### Thêm cột
```sql
ALTER TABLE payment_requests
  ADD COLUMN lead_source TEXT,
  ADD COLUMN lead_channel TEXT;
```

### Pydantic models
- `CreatePaymentRequestPayload`: thêm `lead_source: str | None = None`, `lead_channel: str | None = None`
- `PatchPaymentRequestPayload`: tương tự (optional)

### Hàm cần sửa
- `insert_payment_request()` — thêm `lead_source`, `lead_channel` vào INSERT
- `patch_payment_request()` — thêm vào UPDATE SET nếu có

### Giá trị hợp lệ cho `lead_source`
```
quang_cao, gioi_thieu, offline, koc, gia_han, kho_chung, khac
```

### Giá trị `lead_channel`
Mã kênh (string), VD: `"300265"`, `"832"`, `"300461"`, ...
- Nếu `lead_source` là `gia_han` hoặc `kho_chung` → `lead_channel` sẽ là `null` (nguồn không có kênh)
- Không cần validate channel thuộc source nào ở BE — FE đã filter

## 2. Bảng `active_requests` — per-course trong `uids_data` JSONB

### Cấu trúc JSONB hiện tại
```json
{
  "uids_data": [
    {
      "uid": "123",
      "courses": [
        {
          "code": "C001",
          "name": "Gói A",
          "amount": 5000000,
          "lead_source": "quang_cao",
          "lead_channel": "300265"
        }
      ]
    }
  ]
}
```

### Không cần ALTER TABLE
`uids_data` là JSONB → FE đã gửi `lead_source` + `lead_channel` trong mỗi course object. BE chỉ cần **không strip** các field này khi lưu.

### Kiểm tra
- `update_active_request()` / `patch_active_request()` — đảm bảo khi nhận `uids_data` từ FE, các field `lead_source` / `lead_channel` trong courses được giữ nguyên (không bị filter ra).

## FE đã gửi gì

### POST/PATCH `/payment-requests`
```json
{
  "lead_source": "quang_cao",
  "lead_channel": "300265"
}
```

### PATCH `/active-requests/:id`
```json
{
  "uids_data": [
    {
      "uid": "123",
      "courses": [
        {
          "code": "C001",
          "name": "Gói A",
          "amount": 5000000,
          "lead_source": "quang_cao",
          "lead_channel": "300265"
        }
      ]
    }
  ]
}
```

## Ghi chú
- Cả hai field đều optional, không bắt buộc ở BE
- FE bắt buộc chọn `lead_source` khi tạo PR mới, nhưng BE không cần enforce (backward compat cho PR cũ)
- Per-course lead source cho phép 1 PR có nhiều UID từ các nguồn khác nhau
