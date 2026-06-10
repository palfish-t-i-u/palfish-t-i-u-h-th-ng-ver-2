# TOP 2-A: Nút remind nhắc kế toán xuất hóa đơn — BE Handoff (Đạt)

## Mô tả nghiệp vụ
Khi khách hàng cần xuất hóa đơn nhanh, sales muốn có nút **nhắc kế toán** trong PR để kế toán biết cần ưu tiên làm hóa đơn cho PR đó. Kế toán xem danh sách các PR cần xuất HĐ ở tab B4 (Xuất hóa đơn).

## 1. Tạo bảng `invoice_reminders`

```sql
CREATE TABLE invoice_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_request_id UUID NOT NULL REFERENCES payment_requests(id),
  requested_by UUID NOT NULL REFERENCES profiles(id),
  requested_at TIMESTAMPTZ DEFAULT now(),
  note TEXT
);

CREATE INDEX idx_invoice_reminders_pr ON invoice_reminders(payment_request_id);
```

## 2. Endpoint tạo remind

```
POST /api/v1/payment-requests/{payment_request_id}/invoice-remind
```

### Request body
```python
class InvoiceRemindCreate(BaseModel):
    note: str | None = None  # Ghi chú tùy chọn ("KH cần HĐ gấp", ...)
```

### Logic xử lý
1. `resolve_actor()` → actor từ JWT
2. `require_module_write(sb, actor, "paymentRequests")` → check quyền
3. Check PR tồn tại + actor có quyền access PR (`_can_access_request`)
4. **Throttle**: check xem đã có remind nào cho PR này trong 24h chưa. Nếu có → 429 "Da nhac trong 24h qua, vui long cho"
5. Insert vào `invoice_reminders`
6. Response:
```json
{
  "reminder": {
    "id": "...",
    "payment_request_id": "...",
    "requested_by": "...",
    "requested_at": "2026-06-10T10:00:00Z",
    "note": "KH cần HĐ gấp"
  }
}
```

## 3. Endpoint lấy danh sách remind (cho kế toán)

```
GET /api/v1/invoice-reminders?status=pending
```

### Logic
1. `resolve_actor()` → check role kế toán/manager
2. Query `invoice_reminders` JOIN `payment_requests` JOIN `profiles` (tên người nhắc)
3. Sắp xếp theo `requested_at DESC`
4. Response:
```json
{
  "reminders": [
    {
      "id": "...",
      "payment_request_id": "...",
      "pr_code": "PR-00123",
      "customer_name": "Nguyen Van A",
      "requested_by_name": "Tran Thi B",
      "requested_at": "2026-06-10T10:00:00Z",
      "note": "KH cần HĐ gấp"
    }
  ]
}
```

## 4. Endpoint lấy remind theo PR (cho FE hiện trạng thái)

```
GET /api/v1/payment-requests/{payment_request_id}/invoice-remind
```

### Response
```json
{
  "last_reminder": {
    "id": "...",
    "requested_at": "2026-06-10T10:00:00Z",
    "requested_by_name": "Tran Thi B",
    "note": "..."
  },
  "can_remind": true  // false nếu đã nhắc trong 24h
}
```

## FE contract
FE sẽ gọi:
```ts
// Tạo remind
await api.post(`/api/v1/payment-requests/${prId}/invoice-remind`, { note });
// Lấy trạng thái remind của 1 PR
const { data } = await api.get(`/api/v1/payment-requests/${prId}/invoice-remind`);
// data.can_remind → hiện/disable nút
// data.last_reminder?.requested_at → hiện "Đã nhắc lúc ..."
```
