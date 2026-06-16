"""Test SePay webhook & matching logic bằng sample payload cứng.

Chạy: cd backend && python -m pytest tests/test_sepay_webhook.py -v
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

# ---------------------------------------------------------------------------
# Sample Payloads (sẽ thay bằng payload thật từ Sandbox/Dashboard khi có)
# ---------------------------------------------------------------------------

SAMPLE_WEBHOOK_PAYLOAD_MB = {
    "id": 123456789,
    "gateway": "MBBank",
    "transactionDate": "2026-06-13 15:30:00",
    "accountNumber": "0123456789",
    "subAccount": None,
    "transferType": "in",
    "transferAmount": 5000000,
    "accumulated": 150000000,
    "code": None,
    "content": "84989778983 Minh FHB9T",
    "referenceCode": "FT26164ABC",
    "description": "84989778983 Minh FHB9T",
}

SAMPLE_WEBHOOK_PAYLOAD_VCB = {
    "id": 987654321,
    "gateway": "Vietcombank",
    "transactionDate": "2026-06-13 16:00:00",
    "accountNumber": "1234567890123",
    "subAccount": "VCB-SUB-001",
    "transferType": "in",
    "transferAmount": 3000000,
    "accumulated": 200000000,
    "code": None,
    "content": "84912345678 Nam ABC12",
    "referenceCode": "VCB26164XYZ",
    "description": "84912345678 Nam ABC12",
}

# mPOS Settlement (phải bị ignore)
SAMPLE_WEBHOOK_MPOS_SETTLE = {
    "id": 111222333,
    "gateway": "MBBank",
    "transactionDate": "2026-06-13 09:00:00",
    "accountNumber": "0123456789",
    "transferType": "in",
    "transferAmount": 37100000,
    "content": "MPOS SETTLE LOT 20260613 - PAYOO",
    "description": "MPOS SETTLE LOT 20260613 - PAYOO",
}

# Duplicate webhook (cùng sepay_id, phải bị skip)
SAMPLE_WEBHOOK_DUPLICATE = {
    **SAMPLE_WEBHOOK_PAYLOAD_MB,
    "id": 123456789,  # Same ID
}


class TestSepayHelpers:
    """Test helper functions từ sepay_routes."""

    def test_is_mpos_settlement_true(self):
        from sepay_routes import _is_mpos_settlement

        assert _is_mpos_settlement("MPOS SETTLE LOT 20260613 - PAYOO") is True
        assert _is_mpos_settlement("KET TOAN MPOS ngay 13/06") is True
        assert _is_mpos_settlement("PAYOO SETTLE batch 001") is True

    def test_is_mpos_settlement_false(self):
        from sepay_routes import _is_mpos_settlement

        assert _is_mpos_settlement("84989778983 Minh FHB9T") is False
        assert _is_mpos_settlement("Chuyen tien thuong") is False
        assert _is_mpos_settlement("") is False

    def test_clean_text(self):
        from sepay_routes import _clean_text

        assert _clean_text(None) == ""
        assert _clean_text("  hello  ") == "hello"
        assert _clean_text(12345) == "12345"

    def test_parse_amount(self):
        from sepay_routes import _parse_amount

        assert _parse_amount(5000000) == 5000000.0
        assert _parse_amount("3000000") == 3000000.0
        assert _parse_amount(None) == 0.0
        assert _parse_amount("abc") == 0.0


class TestSepayIPWhitelist:
    """Test IP whitelisting logic."""

    def test_no_whitelist_configured_passes(self):
        from sepay_routes import _verify_ip

        mock_request = MagicMock()
        mock_request.client.host = "1.2.3.4"
        mock_request.headers = {}

        # Khi SEPAY_ALLOWED_IPS rỗng → pass (dev mode)
        with patch("sepay_routes.SEPAY_ALLOWED_IPS", set()):
            _verify_ip(mock_request)  # Không raise = pass

    def test_whitelisted_ip_passes(self):
        from sepay_routes import _verify_ip

        mock_request = MagicMock()
        mock_request.client.host = "103.1.2.3"
        mock_request.headers = {}

        with patch("sepay_routes.SEPAY_ALLOWED_IPS", {"103.1.2.3", "103.1.2.4"}):
            _verify_ip(mock_request)  # pass

    def test_non_whitelisted_ip_blocked(self):
        from sepay_routes import _verify_ip
        from fastapi import HTTPException

        mock_request = MagicMock()
        mock_request.client.host = "999.999.999.999"
        mock_request.headers = {}

        with patch("sepay_routes.SEPAY_ALLOWED_IPS", {"103.1.2.3"}):
            with pytest.raises(HTTPException) as exc_info:
                _verify_ip(mock_request)
            assert exc_info.value.status_code == 403


class TestSepayHMAC:
    """Test HMAC-SHA256 verification."""

    def test_no_secret_configured_passes(self):
        from sepay_routes import _verify_hmac

        with patch("sepay_routes.SEPAY_WEBHOOK_SECRET", ""):
            _verify_hmac(b"anything", "", "")  # pass — dev mode

    def test_missing_signature_rejected(self):
        from sepay_routes import _verify_hmac
        from fastapi import HTTPException

        with patch("sepay_routes.SEPAY_WEBHOOK_SECRET", "my_secret"):
            with pytest.raises(HTTPException) as exc_info:
                _verify_hmac(b"body", "", "1718300000")
            assert exc_info.value.status_code == 401

    def test_missing_timestamp_rejected(self):
        from sepay_routes import _verify_hmac
        from fastapi import HTTPException

        with patch("sepay_routes.SEPAY_WEBHOOK_SECRET", "my_secret"):
            with pytest.raises(HTTPException) as exc_info:
                _verify_hmac(b"body", "sig", "")
            assert exc_info.value.status_code == 401

    def test_valid_signature_passes(self):
        import hashlib
        import hmac as hmac_mod
        from sepay_routes import _verify_hmac

        secret = "test_secret_key"
        body = b'{"id": 123, "amount": 5000000}'
        timestamp = "1718300000"
        msg = timestamp.encode("utf-8") + b"." + body
        
        # Test cả dạng có tiền tố sha256= và không có
        sig_hex = hmac_mod.new(secret.encode(), msg, hashlib.sha256).hexdigest()
        sig_with_prefix = f"sha256={sig_hex}"

        with patch("sepay_routes.SEPAY_WEBHOOK_SECRET", secret):
            _verify_hmac(body, sig_hex, timestamp)  # pass không prefix
            _verify_hmac(body, sig_with_prefix, timestamp)  # pass có prefix

    def test_invalid_signature_rejected(self):
        from sepay_routes import _verify_hmac
        from fastapi import HTTPException

        with patch("sepay_routes.SEPAY_WEBHOOK_SECRET", "my_secret"):
            with pytest.raises(HTTPException) as exc_info:
                _verify_hmac(b"body", "invalid_hex_signature", "1718300000")
            assert exc_info.value.status_code == 401


class TestSepayMatchingLogic:
    """Test transfer_code matching logic."""

    def test_mpos_settlement_ignored(self):
        from sepay_routes import _process_sepay_transaction

        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{"txn_id": "xxx"}])

        result = _process_sepay_transaction(mock_sb, SAMPLE_WEBHOOK_MPOS_SETTLE)
        assert result["status"] == "ignored"

    def test_no_match_stays_pending(self):
        from sepay_routes import _process_sepay_transaction

        mock_sb = MagicMock()
        # payment_lines query returns empty
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{"txn_id": "xxx"}])

        result = _process_sepay_transaction(mock_sb, {
            "id": 999999,
            "content": "random transfer no matching code",
            "transferAmount": 100000,
        })
        # Nếu không match → status sẽ là pending (không phải auto_matched)
        assert result["status"] in ("pending", "needs_review")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
