"""Multi-con: extra_children + children API surface + student_name per line.

Plan: docs/superpowers/plans/2026-07-10-pr-multi-con-va-ar-modal-mo-rong.md
"""
from __future__ import annotations

import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from payment_request_routes import (  # noqa: E402
    PaymentLineCreate,
    PaymentRequestCreate,
    PaymentRequestPatch,
    _child_rename_map,
    _payment_request_insert_row,
    _payment_request_patch_row,
    _serialize_payment_request,
)


def _body(**kw):
    base = dict(uid="uid1", name="Me Bé", phone="0912345678", target=1000000,
                child_name="Bé Một")
    base.update(kw)
    return PaymentRequestCreate(**base)


class TestCreateWithChildren:
    def test_create_with_extra_children(self):
        row = _payment_request_insert_row(_body(
            children=[{"name": "Bé Một", "uid": "uid1"}, {"name": "Bé Hai"}],
        ))
        assert row["child_name"] == "Bé Một"
        assert row["extra_children"] == [{"name": "Bé Hai", "uid": None}]

    def test_create_single_child_no_extra(self):
        row = _payment_request_insert_row(_body())
        assert "extra_children" not in row

    def test_create_rejects_empty_extra_name(self):
        with pytest.raises(HTTPException):
            _payment_request_insert_row(_body(
                children=[{"name": "Bé Một"}, {"name": "  "}],
            ))

    def test_create_rejects_duplicate_names(self):
        with pytest.raises(HTTPException):
            _payment_request_insert_row(_body(
                children=[{"name": "Bé Một"}, {"name": "Bé Một"}],
            ))


class TestSerializeChildren:
    def test_serialize_children_full_list(self):
        out = _serialize_payment_request({
            "id": "PR-1", "uid": "uid1", "child_name": "Bé Một",
            "extra_children": [{"name": "Bé Hai", "uid": "uid2"}],
        })
        assert out["children"] == [
            {"name": "Bé Một", "uid": "uid1"},
            {"name": "Bé Hai", "uid": "uid2"},
        ]

    def test_serialize_no_children_when_single(self):
        out = _serialize_payment_request({"id": "PR-1", "uid": "uid1", "child_name": "Bé Một"})
        assert out["children"] == [{"name": "Bé Một", "uid": "uid1"}]
        assert out.get("extra_children") is None


class TestPatchChildren:
    def test_patch_extra_children(self):
        patch = _payment_request_patch_row(
            PaymentRequestPatch(children=[{"name": "Bé Một"}, {"name": "Bé Hai", "uid": "u2"}]),
            {"uid": "uid1", "name": "Me", "phone": "09", "child_name": "Bé Một"},
        )
        assert patch["child_name"] == "Bé Một"
        assert patch["extra_children"] == [{"name": "Bé Hai", "uid": "u2"}]

    def test_patch_children_none_keeps_current(self):
        patch = _payment_request_patch_row(
            PaymentRequestPatch(note="hi"),
            {"uid": "uid1", "name": "Me", "phone": "09", "child_name": "Bé Một"},
        )
        assert "extra_children" not in patch
        assert "child_name" not in patch


class TestStudentNamePerLine:
    def test_line_create_model_accepts_student_name(self):
        body = PaymentLineCreate(amount=100000, method="cash", student_name="Bé Hai")
        assert body.student_name == "Bé Hai"

    def test_rename_extra_child_builds_line_updates(self):
        old = [{"name": "Bé Hai", "uid": "u2"}]
        new = [{"name": "Bé Hai Sửa", "uid": "u2"}]
        assert _child_rename_map(old, new) == {"Bé Hai": "Bé Hai Sửa"}

    def test_rename_map_matches_by_position_without_uid(self):
        old = [{"name": "Bé Hai", "uid": None}]
        new = [{"name": "Bé Hai Mới", "uid": None}]
        assert _child_rename_map(old, new) == {"Bé Hai": "Bé Hai Mới"}

    def test_rename_map_empty_when_no_change(self):
        same = [{"name": "Bé Hai", "uid": "u2"}]
        assert _child_rename_map(same, same) == {}
