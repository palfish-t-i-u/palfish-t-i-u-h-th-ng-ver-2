# TOP 1-B: Sales sửa số tiền lần thanh toán — BE Handoff (Giang)

## Mô tả nghiệp vụ
Sales tạo payment line (lần thanh toán) trong PR, nếu nhập sai số tiền thì hiện tại phải **hủy rồi tạo lại**. Cần cho phép sales **sửa trực tiếp số tiền** nếu lần TT đó **chưa được thanh toán / chưa được kế toán xác nhận**.

## Endpoint cần tạo

```
PATCH /api/v1/payment-lines/{line_id}/amount
```

### Request body
```python
class PaymentLineAmountPatch(BaseModel):
    amount: int | str  # Số tiền mới (VND)
```

### Logic xử lý
1. `resolve_actor()` → lấy actor từ JWT
2. `require_module_write(sb, actor, "paymentRequests")` → check quyền module
3. Lấy payment_line theo `line_id`
4. **Validate status**: chỉ cho sửa khi `status == "pending"` VÀ `cancelled != true`. Nếu không → 400 "Chi duoc sua so tien khi chua thanh toan"
5. **Validate ownership**: lấy PR của line → check `_can_access_request(sb, actor, pr_row)`. Nếu không → 403
6. **Validate amount**: `_parse_amount(body.amount)` > 0. Nếu không → 400 "amount khong hop le"
7. **Update**: `sb.table("payment_lines").update({"amount": amount}).eq("id", line_id)`
8. **Recompute totals**: gọi `recompute_payment_request_totals(sb, payment_request_id)` (hàm có sẵn dòng 894)
9. **Response**: format giống `patch_transaction_status` (dòng 1546-1553):
```json
{
  "payment_line": { ... },
  "payment_request": { ... },
  "received": 0,
  "target": 10000000,
  "state": "pending"
}
```

### Ghi chú
- Hàm helper có sẵn: `_parse_amount()`, `_can_access_request()`, `_serialize_payment_line()`, `recompute_payment_request_totals()`
- Đặt endpoint trong `payment_request_routes.py`, gần block `patch_transaction_status` (dòng 1495)
- KHÔNG cần xử lý PayOS QR — nếu method=qr và đã tạo link rồi thì amount trên PayOS không đổi được. FE sẽ hiện warning cho user biết

### FE contract
FE sẽ gọi:
```ts
await api.patch(`/api/v1/payment-lines/${lineId}/amount`, { amount: newAmount });
```
Response cần trả `payment_line` + `payment_request` + `received` + `target` + `state` để FE cập nhật UI.
