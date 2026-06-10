# TOP 3 (SCOPE MỚI 10/6): Theo dõi trạng thái gửi hóa đơn — BE Handoff (Đức)

## ⚠️ Thay đổi scope so với handoff cũ

Chị Thu Hiền xác nhận: **hóa đơn điện tử được gửi trực tiếp từ hệ thống thuế** (nhà cung cấp HĐĐT, email `hoadon-noreply`, có mã CQT + mã tra cứu). App KHÔNG tự gửi email hóa đơn nữa — vừa trùng lặp vừa không có giá trị pháp lý.

**Task đổi thành:** kế toán sau khi gửi HĐ từ hệ thống thuế → **tick ghi nhận "Đã gửi"** trong app (kênh email/Zalo) → sales thấy trạng thái ngay trong PR, không phải hỏi qua lại.

**Vấn đề thật (ảnh chat 10/6):** sale trách kế toán chưa gửi HĐ trong khi HĐ đã gửi từ 4/6 — sale không có chỗ nào nhìn thấy trạng thái gửi.

## Tận dụng scaffold đã có (commit a2965b5 trên sandbox)

Giữ lại ~80%: bảng `invoice_email_logs`, route file, helpers, tests. **Bỏ hẳn phần gửi email thật** — không cần tích hợp SMTP/provider nữa (`invoice_email_service.py` chỉ giữ `is_valid_email`).

## Việc cần làm

### 1. Migration — thêm cột `channel`

```sql
ALTER TABLE public.invoice_email_logs
ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email'
  CHECK (channel IN ('email', 'zalo'));

-- Status giờ chỉ còn ý nghĩa "đã ghi nhận gửi" — giữ CHECK cũ
-- ('sent','dry_run','failed') để khỏi migrate data, chỉ dùng 'sent'.
```

### 2. Đổi endpoint POST `send-email` → `delivery-log`

```
POST /api/v1/invoices/{active_request_id}/delivery-log
```

```python
class InvoiceDeliveryLogBody(BaseModel):
    channel: str = "email"          # "email" | "zalo"
    sent_to: str | None = None      # email KH (channel=email) / SĐT-ghi chú (zalo)
    note: str | None = None
```

Logic (đơn giản hơn bản cũ nhiều):
1. RBAC như hiện tại (`resolve_actor` + `require_module_write`) — kế toán/manager
2. Validate AR tồn tại (helper `_fetch_active_request` có sẵn)
3. `channel=email` → validate `sent_to` bằng `is_valid_email` (nếu trống → lấy email KH từ PR như code cũ)
4. **KHÔNG gọi send_invoice_email nữa** — chỉ `_insert_email_log` với `status='sent'`, `channel`, `sent_to`, `sent_by_email`
5. Response: `{ "log": {...} }` (serialize có sẵn, thêm field `channel`)

### 3. GET giữ nguyên, đổi path cho khớp

```
GET /api/v1/invoices/{active_request_id}/delivery-log
```
Trả `{ "logs": [...] }` — thêm `channel` vào `_serialize_email_log`.

### 4. Cập nhật tests

Sửa `test_invoice_email.py` theo semantic mới: bỏ test dry-run/SMTP, thêm test channel email/zalo + validate email.

## FE contract (AI làm sau khi BE xong)

```ts
// Kế toán tick đã gửi (B4)
await api.post(`/api/v1/invoices/${arId}/delivery-log`, { channel: "email", sent_to: "kh@gmail.com" });
// Badge trạng thái (PR drawer + B4)
const { data } = await api.get(`/api/v1/invoices/${arId}/delivery-log`);
// data.logs[0] → "HĐ đã gửi KH ngày 04/06 (email) — bởi Thu Hiền"
```

FE sẽ làm thêm (không cần BE): nút copy email KH trong B4 để kế toán paste sang hệ thống thuế.

## Để sau (không làm đợt này)

- Upload PDF hóa đơn vào app cho case Zalo (sale tự tải gửi KH) — cân nhắc sau go-live 18/06
- Tích hợp API nhà cung cấp HĐĐT để sync trạng thái gửi tự động — cần biết provider nào + API docs
