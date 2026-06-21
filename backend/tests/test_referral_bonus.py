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
