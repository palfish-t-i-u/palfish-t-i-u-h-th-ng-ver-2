"""Regression 23/10: full-PATCH /active-requests/{id} thay cả uids_data từ model_dump → client
không gửi care_channel/care_contact_id/handover_note (màn B3) → null đè → mất dữ liệu sale điền
lúc báo đơn (AR-1746, AR-1753). _preserve_handover_fields giữ giá trị đang có khi nhận None."""
import pytest

try:
    from activation_routes import _preserve_handover_fields
except Exception as exc:  # thiếu fastapi ở máy dev → bỏ qua, CI có đủ
    pytest.skip(f"activation_routes import: {exc}", allow_module_level=True)


def _cur():
    return [{"uid": "1", "courses": [
        {"code": "C1", "care_channel": "Zalo", "care_contact_id": "84-9", "handover_note": "note"},
        {"code": "C2", "care_channel": "Zalo", "care_contact_id": "", "handover_note": None},
    ]}]


def test_none_keeps_existing():
    new = [{"uid": "1", "courses": [{"code": "C1", "care_channel": None, "care_contact_id": None, "handover_note": None}]}]
    _preserve_handover_fields(_cur(), new)
    assert new[0]["courses"][0] == {"code": "C1", "care_channel": "Zalo", "care_contact_id": "84-9", "handover_note": "note"}


def test_explicit_value_or_empty_string_wins():
    new = [{"uid": "1", "courses": [{"code": "C1", "care_channel": "Viber", "care_contact_id": "", "handover_note": None}]}]
    _preserve_handover_fields(_cur(), new)
    c = new[0]["courses"][0]
    assert c["care_channel"] == "Viber" and c["care_contact_id"] == "" and c["handover_note"] == "note"


def test_new_course_and_empty_old_untouched():
    new = [{"uid": "1", "courses": [{"code": "C2", "care_channel": None, "care_contact_id": None},
                                     {"code": "C9", "care_channel": None}]}]
    _preserve_handover_fields(_cur(), new)
    assert new[0]["courses"][0]["care_channel"] == "Zalo"
    assert new[0]["courses"][0]["care_contact_id"] is None   # cũ rỗng → không có gì để giữ
    assert new[0]["courses"][1] == {"code": "C9", "care_channel": None}
