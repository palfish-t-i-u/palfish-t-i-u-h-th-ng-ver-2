# Handoff: 2 bug gateway — verified_received + lọc Khớp tiền

Ngày: 13/07/2026
Người viết: Minh (AI-assisted)
Assign: Đạt (BE)

## Bối cảnh

Feature "Thừa/Thiếu tính theo NET" đã merge main (babbc7a, 12/7). Logic đúng:
khi payment line có `verified_received` → dùng net thay vì gross để tính thừa/thiếu.

Nhưng kế toán phản hồi 2 vấn đề thực tế khiến feature chưa hoạt động đúng
trong nhiều trường hợp.

---

## Bug 1: Ghép mPOS rồi nhưng tiền thực nhận không cập nhật

### Hiện tượng

PR-2026-0221: giao dịch quẹt thẻ 25.240.000 đ, thực nhận 24.785.680 đ.
Gateway đã ghép (status "Đã ghép"), nhưng:
- "Đã nhận" trên PR/AR vẫn hiện 28.240.000 đ (gross)
- Trạng thái báo "Thừa" thay vì "Khớp"

### Nguyên nhân

File: `backend/gateway_routes.py`, dòng 478–497

```python
already_paid = _clean_text(line_row.get("status")).lower() == "paid"
can_auto_confirm = not already_paid and (method not in ("card", "installment") or has_bill)

if can_auto_confirm:
    # ... ghi verified_received ở đây
```

Khi kế toán xác nhận payment line **trước** rồi mới ghép gateway → `already_paid = True`
→ `can_auto_confirm = False` → toàn bộ block ghi `verified_received` bị skip.

### Cách fix

Tách logic ghi `verified_received` ra khỏi điều kiện `can_auto_confirm`.
Khi ghép gateway vào line đã paid, vẫn cập nhật `verified_received` + `verified_total`
rồi gọi `recompute_payment_request_totals`.

Gợi ý sửa trong `match_gateway_txn` (gateway_routes.py ~line 481):

```python
# --- Ghi verified_received BẤT KỂ line đã paid hay chưa ---
txn_row = res.data[0]
gw_amount = _parse_amount(txn_row.get("amount"))
gw_net = _parse_amount(txn_row.get("net_amount"))
if gw_net > 0:
    net_patch = {"verified_total": int(gw_amount), "verified_received": int(gw_net)}
    sb.table("payment_lines").update(net_patch).eq("id", line_id).execute()

# --- Auto-confirm chỉ khi chưa paid (giữ nguyên logic cũ) ---
if can_auto_confirm:
    _mark_line_paid(sb, line_id, actor_email=actor.email, source="gateway")

# --- Recompute dù line đã paid (vì verified_received thay đổi) ---
if pr_id:
    recompute_payment_request_totals(sb, pr_id)

line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
```

### Lưu ý

- `_mark_line_paid` line 1317 cũng early-return khi `status == "paid"` → nếu
  truyền `extra` vào line đã paid, `verified_received` cũng không được ghi.
  Nên ghi trực tiếp như trên thay vì qua `_mark_line_paid`.
- Sau khi ghi `verified_received`, PHẢI gọi `recompute_payment_request_totals`
  để cập nhật `received` và `state` trên PR (hàm `_sum_paid_amount` dùng `_line_net`
  đã tính theo `verified_received`).

---

## Bug 2: Lọc "Khớp tiền" không tìm ra PR khi sale nhập theo tiền thực nhận

### Hiện tượng

Gateway transaction: gross 8.823.000, net 8.602.425.
Sale tạo payment line với amount = 8.602.425 (theo tiền thực nhận).
Kế toán tick "Khớp tiền" → không ra kết quả nào, phải bỏ tick rồi dò tay.

### Nguyên nhân

File: `backend/gateway_routes.py`, dòng 383–387

```python
else:
    amount_int = int(effective_amount) if effective_amount else 0
    line_res = sb.table("payment_lines").select("*").eq("amount", amount_int).limit(100).execute()
```

`effective_amount` = gateway gross. Truy vấn `eq("amount", 8823000)` → chỉ tìm
payment line có amount đúng 8.823.000. Line của sale (8.602.425) không khớp.

### Cách fix

Khi tick "Khớp tiền", tìm payment line khớp **gross HOẶC net**:

```python
else:
    amount_int = int(effective_amount) if effective_amount else 0
    # net_amount từ gateway transaction
    net_int = int(_parse_amount(txn.get("net_amount"))) if _parse_amount(txn.get("net_amount")) > 0 else 0

    if net_int > 0 and net_int != amount_int:
        # Tìm line khớp gross HOẶC net
        line_res = (
            sb.table("payment_lines")
            .select("*")
            .or_(f"amount.eq.{amount_int},amount.eq.{net_int}")
            .limit(100)
            .execute()
        )
    else:
        line_res = sb.table("payment_lines").select("*").eq("amount", amount_int).limit(100).execute()
```

---

## Test

Cả 2 bug dùng chung case test:

1. Tạo PR với payment line quẹt thẻ, amount = tiền net (vd 8.602.425)
2. Xác nhận payment line (status → paid)
3. Import gateway transaction (gross 8.823.000, net 8.602.425)
4. Ghép gateway vào payment line

**Verify Bug 1**: sau ghép, check `payment_lines.verified_received` = 8.602.425
(không null). PR state phải đúng.

**Verify Bug 2**: trước ghép, tick "Khớp tiền" phải tìm ra payment line 8.602.425.

---

## Ví dụ thực tế

| PR | Gross (khách quẹt) | Net (thực nhận) | Sale nhập amount | Vấn đề |
|----|----|----|----|----|
| PR-2026-0221 | 25.240.000 | 24.785.680 | 25.240.000 (gross) | Bug 1: ghép rồi nhưng verified_received null |
| (chị Vân báo) | 8.823.000 | 8.602.425 | 8.602.425 (net) | Bug 2: lọc Khớp tiền không ra |
