"""B0 — Pin hành vi bất biến của create/patch PR (Task 1: UID optional).

Các test này phải XANH cả trước lẫn sau khi thay đổi code.
Pins: invariants không đổi dù uid trở thành optional.
"""
from __future__ import annotations

import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from payment_request_routes import (  # noqa: E402
    PaymentRequestCreate,
    PaymentRequestPatch,
    _payment_request_insert_row,
    _payment_request_patch_row,
)


def _create(**kw) -> PaymentRequestCreate:
    base = dict(uid="uid1", name="Nguyễn Văn A", phone="0912345678", target=1_000_000,
                lead_source="online")
    base.update(kw)
    return PaymentRequestCreate(**base)


def _current_row(**kw) -> dict:
    base = {"uid": "uid1", "name": "Nguyễn Văn A", "phone": "0912345678",
            "child_name": "Bé Một"}
    base.update(kw)
    return base


# ---------------------------------------------------------------------------
# CREATE — đủ trường bắt buộc
# ---------------------------------------------------------------------------

class TestCreateRequiredFields:
    def test_create_full_returns_row(self):
        row = _payment_request_insert_row(_create())
        assert row["uid"] == "uid1"
        assert row["name"] == "Nguyễn Văn A"
        assert row["phone"] == "0912345678"
        assert row["target"] == 1_000_000
        assert row["state"] == "pending"

    def test_create_missing_name_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            _payment_request_insert_row(_create(name=None, ten_khach=None))
        assert exc.value.status_code == 400
        assert "name" in exc.value.detail

    def test_create_missing_phone_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            _payment_request_insert_row(_create(phone=None, sdt=None))
        assert exc.value.status_code == 400
        assert "phone" in exc.value.detail

    def test_create_target_zero_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            _payment_request_insert_row(_create(target=0))
        assert exc.value.status_code == 400
        assert "target" in exc.value.detail

    def test_create_target_negative_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            _payment_request_insert_row(_create(target=-1))
        assert exc.value.status_code == 400
        assert "target" in exc.value.detail


# ---------------------------------------------------------------------------
# CREATE — alias legacy
# ---------------------------------------------------------------------------

class TestCreateAliases:
    def test_alias_uid_khach_hang(self):
        row = _payment_request_insert_row(_create(uid=None, uid_khach_hang="u-alias"))
        assert row["uid"] == "u-alias"

    def test_alias_ten_khach(self):
        row = _payment_request_insert_row(_create(name=None, ten_khach="Tên Bằng Alias"))
        assert row["name"] == "Tên Bằng Alias"

    def test_alias_sdt(self):
        row = _payment_request_insert_row(_create(phone=None, sdt="0987654321"))
        assert row["phone"] == "0987654321"

    def test_alias_tong_tien(self):
        row = _payment_request_insert_row(_create(target=None, tong_tien_phai_thu=2_000_000))
        assert row["target"] == 2_000_000


# ---------------------------------------------------------------------------
# PATCH — PR có uid, sửa target/note → OK
# ---------------------------------------------------------------------------

class TestPatchWithExistingUid:
    def test_patch_target_ok(self):
        patch = _payment_request_patch_row(
            PaymentRequestPatch(target=2_000_000),
            _current_row(),
        )
        assert patch["target"] == 2_000_000
        assert "uid" not in patch  # uid không đổi khi không gửi

    def test_patch_note_ok(self):
        patch = _payment_request_patch_row(
            PaymentRequestPatch(note="ghi chú mới"),
            _current_row(),
        )
        assert patch["note"] == "ghi chú mới"

    def test_patch_uid_ok_when_pr_has_uid(self):
        """Gửi uid mới hợp lệ khi PR đã có uid → được cập nhật."""
        patch = _payment_request_patch_row(
            PaymentRequestPatch(uid="uid-moi"),
            _current_row(uid="uid-cu"),
        )
        assert patch["uid"] == "uid-moi"

    def test_patch_uid_new_value_updates(self):
        patch = _payment_request_patch_row(
            PaymentRequestPatch(uid="uid-moi-2"),
            _current_row(uid="uid-cu"),
        )
        assert patch["uid"] == "uid-moi-2"

    def test_patch_empty_body_only_housekeeping(self):
        """Body rỗng → patch chỉ có housekeeping (company_name=None từ individual logic + updated_at).
        Không có uid/name/phone/target thay đổi."""
        patch = _payment_request_patch_row(PaymentRequestPatch(), _current_row())
        assert "uid" not in patch
        assert "name" not in patch
        assert "phone" not in patch
        assert "target" not in patch


# ---------------------------------------------------------------------------
# B3 — Test ĐỎ: behavior MỚI (sẽ RED trên code cũ, GREEN sau bước 4)
# ---------------------------------------------------------------------------

class TestCreateUidOptionalNew:
    def test_create_without_uid_succeeds(self):
        """Tạo PR không UID → thành công, uid sentinel rỗng."""
        row = _payment_request_insert_row(_create(uid=None, lead_source="online"))
        assert row["uid"] == ""

    def test_create_missing_lead_source_raises_400(self):
        """lead_source trở thành bắt buộc khi uid không cần nữa."""
        with pytest.raises(HTTPException) as exc:
            _payment_request_insert_row(_create(lead_source=None))
        assert exc.value.status_code == 400
        assert "lead_source" in exc.value.detail


class TestPatchUidOptionalNew:
    def test_patch_uid_empty_when_pr_has_no_uid_allowed(self):
        """PR uid="" (chưa nhập) + PATCH gửi uid="" → không raise (bỏ guard cũ)."""
        patch = _payment_request_patch_row(
            PaymentRequestPatch(uid=""),
            _current_row(uid=""),
        )
        assert patch.get("uid") == "" or "uid" in patch

    def test_patch_uid_empty_when_pr_has_uid_raises_400(self):
        """Q1: CẤẤM clear uid khi PR đã có giá trị."""
        with pytest.raises(HTTPException) as exc:
            _payment_request_patch_row(
                PaymentRequestPatch(uid=""),
                _current_row(uid="uid-cu"),
            )
        assert exc.value.status_code == 400

    def test_patch_pr_with_empty_uid_can_update_target(self):
        """PR uid="" vẫn sửa được target/note — guard không khóa cứng PR này."""
        patch = _payment_request_patch_row(
            PaymentRequestPatch(target=3_000_000),
            _current_row(uid=""),
        )
        assert patch["target"] == 3_000_000
