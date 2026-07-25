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
        # Rút tiền TikTok Shop hàng tuần — nội dung CK đúng chuỗi
        assert _is_mpos_settlement("TikTok Shop") is True
        assert _is_mpos_settlement("Tiktok Shop") is True
        assert _is_mpos_settlement("  TikTok Shop  ") is True

    def test_is_mpos_settlement_false(self):
        from sepay_routes import _is_mpos_settlement

        assert _is_mpos_settlement("84989778983 Minh FHB9T") is False
        assert _is_mpos_settlement("Chuyen tien thuong") is False
        assert _is_mpos_settlement("") is False
        # Khách gõ tự do có chứa chữ TikTok → KHÔNG được nuốt (chỉ match exact)
        assert _is_mpos_settlement("hoan tien don TikTok Shop cho khach") is False

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

    def test_extract_poll_payload_snake_case_fields(self):
        from sepay_routes import _extract_sepay_transaction_fields

        payload = {
            "id": 64044377,
            "transaction_date": "2026-06-21 10:59:24",
            "account_number": "168001166899",
            "sub_account": "MB-HCM",
            "amount_in": "10000",
            "amount_out": "0",
            "transaction_content": "CSNF8DAKF04 TT20260002001",
        }

        fields = _extract_sepay_transaction_fields(payload)

        assert fields["sepay_id"] == 64044377
        assert fields["content"] == "CSNF8DAKF04 TT20260002001"
        assert fields["amount"] == 10000.0
        assert fields["account_number"] == "168001166899"
        assert fields["sub_account"] == "MB-HCM"
        assert fields["transaction_date_raw"] == "2026-06-21 10:59:24"


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
        import time
        from sepay_routes import _verify_hmac

        secret = "test_secret_key"
        body = b'{"id": 123, "amount": 5000000}'
        timestamp = str(int(time.time()))
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


class TestSepayOrphanFix:
    """Regression (14/7): recompute/audit fail sau khi payment_line đã paid
    KHÔNG được revert match_status — bug cũ revert về needs_review nhưng
    payment_line vẫn paid = orphan (CK tự khớp mà vẫn nằm ở tab CK ngoài)."""

    def _build_sb(self, *, bank_txn_updates, line_updates):
        matched_line = {
            "id": "line-1", "transfer_code": "ABCDE", "amount": 5_000_000,
            "payment_request_id": "PR-1",
        }

        def mock_table(name):
            t = MagicMock()
            if name == "payment_lines":
                # _match_transfer_code_in_content: select().eq().eq().execute() -> candidates
                t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                    data=[matched_line]
                )
                # mark paid: update({...}).eq(id).execute()
                t.update.side_effect = lambda payload: _RecordingChain(line_updates, payload)
            elif name == "bank_transactions":
                t.upsert.return_value.execute.return_value = MagicMock(data=[{"txn_id": "xxx"}])
                t.update.side_effect = lambda payload: _RecordingChain(bank_txn_updates, payload)
            return t

        sb = MagicMock()
        sb.table.side_effect = mock_table
        return sb

    def test_recompute_failure_does_not_revert_match_status(self):
        """payment_line update thành công -> recompute throw -> match_status
        PHẢI giữ nguyên 'auto_matched' (KHÔNG revert 'needs_review'), line vẫn paid."""
        from sepay_routes import _process_sepay_transaction

        bank_txn_updates: list[dict] = []
        line_updates: list[dict] = []
        sb = self._build_sb(bank_txn_updates=bank_txn_updates, line_updates=line_updates)

        with patch(
            "payment_request_routes.recompute_payment_request_totals",
            side_effect=Exception("boom recompute"),
        ):
            result = _process_sepay_transaction(sb, {
                "id": 555555,
                "content": "ABCDE thanh toan hoc phi",
                "transferAmount": 5_000_000,
            })

        # Line đã được mark paid (op1 thành công, không bị rollback)
        assert len(line_updates) == 1
        assert line_updates[0]["status"] == "paid"
        # match_status KHÔNG bị revert — orphan fix: recompute/audit fail chỉ log warning
        assert bank_txn_updates == []
        assert result["status"] == "auto_matched"

    def test_line_update_failure_still_reverts_match_status(self):
        """payment_line update tự nó throw (op1 fail) -> match_status VẪN được
        revert về needs_review như cũ (an toàn vì line CHƯA paid)."""
        from sepay_routes import _process_sepay_transaction

        bank_txn_updates: list[dict] = []

        def mock_table(name):
            t = MagicMock()
            if name == "payment_lines":
                t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                    data=[{"id": "line-1", "transfer_code": "ABCDE", "amount": 5_000_000,
                           "payment_request_id": "PR-1"}]
                )
                t.update.side_effect = Exception("update failed")
            elif name == "bank_transactions":
                t.upsert.return_value.execute.return_value = MagicMock(data=[{"txn_id": "xxx"}])
                t.update.side_effect = lambda payload: _RecordingChain(bank_txn_updates, payload)
            return t

        sb = MagicMock()
        sb.table.side_effect = mock_table

        result = _process_sepay_transaction(sb, {
            "id": 555556,
            "content": "ABCDE thanh toan hoc phi",
            "transferAmount": 5_000_000,
        })

        assert len(bank_txn_updates) == 1
        assert bank_txn_updates[0]["match_status"] == "needs_review"
        assert result["status"] == "needs_review"


