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
            "\U0001f4b0 PAID \u2014 KH Nguyen Van A | 1,500,000\u0111 "
            "| sale Tran Thi B | QR Code | 01/10/2023 17:00"
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
                "\U0001f4b0 PAID \u2014 KH Unknown | 0\u0111 "
                "| sale Unknown | Unknown | N/A"
            )
            self.assertEqual(result["message"], expected)
            self.assertEqual(result["canonical_team_code"], "Kh\u00e1c")

    # --- build_course_activated_message ---

    def test_build_course_activated_message_success(self):
        req_data = {
            "id": "456",
            "customer_name": "Le Van C",
            "package_name": "Khoa Hoc Tieng Anh 1 Nam",
        }
        sale_info = {
            "crm_name": "Nguyen Thi D",
            "team": "HCM (Online)",
        }

        result = build_course_activated_message(req_data, sale_info)

        expected = (
            "\u2705 K\u00cdCH HO\u1ea0T \u2014 KH Le Van C "
            "| g\u00f3i Khoa Hoc Tieng Anh 1 Nam | sale Nguyen Thi D"
        )
        self.assertEqual(result["message"], expected)
        self.assertEqual(result["canonical_team_code"], "HCM (Online)")

    def test_build_course_activated_message_graceful_degradation(self):
        with self.assertLogs(
            "utils.zalo_message_builder", level="WARNING"
        ):
            result = build_course_activated_message(
                {"id": "888"}, {"team": "Unknown Team"}
            )

            expected = (
                "\u2705 K\u00cdCH HO\u1ea0T \u2014 KH Unknown "
                "| g\u00f3i Unknown | sale Unknown"
            )
            self.assertEqual(result["message"], expected)
            self.assertEqual(
                result["canonical_team_code"], "Unknown Team"
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
