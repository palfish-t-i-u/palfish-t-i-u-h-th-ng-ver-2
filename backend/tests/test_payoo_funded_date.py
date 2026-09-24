"""Tests for Payoo funded_date auto-fill from SePay settlement (batch-range)."""
from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sepay_routes import (
    is_payoo_settlement,
    _parse_payoo_settle_range,
    _try_fill_payoo_funded_date,
)

REAL_PAYOO_CONTENT = (
    "Payoo CT DS N10.7 12.7.2026 cho TKECOM. PY3 PALFISH EC- Ma GD ACSP/123456"
)
REAL_MPOS_CONTENT = (
    "VCBCSH.888210.53e76c202659491fba2e6c027e479f19. 1112608259442547 "
    "CDSNL18846922 TT 381468427 PC 79492392 CT tu 1064604204 CTCP CONG TG THANH"
)

VN_TZ = timezone(timedelta(hours=7))


# ---------------------------------------------------------------------------
# FakeSB — supports select/eq/is_/update/execute for gateway_transactions
# ---------------------------------------------------------------------------
class Query:
    def __init__(self, table_name, rows):
        self._table_name = table_name
        self._rows = rows
        self._preds = []
        self._update_data = None

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self._preds.append(lambda r, k=key, v=value: r.get(k) == v)
        return self

    def neq(self, key, value):
        self._preds.append(lambda r, k=key, v=value: r.get(k) != v)
        return self

    def is_(self, key, value):
        if value == "null":
            self._preds.append(lambda r, k=key: r.get(k) is None)
        else:
            self._preds.append(lambda r, k=key, v=value: r.get(k) is v)
        return self

    def gte(self, key, value):
        self._preds.append(lambda r, k=key, v=value: str(r.get(k) or "") >= str(v))
        return self

    def lte(self, key, value):
        self._preds.append(lambda r, k=key, v=value: str(r.get(k) or "") <= str(v))
        return self

    def gt(self, key, value):
        self._preds.append(lambda r, k=key, v=value: float(r.get(k) or 0) > value)
        return self

    def in_(self, key, values):
        vals = set(str(v) for v in values)
        self._preds.append(lambda r, k=key, vs=vals: str(r.get(k)) in vs)
        return self

    def update(self, data):
        self._update_data = data
        return self

    def execute(self):
        matched = [r for r in self._rows if all(p(r) for p in self._preds)]
        if self._update_data is not None:
            for r in matched:
                r.update(self._update_data)
            return MagicMock(data=matched)
        return MagicMock(data=matched)


class FakeSB:
    def __init__(self, tables: dict):
        self._tables = {k: list(v) for k, v in tables.items()}

    def table(self, name):
        return Query(name, self._tables.setdefault(name, []))


def _gw(gid, net, day, funded=None):
    """Gateway Payoo row quẹt ngày `day` (YYYY-MM-DD)."""
    return {
        "id": gid,
        "source": "payoo",
        "net_amount": net,
        "funded_date": funded,
        "paid_at": f"{day}T10:00:00+00:00",
    }


# ---------------------------------------------------------------------------
# is_payoo_settlement
# ---------------------------------------------------------------------------
class TestIsPayooSettlement:
    def test_payoo_content_returns_true(self):
        assert is_payoo_settlement(REAL_PAYOO_CONTENT) is True

    def test_mpos_content_returns_false(self):
        assert is_payoo_settlement(REAL_MPOS_CONTENT) is False

    def test_normal_ck_returns_false(self):
        assert is_payoo_settlement("Nguyen Van A chuyen tien hoc phi") is False

    def test_empty_returns_false(self):
        assert is_payoo_settlement("") is False
        assert is_payoo_settlement(None) is False


# ---------------------------------------------------------------------------
# _parse_payoo_settle_range
# ---------------------------------------------------------------------------
class TestParsePayooSettleRange:
    def test_single_day(self):
        assert _parse_payoo_settle_range(
            "Payoo CT DS N23.9.2026 cho TK ECOM. PY3 PALFISH EC"
        ) == (date(2026, 9, 23), date(2026, 9, 23))

    def test_range_same_month(self):
        assert _parse_payoo_settle_range(REAL_PAYOO_CONTENT) == (
            date(2026, 7, 10),
            date(2026, 7, 12),
        )

    def test_range_cross_month(self):
        assert _parse_payoo_settle_range(
            "Payoo CT DS N28.8 2.9.2026 cho TK ECOM. PY3 PALFISH EC"
        ) == (date(2026, 8, 28), date(2026, 9, 2))

    def test_range_cross_year(self):
        # Tháng đầu (12) > tháng cuối (1) → ngày đầu thuộc năm trước.
        assert _parse_payoo_settle_range("Payoo CT DS N30.12 2.1.2027 cho TK ECOM") == (
            date(2026, 12, 30),
            date(2027, 1, 2),
        )

    def test_unparseable_returns_none(self):
        assert _parse_payoo_settle_range("Nguyen Van A chuyen tien hoc phi") is None
        assert _parse_payoo_settle_range("") is None
        assert _parse_payoo_settle_range(None) is None


