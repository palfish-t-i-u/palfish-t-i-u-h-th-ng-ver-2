"""TOP1-01: PayOS transfer description and base36 transfer codes."""

from __future__ import annotations

import inspect
import re

import payment_request_routes as pr


class TestTransferCodeHint:
    def test_returns_five_char_uppercase_base36(self):
        code = pr._transfer_code_hint("PR-2026-0002", 0)
        assert len(code) == 5
        assert re.fullmatch(r"[0-9A-Z]{5}", code)

    def test_known_pr_line_encoding(self):
        assert pr._transfer_code_hint("PR-2026-0002", 0) == "FH9VT"

    def test_differs_by_pr_seq(self):
        a = pr._transfer_code_hint("PR-2026-0002", 0)
        b = pr._transfer_code_hint("PR-2026-0001", 0)
        assert a != b

    def test_differs_by_line_seq(self):
        a = pr._transfer_code_hint("PR-2026-0002", 0)
        b = pr._transfer_code_hint("PR-2026-0002", 1)
        assert a != b

    def test_fallback_for_nonstandard_pr_id(self):
        code = pr._transfer_code_hint("INVALID", 3)
        assert len(code) == 5
        assert re.fullmatch(r"[0-9A-Z]{5}", code)
        assert code == pr._transfer_code_hint("INVALID", 3)


class TestBuildPayosTransferDescription:
    def test_strips_vietnamese_accents(self):
        row = {"phone": "0901", "name": "Diệp Quỳnh"}
        desc = pr._build_payos_transfer_description(row, None, "FH9VT")
        assert "Diep" in desc
        assert "Quynh" in desc
        assert "ệ" not in desc
        assert "ỳ" not in desc

    def test_keeps_alnum_and_spaces_only(self):
        row = {"phone": "0901-234-567", "name": "Nguyen@Van#A"}
        desc = pr._build_payos_transfer_description(row, None, "ABC12")
        assert "@" not in desc
        assert "#" not in desc
        assert "ABC12" in desc

    def test_max_twenty_five_chars(self):
        row = {"phone": "090123456789012345", "name": "A" * 40}
        desc = pr._build_payos_transfer_description(row, None, "FH9VT")
        assert len(desc) <= 25

    def test_always_contains_transfer_code(self):
        row = {"phone": "0" * 20, "ten_khach": "Very Long Customer Name"}
        code = "FH9VT"
        desc = pr._build_payos_transfer_description(row, "Ha", code)
        assert code in desc

    def test_name_for_transfer_overrides_pr_name(self):
        row = {"phone": "0901111222", "name": "Long Customer Name"}
        desc = pr._build_payos_transfer_description(row, "Ha", "FH9VT")
        assert "Ha" in desc

    def test_fallback_to_code_only_when_needed(self):
        row = {}
        code = "FH9VT"
        desc = pr._build_payos_transfer_description(row, None, code)
        assert desc == code


class TestCreatePaymentLineSource:
    def test_payment_line_create_has_name_for_transfer(self):
        source = inspect.getsource(pr.PaymentLineCreate)
        assert "name_for_transfer" in source

    def test_qr_handler_does_not_overwrite_transfer_code_from_payos(self):
        source = inspect.getsource(pr)
        assert '"transfer_code": payos_payload.get("transfer_content")' not in source

    def test_qr_handler_builds_description_before_payos(self):
        source = inspect.getsource(pr)
        assert "_build_payos_transfer_description" in source
        assert "create_payos_payment_link(amount, description)" in source
