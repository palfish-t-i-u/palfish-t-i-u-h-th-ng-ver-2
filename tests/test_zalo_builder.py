import sys
import os
import unittest
import logging
from datetime import datetime, timezone

# Add backend directory to sys.path so we can import utils
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from utils.zalo_message_builder import build_payment_paid_message, build_course_activated_message
from utils.team_mapper import get_canonical_team

class TestZaloMessageBuilder(unittest.TestCase):
    
    def setUp(self):
        # Capture logging output
        self.logger = logging.getLogger('utils.zalo_message_builder')
        self.logger.setLevel(logging.WARNING)

    def test_build_payment_paid_message_success(self):
        payment_data = {
            "id": "123",
            "payment_request_id": "PR_001",
            "customer_name": "Nguyen Van A",
            "amount": 1500000,
            "method": "QR Code",
            # Assuming UTC timezone simulation (e.g. Server Render)
            "paid_at": datetime(2023, 10, 1, 10, 0, 0, tzinfo=timezone.utc)
        }
        sale_info = {
            "crm_name": "Tran Thi B",
            "team": "HN inhouse"
        }
        
        result = build_payment_paid_message(payment_data, sale_info)
        
        # 10:00 UTC -> 17:00 Asia/Ho_Chi_Minh
        expected_msg = "💰 PAID — KH Nguyen Van A | 1,500,000đ | sale Tran Thi B | QR Code | 01/10/2023 17:00"
        self.assertEqual(result["message"], expected_msg)
        self.assertEqual(result["canonical_team_code"], "Inhouse 1")

    def test_build_payment_paid_message_graceful_degradation(self):
        with self.assertLogs('utils.zalo_message_builder', level='WARNING') as cm:
            # Empty payloads
            payment_data = {"id": "999"}
            sale_info = {}
            
            result = build_payment_paid_message(payment_data, sale_info)
            
            # Should fallback gracefully
            expected_msg = "💰 PAID — KH Unknown | 0đ | sale Unknown | Unknown | N/A"
            self.assertEqual(result["message"], expected_msg)
            self.assertEqual(result["canonical_team_code"], "Khác")
            
            # Check if warnings were logged
            log_messages = [record.getMessage() for record in cm.records]
            self.assertTrue(any("Missing sale_info" in msg for msg in log_messages))
            self.assertTrue(any("Missing customer_name" in msg for msg in log_messages))
            self.assertTrue(any("Missing amount" in msg for msg in log_messages))

    def test_build_course_activated_message_success(self):
        req_data = {
            "id": "456",
            "customer_name": "Le Van C",
            "package_name": "Khoa Hoc Tieng Anh 1 Nam",
        }
        sale_info = {
            "crm_name": "Nguyen Thi D",
            "team": "HCM (Online)"
        }
        
        result = build_course_activated_message(req_data, sale_info)
        
        expected_msg = "✅ KÍCH HOẠT — KH Le Van C | gói Khoa Hoc Tieng Anh 1 Nam | sale Nguyen Thi D"
        self.assertEqual(result["message"], expected_msg)
        self.assertEqual(result["canonical_team_code"], "HCM (Online)")

    def test_build_course_activated_message_graceful_degradation(self):
        with self.assertLogs('utils.zalo_message_builder', level='WARNING') as cm:
            req_data = {"id": "888"}
            sale_info = {"team": "Unknown Team"}
            
            result = build_course_activated_message(req_data, sale_info)
            
            expected_msg = "✅ KÍCH HOẠT — KH Unknown | gói Unknown | sale Unknown"
            self.assertEqual(result["message"], expected_msg)
            self.assertEqual(result["canonical_team_code"], "Unknown Team")

    def test_team_mapper_various_cases(self):
        self.assertEqual(get_canonical_team("HN inhouse"), "Inhouse 1")
        self.assertEqual(get_canonical_team("In-house"), "Inhouse 1")
        self.assertEqual(get_canonical_team("HCM team"), "HCM (Online)")
        self.assertEqual(get_canonical_team("Linh Dam Store"), "Linh Dam (Store)")
        self.assertEqual(get_canonical_team("IH2"), "Inhouse 2")
        self.assertEqual(get_canonical_team("UnknownTeam"), "UnknownTeam")
        self.assertEqual(get_canonical_team(None), "Khác")

if __name__ == '__main__':
    unittest.main()
