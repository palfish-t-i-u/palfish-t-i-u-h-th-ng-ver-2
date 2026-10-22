"""Tests for REV-03: Luật mốc 22h — ky_tu_gio_thuc + auto-sync paths."""

from __future__ import annotations

import contextlib
import os
import sys
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import revenue_routes as rev_mod

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def vn(year, month, day, hour, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=VN_TZ)


def utc(year, month, day, hour, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# FakeSB for integration tests
# ---------------------------------------------------------------------------

class FakeQuery:
    def __init__(self, data: list[dict]):
        self._data = list(data)
        self._insert_capture: list[dict] | None = None
        self._update_capture: list[dict] | None = None

    def select(self, *a, **kw): return self
    def eq(self, col, val):
        self._data = [r for r in self._data if r.get(col) == val]
        return self
    def order(self, *a, **kw): return self
    def limit(self, n):
        self._data = self._data[:n]
        return self
    def update(self, payload):
        if self._update_capture is not None:
            self._update_capture.append(dict(payload))
        for r in self._data:
            r.update(payload)
        return self
    def insert(self, payload):
        self._insert_capture.append(dict(payload))
        # Return a query whose execute() yields the inserted row with an id
        row = {**payload, "id": "new-id-1"}
        q = FakeQuery([row])
        q._insert_capture = self._insert_capture
        return q
    def execute(self):
        return MagicMock(data=list(self._data))


class FakeSB:
    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = {k: list(v) for k, v in tables.items()}
        self.inserted: list[dict] = []
        self.updated: list[dict] = []

    def table(self, name: str):
        data = self._tables.get(name, [])
        q = FakeQuery(data)
        # Wire insert/update capture for so_doanh_thu
        q._insert_capture = self.inserted
        q._update_capture = self.updated
        return q


# ---------------------------------------------------------------------------
# A. ky_tu_gio_thuc — unit tests
# ---------------------------------------------------------------------------

class TestKyTuGioThuc:
    def test_before_22h_stays_same_day(self):
        assert rev_mod.ky_tu_gio_thuc(vn(2026, 7, 15, 21, 59)) == date(2026, 7, 15)

    def test_at_22h_shifts_to_next_day(self):
        assert rev_mod.ky_tu_gio_thuc(vn(2026, 7, 15, 22, 0)) == date(2026, 7, 16)

    def test_after_22h_shifts_to_next_day(self):
        assert rev_mod.ky_tu_gio_thuc(vn(2026, 7, 15, 23, 30)) == date(2026, 7, 16)

    def test_last_day_of_month_22h_stays(self):
        # ngoại lệ: cuối tháng giữ nguyên, không nhảy M+1
        assert rev_mod.ky_tu_gio_thuc(vn(2026, 7, 31, 22, 30)) == date(2026, 7, 31)

    def test_last_day_of_month_23h_stays(self):
        assert rev_mod.ky_tu_gio_thuc(vn(2026, 6, 30, 23, 59)) == date(2026, 6, 30)

    def test_first_day_after_midnight_stays(self):
        assert rev_mod.ky_tu_gio_thuc(vn(2026, 8, 1, 0, 30)) == date(2026, 8, 1)

    def test_utc_16h30_becomes_vn_23h30_next_day(self):
        # 16:30 UTC = 23:30 VN 15/7 → ngày 16
        assert rev_mod.ky_tu_gio_thuc(utc(2026, 7, 15, 16, 30)) == date(2026, 7, 16)

    def test_utc_midnight_correct_vn_date(self):
        # 00:00 UTC = 07:00 VN → cùng ngày
        assert rev_mod.ky_tu_gio_thuc(utc(2026, 7, 15, 0, 0)) == date(2026, 7, 15)

    def test_february_last_day_leap_year(self):
        assert rev_mod.ky_tu_gio_thuc(vn(2028, 2, 29, 22, 30)) == date(2028, 2, 29)

    def test_february_last_day_non_leap(self):
        assert rev_mod.ky_tu_gio_thuc(vn(2026, 2, 28, 22, 30)) == date(2026, 2, 28)


# ---------------------------------------------------------------------------
# B. _parse_datetime
# ---------------------------------------------------------------------------

class TestParseDatetime:
    def test_naive_string_treated_as_vn(self):
        dt = rev_mod._parse_datetime("2026-07-15T22:30:00")
        assert dt is not None
        assert dt.tzinfo == VN_TZ

    def test_aware_string_preserves_tz(self):
        dt = rev_mod._parse_datetime("2026-07-15T15:30:00+07:00")
        assert dt is not None
        assert dt.utcoffset().total_seconds() == 7 * 3600

    def test_none_returns_none(self):
        assert rev_mod._parse_datetime(None) is None

    def test_empty_returns_none(self):
        assert rev_mod._parse_datetime("") is None

    def test_naive_datetime_object_treated_as_vn(self):
        naive = datetime(2026, 7, 15, 22, 30)
        assert rev_mod._parse_datetime(naive).tzinfo == VN_TZ


# ---------------------------------------------------------------------------
# C. AR path (sync_ledger_from_ar_course)
# ---------------------------------------------------------------------------

AR_COURSE_CODE = "COURSE-001"
AR_ORDER_ID = "CRM-001"

def _make_ar_tables(paid_at: str | None = "2026-07-15T22:30:00+07:00"):
    """Tables for AR integration tests. UID="" to skip loose-match path."""
    payment_line = {"paid_at": paid_at, "created_at": paid_at, "status": "paid",
                    "payment_request_id": "pr-1"}
    return {
        "active_requests": [{
            "id": "ar-1",
            "pr_id": "pr-1",
            "customer_name": "KH Test",
            "uids_data": [{
                "uid": "",
                "phone": "",
                "courses": [{
                    "code": AR_COURSE_CODE,
                    "amount": 3_000_000,
                    "name": "Gói 1 năm",
                    "order_id": AR_ORDER_ID,
                }],
            }],
        }],
        "payment_requests": [{"id": "pr-1", "uid": "", "phone": "", "name": "KH", "is_test": False}],
        "payment_lines": [payment_line] if paid_at else [],
        "so_doanh_thu": [],
    }


def test_ar_sync_22h_shifts_to_next_day():
    """paid_at 22:30 VN → ngay_tien_ve = N+1, pay_time = giờ thực."""
    sb = FakeSB(_make_ar_tables("2026-07-15T22:30:00+07:00"))

    with patch.object(rev_mod, "_resolve_team", return_value="HN Inhouse"), \
         patch.object(rev_mod, "_resolve_sale_from_pr_email", return_value=("Sale A", "sale@test.com")), \
         patch.object(rev_mod, "_resolve_payment_method_from_pr", return_value="CK"), \
         patch.object(rev_mod, "_resolve_payment_time_from_pr",
                      return_value=vn(2026, 7, 15, 22, 30)), \
         patch.object(rev_mod, "_try_auto_stamp_fee", return_value=False):
        result = rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)

    assert result is not None, "sync trả None — insert thất bại"
    assert sb.inserted, "Không có dòng nào được insert"
    row = sb.inserted[0]
    assert row["ngay_tien_ve"] == "2026-07-16", f"Expected 2026-07-16, got {row['ngay_tien_ve']}"
    assert "T00:00:00" not in row["pay_time"], "pay_time vẫn là nửa đêm"


