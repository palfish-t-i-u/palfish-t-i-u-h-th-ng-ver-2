# Bẫy: 1 key JSONB dùng cho 2 nghĩa khác nhau tuỳ thời điểm ghi

**Problem**: Xuất hoá đơn B4 (`don_hang.xlsx`) hiện "Tên sản phẩm" = tên khách hàng thay vì tên gói học. Báo lỗi 12/8, chị Sương Mai + anh Hiếu.

**Trap**: `course["name"]` (1 course trong `active_requests.uids_data[].courses[]`, JSONB) được ghi ở **2 thời điểm khác nhau với 2 nghĩa khác nhau**, và lần ghi sau âm thầm đè lần ghi trước:

1. Lúc tạo AR (`_assign_course_codes` → `_course_name(c)`, `activation_routes.py`): `name` = **tên gói học**.
2. Lúc Ops bấm "Xuất hoá đơn" cho course đó (`_build_invoice_course_patch`, nhận `IssueCourseInvoiceBody` — form có customer_type/email/phone/address, rõ ràng là form nhập **thông tin khách hàng**): field `body.name` (tên khách) bị ghi đè thẳng vào **cùng key** `course["name"]`.

Vì cả 2 lần ghi dùng chung 1 key trên cùng 1 dict, không có gì cảnh báo — code compile sạch, mọi field đều "có giá trị", chỉ là giá trị sai nghĩa. Bug chỉ lộ ra ở bước xuất Excel (đọc lại `course.get("name")` mong đợi tên gói, nhưng course đã qua bước xuất-hoá-đơn nên giá trị đã là tên khách).

**Vì sao khó phát hiện qua review code thường**: `_course_display_name()` (dùng cho field `tenKhach` — tên khách trong export) đọc đúng `course.get("name")` **và ra kết quả ĐÚNG** (vì đó chính xác là tên khách sau khi bị ghi đè) — khiến người review dễ nghĩ "field name đang hoạt động đúng", không nhận ra nó đang đọc nhầm ý nghĩa ở chỗ khác (`_course_to_tax_order`'s `product_name`).

**Insight**: khi 1 field JSONB được ghi từ ≥2 code path độc lập (2 form/2 bước nghiệp vụ khác nhau), luôn tự hỏi: "field này còn được đọc lại ở chỗ nào khác, với kỳ vọng nghĩa gì?" — không chỉ kiểm tra path ghi hiện tại có đúng không.

**Rule**: Đừng dùng chung 1 key JSONB cho 2 khái niệm nghiệp vụ khác nhau dù type giống nhau (cả 2 đều là `str`, đều tên "name"). Đặt tên key theo NGHĨA nghiệp vụ cụ thể (`invoice_customer_name` khác `name`/tên gói học), không đặt theo kiểu dữ liệu chung chung. Khi thêm 1 form/1 bước ghi mới vào 1 dict đã có sẵn field cùng tên, luôn grep toàn bộ các nơi ĐỌC key đó trước khi ghi đè.

**Fix**: tách key — `_build_invoice_course_patch` ghi tên khách vào `course["invoice_customer_name"]` (key mới, chưa từng dùng), `_course_display_name()` đọc key mới này. `course["name"]` từ nay chỉ còn 1 nghĩa duy nhất (tên gói học) xuyên suốt vòng đời course, không bị chạm tới sau khi tạo.

**Liên quan**: `docs/plans/PLAN_FIX_INVOICE_EXPORT_2026-08-12.md`, `backend/tests/test_invoice_export_course_name.py`.
