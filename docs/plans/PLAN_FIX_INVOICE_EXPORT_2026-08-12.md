# Fix xuất hóa đơn B4 — "Tên sản phẩm" sai + "Địa chỉ" trống (12/08/2026)

> Ghi chú: file này ban đầu được nhắc tới trong yêu cầu task nhưng KHÔNG tồn tại
> trong repo (đã kiểm tra toàn bộ git history mọi branch + filesystem). Nội
> dung dưới đây là kết quả tự truy vết lại từ đầu dựa trên báo cáo lỗi của chị
> Sương Mai + anh Hiếu (15:30 12/8) và code thật, không phải chép lại plan cũ.

## Báo lỗi gốc

Xuất hóa đơn B4 ra 3 file Excel, 2 lỗi:
1. Cột "Tên sản phẩm*" (file `don_hang.xlsx`) hiện **tên khách hàng** thay vì tên gói học.
2. Cột "Địa chỉ" (file `khach_hang.xlsx`) luôn **trống**.

## Root cause (lỗi 1 — nghiêm trọng hơn mô tả ban đầu)

Không phải lỗi đọc nhầm tên field đơn giản. `course["name"]` bị dùng cho **2 nghĩa xung đột** trong cùng vòng đời 1 course:

1. Lúc tạo AR (`_assign_course_codes`, `activation_routes.py:287`): `course["name"]` = **tên gói học** (`_course_name(c)`).
2. Lúc Ops "Xuất hoá đơn" cho 1 course (`_build_invoice_course_patch`, gọi từ `_issue_course_invoice_atomic`): form nhập **thông tin khách hàng** để xuất hoá đơn (customer_type/email/phone/address/tax_code...) — và trước fix, field tên khách trong form này (`IssueCourseInvoiceBody.name`) bị ghi đè thẳng vào **cùng key `course["name"]`** (`activation_routes.py:931` cũ).

→ Ngay khi Ops xuất hoá đơn 1 course (bước bắt buộc trước khi xuất Excel B4), `course["name"]` bị ghi đè từ "tên gói học" → "tên khách hàng". Đến lúc `_course_to_tax_order()` đọc `course.get("name")` cho `taxProductName`/`goiHoc`, giá trị đã bị hỏng từ trước.

`_course_display_name()` (dùng cho `tenKhach`) đọc đúng key `course["name"]` ĐẦU TIÊN — hàm này vốn được thiết kế giả định "name" đã là tên khách (đúng ý đồ ban đầu của tác giả), nhưng lại trùng key với tên gói học ở bước tạo AR — đây chính là chỗ collision.

## Fix (2 file, không migration)

### `backend/activation_routes.py`

1. **`_build_invoice_course_patch`**: đổi key ghi tên khách từ `"name"` → **`"invoice_customer_name"`** (3 chỗ: tuple patch, `setdefault` fallback từ PR, đọc lại để validate). `course["name"]` từ nay **không bao giờ bị đụng tới** sau khi tạo — giữ đúng nghĩa tên gói học xuyên suốt.
2. **`_course_display_name`**: đổi key đọc đầu tiên từ `"name"` → `"invoice_customer_name"` (khớp key mới ở #1).
3. **Mới**: `_course_full_address(course, pr)` — dùng lại đúng `_invoice_addr_parts()` đã có sẵn (ưu tiên địa chỉ course, fallback PR — cùng nguồn với gate `_course_invoice_blockers`), nối `street, ward, province` bằng `", "`.
4. **`_course_to_tax_order`**: thêm field `"diaChi": _course_full_address(course, pr)` vào dict trả về.

`_course_to_tax_order`'s `product_name = course.get("name")` **giữ nguyên, không đổi** — vì sau khi fix #1+#2, key này không còn bị ghi đè nữa nên luôn đúng. (Ban đầu nghĩ phải đổi sang đọc `course.get("packageName")` nhưng key đó chưa từng được ghi ở đâu cả — đổi read-key mà không có nơi ghi sẽ ra rỗng, không sửa được gì. Xem thêm `docs/learnings/invoice-export-course-field-naming-trap.md`.)

### `backend/invoice_routes.py`

- `_build_excel_customers`: cột 5 ("Địa chỉ") đổi từ hardcode `""` → `row.get("diaChi", "")`.

## Test

- `backend/tests/test_invoice_address_gate.py` — không đổi, chạy lại xác nhận không regression (9/9 pass, không đụng logic gate).
- `backend/tests/test_invoice_export_course_name.py` — **file test mới**, 9 case:
  - Patch xuất HĐ không đụng `course["name"]`.
  - `_course_to_tax_order` giữ đúng tên gói học sau khi course đã qua bước xuất HĐ (mô phỏng đúng thứ tự patch → export).
  - `_course_display_name` đọc đúng `invoice_customer_name`, có fallback khi chưa xuất HĐ.
  - `_course_full_address`: ưu tiên course, fallback PR, rỗng khi không có gì.
  - `_course_to_tax_order` có field `diaChi`.
  - `_build_excel_customers` ghi đúng cột 5 (đọc lại bằng openpyxl), và để trống khi thiếu `diaChi` (không crash).
- Đã xác nhận bằng `git stash`: 8/9 test mới **fail đúng như kỳ vọng** trên code cũ (proof test thật sự bắt được bug), sau khi pop lại toàn bộ pass.
- Full suite `backend/tests/` (752 test): pass hết, chỉ còn 1 fail hoàn toàn không liên quan (`test_zalo_integration.py` — template text Zalo, không đụng tới bởi fix này).

## Không làm (ngoài phạm vi)

- `_course_invoice_blockers` (gate "Yêu cầu xuất HĐ") vẫn đọc `course.get("name")` cho check "thiếu tên gói học" — không đổi, vẫn đúng vì "name" giờ luôn là tên gói học.
- Không backfill dữ liệu cũ: những course ĐÃ bị hỏng `name` từ trước (do bug cũ) vẫn còn sai — không migration nên không tự sửa được. Ops cần vào sửa lại tên gói qua UI edit sẵn có (`saveCourseRow` — patch AR-level `uids_data`, key `name` đúng theo Pydantic model) rồi xuất lại HĐ nếu cần đối chiếu lại các đơn đã lỡ xuất sai hôm nay.

## Verify thủ công còn thiếu (cần Ops làm trên sandbox/prod thật)

Chưa xuất thử 1 HĐ thật qua UI để soi 3 file Excel (cần tài khoản Ops + dữ liệu AR đủ điều kiện) — phần này ngoài khả năng test tự động, cần chị Sương Mai/anh Hiếu xác nhận sau khi deploy.
