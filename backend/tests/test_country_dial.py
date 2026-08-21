"""Shared country dial map (utils.country_dial) + both consumers.

Regression cho PR-2026-0578: khách nước ngoài phải ra đúng mã vùng, không rơi về 84.
"""

from __future__ import annotations

from utils.country_dial import COUNTRY_DIAL, dial_for, local_len_for


class TestDialFor:
    def test_vietnam(self):
        assert dial_for("VN") == "84"

    def test_czech_the_reported_case(self):
        assert dial_for("CZ") == "420"

    def test_common_ov_markets(self):
        assert dial_for("DE") == "49"
        assert dial_for("GB") == "44"
        assert dial_for("JP") == "81"
        assert dial_for("KR") == "82"
        assert dial_for("TW") == "886"
        assert dial_for("AU") == "61"

    def test_lowercase_and_whitespace(self):
        assert dial_for(" cz ") == "420"
        assert dial_for("vn") == "84"

    def test_empty_or_none_defaults_vn(self):
        assert dial_for(None) == "84"
        assert dial_for("") == "84"

    def test_unknown_defaults_vn(self):
        assert dial_for("ZZ") == "84"


class TestMapIntegrity:
    def test_values_are_digit_strings(self):
        for code, dial in COUNTRY_DIAL.items():
            assert dial.isdigit(), f"{code} dial not digits: {dial!r}"

    def test_keys_are_iso_alpha2_upper(self):
        for code in COUNTRY_DIAL:
            assert len(code) == 2 and code.isupper() and code.isalpha()

    def test_covers_far_more_than_old_stunted_maps(self):
        # Bảng cũ chỉ 10-22 nước; bảng mới phủ phần lớn ISO alpha-2.
        assert len(COUNTRY_DIAL) > 150


class TestConsumersUseSharedMap:
    def test_zalo_format_phone_intl_czech(self):
        from utils.zalo_message_builder import format_phone_intl

        # trunk 0 bị bỏ, mã vùng 420 (không phải 84)
        assert format_phone_intl("0777737388", "CZ") == "420-777737388"
        assert format_phone_intl("777737388", "VN") == "84-777737388"

    def test_vinaphone_084_not_double_stripped(self):
        """SĐT Vinaphone 084xxx bắt đầu bằng 84 — KHÔNG strip dial."""
        from utils.zalo_message_builder import format_phone_intl

        assert format_phone_intl("0844976431", "VN") == "84-844976431"
        assert format_phone_intl("844976431", "VN") == "84-844976431"

    def test_intl_number_with_dial_still_stripped(self):
        """Số quốc tế dính dial 84 (11 digits) vẫn strip đúng."""
        from utils.zalo_message_builder import format_phone_intl

        assert format_phone_intl("84904769355", "VN") == "84-904769355"


class TestLocalLenFor:
    def test_vn(self):
        assert local_len_for("VN") == 9

    def test_us(self):
        assert local_len_for("US") == 10

    def test_default(self):
        assert local_len_for("ZZ") == 9
        assert local_len_for(None) == 9
