"""Tests for REV-01 Việc 2a: mọi báo cáo dùng ngay_tien_ve làm kỳ doanh thu."""

from __future__ import annotations

import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import revenue_routes as rev_mod


# ---------------------------------------------------------------------------
# Unit: ky_doanh_thu trả ngay_tien_ve
# ---------------------------------------------------------------------------

def test_ky_doanh_thu_returns_ngay_tien_ve():
    row = {"ngay_tien_ve": "2026-07-15", "pay_time": "2026-07-14T23:30:00"}
    result = rev_mod.ky_doanh_thu(row)
    assert result == date(2026, 7, 15)


def test_ky_doanh_thu_ignores_pay_time_when_ngay_tien_ve_present():
    # pay_time ở ngày khác không ảnh hưởng kết quả
    row = {"ngay_tien_ve": "2026-07-15", "pay_time": "2026-07-16T01:00:00"}
    assert rev_mod.ky_doanh_thu(row) == date(2026, 7, 15)


def test_ky_doanh_thu_none_when_no_ngay_tien_ve():
    row = {"pay_time": "2026-07-15T00:00:00"}
    assert rev_mod.ky_doanh_thu(row) is None


# ---------------------------------------------------------------------------
# Unit: _row_pay_date dùng ky_doanh_thu (ngay_tien_ve)
# ---------------------------------------------------------------------------

def test_row_pay_date_uses_ngay_tien_ve():
    # Trường hợp pay_time lệch ngay_tien_ve — kỳ theo ngay_tien_ve
    row = {"ngay_tien_ve": "2026-07-15", "pay_time": "2026-07-16T00:00:00"}
    result = rev_mod._row_pay_date(row)
    assert result == date(2026, 7, 15)


def test_row_pay_date_no_fallback_to_pay_time():
    # Nếu không có ngay_tien_ve, trả None (không fallback pay_time)
    row = {"pay_time": "2026-07-15T00:00:00"}
    assert rev_mod._row_pay_date(row) is None


# ---------------------------------------------------------------------------
# Unit: _row_month_date cũng dùng ngay_tien_ve (đã đúng, verify không thay đổi)
# ---------------------------------------------------------------------------

def test_row_month_date_uses_ngay_tien_ve():
    row = {"ngay_tien_ve": "2026-07-15", "pay_time": "2026-07-16T00:00:00"}
    result = rev_mod._row_month_date(row)
    assert result == date(2026, 7, 15)


# ---------------------------------------------------------------------------
# Consistency: BC01 bucket (month) và BC02 bucket (day) cùng kỳ doanh thu
# ---------------------------------------------------------------------------

def test_bc01_bc02_same_period_for_same_row():
    """
    Cùng 1 dòng → BC01 (month bucket) và BC02 (day bucket)
    đều đọc ngay_tien_ve, không dùng pay_time.
    """
    row = {
        "ngay_tien_ve": "2026-07-15",
        "pay_time": "2026-07-16T01:00:00",  # Lệch 1 ngày so ngay_tien_ve
    }
    bc01_day = rev_mod._row_month_date(row)
    bc02_day = rev_mod._row_pay_date(row)
    assert bc01_day == bc02_day == date(2026, 7, 15)


def test_diverged_pay_time_does_not_change_period():
    """
    Dòng có pay_time::date ≠ ngay_tien_ve → cả 2 bucket vẫn theo ngay_tien_ve.
    Đây là AC2 của acceptance criteria (dòng lệch rơi kỳ theo ngay_tien_ve).
    """
    row = {
        "ngay_tien_ve": "2026-06-30",
        "pay_time": "2026-07-01T00:00:00",  # Ngày khác tháng
    }
    assert rev_mod._row_pay_date(row) == date(2026, 6, 30)
    assert rev_mod._row_month_date(row) == date(2026, 6, 30)
