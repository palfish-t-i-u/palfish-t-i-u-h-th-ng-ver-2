"""Tests for _gmv_from_vnd locale-error detection (3-tier)."""

import sys
from pathlib import Path
from unittest.mock import patch

# Add backend to path so gsheet_ledger_import is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gsheet_ledger_import import _gmv_from_vnd, DEFAULT_TY_GIA


def _expected(vnd: int) -> float:
    return round(float(vnd) / float(DEFAULT_TY_GIA), 2)


class TestGmvFromVndLocaleFix:
    """Three-tier locale-error detection for GMV values from Google Sheet."""

    # --- Tier 1: certain locale error (ratio < 0.01, i.e. >100× off) ---

    def test_locale_error_dot_as_decimal(self):
        """4.978 on sheet should be 4978 RMB (DingTalk dot = thousand sep)."""
        vnd = 18_400_000  # expected GMV ≈ 4972.97
        gmv_hint = 4.978  # corrupted by locale
        result = _gmv_from_vnd(vnd, gmv_hint)
        assert result == _expected(vnd), f"Should auto-fix: {result} != {_expected(vnd)}"

    def test_locale_error_small_value(self):
        """1.23 on sheet for a large VND — classic locale corruption."""
        vnd = 4_550_000  # expected ≈ 1229.73
        gmv_hint = 1.23
        result = _gmv_from_vnd(vnd, gmv_hint)
        assert result == _expected(vnd)

    def test_locale_error_2216_becomes_2_216(self):
        """Row 14227-like: 2216 RMB appears as 2.216 on sheet."""
        vnd = 8_200_000  # expected ≈ 2216.22
        gmv_hint = 2.216
        result = _gmv_from_vnd(vnd, gmv_hint)
        assert result == _expected(vnd)

    # --- Tier 2: grey zone (0.01 ≤ ratio < 0.10, i.e. 10×–100× off) ---

    def test_grey_zone_logs_warning(self):
        """Values 10×–100× off should auto-fix AND log a warning."""
        vnd = 3_700_000  # expected = 1000
        gmv_hint = 50.0  # ratio = 0.05 → grey zone
        with patch("gsheet_ledger_import._log") as mock_log:
            result = _gmv_from_vnd(vnd, gmv_hint)
            assert result == _expected(vnd)
            mock_log.assert_called_once()
            assert "locale fix" in mock_log.call_args[0][0].lower()

    # --- Tier 3: plausible value (ratio ≥ 0.10) → keep sheet value ---

    def test_normal_gmv_kept(self):
        """Normal GMV close to expected — keep sheet value."""
        vnd = 3_700_000  # expected = 1000
        gmv_hint = 1000.0
        result = _gmv_from_vnd(vnd, gmv_hint)
        assert result == 1000.0

    def test_discount_gmv_kept(self):
        """GMV with ~30% discount — still plausible, keep it."""
        vnd = 3_700_000  # expected = 1000
        gmv_hint = 700.0  # 30% off — ratio = 0.7
        result = _gmv_from_vnd(vnd, gmv_hint)
        assert result == 700.0

    def test_slightly_different_rate_kept(self):
        """GMV at a slightly different exchange rate — keep it."""
        vnd = 4_000_000  # expected ≈ 1081.08
        gmv_hint = 1100.0  # ratio ≈ 1.02
        result = _gmv_from_vnd(vnd, gmv_hint)
        assert result == 1100.0

    def test_gmv_above_expected_kept(self):
        """GMV higher than expected (e.g. premium) — keep it."""
        vnd = 3_700_000  # expected = 1000
        gmv_hint = 1200.0  # ratio = 1.2
        result = _gmv_from_vnd(vnd, gmv_hint)
        assert result == 1200.0

    # --- Edge cases ---

    def test_no_gmv_hint_calculates_from_vnd(self):
        """No GMV from sheet → calculate from VND."""
        vnd = 7_400_000
        result = _gmv_from_vnd(vnd, None)
        assert result == _expected(vnd)

    def test_zero_gmv_hint_calculates_from_vnd(self):
        """Zero GMV from sheet → calculate from VND."""
        vnd = 3_700_000
        result = _gmv_from_vnd(vnd, 0.0)
        assert result == _expected(vnd)

    def test_negative_gmv_hint_calculates_from_vnd(self):
        """Negative GMV from sheet → calculate from VND."""
        vnd = 3_700_000
        result = _gmv_from_vnd(vnd, -100.0)
        assert result == _expected(vnd)

    def test_zero_vnd_with_gmv_hint(self):
        """VND = 0 but GMV provided → keep GMV."""
        result = _gmv_from_vnd(0, 500.0)
        assert result == 500.0

    def test_zero_vnd_no_gmv(self):
        """Both zero → return 0."""
        result = _gmv_from_vnd(0, None)
        assert result == 0.0

    def test_zero_vnd_zero_gmv(self):
        result = _gmv_from_vnd(0, 0.0)
        assert result == 0.0
