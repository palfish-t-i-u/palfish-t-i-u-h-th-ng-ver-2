"""
Workstream B3 (Đức) — unit tests for build_activation_request_created_message.

Run: cd backend && pytest tests/test_zalo_builder.py -v
"""
from __future__ import annotations

from utils.zalo_message_builder import (
    _format_vnd_dots,
    build_activation_request_created_message,
    build_course_activated_message,
    build_payment_paid_message,
)


def _full_ar_data() -> dict:
    return {
        "id": "AR-2026-0001",
        "customer_name": None,
        "uids_data": [
            {
                "uid": "3307542974",
                "phone": "84-772333555",
                "courses": [
                    {"name": "Phil 48+5 fix 2b/tuần", "amount": 8_500_000},
                ],
            }
        ],
    }


def _full_pr_data() -> dict:
    return {
        "id": "PR-2026-0001",
        "name": None,
        "child_name": "Thành Nam 9T",
        "phone": None,
        "lead_source": None,
        "lead_channel": "Kho chung - Imperia",
        "target": 8_500_000,
    }


def _full_sale_info() -> dict:
    return {"display_name": "Trần Thị B", "crm_name": None, "team": "Inhouse 2"}


class TestFormatVndDots:
    def test_format_vnd_dots_basic(self):
        assert _format_vnd_dots(8_500_000) == "8.500.000 VNĐ"

    def test_format_vnd_dots_zero_or_invalid(self):
        assert _format_vnd_dots(0) == "0 VNĐ"
        assert _format_vnd_dots(None) == "0 VNĐ"
        assert _format_vnd_dots("garbage") == "0 VNĐ"

    def test_format_vnd_dots_does_not_use_comma(self):
        # Regression: _format_vnd (comma, no space) must stay untouched —
        # this is the NEW dot-separated variant only.
        result = _format_vnd_dots(1_500_000)
        assert "," not in result
        assert result == "1.500.000 VNĐ"


