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
