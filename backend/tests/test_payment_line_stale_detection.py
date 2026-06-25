"""Stale detection cho transfer_content của payment_lines.

Bối cảnh: sau khi sale PATCH PR (name/phone/childName/country),
content cũ lưu trên line PENDING không còn khớp với PR hiện tại.
Helper _is_payment_line_content_stale phát hiện điều này.
"""
from __future__ import annotations

import payment_request_routes as pr


def _line(**over):
    """Build line dict cho test. Default = PENDING qr line khớp PR fixture."""
    base = {
        "id": "line-1",
        "method": "qr",
        "status": "pending",
        "transfer_code": "FHETL",
        "transfer_content": "84985004656 Nguyen Thi Phuong Linh FHETL",
        "name_for_transfer": "Nguyễn Thị Phương Linh",
    }
    base.update(over)
    return base


def _pr(**over):
    base = {
        "id": "PR-2026-0066",
        "name": "Trần Xuân",
        "child_name": "Nguyễn Thị Phương Linh",
        "phone": "985004656",
        "country": "VN",
    }
    base.update(over)
    return base


class TestStaleDetection:
    def test_not_stale_when_pr_matches_stored_content(self):
        assert pr._is_payment_line_content_stale(_pr(), _line()) is False

    def test_stale_when_pr_phone_changed(self):
        assert pr._is_payment_line_content_stale(
            _pr(phone="906698067"), _line()
        ) is True

    def test_stale_when_pr_child_name_changed(self):
        assert pr._is_payment_line_content_stale(
            _pr(child_name="Tran Hoang Yen Nhi"), _line()
        ) is True

    def test_stale_when_pr_country_changed(self):
        # country đổi từ VN (dial 84) sang SG (dial 65) → phone prefix khác
        assert pr._is_payment_line_content_stale(
            _pr(country="SG"), _line()
        ) is True

    def test_stale_when_pr_name_changed_and_line_used_parent_name(self):
        line = _line(
            name_for_transfer="Trần Xuân",
            transfer_content="84985004656 Tran Xuan FHETL",
        )
        assert pr._is_payment_line_content_stale(
            _pr(name="Nguyễn Văn B"), line
        ) is True

    def test_not_stale_when_pr_name_changed_but_line_used_child_name(self):
        # Sale chọn child_name → đổi tên cha không ảnh hưởng
        assert pr._is_payment_line_content_stale(
            _pr(name="Đổi Tên Cha Mới"), _line()
        ) is False

    def test_not_stale_when_line_is_paid(self):
        # Line đã PAID không cần warning (sale không còn sửa được nữa)
        assert pr._is_payment_line_content_stale(
            _pr(phone="906698067"), _line(status="paid")
        ) is False

    def test_not_stale_when_line_is_cancelled(self):
        assert pr._is_payment_line_content_stale(
            _pr(phone="906698067"),
            _line(status="rejected", reject_reason="Sales huỷ lần thanh toán"),
        ) is False

    def test_not_stale_when_line_is_not_qr_method(self):
        # cash/card/installment không có QR → không cần stale check
        assert pr._is_payment_line_content_stale(
            _pr(phone="906698067"), _line(method="cash")
        ) is False

    def test_null_name_for_transfer_falls_back_to_child_then_name(self):
        # Line cũ trước migration → name_for_transfer = NULL → default childName
        line = _line(name_for_transfer=None)
        # PR khớp child_name → not stale
        assert pr._is_payment_line_content_stale(_pr(), line) is False
        # PR đổi child_name → stale
        assert pr._is_payment_line_content_stale(
            _pr(child_name="Đổi Tên Con"), line
        ) is True

    def test_null_name_and_no_child_name_falls_back_to_pr_name(self):
        line = _line(
            name_for_transfer=None,
            transfer_content="84985004656 Tran Xuan FHETL",
        )
        prow = _pr(child_name=None)
        assert pr._is_payment_line_content_stale(prow, line) is False
        assert pr._is_payment_line_content_stale(
            _pr(name="Khac", child_name=None), line
        ) is True
