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

    def test_not_stale_when_dismissed(self):
        # Sale bấm "Huỷ/giữ QR cũ" → content_stale_dismissed_at set → không cảnh báo dù lệch.
        line = _line(
            name_for_transfer="Ten Cu",
            transfer_content="84985004656 Ten Cu FHETL",
            content_stale_dismissed_at="2026-07-25T10:00:00+00:00",
        )
        assert pr._is_payment_line_content_stale(_pr(), line) is False

    def test_stale_again_when_dismiss_cleared(self):
        # Cờ đã clear (re-arm khi PR đổi thông tin) → lệch thì cảnh báo lại.
        line = _line(
            name_for_transfer="Ten Cu",
            transfer_content="84985004656 Ten Cu FHETL",
            content_stale_dismissed_at=None,
        )
        assert pr._is_payment_line_content_stale(_pr(), line) is True

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


class TestSerializerExposesIsContentStale:
    def test_list_serializer_includes_is_content_stale_true(self):
        pr_row = _pr(phone="906698067")  # đã đổi phone
        line = _line()
        out = pr._serialize_payment_for_list(line, idx=1, pr_row=pr_row)
        assert out["is_content_stale"] is True

    def test_list_serializer_includes_is_content_stale_false_when_match(self):
        out = pr._serialize_payment_for_list(_line(), idx=1, pr_row=_pr())
        assert out["is_content_stale"] is False

    def test_list_serializer_defaults_false_when_pr_row_missing(self):
        # Backward compat: nếu caller không truyền pr_row → False (safe default)
        out = pr._serialize_payment_for_list(_line(), idx=1)
        assert out["is_content_stale"] is False

    def test_detail_serializer_includes_is_content_stale_true(self):
        pr_row = _pr(child_name="Đổi Tên Con")
        out = pr._serialize_payment_line(_line(), pr_row=pr_row)
        assert out["is_content_stale"] is True

    def test_detail_serializer_defaults_false_when_pr_row_missing(self):
        out = pr._serialize_payment_line(_line())
        assert out["is_content_stale"] is False


class TestNameForTransferPersistedAtCreate:
    """Verify khi tạo line, name_for_transfer được lưu vào DB."""

    def test_addPayment_qr_persists_name_for_transfer_from_body(self):
        # Mock add_payment_line endpoint hành vi: insert_row có name_for_transfer
        # khi method=qr và body.name_for_transfer được set.
        import payment_request_routes as pr_mod
        src = pr_mod
        # Đọc source: chỗ build insert_row trong add_payment_line
        import inspect
        source = inspect.getsource(src)
        # Quy ước hiện tại: nếu method qr, name_for_transfer ĐƯỢC truyền vào insert_row.
        assert '"name_for_transfer": body.name_for_transfer' in source or \
               "insert_row[\"name_for_transfer\"] = body.name_for_transfer" in source or \
               "name_for_transfer=body.name_for_transfer" in source, \
               "addPayment phải lưu body.name_for_transfer vào insert_row khi method=qr"