# ---------------------------------------------------------------------------
# _try_fill_payoo_funded_date (batch-range)
# ---------------------------------------------------------------------------
class TestTryFillPayooFundedDate:
    def _sb(self, gateway_rows):
        return FakeSB({"gateway_transactions": gateway_rows})

    def test_single_day_two_same_amount_both_filled(self):
        """Lô 1 ngày, 2 đơn cùng net (case 1-to-1 cũ chết) → cả 2 được fill."""
        content = "Payoo CT DS N23.9.2026 cho TK ECOM. PY3 PALFISH EC"
        g1 = _gw("g1", 9376620.0, "2026-09-23")
        g2 = _gw("g2", 9376620.0, "2026-09-23")
        sb = self._sb([g1, g2])
        bank_date = datetime(2026, 9, 24, 14, 39, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 18753240.0, bank_date, "84244968", content)

        assert result == 2
        assert g1["funded_date"] == "2026-09-24T14:39:00"
        assert g2["funded_date"] == "2026-09-24T14:39:00"
        assert g1["settlement_code"] == "PAYOO-84244968"
        assert g2["settlement_code"] == "PAYOO-84244968"

    def test_multi_day_range_fills_all(self):
        """Dải 10→12/7, đơn rải 3 ngày → cả lô fill khi Σnet == cục."""
        g1 = _gw("g1", 4000000.0, "2026-07-10")
        g2 = _gw("g2", 5000000.0, "2026-07-11")
        g3 = _gw("g3", 3254880.0, "2026-07-12")
        sb = self._sb([g1, g2, g3])
        bank_date = datetime(2026, 7, 13, 7, 55, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 12254880.0, bank_date, "s-713", REAL_PAYOO_CONTENT)

        assert result == 3
        for g in (g1, g2, g3):
            assert g["funded_date"] == "2026-07-13T07:55:00"
            assert g["settlement_code"] == "PAYOO-s-713"

    def test_cross_month_range(self):
        content = "Payoo CT DS N28.8 2.9.2026 cho TK ECOM. PY3 PALFISH EC"
        g1 = _gw("g1", 10000000.0, "2026-08-28")
        g2 = _gw("g2", 7639380.0, "2026-09-02")
        sb = self._sb([g1, g2])
        bank_date = datetime(2026, 9, 3, 8, 16, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 17639380.0, bank_date, "s-903", content)

        assert result == 2
        assert g1["funded_date"] == "2026-09-03T08:16:00"
        assert g2["funded_date"] == "2026-09-03T08:16:00"

    def test_sum_mismatch_no_fill(self):
        """Σnet != cục → bỏ qua, không fill (chống gán nhầm lô)."""
        content = "Payoo CT DS N23.9.2026 cho TK ECOM. PY3 PALFISH EC"
        g1 = _gw("g1", 9376620.0, "2026-09-23")
        sb = self._sb([g1])
        bank_date = datetime(2026, 9, 24, 14, 39, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 9000000.0, bank_date, "s-x", content)

        assert result == 0
        assert g1["funded_date"] is None

    def test_only_unfunded_rows_updated(self):
        """1 đơn đã funded + 1 chưa; Σnet cả 2 == cục → chỉ đơn chưa funded được set."""
        content = "Payoo CT DS N23.9.2026 cho TK ECOM. PY3 PALFISH EC"
        g1 = _gw("g1", 9376620.0, "2026-09-23", funded="2026-09-24T14:39:00")
        g2 = _gw("g2", 9376620.0, "2026-09-23")
        sb = self._sb([g1, g2])
        bank_date = datetime(2026, 9, 24, 14, 39, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 18753240.0, bank_date, "s-2", content)

        assert result == 1
        assert g2["funded_date"] == "2026-09-24T14:39:00"

    def test_funded_date_vn_naive_no_tz(self):
        """G1: funded_date lưu VN naive, không có tzinfo."""
        content = "Payoo CT DS N14.9.2026 cho TK ECOM. PY3 PALFISH EC"
        g1 = _gw("g1", 10000000.0, "2026-09-14")
        sb = self._sb([g1])
        bank_date = datetime(2026, 9, 14, 3, 26, 0, tzinfo=VN_TZ)

        _try_fill_payoo_funded_date(sb, 10000000.0, bank_date, "s-tz", content)

        funded = g1["funded_date"]
        assert funded == "2026-09-14T03:26:00"
        assert "+" not in funded and "Z" not in funded

    def test_mpos_rows_not_summed(self):
        """Chỉ cộng/khớp đơn source='payoo' — mPOS cùng ngày không tính."""
        content = "Payoo CT DS N23.9.2026 cho TK ECOM. PY3 PALFISH EC"
        payoo = _gw("p1", 8172450.0, "2026-09-23")
        mpos = {"id": "m1", "source": "mpos", "net_amount": 5000000.0,
                "funded_date": None, "paid_at": "2026-09-23T09:00:00+00:00"}
        sb = self._sb([payoo, mpos])
        bank_date = datetime(2026, 9, 24, 14, 39, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 8172450.0, bank_date, "s-p", content)

        assert result == 1
        assert payoo["funded_date"] == "2026-09-24T14:39:00"
        assert mpos["funded_date"] is None

    def test_order_outside_range_excluded(self):
        """Đơn quẹt ngoài dải không được cộng/fill."""
        content = "Payoo CT DS N23.9.2026 cho TK ECOM. PY3 PALFISH EC"
        in_range = _gw("g1", 8172450.0, "2026-09-23")
        out_range = _gw("g2", 9376620.0, "2026-09-24")  # 24/9, ngoài dải
        sb = self._sb([in_range, out_range])
        bank_date = datetime(2026, 9, 24, 14, 39, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 8172450.0, bank_date, "s-r", content)

        assert result == 1
        assert in_range["funded_date"] == "2026-09-24T14:39:00"
        assert out_range["funded_date"] is None

    def test_unparseable_content_no_fill(self):
        g1 = _gw("g1", 9376620.0, "2026-09-23")
        sb = self._sb([g1])
        bank_date = datetime(2026, 9, 24, 14, 39, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 9376620.0, bank_date, "s-np", "CK khong co ngay")

        assert result == 0
        assert g1["funded_date"] is None


