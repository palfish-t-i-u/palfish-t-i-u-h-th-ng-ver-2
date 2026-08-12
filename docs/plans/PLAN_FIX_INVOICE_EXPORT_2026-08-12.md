# Fix 3 file Excel xuất hóa đơn B4 — 12/08/2026

**Độ ưu tiên**: GẤP — hoàn thành trong ngày (trước 21-22h)
**Reporter**: Chị Sương Mai (15:30 12/08)
**Confirm gấp**: Anh Hiếu (15:33 12/08)

## Hiện tượng

Xuất HĐ cho AR-2026-0321 (Chị Hương, UID 3190649649, CC-1006-001):

| File | Cột | Giá trị sai | Giá trị đúng |
|------|-----|-------------|--------------|
| `01_1don_hang` | I "Tên sản phẩm*" | "Chị Hương" (tên khách) | Tên gói học |
| `03_sanpham1` | B "Tên sản phẩm (*)" | "Chị Hương" (tên khách) | Tên gói học |
| `02_khach_hang1` | E "Địa chỉ" | trống | Địa chỉ đầy đủ |

## Root cause

**RC1 — Tên sản phẩm**: `backend/activation_routes.py:1499` dùng `course.get("name")` — field này là **tên khách hàng** (buyer name). Tên gói học nằm ở `course["packageName"]`.

**RC2 — Địa chỉ**: `_course_to_tax_order()` (activation_routes.py:1500-1510) không trả field địa chỉ → `_build_excel_customers()` (invoice_routes.py:326) hardcode cột 5 = `""`.

## Task

### T1 — Fix "Tên sản phẩm" (File 01 + File 03)

**File**: `backend/activation_routes.py`, dòng 1499

```python
# ĐỔI dòng 1499 từ:
    product_name = _clean_text(course.get("name")) or _clean_text(course.get("code"))

# THÀNH:
    product_name = _clean_text(course.get("packageName")) or _clean_text(course.get("code"))
```

Không cần sửa gì ở `invoice_routes.py` — cả File 01 (dòng 239) và File 03 (dòng 391) đều đọc từ `taxProductName`/`goiHoc` đã được set đúng khi source đúng.

### T2 — Fix Địa chỉ trống (File 02)

**Bước 2a** — File `backend/activation_routes.py`, hàm `_course_to_tax_order()` (dòng 1491-1510)

Thêm assembly địa chỉ VÀ field `diaChi` vào return dict. Hàm `_invoice_addr_parts` đã có sẵn ở dòng 870 cùng file.

```python
# ĐỔI toàn bộ hàm _course_to_tax_order (dòng 1491-1510) thành:
def _course_to_tax_order(
    course: dict[str, Any],
    uid_block: dict[str, Any],
    ar_row: dict[str, Any],
    pr: dict[str, Any] | None,
    tax_invoice_code: str,
    tax_product_code: str,
) -> dict[str, Any]:
    product_name = _clean_text(course.get("packageName")) or _clean_text(course.get("code"))
    province, ward, street, country = _invoice_addr_parts(course, pr)
    if country and country.upper() != "VN":
        full_addr = country
    else:
        full_addr = ", ".join(p for p in [street, ward, province] if p)
    return {
        "taxInvoiceCode": tax_invoice_code,
        "taxProductCode": tax_product_code,
        "taxProductName": product_name,
        "goiHoc": product_name,
        "sdt": _course_display_phone(course, uid_block, pr),
        "tenKhach": _course_display_name(course, ar_row, pr),
        "tongTien": int(float(course.get("amount") or 0)),
        "m3ApprovedAt": course.get("invoiced_at") or ar_row.get("created_at") or "",
        "email": _clean_text(course.get("email") or (pr.get("email") if pr else "")),
        "diaChi": full_addr,
    }
```

**Bước 2b** — File `backend/invoice_routes.py`, hàm `_build_excel_customers()`, dòng 321-326

```python
# ĐỔI dòng 321-326 từ:
        row_vals = [
            row["_maKH"],           # 1  Mã KH/NCC = 84-SĐT
            "",                     # 2  Tên đơn vị
            row.get("tenKhach", ""),# 3  Tên người mua = họ tên khách
            "Khách hàng",           # 4  Loại
            "", "", "", "", "", "", "", "", "", "",  # 5–14
        ]

# THÀNH:
        row_vals = [
            row["_maKH"],                # 1  Mã KH/NCC = 84-SĐT
            "",                          # 2  Tên đơn vị
            row.get("tenKhach", ""),      # 3  Tên người mua = họ tên khách
            "Khách hàng",                # 4  Loại
            row.get("diaChi", ""),        # 5  Địa chỉ
            "", "", "", "", "", "", "", "", "",  # 6–14
        ]
```

## Verify

1. Chạy test hiện có:
```bash
cd backend && python -m pytest tests/test_invoice_address_gate.py -v
```
Expected: all pass (test này check gate logic, không bị ảnh hưởng).

2. Chạy dev server, mở app → tab B4 "Xuất hoá đơn" → chọn 1 đơn đã xuất (vd Chị Hương AR-2026-0321) → bấm "Xuất HĐ" → mở ZIP kiểm tra:
   - File `01_1don_hang`: cột I = tên gói (KHÔNG phải tên khách)
   - File `02_khach_hang1`: cột E = địa chỉ đầy đủ (KHÔNG trống)
   - File `03_sanpham1`: cột B = tên gói (KHÔNG phải tên khách)

3. Edge case kiểm tra thêm nếu có thời gian:
   - Đơn khách nước ngoài (OV) → cột E = tên quốc gia
   - Đơn không có packageName → fallback course code (vd CC-0042-001)
   - Đơn không có địa chỉ → cột E = "" (không crash)

## Đánh giá 5 tiêu chí

| # | Tiêu chí | P/F | Ghi chú |
|---|----------|-----|---------|
| 1 | Triệt để | P | Sửa đúng root cause (sai field + thiếu pipe), không workaround |
| 2 | Không lỗi con | P | `packageName` là field chuẩn; `_invoice_addr_parts` đã tested; fallback xử lý course không có packageName hoặc không có địa chỉ |
| 3 | Không tăng gánh hạ tầng | P | 2 file Python, 0 migration, 0 dependency |
| 4 | Tối ưu token | P | 2 task gộp 1 commit, reuse `_invoice_addr_parts` có sẵn |
| 5 | Bền vững context compact | P | Code trước/sau nguyên văn, file:line cụ thể, verify step có expected output |
