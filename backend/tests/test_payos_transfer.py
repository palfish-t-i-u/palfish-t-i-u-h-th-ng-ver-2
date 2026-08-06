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

    def test_max_forty_chars_vietqr_hard_limit(self):
        """img.vietqr.io cắt cứng ở 40 chars (commit fff4d89, tested 19/6)."""
        row = {"phone": "090123456789012345", "name": "A" * 40}
        desc = pr._build_payos_transfer_description(row, None, "FH9VT")
        assert len(desc) <= 40

    def test_always_contains_transfer_code(self):
        row = {"phone": "0" * 20, "ten_khach": "Very Long Customer Name"}
        code = "FH9VT"
        desc = pr._build_payos_transfer_description(row, "Ha", code)
        assert code in desc

    def test_name_for_transfer_overrides_pr_name(self):
        row = {"phone": "0901111222", "name": "Long Customer Name"}
        desc = pr._build_payos_transfer_description(row, "Ha", "FH9VT")
        assert "Ha" in desc

    def test_keeps_full_vietnamese_name_when_under_40(self):
        """3 tên ≤ 40 chars → giữ FULL (commit 9940468 tier 1: full).
        "8413521313 Tran Ky Duyen FH9VT" = 30 chars ≤ 40 → không cần cắt."""
        row = {"phone": "8413521313", "name": "Trần Kỳ Duyên"}
        desc = pr._build_payos_transfer_description(row, None, "FH9VT")
        assert "Tran" in desc
        assert "Ky" in desc
        assert "Duyen" in desc
        assert len(desc) <= 40

    def test_child_name_keeps_full_when_under_40(self):
        """Tên con ngắn ≤ 40 → giữ nguyên full name."""
        row = {"phone": "8413521313", "name": "Nguyễn Văn A"}
        desc = pr._build_payos_transfer_description(row, "Nguyễn Minh Anh", "FH9VT")
        assert "Nguyen" in desc
        assert "Minh" in desc
        assert "Anh" in desc
        assert len(desc) <= 40

    def test_falls_back_to_last_two_words_when_over_40(self):
        """Tên dài quá 40 → tier 2: cắt còn 2 từ cuối (convention VN)."""
        # phone 12 + 1 + name 30 + 1 + code 5 = 49 > 40 → fallback
        row = {"phone": "841352131311", "name": "Nguyen Thi Bich Diep Quynh"}
        desc = pr._build_payos_transfer_description(row, None, "FH9VT")
        assert "Diep" in desc  # từ áp cuối
        assert "Quynh" in desc  # từ cuối
        assert len(desc) <= 40

    def test_falls_back_to_last_word_only_when_still_over_40(self):
        """Tên cực dài → tier 3: chỉ giữ tên riêng (từ cuối)."""
        # phone 20 chars + name nhiều từ dài → ép xuống last1
        row = {"phone": "84012345678901234567",
               "name": "Nguyen Thi Hong Bich Diep Quynh"}
        desc = pr._build_payos_transfer_description(row, None, "FH9VT")
        assert "Quynh" in desc
        assert len(desc) <= 40


    def test_fallback_to_code_only_when_needed(self):
        row = {}
        code = "FH9VT"
        desc = pr._build_payos_transfer_description(row, None, code)
        assert desc == code

    def test_foreign_country_uses_its_dial_not_vn_default(self):
        """PR-2026-0578 (26/7): khách Séc (CZ) → mã vùng 420, KHÔNG rơi về 84 mặc định.
        Trước fix: bảng dial cụt thiếu CZ → ra "84777737388 ..."."""
        row = {"phone": "777737388", "country": "CZ", "name": "Nguyen Thi Hue"}
        desc = pr._build_payos_transfer_description(row, "Vuong Bao Khanh", "FIIBT")
        assert desc.startswith("420777737388 ")
        assert "FIIBT" in desc
        assert len(desc) <= 40

    def test_vn_country_still_prefixes_84(self):
        row = {"phone": "777737388", "country": "VN", "name": "Nguyen Van A"}
        desc = pr._build_payos_transfer_description(row, None, "FH9VT")
        assert desc.startswith("84777737388")

    def test_unknown_country_falls_back_to_84(self):
        row = {"phone": "777737388", "country": "ZZ", "name": "Test"}
        desc = pr._build_payos_transfer_description(row, None, "FH9VT")
        assert desc.startswith("84777737388")


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
