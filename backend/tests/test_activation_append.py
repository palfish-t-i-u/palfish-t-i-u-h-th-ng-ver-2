"""Append bé/gói vào Active Request có sẵn (báo đơn bổ sung lần 2, 18/7)."""
import pytest

from activation_routes import _assign_course_codes, _max_course_seq


def test_assign_course_codes_default_starts_at_1():
    out = _assign_course_codes([{"uid": "U1", "courses": [{"name": "G1", "amount": 100}]}], "PR-2026-0001")
    # _pr_digits("PR-2026-0001") → "0001"
    assert out[0]["courses"][0]["code"] == "CC-0001-001"


def test_assign_course_codes_start_seq_offset():
    out = _assign_course_codes(
        [{"uid": "U2", "courses": [{"name": "G2", "amount": 100}, {"name": "G3", "amount": 200}]}],
        "PR-2026-0001",
        start_seq=3,
    )
    codes = [c["code"] for c in out[0]["courses"]]
    assert codes == ["CC-0001-003", "CC-0001-004"]


def test_max_course_seq_reads_existing_codes():
    uids_data = [
        {"uid": "U1", "courses": [{"code": "CC-20260001-001"}, {"code": "CC-20260001-002"}]},
        {"uid": "U2", "courses": [{"code": "CC-20260001-005"}]},
    ]
    assert _max_course_seq(uids_data) == 5


def test_max_course_seq_ignores_malformed_and_empty():
    assert _max_course_seq([]) == 0
    assert _max_course_seq([{"uid": "U", "courses": [{"code": "JUNK"}, {"code": ""}, {}]}]) == 0


# ---- _merge_uid_blocks ----
from activation_routes import _merge_uid_blocks


def _block(uid, codes_amounts):
    return {
        "uid": uid,
        "courses": [{"code": c, "name": f"G{c[-1]}", "amount": a, "order_id": "", "invoiced": False}
                    for c, a in codes_amounts],
    }


def test_merge_new_uid_appends_block():
    existing = [_block("U1", [("CC-1-001", 100)])]
    new = [_block("U2", [("CC-1-002", 200)])]
    merged = _merge_uid_blocks(existing, new)
    assert len(merged) == 2
    assert merged[0]["uid"] == "U1" and merged[1]["uid"] == "U2"
    # existing không bị mutate object gốc
    assert len(existing[0]["courses"]) == 1


def test_merge_same_uid_extends_courses():
    existing = [_block("U1", [("CC-1-001", 100)])]
    new = [_block("U1", [("CC-1-002", 200)])]
    merged = _merge_uid_blocks(existing, new)
    assert len(merged) == 1
    assert [c["code"] for c in merged[0]["courses"]] == ["CC-1-001", "CC-1-002"]


def test_merge_preserves_existing_course_flags():
    existing = [_block("U1", [("CC-1-001", 100)])]
    existing[0]["courses"][0]["invoiced"] = True
    existing[0]["courses"][0]["order_id"] = "OD-9"
    merged = _merge_uid_blocks(existing, [_block("U1", [("CC-1-002", 200)])])
    assert merged[0]["courses"][0]["invoiced"] is True
    assert merged[0]["courses"][0]["order_id"] == "OD-9"


# ---- _append_children_core ----
from unittest.mock import MagicMock
from fastapi import HTTPException
from activation_routes import _append_children_core


def _fake_sb():
    """Fake supabase: mọi query trả data rỗng (không có AR khác, không conflict)."""
    sb = MagicMock()
    res = MagicMock()
    res.data = []
    # Handle any chain: table(...).select(...).eq(...).limit(...).execute()
    table_mock = MagicMock()
    table_mock.select.return_value = table_mock
    table_mock.eq.return_value = table_mock
    table_mock.limit.return_value = table_mock
    table_mock.execute.return_value = res
    sb.table.return_value = table_mock
    return sb


def _ar_row():
    return {
        "id": "AR-2026-9508",
        "pr_id": "PR-2026-0001",
        "uids_data": [_block("UID-1", [("CC-0001-001", 4_000_000)])],
    }


def _pr():
    return {"id": "PR-2026-0001", "target": 5_000_000, "received": 5_000_000}


def test_append_core_happy_codes_continue_and_merge():
    new_blocks, merged, status = _append_children_core(
        _fake_sb(), _ar_row(), _pr(),
        [{"uid": "UID-2", "courses": [{"name": "Gói B", "amount": 1_000_000}]}],
    )
    # _max_course_seq reads "001" from "CC-0001-001" → start_seq=2
    # _pr_digits("PR-2026-0001") → "0001" → code = "CC-0001-002"
    assert new_blocks[0]["courses"][0]["code"] == "CC-0001-002"
    assert len(merged) == 2
    assert status  # _derive_status trả string không rỗng


def test_append_core_over_budget_raises_422():
    with pytest.raises(HTTPException) as exc:
        _append_children_core(
            _fake_sb(), _ar_row(), _pr(),
            [{"uid": "UID-2", "courses": [{"name": "Gói B", "amount": 2_000_000}]}],  # 4+2 > 5
        )
    assert exc.value.status_code == 422


def test_append_core_empty_uids_raises_400():
    with pytest.raises(HTTPException) as exc:
        _append_children_core(_fake_sb(), _ar_row(), _pr(), [])
    assert exc.value.status_code == 400


def test_append_core_missing_course_name_raises():
    with pytest.raises(HTTPException):
        _append_children_core(
            _fake_sb(), _ar_row(), _pr(),
            [{"uid": "UID-2", "courses": [{"name": "", "amount": 500_000}]}],
        )
