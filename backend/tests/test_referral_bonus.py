"""BE round-trip cho cộng buổi referral (nguồn = gioi_thieu).

Field referral sống trong active_requests.uids_data (JSONB) — không cần migration.
- PATCH: ActiveRequestPatchCoursePayload.model_dump() phải giữ 3 field referral.
- GET: _serialize_ar phải passthrough 3 field từ JSONB ra response.
DB-free (chỉ test Pydantic model + hàm thuần).
"""

from __future__ import annotations

import importlib


class TestReferralBonusPatchModel:
    def test_patch_course_model_persists_referral_fields(self):
        import activation_routes as ar

        ar = importlib.reload(ar)
        dumped = ar.ActiveRequestPatchCoursePayload(
            code="CC-0099-001",
            name="Gói X",
            amount=5_000_000,
            lead_source="gioi_thieu",
            referrer_uid="REFERRER_A",
            bonus_sessions_referee=2,
            bonus_sessions_referrer=3,
        ).model_dump()

        assert dumped["referrer_uid"] == "REFERRER_A"
        assert dumped["bonus_sessions_referee"] == 2
        assert dumped["bonus_sessions_referrer"] == 3

    def test_patch_course_model_defaults_referral_none(self):
        import activation_routes as ar

        ar = importlib.reload(ar)
        dumped = ar.ActiveRequestPatchCoursePayload(code="CC-1").model_dump()

        assert dumped["referrer_uid"] is None
        assert dumped["bonus_sessions_referee"] is None
        assert dumped["bonus_sessions_referrer"] is None


class TestReferralBonusSerialize:
    def test_serialize_ar_passes_through_referral_fields(self):
        import activation_routes as ar

        ar = importlib.reload(ar)
        row = {
            "id": "AR-2026-0099",
            "pr_id": "PR-2026-0099",
            "customer_name": "Khách B",
            "uids_data": [
                {
                    "uid": "BUYER_B",
                    "courses": [
                        {
                            "code": "CC-0099-001",
                            "name": "Gói X",
                            "amount": 5_000_000,
                            "lead_source": "gioi_thieu",
                            "referrer_uid": "REFERRER_A",
                            "bonus_sessions_referee": 2,
                            "bonus_sessions_referrer": 3,
                        }
                    ],
                }
            ],
        }

        course = ar._serialize_ar(row)["uids_data"][0]["courses"][0]

        assert course["referrer_uid"] == "REFERRER_A"
        assert course["bonus_sessions_referee"] == 2
        assert course["bonus_sessions_referrer"] == 3


def test_assign_course_codes_keeps_referral():
    from activation_routes import _assign_course_codes
    uids_in = [{
        "uid": "111",
        "courses": [{
            "name": "2/W- Both AB REFER 24 PHI+2 HN",
            "amount": 1_000_000,
            "lead_source": "gioi_thieu",
            "referrer_uid": "999",
            "bonus_sessions_referee": 2,
            "bonus_sessions_referrer": 3,
        }],
    }]
    out = _assign_course_codes(uids_in, pr_id="PR-2026-0001")
    course = out[0]["courses"][0]
    assert course["referrer_uid"] == "999"
    assert course["bonus_sessions_referee"] == 2
    assert course["bonus_sessions_referrer"] == 3


def test_assign_course_codes_omits_empty_referral():
    from activation_routes import _assign_course_codes
    uids_in = [{"uid": "111", "courses": [{"name": "Phil 48+5", "amount": 1000}]}]
    course = _assign_course_codes(uids_in, pr_id="PR-2026-0001")[0]["courses"][0]
    assert "referrer_uid" not in course
    assert "bonus_sessions_referee" not in course


# ---------------------------------------------------------------------------
# Message builder: referral lines in báo đơn notification
# ---------------------------------------------------------------------------

def _ref_msg(course_over):
    from utils.zalo_message_builder import build_activation_request_created_message
    ar = {
        "id": "AR-1", "customer_name": "Minh Phương",
        "uids_data": [{
            "uid": "3315152683", "name": "Minh Phương",
            "courses": [{"name": "2/W- Both AB REFER 24 PHI+2 HN", **course_over}],
        }],
    }
    pr = {"phone": "84-938572456", "country": "VN", "lead_source": "quang_cao",
          "lead_channel": "fb", "received": 14_320_000}
    return build_activation_request_created_message(
        ar, pr, {"display_name": "Kieu Thi Thu Quynh", "team": "Inhouse 1"}
    )["message"]


def test_referral_lines_removed_from_message():
    """27/8: chị Hiền yêu cầu bỏ khối thưởng giới thiệu khỏi tin DingTalk."""
    m = _ref_msg({"referrer_uid": "3312345678", "bonus_sessions_referee": 2, "bonus_sessions_referrer": 3})
    assert "🎁" not in m
    assert "Thưởng giới thiệu" not in m
    assert "Người giới thiệu" not in m
    assert "⚠ Gói giới thiệu" not in m
    # Đơn REFER vẫn hiện đúng info gói (tên gói, tiền, nguồn) — chỉ bỏ khối thưởng
    assert "REFER" in m


def test_referral_empty_no_warning_line():
    """Đơn REFER trống field referral cũng không hiện dòng ⚠ nữa."""
    m = _ref_msg({})
    assert "⚠ Gói giới thiệu" not in m
    assert "🎁" not in m


def test_referral_line_absent_for_non_referral():
    from utils.zalo_message_builder import build_activation_request_created_message
    ar = {"id": "AR-1", "customer_name": "Bé C",
          "uids_data": [{"uid": "111", "name": "Bé C", "courses": [{"name": "Phil 48+5"}]}]}
    pr = {"phone": "0900", "country": "VN", "lead_source": "quang_cao", "received": 1000}
    m = build_activation_request_created_message(ar, pr, {"display_name": "S", "team": "Inhouse 1"})["message"]
    assert "🎁" not in m and "⚠ Gói giới thiệu" not in m
