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

// Lấy danh sách remind pending (cho kế toán B4 tab)
const { data } = await api.get(`/api/v1/invoice-reminders?status=pending`);
// data.reminders[] → banner + badge trong InvoiceRequestTab
```

## 5. Smart Throttle (commit `ac765bf`)

Throttle 24h vẫn giữ nguyên, **nhưng** nếu có course được xuất hóa đơn SAU lần nhắc gần nhất → cooldown reset → sale có thể nhắc lại.

### Helper `_has_invoice_since(sb, pr_id, since)`
- Duyệt `active_requests.uids_data` JSONB → courses[] → `invoicedAt`
- Nếu bất kỳ course nào có `invoicedAt > since` → return `True`

### Áp dụng tại:
- **Create endpoint**: trước khi raise 429, check `_has_invoice_since`. Nếu `True` → cho nhắc tiếp.
- **Status endpoint**: trước khi set `can_remind = False`, check `_has_invoice_since`. Nếu `True` → `can_remind = True`.

### Ví dụ:
1. Sale nhắc HĐ lúc 10:00 → kế toán xuất HĐ cho course A lúc 11:00
2. Course B được kích hoạt lúc 14:00 → sale cần nhắc lại
3. Smart throttle phát hiện `invoicedAt(11:00) > requested_at(10:00)` → cho nhắc lại

## 6. FE đã hoàn thành (Minh)

### Trong PR drawer (`PaymentRequestDetailDrawer.tsx`):
- Nút "Nhắc xuất hóa đơn" + hook `useInvoiceRemind`
- Dòng trạng thái "Đã nhắc kế toán lúc ... — bởi ..."
- Nút chỉ hiện khi `activatedCount > 0` (commit `9a1e181`)

### Trong B4 tab (`InvoiceRequestTab.tsx`):
- **Banner standalone** (cam) — hiện khi có pending reminders, liệt kê từng PR + tên KH + ai nhắc + lúc nào
- **KPI card** "Sales đang nhắc" với icon chuông
- **Row-level badge** "Nhắc" bên cạnh tên KH trong tab pending

### API (`api.ts`):
- `invoiceRemind.list(status?)` → `GET /api/v1/invoice-reminders`

## 7. BE bugs đã fix

| Commit | Bug | Root cause | Fix |
|--------|-----|------------|-----|
| `29f71bd` | Banner không hiện (is_pending sai) | `is_pending()` check AR status string → lọc mất reminder khi AR activated nhưng chưa invoiced | Check actual `course.invoiced` field trong `uids_data` |
| `bfc318b` | Banner vẫn không hiện (sai tên cột) | Query dùng `uids` nhưng cột tên `uids_data` → Supabase 400 | Đổi `uids` → `uids_data` |
| `9a1e181` | Nút nhắc quá lỏng lẻo | Chỉ check `state !== "cancelled"` → nhắc được ngay khi tạo PR | Thêm `activatedCount > 0` |
| `ac765bf` | Throttle cứng 24h không hợp lý | Không tính trường hợp course mới kích hoạt sau khi KT đã xuất HĐ | Smart throttle: `_has_invoice_since()` |
