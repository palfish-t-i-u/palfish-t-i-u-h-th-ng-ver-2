"""Guardrail cho cron sync HCM (backend/scripts/sync_hcm_cron.py).

Chỉ test logic cổng giờ thuần (không mạng, không DB):
  - Khung thường 21:59–22:30, cuối tháng nới 21:59–23:59.
  - Nhận diện ngày cuối tháng (gồm tháng 2 năm không nhuận + rollover năm).

Run: cd backend && python -m pytest tests/test_sync_hcm_cron.py -v
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import sync_hcm_cron as cron  # noqa: E402


def _dt(y: int, mo: int, d: int, h: int, mi: int, s: int = 0) -> datetime:
    return datetime(y, mo, d, h, mi, s, tzinfo=cron.VN_TZ)


# 2026-10-16 = ngày thường; 2026-10-31 = ngày cuối tháng
NORMAL = (2026, 10, 16)
LAST = (2026, 10, 31)


class TestLastDayOfMonth:
    def test_last_day_true(self):
        assert cron._is_last_day_of_month(datetime(*LAST, 0, 0).date())

    def test_mid_month_false(self):
        assert not cron._is_last_day_of_month(datetime(*NORMAL, 0, 0).date())

    def test_feb_non_leap_year(self):
        # 2026 không nhuận → 28/2 là cuối tháng
        assert cron._is_last_day_of_month(datetime(2026, 2, 28, 0, 0).date())
        assert not cron._is_last_day_of_month(datetime(2026, 2, 27, 0, 0).date())

    def test_year_rollover(self):
        assert cron._is_last_day_of_month(datetime(2026, 12, 31, 0, 0).date())


class TestWindowEnd:
    def test_normal_day_ends_2230(self):
        assert cron._window_end(_dt(*NORMAL, 22, 0)) == cron.WINDOW_END_NORMAL

    def test_last_day_ends_2359(self):
        assert cron._window_end(_dt(*LAST, 22, 0)) == cron.WINDOW_END_EOM


class TestInWindowNormalDay:
    def test_before_start_2158(self):
        assert not cron._in_window(_dt(*NORMAL, 21, 58))

    def test_at_start_2159(self):
        assert cron._in_window(_dt(*NORMAL, 21, 59))

    def test_2200(self):
        assert cron._in_window(_dt(*NORMAL, 22, 0))

    def test_at_end_2230(self):
        assert cron._in_window(_dt(*NORMAL, 22, 30))

    def test_end_minute_tail_223059(self):
        # Cron có thể fire trễ vài giây trong phút :30 → vẫn phải chạy
        assert cron._in_window(_dt(*NORMAL, 22, 30, 59))

    def test_after_end_2231(self):
        assert not cron._in_window(_dt(*NORMAL, 22, 31))

    def test_late_evening_2300_not_run_normal_day(self):
        assert not cron._in_window(_dt(*NORMAL, 23, 0))


class TestInWindowLastDay:
    def test_before_start_2158(self):
        assert not cron._in_window(_dt(*LAST, 21, 58))

    def test_at_start_2159(self):
        assert cron._in_window(_dt(*LAST, 21, 59))

    def test_2235_runs_on_last_day(self):
        # Ngày thường sẽ skip, cuối tháng phải chạy (khung nới tới 23:59)
        assert not cron._in_window(_dt(*NORMAL, 22, 35))
        assert cron._in_window(_dt(*LAST, 22, 35))

    def test_at_end_2359(self):
        assert cron._in_window(_dt(*LAST, 23, 59))

    def test_end_minute_tail_235959(self):
        assert cron._in_window(_dt(*LAST, 23, 59, 59))


class TestConstantsSane:
    def test_start_before_ends(self):
        assert cron.WINDOW_START < cron.WINDOW_END_NORMAL < cron.WINDOW_END_EOM

    def test_vn_offset_is_utc_plus_7(self):
        assert cron.VN_TZ.utcoffset(None).total_seconds() == 7 * 3600