def test_ar_sync_before_22h_stays_same_day():
    """paid_at 21:59 VN → ngay_tien_ve = ngày N."""
    sb = FakeSB(_make_ar_tables("2026-07-15T21:59:00+07:00"))

    with patch.object(rev_mod, "_resolve_team", return_value="HN Inhouse"), \
         patch.object(rev_mod, "_resolve_sale_from_pr_email", return_value=("Sale A", "sale@test.com")), \
         patch.object(rev_mod, "_resolve_payment_method_from_pr", return_value="CK"), \
         patch.object(rev_mod, "_resolve_payment_time_from_pr",
                      return_value=vn(2026, 7, 15, 21, 59)), \
         patch.object(rev_mod, "_try_auto_stamp_fee", return_value=False):
        rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)

    assert sb.inserted
    assert sb.inserted[0]["ngay_tien_ve"] == "2026-07-15"


def test_ar_sync_no_time_falls_back_to_midnight():
    """Không truy được giờ thực → fallback nửa đêm, ngay_tien_ve = resolver date."""
    sb = FakeSB(_make_ar_tables(None))

    with patch.object(rev_mod, "_resolve_team", return_value="HN Inhouse"), \
         patch.object(rev_mod, "_resolve_sale_from_pr_email", return_value=("Sale A", "sale@test.com")), \
         patch.object(rev_mod, "_resolve_payment_method_from_pr", return_value="CK"), \
         patch.object(rev_mod, "_resolve_payment_time_from_pr", return_value=None), \
         patch.object(rev_mod, "_resolve_payment_date_from_pr", return_value=date(2026, 7, 15)), \
         patch.object(rev_mod, "_try_auto_stamp_fee", return_value=False):
        rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)

    assert sb.inserted
    row = sb.inserted[0]
    assert row["ngay_tien_ve"] == "2026-07-15"
    assert "T00:00:00" in row["pay_time"], "fallback phải là nửa đêm"


