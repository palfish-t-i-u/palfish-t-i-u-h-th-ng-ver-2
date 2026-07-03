"""Tests for utils.team_mapper and utils.zalo_message_builder."""

import os
import sys
import unittest
import logging
from datetime import datetime, timezone

# Add backend directory to sys.path so we can import utils
sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend")),
)

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.utils.zalo_message_builder import (
        build_payment_paid_message,
        build_course_activated_message,
    )
    from backend.utils.team_mapper import get_canonical_team
else:
    from utils.zalo_message_builder import (  # type: ignore
        build_payment_paid_message,
        build_course_activated_message,
    )
    from utils.team_mapper import get_canonical_team  # type: ignore


class TestZaloMessageBuilder(unittest.TestCase):

    def setUp(self):
        self.logger = logging.getLogger("utils.zalo_message_builder")
        self.logger.setLevel(logging.WARNING)

    # --- build_payment_paid_message ---

    def test_build_payment_paid_message_success(self):
        payment_data = {
            "id": "123",
            "payment_request_id": "PR_001",
            "customer_name": "Nguyen Van A",
            "amount": 1500000,
            "method": "QR Code",
            # UTC → should be converted to Asia/Ho_Chi_Minh
            "paid_at": datetime(2023, 10, 1, 10, 0, 0, tzinfo=timezone.utc),
        }
        sale_info = {
            "crm_name": "Tran Thi B",
            "team": "HN inhouse",
        }

        result = build_payment_paid_message(payment_data, sale_info)

        # 10:00 UTC → 17:00 Asia/Ho_Chi_Minh
        expected = (
            "💰 Đã vào - KH Nguyen Van A | Sale Tran Thi B · Team HN inhouse | 1,500,000đ | 01/10/2023 17:00"
        )
        self.assertEqual(result["message"], expected)
        self.assertEqual(result["canonical_team_code"], "Inhouse 1")

    def test_build_payment_paid_message_graceful_degradation(self):
        with self.assertLogs(
            "utils.zalo_message_builder", level="WARNING"
        ):
            result = build_payment_paid_message(
                {"id": "999"}, {}
            )

            expected = (
                "💰 Đã vào - KH Unknown | Sale Unknown · Team ? | 0đ | N/A"
            )
            self.assertEqual(result["message"], expected)
            self.assertEqual(result["canonical_team_code"], "Kh\u00e1c")

    # --- build_course_activated_message ---

    def test_build_course_activated_message_success(self):
        # Format enriched phải khớp SQL fn trong
        # backend/migrations/2026-07-02-zalo-course-activated-enrich.sql
        req_data = {
            "id": "456",
            "customer_name": "Le Van C",
            "uids_data": [
                {
                    "uid": "3307542974",
                    "phone": "84-772333555",
                    "courses": [
                        {"name": "Khoa Hoc Tieng Anh 1 Nam", "amount": 8500000},
                    ],
                },
            ],
        }
        sale_info = {
            "crm_name": "Nguyen Thi D",
            "team": "HCM (Online)",
        }

        result = build_course_activated_message(req_data, sale_info)

        expected = (
            "✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC\n"
            "KH: Le Van C · Sale Nguyen Thi D · Team HCM (Online)\n"
            "SĐT: 84-772333555 · UID: 3307542974\n"
            "Gói: Khoa Hoc Tieng Anh 1 Nam"
        )
        self.assertEqual(result["message"], expected)
        self.assertEqual(result["canonical_team_code"], "HCM (Online)")

    def test_build_course_activated_message_graceful_degradation(self):
        with self.assertLogs(
            "utils.zalo_message_builder", level="WARNING"
        ):
            result = build_course_activated_message({"id": "888"}, {})

            expected = (
                "✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC\n"
                "KH: ? · Sale ? · Team ?\n"
                "SĐT: ? · UID: ?\n"
                "Gói: ?"
            )
            self.assertEqual(result["message"], expected)
            self.assertEqual(
                result["canonical_team_code"], "Khác"
            )

    # --- get_canonical_team ---

    def test_team_mapper_various_cases(self):
        self.assertEqual(get_canonical_team("HN inhouse"), "Inhouse 1")
        self.assertEqual(get_canonical_team("In-house"), "Inhouse 1")
        self.assertEqual(get_canonical_team("HCM team"), "HCM (Online)")
        self.assertEqual(
            get_canonical_team("Linh Dam Store"), "Linh Dam (Store)"
        )
        self.assertEqual(get_canonical_team("IH2"), "Inhouse 2")
        self.assertEqual(get_canonical_team("UnknownTeam"), "UnknownTeam")
        self.assertEqual(get_canonical_team(None), "Kh\u00e1c")
        self.assertEqual(get_canonical_team(""), "Kh\u00e1c")
        self.assertEqual(get_canonical_team("  "), "Kh\u00e1c")
        # Case-insensitive
        self.assertEqual(get_canonical_team("hn INHOUSE"), "Inhouse 1")


if __name__ == "__main__":
    unittest.main()
