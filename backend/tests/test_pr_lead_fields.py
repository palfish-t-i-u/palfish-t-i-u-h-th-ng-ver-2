from __future__ import annotations
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from payment_request_routes import (
    _apply_lead_fields, PaymentRequestCreate, PaymentRequestPatch,
)


def test_create_writes_lead_fields_and_stamps():
    body = PaymentRequestCreate(
        name="A", phone="0912345678", target=1,
        lead_source="quang_cao",
        sdt_goc=None, lead_matched=True, lead_id="L1",
        lead_matched_by="sdt",
    )
    row: dict = {}
    _apply_lead_fields(row, body, is_patch=False)
    assert row["lead_matched"] is True
    assert row["lead_id"] == "L1"
    assert row["lead_matched_by"] == "sdt"
    assert row["lead_check_at"]                       # stamped


def test_create_skips_when_no_lead_fields():
    body = PaymentRequestCreate(name="A", phone="0912345678", target=1,
                                lead_source="gia_han")
    row: dict = {}
    _apply_lead_fields(row, body, is_patch=False)
    assert "lead_check_at" not in row                 # không đụng


def test_patch_clears_to_null_when_sent_explicitly():
    # BUG cũ: bị skip. Fix: model_fields_set thấy field đã gửi → ghi null.
    body = PaymentRequestPatch(sdt_goc=None, lead_matched=None, lead_id=None,
                               lead_matched_by=None, ly_do_khong_ghep=None)
    patch: dict = {}
    _apply_lead_fields(patch, body, is_patch=True)
    assert patch["lead_matched"] is None
    assert patch["lead_id"] is None
    assert "lead_check_at" in patch                   # vẫn stamp


def test_patch_untouched_when_lead_fields_absent():
    body = PaymentRequestPatch(note="chỉ sửa note")
    patch: dict = {}
    _apply_lead_fields(patch, body, is_patch=True)
    assert patch == {}                                # không đụng cột lead


def test_invalid_ly_do_raises_422():
    import pytest
    from fastapi import HTTPException
    body = PaymentRequestPatch(ly_do_khong_ghep="SAI_MA")
    with pytest.raises(HTTPException) as e:
        _apply_lead_fields({}, body, is_patch=True)
    assert e.value.status_code == 422
