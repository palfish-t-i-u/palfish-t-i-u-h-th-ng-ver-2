"""Tests for Payoo funded_date auto-fill from SePay settlement."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sepay_routes import is_payoo_settlement, _try_fill_payoo_funded_date

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
# _try_fill_payoo_funded_date
# ---------------------------------------------------------------------------
class TestTryFillPayooFundedDate:
    def _make_sb(self, gateway_rows):
        return FakeSB({"gateway_transactions": gateway_rows})

    def test_happy_path_1to1_match(self):
        """Exactly 1 unfunded Payoo gateway txn matches bank_amount → fill."""
        gw = {"id": "gw-1", "source": "payoo", "funded_date": None, "net_amount": 18422580.0}
        sb = self._make_sb([gw])
        bank_date = datetime(2026, 9, 18, 10, 30, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 18422580.0, bank_date, "sepay-abc")

        assert result == 1
        assert gw["funded_date"] == "2026-09-18T10:30:00"  # VN naive, no tz
        assert gw["settlement_code"] == "PAYOO-sepay-abc"

    def test_amount_mismatch_no_fill(self):
        """Bank amount doesn't match any gateway → no fill."""
        gw = {"id": "gw-1", "source": "payoo", "funded_date": None, "net_amount": 18422580.0}
        sb = self._make_sb([gw])
        bank_date = datetime(2026, 9, 18, 10, 0, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 18000000.0, bank_date, "sepay-x")

        assert result == 0
        assert gw["funded_date"] is None

    def test_multiple_matches_no_fill(self):
        """Multiple gateway txns match same amount → ambiguous, skip."""
        gw1 = {"id": "gw-1", "source": "payoo", "funded_date": None, "net_amount": 5000000.0}
        gw2 = {"id": "gw-2", "source": "payoo", "funded_date": None, "net_amount": 5000000.0}
        sb = self._make_sb([gw1, gw2])
        bank_date = datetime(2026, 9, 18, 10, 0, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 5000000.0, bank_date, "sepay-y")

        assert result == 0
        assert gw1["funded_date"] is None
        assert gw2["funded_date"] is None

    def test_mpos_gateway_not_matched(self):
        """Only matches source='payoo', not mPOS."""
        gw = {"id": "gw-1", "source": "mpos", "funded_date": None, "net_amount": 18422580.0}
        sb = self._make_sb([gw])
        bank_date = datetime(2026, 9, 18, 10, 0, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 18422580.0, bank_date, "sepay-z")

        assert result == 0

    def test_already_funded_not_matched(self):
        """Gateway with funded_date already set → not matched (is_ null filter)."""
        gw = {"id": "gw-1", "source": "payoo", "funded_date": "2026-09-17T10:00:00",
              "net_amount": 18422580.0}
        sb = self._make_sb([gw])
        bank_date = datetime(2026, 9, 18, 10, 0, 0, tzinfo=VN_TZ)

        result = _try_fill_payoo_funded_date(sb, 18422580.0, bank_date, "sepay-w")

        assert result == 0

    def test_funded_date_vn_naive_no_tz(self):
        """G1: funded_date stored as VN naive — no timezone info."""
        gw = {"id": "gw-1", "source": "payoo", "funded_date": None, "net_amount": 10000000.0}
        sb = self._make_sb([gw])
        bank_date = datetime(2026, 9, 14, 3, 26, 0, tzinfo=VN_TZ)

        _try_fill_payoo_funded_date(sb, 10000000.0, bank_date, "sepay-tz")

        funded = gw["funded_date"]
        assert funded is not None
        assert "+" not in funded  # no timezone offset
        assert "Z" not in funded
        assert funded == "2026-09-14T03:26:00"


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