# ---------------------------------------------------------------------------
# BC04 dedup for Payoo
# ---------------------------------------------------------------------------
class TestBC04PayooDedup:
    """Verify that Payoo bank settlement rows are excluded from BC04 when
    per-order gateway rows with matching settlement_code exist."""

    def test_payoo_settlement_deduped_when_gateway_has_code(self):
        """G2: Payoo bank settlement skipped when PAYOO-{sepay_id} in known codes."""
        from report_routes import _load_bc04_bank_rows

        known_codes = {"PAYOO-sepay-abc"}
        bank_rows = [
            {
                "txn_id": "b1", "amount": 18422580.0,
                "account_number": "1680011668899",
                "match_status": "ignored",
                "content": REAL_PAYOO_CONTENT,
                "sepay_id": "sepay-abc",
                "transaction_date": "2026-09-18T10:30:00+07:00",
                "payment_line_id": None,
            },
        ]
        sb = FakeSB({"bank_transactions": bank_rows, "payment_lines": [], "payment_requests": []})
        rows = _load_bc04_bank_rows(sb, "2026-09-18", "2026-09-18", known_codes)
        assert len(rows) == 0, "Payoo settlement should be deduped"

    def test_payoo_settlement_kept_when_no_matching_code(self):
        """Payoo settlement shown when no gateway has matching code (unfilled)."""
        from report_routes import _load_bc04_bank_rows

        known_codes = set()
        bank_rows = [
            {
                "txn_id": "b2", "amount": 17443580.0,
                "account_number": "1680011668899",
                "match_status": "ignored",
                "content": REAL_PAYOO_CONTENT,
                "sepay_id": "sepay-def",
                "transaction_date": "2026-09-14T09:00:00+07:00",
                "payment_line_id": None,
            },
        ]
        sb = FakeSB({"bank_transactions": bank_rows, "payment_lines": [], "payment_requests": []})
        rows = _load_bc04_bank_rows(sb, "2026-09-14", "2026-09-14", known_codes)
        assert len(rows) == 1, "Payoo settlement should show when not deduped"

    def test_mpos_settlement_not_affected_by_payoo_dedup(self):
        """mPOS settlement with PC dedup still works, Payoo dedup doesn't interfere."""
        from report_routes import _load_bc04_bank_rows

        known_codes = {"79492392"}
        bank_rows = [
            {
                "txn_id": "b3", "amount": 60732000.0,
                "account_number": "1680011668899",
                "match_status": "ignored",
                "content": REAL_MPOS_CONTENT,
                "sepay_id": "sepay-mpos",
                "transaction_date": "2026-08-25T03:26:00+07:00",
                "payment_line_id": None,
            },
        ]
        sb = FakeSB({"bank_transactions": bank_rows, "payment_lines": [], "payment_requests": []})
        rows = _load_bc04_bank_rows(sb, "2026-08-25", "2026-08-25", known_codes)
        assert len(rows) == 0, "mPOS settlement deduped by PC as before"