# ---------------------------------------------------------------------------
# C2. M1 real-time: đơn ĐÃ BÁO nhưng CHƯA kích hoạt (chưa order_id)
# ---------------------------------------------------------------------------

def _make_ar_tables_baodon(order_id: str = "", paid_at: str | None = "2026-07-15T21:59:00+07:00",
                           so_doanh_thu: list | None = None):
    course = {"code": AR_COURSE_CODE, "amount": 3_000_000, "name": "Gói 1 năm"}
    if order_id:
        course["order_id"] = order_id
    return {
        "active_requests": [{
            "id": "ar-1", "pr_id": "pr-1", "customer_name": "KH Test",
            "uids_data": [{"uid": "", "phone": "", "courses": [course]}],
        }],
        "payment_requests": [{"id": "pr-1", "uid": "", "phone": "", "name": "KH", "is_test": False}],
        "payment_lines": [{"paid_at": paid_at, "created_at": paid_at, "status": "paid",
                           "payment_request_id": "pr-1"}] if paid_at else [],
        "so_doanh_thu": so_doanh_thu if so_doanh_thu is not None else [],
    }


def _patch_resolvers(pay_time):
    return [
        patch.object(rev_mod, "_resolve_team", return_value="HN Inhouse"),
        patch.object(rev_mod, "_resolve_sale_from_pr_email", return_value=("Sale A", "sale@test.com")),
        patch.object(rev_mod, "_resolve_payment_method_from_pr", return_value="CK"),
        patch.object(rev_mod, "_resolve_payment_time_from_pr", return_value=pay_time),
        patch.object(rev_mod, "_resolve_payment_date_from_pr", return_value=date(2026, 7, 15)),
        patch.object(rev_mod, "_try_auto_stamp_fee", return_value=False),
    ]


def test_baodon_no_orderid_with_payment_writes_flagged_row():
    """Báo đơn chưa order_id + tiền đã về → ghi Sổ ngay, cờ chưa-kích-hoạt (crm_order_id None)."""
    sb = FakeSB(_make_ar_tables_baodon(order_id=""))
    with contextlib.ExitStack() as st:
        for p in _patch_resolvers(vn(2026, 7, 15, 21, 59)):
            st.enter_context(p)
        result = rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)
    assert result is not None
    assert sb.inserted, "Báo đơn có tiền phải ghi Sổ"
    row = sb.inserted[0]
    assert row["crm_order_id"] is None, "Dòng báo đơn phải để crm_order_id None (cờ chưa kích hoạt)"
    assert row["ma_don_hang"] == AR_COURSE_CODE
    assert row["loai_nhap"] == "tu_dong"