class TestBuildActivationRequestCreatedMessage:
    def test_full_data_matches_handoff_sample_format(self):
        result = build_activation_request_created_message(
            _full_ar_data(), _full_pr_data(), _full_sale_info()
        )
        expected = (
            "🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-2026-0001\n"
            "SĐT: 84-772333555​\n"
            "UID: 3307542974\n"
            "Thành Nam 9T, Phil 48+5 fix 2b/tuần\n"
            "Nguồn: Kho chung - Imperia\n"
            "Tổng: 8.500.000 VNĐ\n"
            "Sale: Trần Thị B · Team Inhouse 2"
        )
        assert result["message"] == expected
        assert result["canonical_team_code"] == "Inhouse 2"

    def test_multi_uid_produces_multiple_blocks_separated_by_blank_line(self):
        ar_data = {
            "id": "AR-2026-0002",
            "customer_name": "Gia đình Nam",
            "uids_data": [
                {
                    "uid": "111",
                    "phone": "84-900000001",
                    "courses": [{"name": "Gói A", "amount": 5_000_000}],
                },
                {
                    "uid": "222",
                    "phone": "84-900000002",
                    "courses": [{"name": "Gói B", "amount": 3_000_000}],
                },
            ],
        }
        pr_data = {"lead_channel": "Facebook"}
        sale_info = {"display_name": "Sale X", "team": "Offline"}

        result = build_activation_request_created_message(ar_data, pr_data, sale_info)
        message = result["message"]

        assert "UID: 111" in message
        assert "UID: 222" in message
        # 2 blocks -> exactly one blank-line separator between them
        assert "\n\n" in message
        assert message.count("Nguồn: Facebook") == 2
        assert result["canonical_team_code"] == "Offline"

    def test_missing_phone_uid_lead_falls_back_to_question_mark(self):
        ar_data = {
            "id": "AR-2026-0003",
            "uids_data": [{"courses": [{"name": "Gói C", "amount": 1_000_000}]}],
        }
        pr_data = {}
        sale_info = {"team": "Inhouse 1"}

        result = build_activation_request_created_message(ar_data, pr_data, sale_info)
        message = result["message"]

        assert "SĐT: ?" in message
        assert "UID: ?" in message
        assert "Nguồn: ?" in message

    def test_multiple_courses_in_one_uid_each_get_own_line(self):
        ar_data = {
            "id": "AR-2026-0004",
            "uids_data": [
                {
                    "uid": "999",
                    "phone": "84-911111111",
                    "courses": [
                        {"name": "Gói A", "amount": 2_000_000},
                        {"name": "Gói B", "amount": 3_000_000},
                    ],
                }
            ],
        }
        pr_data = {"child_name": "Bé Sóc"}
        sale_info = {"team": "Inhouse 2"}

        result = build_activation_request_created_message(ar_data, pr_data, sale_info)
        message = result["message"]

        assert "Bé Sóc, Gói A" in message
        assert "Bé Sóc, Gói B" in message
        # Tổng = sum of both courses
        assert "Tổng: 5.000.000 VNĐ" in message

    def test_team_ih2_alias_resolves_to_canonical_inhouse_2(self):
        result = build_activation_request_created_message(
            _full_ar_data(), _full_pr_data(), {"team": "IH2", "display_name": "Sale Y"}
        )
        assert result["canonical_team_code"] == "Inhouse 2"

    def test_amount_fallback_to_pr_target_when_course_missing_amount(self):
        ar_data = {
            "id": "AR-2026-0005",
            "uids_data": [{"uid": "1", "phone": "84-1", "courses": [{"name": "Gói D"}]}],
        }
        pr_data = {"target": 4_200_000}
        sale_info = {"team": "Inhouse 2"}

        result = build_activation_request_created_message(ar_data, pr_data, sale_info)
        assert "Tổng: 4.200.000 VNĐ" in result["message"]

    def test_never_raises_on_empty_or_malformed_input(self):
        # Empty dicts
        result = build_activation_request_created_message({}, {}, {})
        assert isinstance(result["message"], str)
        assert result["canonical_team_code"] == "Khác"

        # uids_data is not a list, courses not a list, uid_block not a dict
        garbage_ar = {"id": "AR-X", "uids_data": "not-a-list"}
        result2 = build_activation_request_created_message(garbage_ar, {}, {})
        assert isinstance(result2["message"], str)

        garbage_ar2 = {"id": "AR-Y", "uids_data": [{"uid": "1", "courses": "not-a-list"}, "not-a-dict"]}
        result3 = build_activation_request_created_message(garbage_ar2, {}, {})
        assert isinstance(result3["message"], str)

    def test_phone_local_with_leading_zero_normalized_to_intl(self):
        ar = {"id": "AR-T1", "uids_data": [{"uid": "1", "phone": "0933903310",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {}, {"team": "Inhouse 2"})
        assert "SĐT: 84-933903310" in r["message"]

    def test_phone_local_without_leading_zero_normalized_to_intl(self):
        ar = {"id": "AR-T2", "uids_data": [{"uid": "1", "phone": "933903310",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {}, {"team": "Inhouse 2"})
        assert "SĐT: 84-933903310" in r["message"]

    def test_phone_already_intl_is_idempotent(self):
        ar = {"id": "AR-T3", "uids_data": [{"uid": "1", "phone": "84-772333555",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {}, {"team": "Inhouse 2"})
        assert "SĐT: 84-772333555" in r["message"]

    def test_phone_empty_or_none_becomes_question_mark(self):
        ar = {"id": "AR-T4", "uids_data": [{"uid": "1", "phone": "",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {"phone": None}, {"team": "Inhouse 2"})
        assert "SĐT: ?" in r["message"]

    def test_multi_uid_each_phone_normalized_independently(self):
        ar = {"id": "AR-T5", "uids_data": [
            {"uid": "111", "phone": "0933903310", "courses": [{"name": "A", "amount": 1}]},
            {"uid": "222", "phone": "84-900000002", "courses": [{"name": "B", "amount": 2}]},
        ]}
        r = build_activation_request_created_message(ar, {}, {"team": "Offline"})
        assert "SĐT: 84-933903310" in r["message"]
        assert "SĐT: 84-900000002" in r["message"]

    def test_pr_country_threaded_for_overseas_customer(self):
        ar = {"id": "AR-T6", "uids_data": [{"uid": "1", "phone": "0812345678",
              "courses": [{"name": "G", "amount": 1}]}]}
        pr = {"country": "TH"}
        r = build_activation_request_created_message(ar, pr, {"team": "Offline"})
        assert "SĐT: 66-812345678" in r["message"]

    def test_uid_block_country_overrides_pr_country(self):
        ar = {"id": "AR-T7", "uids_data": [{"uid": "1", "phone": "13800138000",
              "country": "CN", "courses": [{"name": "G", "amount": 1}]}]}
        pr = {"country": "VN"}
        r = build_activation_request_created_message(ar, pr, {"team": "Offline"})
        assert "SĐT: 86-13800138000" in r["message"]


class TestBuildCourseActivatedMessage:
    """Workstream C2 (Giang) — unit tests for enriched build_course_activated_message."""

    def test_full_data_produces_enriched_format(self):
        req_data = {
            "id": "AR-2026-0010",
            "customer_name": "Nguyễn Văn A",
            "uids_data": [
                {
                    "uid": "3307542974",
                    "phone": "84-772333555",
                    "courses": [
                        {"name": "Phil 48+5 fix 2b/tuần"},
                        {"name": "Gói Toán 12T"},
                    ],
                }
            ],
        }
        sale_info = {"display_name": "Trần Thị B", "crm_name": "tran.b", "team": "Inhouse 2"}

        result = build_course_activated_message(req_data, sale_info)
        msg = result["message"]

        assert msg.startswith("✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC")
        assert "KH: Nguyễn Văn A · Sale Trần Thị B · Team Inhouse 2" in msg
        assert "SĐT: 84-772333555 · UID: 3307542974" in msg
        assert "Gói: Phil 48+5 fix 2b/tuần, Gói Toán 12T" in msg
        assert result["canonical_team_code"] == "Inhouse 2"

    def test_multi_uid_collects_all_phones_and_uids(self):
        req_data = {
            "id": "AR-2026-0011",
            "customer_name": "Bé Sóc",
            "uids_data": [
                {"uid": "111", "phone": "84-900000001", "courses": [{"name": "Gói A"}]},
                {"uid": "222", "phone": "84-900000002", "courses": [{"name": "Gói B"}]},
            ],
        }
        sale_info = {"display_name": "Sale X", "team": "Offline"}

        result = build_course_activated_message(req_data, sale_info)
        msg = result["message"]

        assert "SĐT: 84-900000001, 84-900000002" in msg
        assert "UID: 111, 222" in msg
        assert "Gói: Gói A, Gói B" in msg
        assert result["canonical_team_code"] == "Offline"

    def test_missing_uids_data_falls_back_to_question_marks(self):
        req_data = {"id": "AR-2026-0012", "customer_name": "Test KH"}
        sale_info = {"team": "Inhouse 2"}

        result = build_course_activated_message(req_data, sale_info)
        msg = result["message"]

        assert "SĐT: ? · UID: ?" in msg
        assert "Gói: ?" in msg

    def test_phone_fallback_from_pr_data(self):
        req_data = {
            "id": "AR-2026-0013",
            "customer_name": "KH Fallback",
            "uids_data": [
                {"uid": "999", "courses": [{"name": "Gói C"}]},  # no phone in uid_block
            ],
        }
        sale_info = {"team": "Offline"}
        pr_data = {"phone": "84-111222333"}

        result = build_course_activated_message(req_data, sale_info, pr_data=pr_data)
        msg = result["message"]

        assert "SĐT: 84-111222333" in msg

    def test_customer_fallback_from_pr_name(self):
        req_data = {"id": "AR-2026-0014", "uids_data": [{"uid": "1", "courses": [{"name": "G"}]}]}
        sale_info = {"team": "Offline"}
        pr_data = {"name": "Khách từ PR"}

        result = build_course_activated_message(req_data, sale_info, pr_data=pr_data)
        assert "KH: Khách từ PR" in result["message"]

    def test_never_raises_on_empty_input(self):
        result = build_course_activated_message({}, {})
        assert isinstance(result["message"], str)
        assert result["canonical_team_code"] == "Khác"

    def test_non_list_uids_data_is_safe(self):
        result = build_course_activated_message(
            {"id": "X", "uids_data": "not-a-list"}, {"team": "IH2"}
        )
        assert isinstance(result["message"], str)
        assert "SĐT: ? · UID: ?" in result["message"]


class TestBuildPaymentPaidMessageNetAmount:
    """Task B (10/7) — báo tiền quẹt thẻ/trả góp ưu tiên verified_received
    (thực nhận sau phí), fallback amount (gross) khi không có. Xem
    docs/superpowers/plans/2026-07-10-bao-tien-net-amount.md."""

    def _payment_data(self, **overrides) -> dict:
        base = {
            "id": "line-1",
            "customer_name": "Phạm Thị Kiều Oanh",
            "child_name": "Phạm Bảo Khánh",
            "phone": "767836839",
            "amount": 19_160_000,
            "method": "card",
            "paid_at": "2026-07-10T03:48:00+00:00",
        }
        base.update(overrides)
        return base

    def test_card_with_verified_received_shows_thuc_nhan(self):
        result = build_payment_paid_message(
            self._payment_data(verified_received=18_681_000),
            {"display_name": "Nguyen Thi Hang Nga", "team": "Inhouse 1"},
        )
        assert "🔸 Thực nhận: 18,681,000 VND" in result["message"]
        assert "Gross" not in result["message"]

    def test_card_without_verified_received_falls_back_to_gross(self):
        result = build_payment_paid_message(
            self._payment_data(),  # không có verified_received
            {"team": "Inhouse 1"},
        )
        assert "🔸 Số tiền (Gross): 19,160,000 VND" in result["message"]
        assert "Thực nhận" not in result["message"]

    def test_installment_with_verified_received_shows_thuc_nhan(self):
        result = build_payment_paid_message(
            self._payment_data(
                method="installment", installment_platform="Payoo",
                verified_received=9_500_000, amount=10_000_000,
            ),
            {"team": "Inhouse 2"},
        )
        assert "🔸 Thực nhận: 9,500,000 VND" in result["message"]
        assert "Trả góp Payoo" in result["message"]

    def test_cash_method_unaffected_by_verified_received(self):
        """Tiền mặt không có khái niệm phí — verified_received (nếu lỡ có) KHÔNG
        được áp dụng, label/số phải giữ nguyên 'Số tiền' + amount gộp."""
        result = build_payment_paid_message(
            self._payment_data(method="cash", verified_received=999),
            {"team": "Inhouse 1"},
        )
        assert "🔸 Số tiền: 19,160,000 VND" in result["message"]
        assert "Thực nhận" not in result["message"]
        assert "Gross" not in result["message"]

    def test_qr_method_unaffected_by_verified_received(self):
        result = build_payment_paid_message(
            self._payment_data(method="qr", verified_received=999),
            {"team": "Inhouse 1"},
        )
        assert "🔸 Số tiền: 19,160,000 VND" in result["message"]
        assert "Thực nhận" not in result["message"]

    def test_verified_received_empty_string_treated_as_missing(self):
        result = build_payment_paid_message(
            self._payment_data(verified_received=""),
            {"team": "Inhouse 1"},
        )
        assert "🔸 Số tiền (Gross): 19,160,000 VND" in result["message"]

    def test_never_raises_on_empty_input(self):
        result = build_payment_paid_message({}, {})
        assert isinstance(result["message"], str)
        assert "🔸 Số tiền: 0 VND" in result["message"]


class TestMultiChildNames:
    """Multi-con (10/7) — tin Zalo hiện đúng tên bé theo lần TT / uid-block.
    Plan: docs/superpowers/plans/2026-07-10-pr-multi-con-va-ar-modal-mo-rong.md"""

    def test_payment_paid_prefers_line_student_name(self):
        result = build_payment_paid_message(
            {
                "customer_name": "Me Bé", "child_name": "Bé Một",
                "student_name": "Bé Hai", "amount": 100000, "method": "cash",
                "phone": "0912345678",
            },
            {"display_name": "Sale A", "team": "Inhouse 1"},
        )
        assert "Bé Hai" in result["message"]
        assert "Bé Một" not in result["message"]

    def test_payment_paid_falls_back_to_child_name(self):
        result = build_payment_paid_message(
            {
                "customer_name": "Me Bé", "child_name": "Bé Một",
                "amount": 100000, "method": "cash", "phone": "0912345678",
            },
            {"team": "Inhouse 1"},
        )
        assert "Bé Một" in result["message"]

    def test_activation_created_uses_block_name(self):
        result = build_activation_request_created_message(
            {"id": "AR-1", "uids_data": [
                {"uid": "u1", "courses": [{"name": "Gói A", "amount": 1000}]},
                {"uid": "u2", "name": "Bé Hai", "courses": [{"name": "Gói B", "amount": 2000}]},
            ]},
            {"id": "PR-1", "child_name": "Bé Một", "phone": "0912345678",
             "country": "VN", "target": 3000},
            {"display_name": "Sale A", "team": "Inhouse 2"},
        )
        msg = result["message"]
        # Block không có name → fallback child_name PR (hành vi cũ); block có name → tên bé đó
        assert "Bé Một, Gói A" in msg
        assert "Bé Hai, Gói B" in msg

