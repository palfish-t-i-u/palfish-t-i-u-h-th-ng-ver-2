# Handoff BE: Sửa nội dung chuyển khoản (TOP1-01)

> **Ngày**: 2026-06-09
> **Người giao**: Minh (DA)
> **Cho**: Giang / Đức / Đạt (ai available)
> **Deadline**: Trước 10/06 (bắt đầu test)

## Bối cảnh

Hiện tại, nội dung chuyển khoản (CK) trên app ngân hàng của khách chỉ hiện mã giao dịch:

```
CSNF8DAKF04 TT20260002001
^^^^^^^^^^^  ^^^^^^^^^^^^^
PayOS tự gắn  App kiểm soát (description)
```

Sale muốn nhìn thấy **SĐT + tên khách/bé** trong nội dung CK để dễ đối chiếu. Nhưng PayOS giới hạn description **tối đa 25 ký tự** (đã test thực tế, 30 ký tự PayOS trả lỗi).

**Giải pháp đã thống nhất:** Rút ngắn mã TT bằng base36, dành chỗ cho SĐT + tên.

## Format mới

```
{SĐT đầy đủ} {tên riêng không dấu} {mã base36 5 ký tự}
```

Ví dụ:

| Trường hợp | Description | Ký tự |
|------------|-------------|-------|
| VN, tên ngắn | `0383549120 Ha A2B01` | 20 |
| VN, tên dài | `0383549120 Quynh A2B01` | 23 |
| Quốc tế (420) | `420987654321 Ha A2B01` | 22 |
| Quốc tế (82) | `82987654321 Ha A2B01` | 21 |

Tất cả đều nằm trong giới hạn 25 ký tự.

## Mã base36 là gì

Thay vì `TT-20260002-001` (13+ ký tự), encode thành 5 ký tự base36:

- Lấy phần số: năm 2 chữ số (26) + PR seq 4 chữ số (0002) + line seq 2 chữ số (01) = `260002` + `01`
- Encode `26000201` thành base36 → `A2B01` (ví dụ minh hoạ)
- 5 ký tự base36 biểu diễn được đến 60,466,176 giá trị → dư sức cho nhiều năm

**Yêu cầu:** Mã phải unique, có thể decode ngược lại để biết PR nào + line nào (giúp debug).

## Cần sửa gì (3 việc)

### Việc 1: Hàm sinh mã base36

**File:** `payment_request_routes.py:716-718`

```python
# HIỆN TẠI
def _transfer_code_hint(payment_request_id: str, line_count: int) -> str:
    suffix = payment_request_id.replace("PR-", "").replace("-", "")
    return f"TT-{suffix}-{line_count + 1:03d}"
```

**Cần sửa:** Thay bằng hàm sinh mã base36 5 ký tự. Input vẫn là `payment_request_id` + `line_count`. Output là chuỗi 5 ký tự `[0-9A-Z]`.

### Việc 2: Ghép description mới khi tạo payment line

**File:** `payment_request_routes.py:1240-1277`

Hiện tại dòng 1264 gọi `create_payos_payment_link(amount, transfer_code)` — truyền mã TT làm description.

**Cần sửa:**
1. Lấy `phone` và `name` (tên riêng, không dấu) từ `payment_requests` row (đã có sẵn trong `pr_row`)
2. FE sẽ gửi thêm field `name_for_transfer` (tên riêng KH hoặc tên bé — do sale chọn)
3. Ghép: `f"{phone} {name_for_transfer_ascii} {base36_code}"`
4. Sanitize: bỏ dấu tiếng Việt, chỉ giữ `[a-zA-Z0-9 ]`, cắt max 25 ký tự
5. Truyền chuỗi này vào `create_payos_payment_link(amount, description_ghep)`

**Lưu ý:** `payos_qr.py:91` đã có sẵn sanitize `re.sub(r"[^a-zA-Z0-9 ]", "", ...)[:25]` — không cần sửa file này.

### Việc 3: Webhook matching — KHÔNG CẦN SỬA

**File:** `payment_request_routes.py:920-942`

Webhook matching dùng substring search: `if code and code in desc`. Mã base36 vẫn nằm trong description → vẫn match được. **Không cần sửa gì.**

## Contract FE ↔ BE

**POST `/api/v1/payment-requests/{id}/payment-lines`** — thêm field:

```json
{
  "method": "qr",
  "amount": 5000000,
  "name_for_transfer": "Ha"   // ← MỚI: tên riêng không dấu, do sale chọn (tên KH hoặc tên bé)
}
```

**Response** — giữ nguyên, `transfer_code` sẽ chứa mã base36:

```json
{
  "payment_line": {
    "transfer_code": "A2B01",
    ...
  },
  "payos": {
    "transfer_content": "0383549120 Ha A2B01",
    ...
  }
}
```

## Lưu ý

- Mã cũ (`TT-xxx`) đã có trong DB vẫn hoạt động bình thường — hai format tồn tại song song
- PayOS chỉ chấp nhận chữ không dấu + số + khoảng trắng trong description
- Phần `CSNF8DAKF04` ở đầu nội dung CK là do PayOS/ngân hàng tự gắn, app không kiểm soát
- Nếu `name_for_transfer` không được gửi từ FE → fallback về format cũ (chỉ mã base36, không có tên)

## Tham khảo

- **PayOS API docs**: https://payos.vn/docs/
- **Test script xác nhận limit 25 chars**: `scripts/test_payos_description_limit.py`
- **Hàm tạo PayOS link**: `payos_qr.py:68-147`
- **Webhook handler**: `payment_request_routes.py:911-965`
