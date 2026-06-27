"""Gate địa chỉ cho Yêu cầu/Xuất hoá đơn (kế toán 27/6).

Mirror logic FE getInvoiceBlockers: 1 course chỉ xuất HĐ được khi đủ
Order ID + tên gói + số tiền + địa chỉ (Tỉnh+Phường+Số nhà; khách OV chỉ cần quốc gia).
"""
from __future__ import annotations

import activation_routes as ar


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


FULL_PR = {"province": "Thành phố Hà Nội", "ward": "Phường Hoàng Mai", "address": "119 Phúc Xá"}


def _keys(course, pr):
    return ar._course_invoice_blockers(course, pr)


def test_du_dieu_kien_khong_blocker():
    assert ar._course_invoice_blockers(_course(), FULL_PR) == []


def test_thieu_order_id():
    assert any("Order ID" in b for b in _keys(_course(order_id=""), FULL_PR))
    assert any("Order ID" in b for b in _keys(_course(order_id="   "), FULL_PR))


def test_thieu_ten_goi_va_so_tien():
    assert any("tên gói" in b for b in _keys(_course(name=""), FULL_PR))
    assert any("số tiền" in b for b in _keys(_course(amount=0), FULL_PR))
    assert any("số tiền" in b for b in _keys(_course(amount=None), FULL_PR))


def test_thieu_dia_chi_can_du_3():
    assert any("địa chỉ" in b for b in _keys(_course(), {"province": "Hà Nội", "ward": "", "address": "119"}))
    assert any("địa chỉ" in b for b in _keys(_course(), {"province": "", "ward": "P. X", "address": "119"}))
    assert any("địa chỉ" in b for b in _keys(_course(), {"province": "Hà Nội", "ward": "P. X", "address": ""}))
    assert any("địa chỉ" in b for b in _keys(_course(), None))


def test_dia_chi_tren_course_bu_cho_pr_thieu():
    course = _course(province="Thành phố Hà Nội", ward="Phường Hoàng Mai", address="119 Phúc Xá")
    assert not any("địa chỉ" in b for b in _keys(course, None))


def test_khach_ov_chi_can_quoc_gia():
    # province = tên quốc gia nước ngoài → không bắt phường/số nhà
    assert not any("địa chỉ" in b for b in _keys(_course(), {"province": "United States", "ward": "", "address": ""}))
    assert not any("địa chỉ" in b for b in _keys(_course(), {"province": "Japan", "ward": "", "address": ""}))
    # OV nhưng thiếu Order ID vẫn chặn vì lý do khác
    assert _keys(_course(order_id=""), {"province": "Japan"}) == ["Order ID"]


def test_invoice_address_complete_helper():
    assert ar._invoice_address_complete("Hà Nội", "P. Hoàng Mai", "119") is True
    assert ar._invoice_address_complete("Hà Nội", "", "119") is False
    assert ar._invoice_address_complete("United States", "", "") is True  # OV
    assert ar._invoice_address_complete("", "", "") is False