class _RecordingChain:
    """Records payload; .eq(...).execute() chain returns benign data."""

    def __init__(self, sink: list[dict], payload: dict):
        sink.append(payload)
        self._payload = payload

    def eq(self, *a, **k):
        return self

    def execute(self):
        return MagicMock(data=[self._payload])


class _FakeSelect:
    """Select chain lọc rows theo .eq(col, val) thật — phân biệt được query
    pending (2 eq) vs paid (3 eq, có amount) trong _match_transfer_code_in_content."""

    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._filters: list[tuple] = []
        self._limit: int | None = None

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        out = [r for r in self._rows if all(r.get(c) == v for c, v in self._filters)]
        if self._limit is not None:
            out = out[: self._limit]
        return MagicMock(data=out)


class TestSepayLateMatch:
    """Race PayOS↔SePay (PR chị Hương 11/7): PayOS confirm line TRƯỚC, SePay về
    SAU 2s → match cũ chỉ tìm status=pending → bank txn kẹt 'pending' lẫn vào
    tab CK ngoài. Fix: khớp muộn với lines đã paid — chỉ link, không notify."""

    _PAID_LINE = {
        "id": "line-paid-1", "transfer_code": "FHBFF", "amount": 14_650_000,
        "method": "qr", "status": "paid", "payment_request_id": "PR-22",
    }

    def _build_sb(self, *, paid_lines, linked_txns, upserts, line_updates):
        def mock_table(name):
            t = MagicMock()
            if name == "payment_lines":
                t.select.side_effect = lambda *a, **k: _FakeSelect(paid_lines)
                t.update.side_effect = lambda payload: _RecordingChain(line_updates, payload)
            elif name == "bank_transactions":
                t.select.side_effect = lambda *a, **k: _FakeSelect(linked_txns)
                def record_upsert(payload, **kw):
                    upserts.append(payload)
                    chain = MagicMock()
                    chain.execute.return_value = MagicMock(data=[{"txn_id": "new-txn"}])
                    return chain
                t.upsert.side_effect = record_upsert
            return t

        sb = MagicMock()
        sb.table.side_effect = mock_table
        return sb

    def test_paid_line_late_match_links_without_notify(self):
        """Line đã paid (PayOS) + đúng mã + đúng tiền + chưa có txn link
        → auto_matched + matched_by=system:sepay_late, KHÔNG update payment_lines
        (không update → trigger Zalo/DingTalk không bắn lại)."""
        from sepay_routes import _process_sepay_transaction

        upserts: list[dict] = []
        line_updates: list[dict] = []
        sb = self._build_sb(
            paid_lines=[self._PAID_LINE], linked_txns=[],
            upserts=upserts, line_updates=line_updates,
        )

        result = _process_sepay_transaction(sb, {
            "id": 67653641,
            "content": "CSO9E63CVK7 84927509353 ANH FHBFF 110726",
            "transferAmount": 14_650_000,
        })

        assert result["status"] == "auto_matched"
        assert result["payment_line_id"] == "line-paid-1"
        assert len(upserts) == 1
        assert upserts[0]["match_status"] == "auto_matched"
        assert upserts[0]["payment_line_id"] == "line-paid-1"
        assert upserts[0]["matched_by"] == "system:sepay_late"
        # KHÔNG mark paid lại — payment_lines không được update
        assert line_updates == []

    def test_paid_line_with_existing_txn_stays_pending(self):
        """Line đã paid NHƯNG đã có bank txn link → CK lặp thật của khách
        → giữ pending cho kế toán, không tự nuốt."""
        from sepay_routes import _process_sepay_transaction

        upserts: list[dict] = []
        line_updates: list[dict] = []
        sb = self._build_sb(
            paid_lines=[self._PAID_LINE],
            linked_txns=[{"txn_id": "old-txn", "payment_line_id": "line-paid-1"}],
            upserts=upserts, line_updates=line_updates,
        )

        result = _process_sepay_transaction(sb, {
            "id": 67653642,
            "content": "khach chuyen lap FHBFF",
            "transferAmount": 14_650_000,
        })

        assert result["status"] == "pending"
        assert result["payment_line_id"] is None
        assert upserts[0]["match_status"] == "pending"
        assert "matched_by" not in upserts[0]
        assert line_updates == []

    def test_paid_line_amount_mismatch_stays_pending(self):
        """Đúng mã nhưng SAI tiền so với line đã paid → query .eq(amount) không
        trả line → pending (không gán needs_review hint sai lên line đã paid)."""
        from sepay_routes import _process_sepay_transaction

        upserts: list[dict] = []
        line_updates: list[dict] = []
        sb = self._build_sb(
            paid_lines=[self._PAID_LINE], linked_txns=[],
            upserts=upserts, line_updates=line_updates,
        )

        result = _process_sepay_transaction(sb, {
            "id": 67653643,
            "content": "chuyen them FHBFF",
            "transferAmount": 5_000_000,  # khác 14.65M
        })

        assert result["status"] == "pending"
        assert result["payment_line_id"] is None
        assert line_updates == []

    def test_two_codes_in_content_ambiguous_no_auto(self):
        """UPDATE 24/7 (fold matching): content chứa 2 mã của 2 line paid khác
        nhau → ambiguous guard chặn auto, chờ ghép tay.

        Hành vi cũ (18/7): first-match-wins theo thứ tự DB, lỗi linked-check ở
        A thì nhảy sang B — kết quả ghép phụ thuộc thứ tự + lỗi thoáng qua.
        Semantics mới: ≥2 mã cùng khớp = không đoán được txn thuộc line nào
        (amount khớp từng line không phân định được) → manual. Tinh thần review
        18/7 (lỗi thoáng qua không chặn vòng dò) giữ ở test dưới — scan mã giờ
        in-memory không chạm DB, linked-check chỉ chạy trên winner duy nhất."""
        from sepay_routes import _process_sepay_transaction

        line_a = {"id": "line-a", "transfer_code": "AAAAA", "amount": 7_000_000,
                  "method": "qr", "status": "paid", "payment_request_id": "PR-A"}
        line_b = {"id": "line-b", "transfer_code": "BBBBB", "amount": 7_000_000,
                  "method": "qr", "status": "paid", "payment_request_id": "PR-B"}

        upserts: list[dict] = []

        def mock_table(name):
            t = MagicMock()
            if name == "payment_lines":
                t.select.side_effect = lambda *a, **k: _FakeSelect([line_a, line_b])
            elif name == "bank_transactions":
                t.select.side_effect = lambda *a, **k: _FakeSelect([])
                def record_upsert(payload, **kw):
                    upserts.append(payload)
                    chain = MagicMock()
                    chain.execute.return_value = MagicMock(data=[{"txn_id": "new-txn"}])
                    return chain
                t.upsert.side_effect = record_upsert
            return t

        sb = MagicMock()
        sb.table.side_effect = mock_table

        result = _process_sepay_transaction(sb, {
            "id": 67653645,
            "content": "AAAAA BBBBB chuyen tien",
            "transferAmount": 7_000_000,
        })

        assert result["status"] == "pending"
        assert result["payment_line_id"] is None

    def test_linked_check_transient_error_graceful_pending(self):
        """Tinh thần review 18/7 sau redesign 24/7: lỗi DB thoáng qua ở
        linked-check của winner duy nhất → KHÔNG raise, txn về pending
        (kế toán ghép tay được) thay vì crash cả flow webhook."""
        from sepay_routes import _process_sepay_transaction

        line_a = {"id": "line-a", "transfer_code": "AAAAA", "amount": 7_000_000,
                  "method": "qr", "status": "paid", "payment_request_id": "PR-A"}

        upserts: list[dict] = []

        def bank_select(*a, **k):
            raise Exception("transient DB error")

        def mock_table(name):
            t = MagicMock()
            if name == "payment_lines":
                t.select.side_effect = lambda *a, **k: _FakeSelect([line_a])
            elif name == "bank_transactions":
                t.select.side_effect = bank_select
                def record_upsert(payload, **kw):
                    upserts.append(payload)
                    chain = MagicMock()
                    chain.execute.return_value = MagicMock(data=[{"txn_id": "new-txn"}])
                    return chain
                t.upsert.side_effect = record_upsert
            return t

        sb = MagicMock()
        sb.table.side_effect = mock_table

        result = _process_sepay_transaction(sb, {
            "id": 67653646,
            "content": "AAAAA chuyen tien",
            "transferAmount": 7_000_000,
        })

        # Không crash; txn pending, không link sai
        assert result["status"] == "pending"
        assert result["payment_line_id"] is None

    def test_pending_line_still_wins_over_paid(self):
        """Có line pending khớp mã → flow cũ thắng (mark paid + notify),
        KHÔNG rơi vào nhánh late match."""
        from sepay_routes import _process_sepay_transaction

        pending_line = {
            "id": "line-pending-1", "transfer_code": "FHBFF", "amount": 14_650_000,
            "method": "qr", "status": "pending", "payment_request_id": "PR-22",
        }
        upserts: list[dict] = []
        line_updates: list[dict] = []
        sb = self._build_sb(
            paid_lines=[pending_line, self._PAID_LINE], linked_txns=[],
            upserts=upserts, line_updates=line_updates,
        )

        with patch("payment_request_routes.recompute_payment_request_totals", return_value={}):
            result = _process_sepay_transaction(sb, {
                "id": 67653644,
                "content": "CK moi FHBFF",
                "transferAmount": 14_650_000,
            })

        assert result["status"] == "auto_matched"
        assert result["payment_line_id"] == "line-pending-1"
        # Flow cũ: line ĐƯỢC mark paid
        assert len(line_updates) == 1
        assert line_updates[0]["status"] == "paid"
        assert "matched_by" not in upserts[0]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
