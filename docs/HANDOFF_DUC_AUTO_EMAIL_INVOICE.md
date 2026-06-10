# TOP 3: Tự động gửi hóa đơn qua email cho KH — BE Handoff (Đức)

## Mô tả nghiệp vụ
Khi kế toán xuất xong hóa đơn cho KH, hiện tại phải download file rồi gửi email thủ công. Cần tự động hóa: bấm nút → hệ thống gửi email kèm file hóa đơn đến email KH.

## 1. Email service

Đức đã setup email cty + OTP quên mật khẩu trước đó. Dùng lại infrastructure đó (Resend / SendGrid / SMTP cty — tùy cái đã có).

Config cần thêm:
- Template email hóa đơn (subject, body HTML)
- Sender: dùng email cty (VD: `ketoan@palfish.vn` hoặc tương tự)

## 2. Endpoint gửi email hóa đơn

```
POST /api/v1/invoices/{active_request_id}/send-email
```

### Request body
```python
class InvoiceSendEmailBody(BaseModel):
    email_override: str | None = None  # Gửi đến email khác (nếu KH yêu cầu)
```

### Logic xử lý
1. `resolve_actor()` → check role kế toán/manager (chỉ kế toán mới gửi được)
2. Lấy active_request → lấy thông tin KH (tên, email từ PR liên quan)
3. Lấy file hóa đơn đã xuất (từ Supabase Storage hoặc generate lại)
4. Compose email:
   - **To**: `body.email_override` hoặc email KH từ PR
   - **Subject**: "Hóa đơn thanh toán - [Tên KH] - [Mã PR]"
   - **Body**: Template HTML đơn giản (thông tin KH, số tiền, ngày, file đính kèm)
   - **Attachment**: File hóa đơn (Excel/PDF)
5. Gửi email qua service đã có
6. Log kết quả vào bảng `invoice_email_logs`
7. Response:
```json
{
  "success": true,
  "sent_to": "khachhang@gmail.com",
  "sent_at": "2026-06-10T10:00:00Z"
}
```

## 3. Bảng log gửi email

```sql
CREATE TABLE invoice_email_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  active_request_id UUID NOT NULL,
  payment_request_id UUID,
  sent_to TEXT NOT NULL,
  sent_by UUID NOT NULL REFERENCES profiles(id),
  sent_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'sent',  -- sent / failed / delivered
  error_message TEXT
);
```

## 4. Endpoint xem lịch sử gửi (cho FE hiện trạng thái)

```
GET /api/v1/invoices/{active_request_id}/email-logs
```

### Response
```json
{
  "logs": [
    {
      "id": "...",
      "sent_to": "khachhang@gmail.com",
      "sent_by_name": "Nguyen Van Ke Toan",
      "sent_at": "2026-06-10T10:00:00Z",
      "status": "sent"
    }
  ]
}
```

## FE contract
FE sẽ gọi:
```ts
// Gửi email hóa đơn
await api.post(`/api/v1/invoices/${arId}/send-email`, { email_override: null });
// Xem lịch sử gửi
const { data } = await api.get(`/api/v1/invoices/${arId}/email-logs`);
// data.logs → hiện badge "Đã gửi email lúc ..."
```

## Ghi chú
- Task này là TOP 3, không gấp bằng TOP 1-2
- Ưu tiên: gửi được email cơ bản trước, template đẹp sau
- Nếu email service hiện tại chỉ dùng cho OTP → cần check rate limit / quota có đủ cho gửi hóa đơn không
