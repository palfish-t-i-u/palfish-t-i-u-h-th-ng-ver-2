"""Gate thông tin khách cho Yêu cầu/Xuất hoá đơn — chuẩn kế toán Sương Mai 26/8 (thuế NĐ 70/2025).

Mirror logic FE getInvoiceBlockers (ActivationTab.tsx) — sửa rule thì sửa CẢ HAI:
- Khách KHÔNG lấy HĐ (wants_invoice falsy): không cần thông tin khách (kể cả địa chỉ).
- Khách VN lấy HĐ: họ tên đầy đủ + số CCCD + email + địa chỉ Tỉnh + Phường/Xã
  (SỐ NHÀ KHÔNG bắt buộc).
- Khách OV lấy HĐ: họ tên + CCCD/hộ chiếu + email + tên nước.
- Doanh nghiệp: không blocker thông tin cá nhân mới.
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


# Khách KHÔNG lấy HĐ — mọi thông tin khách trống.
NON_TAKER_PR = {"province": "", "ward": "", "address": ""}

# Khách VN LẤY HĐ, đủ chuẩn 26/8 (số nhà để trống chủ đích — không bắt buộc).
TAKER_PR = {
    "wants_invoice": True,
    "invoice_customer_name": "Nguyễn Thị Hằng",
    "tax_id": "001204012345",
    "email": "hang@example.com",
    "province": "Thành phố Hà Nội",
    "ward": "Phường Hoàng Mai",
    "address": "",
}

# Khách OV LẤY HĐ (hộ chiếu, địa chỉ = tên nước).
OV_TAKER_PR = {
    "wants_invoice": True,
    "invoice_customer_name": "Nguyen Kim Bich",
    "tax_id": "C1234567",
    "email": "bich@example.com",
    "province": "Czechia",
    "ward": "",
    "address": "",
    "country": "CZ",
}


def _keys(course, pr):
    return ar._course_invoice_blockers(course, pr)


# ── Khách KHÔNG lấy HĐ ────────────────────────────────────────────────────────

def test_non_taker_khong_can_thong_tin_khach():
    assert ar._course_invoice_blockers(_course(), NON_TAKER_PR) == []
    assert ar._course_invoice_blockers(_course(), None) == []
    assert ar._course_invoice_blockers(_course(), {"wants_invoice": False}) == []


def test_thieu_order_id():
    assert any("Order ID" in b for b in _keys(_course(order_id=""), NON_TAKER_PR))
    assert any("Order ID" in b for b in _keys(_course(order_id="   "), NON_TAKER_PR))


def test_thieu_ten_goi_va_so_tien():
    assert any("tên gói" in b for b in _keys(_course(name=""), NON_TAKER_PR))
    assert any("số tiền" in b for b in _keys(_course(amount=0), NON_TAKER_PR))
    assert any("số tiền" in b for b in _keys(_course(amount=None), NON_TAKER_PR))


# ── Khách VN lấy HĐ ──────────────────────────────────────────────────────────

def test_taker_vn_du_chuan_khong_blocker():
    assert ar._course_invoice_blockers(_course(), TAKER_PR) == []


def test_taker_vn_dia_chi_tinh_xa_du_so_nha_khong_bat_buoc():
    assert any("địa chỉ" in b for b in _keys(_course(), {**TAKER_PR, "ward": ""}))
    assert any("địa chỉ" in b for b in _keys(_course(), {**TAKER_PR, "province": ""}))
    # Số nhà trống → KHÔNG blocker địa chỉ.
    assert not any("địa chỉ" in b for b in _keys(_course(), {**TAKER_PR, "address": ""}))
    # Message không còn đòi số nhà.
    addr_blockers = [b for b in _keys(_course(), {**TAKER_PR, "ward": ""}) if "địa chỉ" in b]
    assert addr_blockers and "Số nhà" not in addr_blockers[0]


def test_taker_vn_thieu_ho_ten_cccd_email():
    assert any("họ tên" in b for b in _keys(_course(), {**TAKER_PR, "invoice_customer_name": ""}))
    assert any("CCCD" in b for b in _keys(_course(), {**TAKER_PR, "tax_id": ""}))
    assert any("email" in b for b in _keys(_course(), {**TAKER_PR, "email": ""}))


def test_taker_ho_ten_khong_fallback_ten_goi_hang_ngay():
    """pr["name"] ("Chị Hằng") KHÔNG được tính là họ tên đầy đủ."""
    pr = {**TAKER_PR, "invoice_customer_name": "", "name": "Chị Hằng"}
    assert any("họ tên" in b for b in _keys(_course(), pr))


def test_taker_gia_tri_per_course_bu_cho_pr():
    course = _course(
        invoice_customer_name="Nguyễn Thị Hằng",
        tax_code="001204012345",
        email="hang@example.com",
    )
    pr = {**TAKER_PR, "invoice_customer_name": "", "tax_id": "", "email": ""}
    assert ar._course_invoice_blockers(course, pr) == []


def test_dia_chi_tren_course_bu_cho_pr_thieu():
    course = _course(province="Thành phố Hà Nội", ward="Phường Hoàng Mai")
    assert not any("địa chỉ" in b for b in _keys(course, {**TAKER_PR, "province": "", "ward": ""}))


# ── Khách OV lấy HĐ ──────────────────────────────────────────────────────────

def test_taker_ov_du_chuan_khong_blocker():
    assert ar._course_invoice_blockers(_course(), OV_TAKER_PR) == []


def test_taker_ov_van_bat_ho_ten_ho_chieu_email():
    assert any("CCCD" in b for b in _keys(_course(), {**OV_TAKER_PR, "tax_id": ""}))
    assert any("họ tên" in b for b in _keys(_course(), {**OV_TAKER_PR, "invoice_customer_name": ""}))
    assert any("email" in b for b in _keys(_course(), {**OV_TAKER_PR, "email": ""}))


def test_taker_ov_nhan_dien_qua_country_code():
    """Country code != VN → foreign, bỏ check địa chỉ dù province trống (fix Czechia 18/7)."""
    assert not any("địa chỉ" in b for b in _keys(_course(), {**OV_TAKER_PR, "province": ""}))


def test_non_taker_ov_khong_blocker():
    assert ar._course_invoice_blockers(_course(), {"province": "Japan", "ward": "", "address": ""}) == []


# ── Doanh nghiệp ─────────────────────────────────────────────────────────────

def test_business_taker_khong_doi_thong_tin_ca_nhan():
    pr = {
        "wants_invoice": True,
        "customer_type": "business",
        "invoice_customer_name": "",
        "tax_id": "",
        "email": "",
        "province": "Thành phố Hà Nội",
        "ward": "Phường Hoàng Mai",
        "address": "",
    }
    assert ar._course_invoice_blockers(_course(), pr) == []
    assert any("địa chỉ" in b for b in _keys(_course(), {**pr, "ward": ""}))


# ── Helpers ──────────────────────────────────────────────────────────────────

def test_invoice_address_complete_helper():
    assert ar._invoice_address_complete("Hà Nội", "P. Hoàng Mai", "119") is True
    assert ar._invoice_address_complete("Hà Nội", "P. Hoàng Mai", "") is True  # số nhà optional (26/8)
    assert ar._invoice_address_complete("Hà Nội", "", "119") is False
    assert ar._invoice_address_complete("United States", "", "") is True  # OV province-name
    assert ar._invoice_address_complete("", "", "") is False


def test_ov_country_code_bypass():
    """Country code != VN → foreign, skip address check (fix Czechia bug 18/7)."""
    assert ar._invoice_address_complete("Czechia", "", "", "CZ") is True
    assert ar._invoice_address_complete("", "", "", "CZ") is True
    assert ar._invoice_address_complete("", "", "", "US") is True
    assert ar._invoice_address_complete("", "", "", "VN") is False
