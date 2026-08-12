# Bẫy field name trong course object (uids_data JSONB)

## Problem

Xuất 3 file Excel hóa đơn B4, cột "Tên sản phẩm" hiện **tên khách hàng** thay vì tên gói học.

## Trap

`course["name"]` trong `uids_data[].courses[]` JSONB **KHÔNG phải tên gói học** — đó là **tên khách hàng / người mua** (buyer name).

Tên gói học nằm ở `course["packageName"]` (vd "2/W-NEW 24 PHI+2 HN").

Hàm `_course_display_name()` (activation_routes.py:1466) cũng dùng `course["name"]` để lấy `tenKhach` — confirm rằng `name` = tên người, không phải tên sản phẩm.

## Insight

JSONB schema trong `uids_data` không có type safety ở BE (Python dict). FE có TypeScript interface `ActiveCourse` (paymentRequest.ts:146) phân biệt rõ `name?: string` vs `packageName: string`, nhưng BE truy cập bằng `course.get("...")` không có kiểm tra.

Khi viết code mới đọc course JSONB ở BE, luôn cross-check với FE interface `ActiveCourse` tại `frontend/src/types/paymentRequest.ts:146`.

## Rule

- `course["packageName"]` = tên gói học (dùng cho sản phẩm trên hóa đơn)
- `course["name"]` = tên khách hàng / người mua (KHÔNG dùng cho sản phẩm)
- Khi thêm field mới vào `_course_to_tax_order()`, luôn verify field name khớp FE type trước khi dùng
