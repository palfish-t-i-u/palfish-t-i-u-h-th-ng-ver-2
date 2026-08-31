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
        # 17/7 (a Hiếu chốt): bỏ header, "Phone:", Tổng = tiền thu PR (received),
        # Nguồn + Tổng ở footer chung. received vắng → fallback target.
        result = build_activation_request_created_message(
            _full_ar_data(), _full_pr_data(), _full_sale_info()
        )
        expected = (
            "Phone: 84-772333555​\n"
            "UID: 3307542974\n"
            "Thành Nam 9T, Phil 48+5 fix 2b/tuần\n"
            "Tiền: 8.500.000 VND\n"
            "Nguồn: Kho chung - Imperia\n"
            "Tổng: 8.500.000 VND\n"
            "Sale: Trần Thị B · Team Inhouse 2"
        )
        assert result["message"] == expected
        assert result["canonical_team_code"] == "Inhouse 2"

    def test_footer_total_equals_sum_of_per_course_amounts(self):
        # 14/8 (kế toán + sale chốt): mỗi con 1 dòng "Tiền"; footer Tổng = Σ dòng Tiền
        # (tiền thực nhận sale phân bổ), KHÔNG lấy received/target. received cố tình
        # LỆCH Σ gói để chứng minh Tổng bám Σ gói. Đảo quy tắc 29/7 (footer=received).
        ar_data = {
            "id": "AR-2026-0597",
            "customer_name": "",
            "uids_data": [
                {"uid": "3315147172", "name": "Cao Lê Thanh Thư", "phone": "986019442",
                 "country": "VN", "courses": [{"name": "2/W- NEW 48 PHI+5 HN", "amount": 9_340_500}]},
                {"uid": "3315396315", "name": "Cao Lê Nguyên Thư", "phone": "964892469",
                 "country": "VN", "courses": [{"name": "2/W- Both AB REFER 48 PHI+5 HN", "amount": 9_340_500}]},
            ],
        }
        pr_data = {"lead_source": "quang_cao", "lead_channel": "300531", "received": 20_000_000}
        sale_info = {"display_name": "Pham Thi Thao", "team": "Inhouse 1"}

        message = build_activation_request_created_message(ar_data, pr_data, sale_info)["message"]

        # mỗi con 1 dòng Tiền
        assert message.count("Tiền: 9.340.500 VND") == 2
        # Tiền nằm TRONG block (trước footer Nguồn/Tổng), không phải cuối tin
        assert message.index("Tiền: 9.340.500 VND") < message.index("Nguồn:")
        # đúng 1 Tổng = Σ gói (18.681.000), KHÔNG phải received 20.000.000
        assert message.count("Tổng:") == 1
        assert "Tổng: 18.681.000 VND" in message
        assert "Tổng: 20.000.000 VND" not in message

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
        # Nguồn giờ ở footer chung (1 lần), không lặp mỗi block
        assert message.count("Nguồn: Facebook") == 1
        assert result["canonical_team_code"] == "Offline"

    def test_mixed_source_prints_nguon_per_course(self):
        # Ca chị Kim Chi 17/8: 1 đơn 2 con KHÁC nguồn (Quảng cáo FB vs Kho Chung).
        # Trước: footer 1 dòng "Nguồn" cấp PR → con 2 hiện SAI. Nay: in Nguồn per-con
        # NGAY SAU dòng Tiền, KHÔNG có dòng Nguồn ở footer.
        ar_data = {
            "id": "AR-2026-0399",
            "customer_name": "",
            "uids_data": [
                {"uid": "3241004064", "name": "Minh Khôi", "phone": "936757113", "country": "VN",
                 "courses": [{"name": "2/W- NEW 48 PHI+5 HN", "amount": 9_010_000,
                              "lead_source": "quang_cao", "lead_channel": "300265"}]},
                {"uid": "3316511766", "name": "Minh Anh", "phone": "769120217", "country": "VN",
                 "courses": [{"name": "2/W- NEW 48 PHI+5 HN", "amount": 8_810_000,
                              "lead_source": "kho_chung", "lead_channel": None}]},
            ],
        }
        pr_data = {"lead_source": "quang_cao", "lead_channel": "300265"}  # cấp PR = con đầu
        sale_info = {"display_name": "Lê Kim Chi", "team": "Inhouse 1"}

        message = build_activation_request_created_message(ar_data, pr_data, sale_info)["message"]

        # mỗi con có dòng Nguồn riêng, đúng nguồn của con đó
        assert "Nguồn: Quảng cáo · FB - VN" in message
        assert "Nguồn: Kho Chung" in message
        assert message.count("Nguồn:") == 2  # per-con, footer KHÔNG có
        # con 2 (Minh Anh) KHÔNG bị gán nhầm sang Quảng cáo
        minh_anh_block = message.split("Phone: 84-769120217")[1]
        assert "Nguồn: Kho Chung" in minh_anh_block
        assert "Nguồn: Quảng cáo" not in minh_anh_block
        # thứ tự trong mỗi con: gói → Tiền → Nguồn (Nguồn NGAY SAU Tiền)
        assert message.index("Tiền: 9.010.000 VND") < message.index("Nguồn: Quảng cáo · FB - VN")
        assert message.index("Nguồn: Quảng cáo · FB - VN") < message.index("Tiền: 8.810.000 VND")
        assert message.index("Tiền: 8.810.000 VND") < message.index("Nguồn: Kho Chung")
        # Tổng vẫn đúng, 1 lần
        assert message.count("Tổng:") == 1
        assert "Tổng: 17.820.000 VND" in message

    def test_uniform_source_keeps_single_footer_nguon(self):
        # Đơn nhiều con CÙNG nguồn → giữ format cũ: 1 dòng Nguồn ở footer, không per-con.
        ar_data = {
            "id": "AR-2026-0600",
            "uids_data": [
                {"uid": "1", "name": "Bé A", "phone": "900000001", "country": "VN",
                 "courses": [{"name": "Gói A", "amount": 5_000_000,
                              "lead_source": "kho_chung"}]},
                {"uid": "2", "name": "Bé B", "phone": "900000002", "country": "VN",
                 "courses": [{"name": "Gói B", "amount": 3_000_000,
                              "lead_source": "kho_chung"}]},
            ],
        }
        message = build_activation_request_created_message(
            ar_data, {"lead_source": "kho_chung"}, {"team": "Inhouse 1"})["message"]
        assert message.count("Nguồn:") == 1  # đồng nhất → footer 1 dòng
        assert "Nguồn: Kho Chung" in message

    def test_single_course_source_differs_from_pr_prints_per_course(self):
        # PR-2026-1445 (30/8): sale đổi nguồn 1 gói Kho Chung → Gia hạn nhưng PR vẫn
        # Kho Chung. Đơn 1 gói ⇒ trước đây footer lấy nguồn cấp PR = "Kho Chung" (SAI).
        # Nay in "Nguồn: Gia hạn" per-con NGAY SAU Tiền, footer KHÔNG có dòng Nguồn.
        ar_data = {
            "id": "AR-2026-0700",
            "uids_data": [
                {"uid": "3298497046", "name": "Lưu Hoàng An Nhiên", "phone": "934862365",
                 "country": "VN",
                 "courses": [{"name": "2/W- NEW 96 PHI+10 HN", "amount": 16_520_000,
                              "lead_source": "gia_han", "lead_channel": None}]},
            ],
        }
        pr_data = {"lead_source": "kho_chung", "lead_channel": None}  # PR chưa đổi
        message = build_activation_request_created_message(
            ar_data, pr_data, {"team": "Inhouse 1"})["message"]

        assert message.count("Nguồn:") == 1  # per-con, footer KHÔNG có
        assert "Nguồn: Gia hạn" in message
        assert "Nguồn: Kho Chung" not in message
        assert message.index("Tiền: 16.520.000 VND") < message.index("Nguồn: Gia hạn")

    def test_missing_phone_uid_lead_falls_back_to_question_mark(self):
        ar_data = {
            "id": "AR-2026-0003",
            "uids_data": [{"courses": [{"name": "Gói C", "amount": 1_000_000}]}],
        }
        pr_data = {}
        sale_info = {"team": "Inhouse 1"}

        result = build_activation_request_created_message(ar_data, pr_data, sale_info)
        message = result["message"]

        assert "Phone: ?" in message
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
        pr_data = {"child_name": "Bé Sóc", "received": 5_000_000}
        sale_info = {"team": "Inhouse 2"}

        result = build_activation_request_created_message(ar_data, pr_data, sale_info)
        message = result["message"]

        assert "Bé Sóc, Gói A" in message
        assert "Bé Sóc, Gói B" in message
        # Tổng = Σ gói (2M + 3M = 5M)
        assert "Tổng: 5.000.000 VND" in message

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
        assert "Tổng: 4.200.000 VND" in result["message"]

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
        assert "Phone: 84-933903310" in r["message"]

    def test_phone_local_without_leading_zero_normalized_to_intl(self):
        ar = {"id": "AR-T2", "uids_data": [{"uid": "1", "phone": "933903310",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {}, {"team": "Inhouse 2"})
        assert "Phone: 84-933903310" in r["message"]

    def test_phone_already_intl_is_idempotent(self):
        ar = {"id": "AR-T3", "uids_data": [{"uid": "1", "phone": "84-772333555",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {}, {"team": "Inhouse 2"})
        assert "Phone: 84-772333555" in r["message"]

    def test_phone_empty_or_none_becomes_question_mark(self):
        ar = {"id": "AR-T4", "uids_data": [{"uid": "1", "phone": "",
              "courses": [{"name": "G", "amount": 1_000_000}]}]}
        r = build_activation_request_created_message(ar, {"phone": None}, {"team": "Inhouse 2"})
        assert "Phone: ?" in r["message"]

    def test_multi_uid_each_phone_normalized_independently(self):
        ar = {"id": "AR-T5", "uids_data": [
            {"uid": "111", "phone": "0933903310", "courses": [{"name": "A", "amount": 1}]},
            {"uid": "222", "phone": "84-900000002", "courses": [{"name": "B", "amount": 2}]},
        ]}
        r = build_activation_request_created_message(ar, {}, {"team": "Offline"})
        assert "Phone: 84-933903310" in r["message"]
        assert "Phone: 84-900000002" in r["message"]

    def test_pr_country_threaded_for_overseas_customer(self):
        ar = {"id": "AR-T6", "uids_data": [{"uid": "1", "phone": "0812345678",
              "courses": [{"name": "G", "amount": 1}]}]}
        pr = {"country": "TH"}
        r = build_activation_request_created_message(ar, pr, {"team": "Offline"})
        assert "Phone: 66-812345678" in r["message"]

    def test_uid_block_country_overrides_pr_country(self):
        ar = {"id": "AR-T7", "uids_data": [{"uid": "1", "phone": "13800138000",
              "country": "CN", "courses": [{"name": "G", "amount": 1}]}]}
        pr = {"country": "VN"}
        r = build_activation_request_created_message(ar, pr, {"team": "Offline"})
        assert "Phone: 86-13800138000" in r["message"]

    def test_tong_from_course_amount_when_received_zero(self):
        """received=0 (đơn thẻ/trả góp chưa verify) → Tổng = Σ amount gói, không hiện 0đ."""
        ar = {"uids_data": [{"uid": "123", "phone": "84-900000000", "courses": [{"name": "Gói A", "amount": 9_434_880}]}]}
        pr = {"target": 9_434_880, "received": 0, "child_name": "Bé An"}
        sale = {"display_name": "Sale A", "team": "Inhouse 1"}
        msg = build_activation_request_created_message(ar, pr, sale)["message"]
        assert "Tổng: 9.434.880 VND" in msg
        assert "Tổng: 0 VND" not in msg

    def test_card_order_total_uses_allocation_not_course_price(self):
        """Đơn tín dụng (chị Thảo Anh 14/8): received=0, target=giá gói gốc 20.160.000,
        nhưng sale phân bổ tiền THỰC NHẬN (sau phí thẻ) trên gói ⇒ Tổng = Σ allocation
        19.656.000, KHÔNG phải target. Regression cho bug footer lấy nhầm target."""
        ar = {"id": "AR-2026-0358", "customer_name": "", "uids_data": [
            {"uid": "3316206459", "name": "Phạm Tiến Đạt", "phone": "969612190", "country": "VN",
             "courses": [{"name": "2/W- NEW 48 PHI+5 HN", "amount": 10_530_000}]},
            {"uid": "3316344810", "name": "Phạm Minh Nguyệt", "phone": "986290867", "country": "VN",
             "courses": [{"name": "2/W- Both AB REFER 48 PHI+5 HN", "amount": 9_126_000,
                          "lead_source": "gioi_thieu", "referrer_uid": "3316206459",
                          "bonus_sessions_referee": 5, "bonus_sessions_referrer": 5}]},
        ]}
        pr = {"lead_source": "quang_cao", "lead_channel": "300431", "target": 20_160_000, "received": 0}
        sale = {"display_name": "Nguyen Thao Anh", "team": "Inhouse 1"}
        msg = build_activation_request_created_message(ar, pr, sale)["message"]
        assert "Tổng: 19.656.000 VND" in msg
        assert "Tổng: 20.160.000 VND" not in msg

    def test_supplementary_total_uses_pr_received_not_grand_total(self):
        """Đơn bổ sung (is_supplementary=True): block chỉ chứa gói MỚI (7.74M) nhưng
        Tổng phải = tiền LŨY KẾ toàn PR (received 17.32M), KHÔNG phải Σ block (7.74M).
        Case thật PR-2026-1070: upsell 48→96 buổi, KH đóng thêm 7.74M. Tiền≠Tổng cố ý."""
        ar = {"id": "AR-2026-0381", "uids_data": [
            {"uid": "3291469610", "phone": "81-7083630739",
             "courses": [{"name": "2/W- NEW 96 PHI+10 HN", "amount": 7_740_000}]},
        ]}
        pr = {"received": 17_320_000, "target": 17_320_000,
              "child_name": "Ichibakase Mio", "lead_channel": "Kho Chung"}
        sale = {"display_name": "Bui Thi Hong Van", "team": "Inhouse 1"}
        msg = build_activation_request_created_message(ar, pr, sale, is_supplementary=True)["message"]
        assert "Tiền: 7.740.000 VND" in msg   # dòng tiền = gói bổ sung
        assert "Tổng: 17.320.000 VND" in msg  # footer = lũy kế PR
        assert "Tổng: 7.740.000 VND" not in msg

    def test_supplementary_total_falls_back_to_target_when_received_zero(self):
        """is_supplementary=True nhưng received=0 (edge) → fallback target, KHÔNG dùng Σ block."""
        ar = {"id": "AR-X", "uids_data": [
            {"uid": "1", "phone": "84-900000000", "courses": [{"name": "Gói", "amount": 3_000_000}]},
        ]}
        pr = {"received": 0, "target": 12_000_000}
        sale = {"team": "Inhouse 1"}
        msg = build_activation_request_created_message(ar, pr, sale, is_supplementary=True)["message"]
        assert "Tổng: 12.000.000 VND" in msg
        assert "Tổng: 3.000.000 VND" not in msg

    def test_non_supplementary_default_keeps_grand_total(self):
        """Regression: mặc định is_supplementary=False → Tổng = Σ block như cũ,
        KHÔNG bị received cao hơn ghi đè. Bảo vệ mọi caller create/edit-resend/Zalo."""
        ar = {"id": "AR-Y", "uids_data": [
            {"uid": "1", "phone": "84-900000000", "courses": [{"name": "Gói", "amount": 7_740_000}]},
        ]}
        pr = {"received": 17_320_000, "target": 17_320_000}
        sale = {"team": "Inhouse 1"}
        msg = build_activation_request_created_message(ar, pr, sale)["message"]
        assert "Tổng: 7.740.000 VND" in msg
        assert "Tổng: 17.320.000 VND" not in msg


class TestBuildCourseActivatedMessage:
    """17/7 (a Hiếu chốt): tin course_activated NGẮN GỌN — SĐT + Sale + Order ID."""

    def test_full_data_short_format(self):
        req_data = {
            "id": "AR-2026-0010",
            "customer_name": "Nguyễn Văn A",
            "uids_data": [
                {
                    "uid": "3307542974",
                    "phone": "84-772333555",
                    "courses": [{"name": "Phil 48+5", "order_id": "756503406889218"}],
                }
            ],
        }
        sale_info = {"display_name": "Trần Thị B", "crm_name": "tran.b", "team": "Inhouse 2"}

        result = build_course_activated_message(req_data, sale_info)
        assert result["message"] == (
            "✅ ĐÃ TẠO GÓI HỌC THÀNH CÔNG\n"
            "SĐT: 84-772333555 · Sale Trần Thị B\n"
            "Order ID: 756503406889218"
        )
        assert result["canonical_team_code"] == "Inhouse 2"

    def test_multi_uid_collects_all_phones_and_order_ids(self):
        req_data = {
            "id": "AR-2026-0011",
            "uids_data": [
                {"uid": "111", "phone": "84-900000001", "courses": [{"name": "Gói A", "order_id": "oid1"}]},
                {"uid": "222", "phone": "84-900000002", "courses": [{"name": "Gói B", "order_id": "oid2"}]},
            ],
        }
        sale_info = {"display_name": "Sale X", "team": "Offline"}

        msg = build_course_activated_message(req_data, sale_info)["message"]
        assert "SĐT: 84-900000001, 84-900000002" in msg
        assert "Order ID: oid1, oid2" in msg

    def test_missing_uids_data_falls_back_to_question_marks(self):
        msg = build_course_activated_message({"id": "AR-2026-0012"}, {"team": "Inhouse 2"})["message"]
        assert "SĐT: ?" in msg
        assert "Order ID: ?" in msg

    def test_phone_fallback_from_pr_data(self):
        req_data = {"id": "AR-2026-0013", "uids_data": [{"uid": "999", "courses": [{"name": "Gói C", "order_id": "o9"}]}]}
        msg = build_course_activated_message(req_data, {"team": "Offline"}, pr_data={"phone": "84-111222333"})["message"]
        assert "SĐT: 84-111222333" in msg
        assert "Order ID: o9" in msg

    def test_order_id_missing_falls_back_to_question_mark(self):
        req_data = {"id": "AR-2026-0014", "uids_data": [{"uid": "1", "phone": "84-1", "courses": [{"name": "G"}]}]}
        msg = build_course_activated_message(req_data, {"team": "Offline"})["message"]
        assert "Order ID: ?" in msg

    def test_never_raises_on_empty_input(self):
        result = build_course_activated_message({}, {})
        assert isinstance(result["message"], str)
        assert result["canonical_team_code"] == "Khác"

    def test_non_list_uids_data_is_safe(self):
        result = build_course_activated_message(
            {"id": "X", "uids_data": "not-a-list"}, {"team": "IH2"}
        )
        assert isinstance(result["message"], str)
        assert "SĐT: ?" in result["message"]
        assert "Order ID: ?" in result["message"]


class TestBuildPaymentPaidMessageNetAmount:
    """Task B (13/7 rearchitecture) — nội dung 'ĐÃ VÀO TK' theo spec anh Hiếu:
    mã PR · lần #k · net vào TK · lũy kế/tổng. Net vẫn ưu tiên verified_received
    (card/installment đã kế toán xác nhận), fallback amount (gross) khi chưa có —
    khớp BE `_line_net` (G2). Xem docs/HANDOFF_DUC_2026-07-13_NOTIFICATION.md."""

    def _payment_data(self, **overrides) -> dict:
        base = {
            "id": "line-1",
            "payment_request_id": "PR-2026-0044",
            "customer_name": "Phạm Thị Kiều Oanh",
            "child_name": "Phạm Bảo Khánh",
            "phone": "767836839",
            "amount": 19_160_000,
            "method": "card",
            "paid_at": "2026-07-10T03:48:00+00:00",
            "installment_index": 1,
            "cumulative_net": 19_160_000,
            "target": 19_160_000,
        }
        base.update(overrides)
        return base

    def test_card_with_verified_received_shows_net(self):
        result = build_payment_paid_message(
            self._payment_data(verified_received=18_681_000, cumulative_net=18_681_000),
            {"display_name": "Nguyen Thi Hang Nga", "team": "Inhouse 1"},
        )
        assert "🔸 Net vào TK: 18,681,000 VND" in result["message"]

    def test_card_without_verified_received_falls_back_to_gross(self):
        result = build_payment_paid_message(
            self._payment_data(),  # không có verified_received
            {"team": "Inhouse 1"},
        )
        assert "🔸 Net vào TK: 19,160,000 VND" in result["message"]

    def test_installment_with_verified_received_shows_net(self):
        result = build_payment_paid_message(
            self._payment_data(
                method="installment", installment_platform="Payoo",
                verified_received=9_500_000, amount=10_000_000, cumulative_net=9_500_000,
            ),
            {"team": "Inhouse 2"},
        )
        assert "🔸 Net vào TK: 9,500,000 VND" in result["message"]
        assert "Trả góp Payoo" in result["message"]

    def test_cash_method_unaffected_by_verified_received(self):
        """Tiền mặt không có khái niệm phí — verified_received (nếu lỡ có) KHÔNG
        được áp dụng, số phải giữ nguyên amount gộp."""
        result = build_payment_paid_message(
            self._payment_data(method="cash", verified_received=999),
            {"team": "Inhouse 1"},
        )
        assert "🔸 Net vào TK: 19,160,000 VND" in result["message"]

    def test_qr_method_unaffected_by_verified_received(self):
        result = build_payment_paid_message(
            self._payment_data(method="qr", verified_received=999),
            {"team": "Inhouse 1"},
        )
        assert "🔸 Net vào TK: 19,160,000 VND" in result["message"]

    def test_verified_received_empty_string_treated_as_missing(self):
        result = build_payment_paid_message(
            self._payment_data(verified_received=""),
            {"team": "Inhouse 1"},
        )
        assert "🔸 Net vào TK: 19,160,000 VND" in result["message"]

    def test_never_raises_on_empty_input(self):
        result = build_payment_paid_message({}, {})
        assert isinstance(result["message"], str)
        assert "🔸 Net vào TK: 0 VND" in result["message"]

    def test_payment_paid_message_pr_focused_content(self):
        result = build_payment_paid_message(
            {
                "payment_request_id": "PR-2026-0221", "customer_name": "Nguyễn Văn A",
                "child_name": "Bin", "phone": "0900000000", "country": "VN", "method": "card",
                "verified_received": 24_785_680, "amount": 25_240_000,
                "paid_at": "2026-07-12T02:12:00+00:00",
                "installment_index": 2, "cumulative_net": 27_785_680, "target": 35_000_000,
            },
            {"display_name": "Hoa", "team": "Inhouse 1"},
        )
        msg = result["message"]
        assert "PR-2026-0221" in msg and "Lần #2" in msg
        assert "24,785,680" in msg
        assert "27,785,680 / 35,000,000" in msg


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