def test_baodon_no_orderid_no_payment_does_not_write():
    """Báo đơn chưa order_id VÀ chưa có tiền → KHÔNG ghi Sổ."""
    sb = FakeSB(_make_ar_tables_baodon(order_id="", paid_at=None))
    with contextlib.ExitStack() as st:
        for p in _patch_resolvers(None):
            st.enter_context(p)
        result = rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)
    assert result is None
    assert not sb.inserted, "Chưa có tiền thì không được ghi Sổ"


def test_activation_after_baodon_updates_same_row_no_dup():
    """Đã có dòng báo-đơn (crm_order_id None); kích hoạt (order_id) → UPDATE chính dòng, không đẻ mới."""
    existing = [{"id": "sodt-1", "loai_nhap": "tu_dong", "ma_don_hang": AR_COURSE_CODE,
                 "crm_order_id": None}]
    sb = FakeSB(_make_ar_tables_baodon(order_id=AR_ORDER_ID, so_doanh_thu=existing))
    with contextlib.ExitStack() as st:
        for p in _patch_resolvers(vn(2026, 7, 15, 21, 59)):
            st.enter_context(p)
        result = rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)
    assert result == "sodt-1", "Phải trả id dòng báo-đơn cũ (idempotent)"
    assert not sb.inserted, "KHÔNG được insert dòng mới khi kích hoạt đơn đã báo"
    assert any(u.get("crm_order_id") == AR_ORDER_ID for u in sb.updated), "Phải gắn order_id vào dòng cũ"


# ---------------------------------------------------------------------------
# D. M3 path (sync_ledger_from_m3_order)
# ---------------------------------------------------------------------------

def _make_m3_tables():
    return {
        "so_doanh_thu": [],
        "don_hang": [{
            "id": "don-1",
            "so_tien_can_thu": 5_000_000,
            "sale_crm_name": "Sale A",
            "created_by": "sale@test.com",
            "ma_don_hang": "MA-001",
            "crm_order_id": "CRM-001",
            "goi_hoc": "Gói 1 năm",
            "nguon_doanh_thu": "广告",
            "lead_kenh": "FB",
            "khach_hang_id": "kh-1",
        }],
        "khach_hang": [{"id": "kh-1", "ho_ten": "KH A", "crm_uid": "UID1",
                        "phone": "0912345678", "country_dial": None}],
    }


def test_m3_sync_22h_last_day_stays():
    """22:00 ngày cuối tháng → ngoại lệ → giữ nguyên tháng."""
    sb = FakeSB(_make_m3_tables())

    with patch.object(rev_mod, "_resolve_team", return_value="HN Inhouse"), \
         patch.object(rev_mod, "_resolve_payment_time",
                      return_value=vn(2026, 7, 31, 22, 0)):
        rev_mod.sync_ledger_from_m3_order(sb, "don-1", "sale@test.com")

    assert sb.inserted
    row = sb.inserted[0]
    assert row["ngay_tien_ve"] == "2026-07-31"
    assert "T00:00:00" not in row["pay_time"]


def test_m3_sync_22h_mid_month_shifts_to_next():
    """22:00 giữa tháng → sang ngày hôm sau."""
    sb = FakeSB(_make_m3_tables())

    with patch.object(rev_mod, "_resolve_team", return_value="HN Inhouse"), \
         patch.object(rev_mod, "_resolve_payment_time",
                      return_value=vn(2026, 7, 15, 22, 0)):
        rev_mod.sync_ledger_from_m3_order(sb, "don-1", "sale@test.com")

    assert sb.inserted
    assert sb.inserted[0]["ngay_tien_ve"] == "2026-07-16"


