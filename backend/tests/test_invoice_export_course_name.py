"""Fix 12/8: xuất HĐ B4 sai "Tên sản phẩm" (hiện tên khách) + "Địa chỉ" trống.

Root cause: course["name"] (tên gói học, set lúc tạo AR) và tên khách hàng để
xuất HĐ đều dùng chung key "name" trong _build_invoice_course_patch — patch
tên khách ghi đè mất tên gói. Fix: tên khách dùng key riêng
"invoice_customer_name", "name" chỉ còn giữ đúng nghĩa tên gói học xuyên suốt.
Đồng thời bổ sung "diaChi" vào _course_to_tax_order() (trước đây không có,
cột 5 file khach_hang.xlsx luôn trống).

Xem docs/plans/PLAN_FIX_INVOICE_EXPORT_2026-08-12.md.
"""
from __future__ import annotations

import activation_routes as ar

FULL_PR = {
    "name": "Nguyễn Văn A",
    "phone": "0900000000",
    "province": "Thành phố Hà Nội",
    "ward": "Phường Hoàng Mai",
    "address": "119 Phúc Xá",
}


def _course(**over):
    base = {
        "code": "CC-0078-001",
        "name": "2/W- NEW 24 buoi",
        "amount": 4_550_000,
        "order_id": "752820050659",
        "invoiced": False,
    }
    base.update(over)
    return base


def test_issue_invoice_patch_does_not_clobber_package_name():
    """_build_invoice_course_patch ghi tên khách vào invoice_customer_name,
    KHÔNG được đụng vào "name" (tên gói học) của course."""
    course = _course()
    body = ar.IssueCourseInvoiceBody(
        name="Trần Thị B",
        phone="0911111111",
        province="Thành phố Hà Nội",
        ward="Phường Hoàng Mai",
        address="119 Phúc Xá",
    )
    patch = ar._build_invoice_course_patch(course, None, body)

    assert patch["invoice_customer_name"] == "Trần Thị B"
    assert "name" not in patch  # không được ghi đè key "name"


def test_course_to_tax_order_keeps_package_name_after_invoice_issued():
    """Course đã qua bước xuất HĐ (đã áp patch tên khách) — B4 export vẫn phải
    ra đúng tên gói học, không phải tên khách."""
    course = _course()
    body = ar.IssueCourseInvoiceBody(
        name="Trần Thị B",
        phone="0911111111",
        province="Thành phố Hà Nội",
        ward="Phường Hoàng Mai",
        address="119 Phúc Xá",
    )
    patch = ar._build_invoice_course_patch(course, None, body)
    course.update(patch)  # mô phỏng đúng những gì _issue_course_invoice_atomic làm với course dict

    order = ar._course_to_tax_order(course, {}, {"customer_name": ""}, None, "M260812001", "PF000001")

    assert order["taxProductName"] == "2/W- NEW 24 buoi"
    assert order["goiHoc"] == "2/W- NEW 24 buoi"
    assert order["tenKhach"] == "Trần Thị B"


def test_course_display_name_reads_invoice_customer_name_not_package_name():
    course = _course(invoice_customer_name="Trần Thị B")
    assert ar._course_display_name(course, {"customer_name": ""}, None) == "Trần Thị B"


def test_course_display_name_falls_back_when_no_invoice_customer_name():
    course = _course()  # chưa qua bước xuất HĐ — chưa có invoice_customer_name
    assert ar._course_display_name(course, {"customer_name": "Lê Văn C"}, None) == "Lê Văn C"


def test_dia_chi_uses_course_then_pr_fallback():
    course = _course(province="Thành phố Hà Nội", ward="Phường Hoàng Mai", address="119 Phúc Xá")
    assert ar._course_full_address(course, None) == "119 Phúc Xá, Phường Hoàng Mai, Thành phố Hà Nội"

    course_no_addr = _course()
    assert ar._course_full_address(course_no_addr, FULL_PR) == "119 Phúc Xá, Phường Hoàng Mai, Thành phố Hà Nội"


def test_dia_chi_empty_when_no_address_anywhere():
    assert ar._course_full_address(_course(), None) == ""


def test_course_to_tax_order_includes_dia_chi():
    course = _course()
    order = ar._course_to_tax_order(course, {}, {"customer_name": ""}, FULL_PR, "M260812001", "PF000001")
    assert order["diaChi"] == "119 Phúc Xá, Phường Hoàng Mai, Thành phố Hà Nội"


def test_build_excel_customers_writes_dia_chi_column_5():
    import io

    import openpyxl

    import invoice_routes as inv

    orders = [{
        "sdt": "0900000000",
        "tenKhach": "Trần Thị B",
        "diaChi": "119 Phúc Xá, Phường Hoàng Mai, Thành phố Hà Nội",
    }]
    data = inv._build_excel_customers(orders)
    wb = openpyxl.load_workbook(io.BytesIO(data))
    ws = wb.active

    assert ws.cell(row=1, column=5).value == "Địa chỉ"
    assert ws.cell(row=2, column=3).value == "Trần Thị B"
    assert ws.cell(row=2, column=5).value == "119 Phúc Xá, Phường Hoàng Mai, Thành phố Hà Nội"


def test_build_excel_customers_dia_chi_blank_when_missing():
    import io

    import openpyxl

    import invoice_routes as inv

    orders = [{"sdt": "0900000000", "tenKhach": "Trần Thị B"}]
    data = inv._build_excel_customers(orders)
    wb = openpyxl.load_workbook(io.BytesIO(data))
    ws = wb.active

    assert ws.cell(row=2, column=5).value is None