def test_m3_sync_no_time_fallback_midnight():
    """Không truy được giờ → fallback nửa đêm."""
    sb = FakeSB(_make_m3_tables())

    with patch.object(rev_mod, "_resolve_team", return_value="HN Inhouse"), \
         patch.object(rev_mod, "_resolve_payment_time", return_value=None), \
         patch.object(rev_mod, "_resolve_payment_date", return_value=date(2026, 7, 15)):
        rev_mod.sync_ledger_from_m3_order(sb, "don-1", "sale@test.com")

    assert sb.inserted
    row = sb.inserted[0]
    assert row["ngay_tien_ve"] == "2026-07-15"
    assert "T00:00:00" in row["pay_time"]


# ---------------------------------------------------------------------------
# E. Nguồn (loai) tự động fill + guard không lật tag Thủ công (anh Minh 12/8)
# ---------------------------------------------------------------------------

def _make_ar_tables_loai(
    lead_source: str | None = "quang_cao",
    lead_channel: str | None = None,
    uid: str = "UID-LOAI-1",
    existing_ledger: list[dict] | None = None,
):
    """Tables cho nhóm test Nguồn (loai): PR có lead_source/lead_channel + UID
    thật (để loose_match chạy được) + so_doanh_thu khởi tạo theo existing_ledger."""
    payment_line = {"paid_at": "2026-08-10T10:00:00+07:00",
                     "created_at": "2026-08-10T10:00:00+07:00",
                     "status": "paid", "payment_request_id": "pr-1"}
    return {
        "active_requests": [{
            "id": "ar-1",
            "pr_id": "pr-1",
            "customer_name": "KH Test",
            "uids_data": [{
                "uid": uid,
                "phone": "0900000000",
                "courses": [{
                    "code": AR_COURSE_CODE,
                    "amount": 3_000_000,
                    "name": "Gói 1 năm",
                    "order_id": AR_ORDER_ID,
                }],
            }],
        }],
        "payment_requests": [{
            "id": "pr-1", "uid": uid, "phone": "0900000000", "name": "KH",
            "is_test": False, "lead_source": lead_source, "lead_channel": lead_channel,
        }],
        "payment_lines": [payment_line],
        "so_doanh_thu": existing_ledger or [],
    }


@contextlib.contextmanager
def _patch_sync():
    with patch.object(rev_mod, "_resolve_team", return_value="HN Inhouse"), \
         patch.object(rev_mod, "_resolve_sale_from_pr_email", return_value=("Sale A", "sale@test.com")), \
         patch.object(rev_mod, "_resolve_payment_method_from_pr", return_value="CK"), \
         patch.object(rev_mod, "_resolve_payment_time_from_pr", return_value=vn(2026, 8, 10, 10, 0)), \
         patch.object(rev_mod, "_try_auto_stamp_fee", return_value=False):
        yield


def test_ar_sync_insert_fills_loai_from_lead_source():
    """Dòng mới (không match gì có sẵn) → loai lấy từ lead_source qua resolve_loai_from_lead_source."""
    sb = FakeSB(_make_ar_tables_loai(lead_source="quang_cao"))

    with _patch_sync():
        result = rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)

    assert result is not None
    assert sb.inserted, "Không có dòng nào được insert"
    assert sb.inserted[0]["loai"] == "广告"


def test_ar_sync_order_match_manual_row_dedups_without_flipping_tag():
    """order_match trúng dòng Thủ công (import sheet) → chỉ dedup (trả id cũ),
    KHÔNG lật loai_nhap sang tu_dong (bug 130 dòng, anh Minh 12/8)."""
    existing = [{
        "id": "sdt-manual-1",
        "crm_order_id": AR_ORDER_ID,
        "loai_nhap": "tay",
        "loai": None,
        "uid": "UID-LOAI-1",
        "ngay_tien_ve": "2026-08-10",
        "so_tien_vnd": 3_000_000,
    }]
    sb = FakeSB(_make_ar_tables_loai(lead_source="quang_cao", existing_ledger=existing))

    with _patch_sync():
        result = rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)

    assert result == "sdt-manual-1"
    assert not sb.inserted, "Không được insert dòng mới — phải dedup vào dòng cũ"
    row = sb._tables["so_doanh_thu"][0]
    assert row["loai_nhap"] == "tay", "Dòng thủ công bị lật tag — đây chính là bug 130 dòng"
    assert row["loai"] is None, "Dòng thủ công không được app ghi đè loai"


def test_ar_sync_loose_match_manual_row_dedups_without_flipping_tag():
    """loose_match (uid+ngày+tiền, không cùng crm_order_id) trúng dòng Thủ công
    → cũng chỉ dedup, không lật tag."""
    existing = [{
        "id": "sdt-manual-2",
        "crm_order_id": "SHEET-OLD-ID",  # khác order_id AR → order_match không trúng
        "loai_nhap": "tay",
        "loai": None,
        "uid": "UID-LOAI-1",
        "ngay_tien_ve": "2026-08-10",
        "so_tien_vnd": 3_000_000,
    }]
    sb = FakeSB(_make_ar_tables_loai(lead_source="gioi_thieu", existing_ledger=existing))

    with _patch_sync():
        result = rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)

    assert result == "sdt-manual-2"
    assert not sb.inserted
    row = sb._tables["so_doanh_thu"][0]
    assert row["loai_nhap"] == "tay", "Dòng thủ công bị lật tag qua loose_match"
    assert row["crm_order_id"] == "SHEET-OLD-ID", "Không được ghi đè crm_order_id của dòng thủ công"


def test_ar_sync_order_match_hoan_row_dedups_without_flipping_tag():
    """order_match trúng dòng ghi giảm/hoàn (loai_nhap='hoan') → cũng chỉ dedup,
    không lật tag — guard áp dụng cho cả 'tay' lẫn 'hoan', không riêng 1 giá trị."""
    existing = [{
        "id": "sdt-hoan-1",
        "crm_order_id": AR_ORDER_ID,
        "loai_nhap": "hoan",
        "loai": None,
        "uid": "UID-LOAI-1",
        "ngay_tien_ve": "2026-08-10",
        "so_tien_vnd": 3_000_000,
    }]
    sb = FakeSB(_make_ar_tables_loai(lead_source="quang_cao", existing_ledger=existing))

    with _patch_sync():
        result = rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)

    assert result == "sdt-hoan-1"
    assert not sb.inserted
    row = sb._tables["so_doanh_thu"][0]
    assert row["loai_nhap"] == "hoan", "Dòng ghi giảm/hoàn bị lật tag sang tu_dong"


def test_ar_sync_order_match_auto_row_fills_loai_only_when_blank():
    """order_match trúng dòng Tự động ĐÃ có loai sẵn → không ghi đè (giữ giá trị cũ)."""
    existing = [{
        "id": "sdt-auto-1",
        "crm_order_id": AR_ORDER_ID,
        "loai_nhap": "tu_dong",
        "loai": "续费",  # đã có sẵn, khác với "广告" mà lead_source="quang_cao" sẽ tính ra
        "uid": "UID-LOAI-1",
        "ngay_tien_ve": "2026-08-10",
        "so_tien_vnd": 3_000_000,
    }]
    sb = FakeSB(_make_ar_tables_loai(lead_source="quang_cao", existing_ledger=existing))

    with _patch_sync():
        result = rev_mod.sync_ledger_from_ar_course(sb, "ar-1", AR_COURSE_CODE)

    assert result == "sdt-auto-1"
    row = sb._tables["so_doanh_thu"][0]
    assert row["loai_nhap"] == "tu_dong"
    assert row["loai"] == "续费", "loai đã có sẵn không được ghi đè khi re-sync"
