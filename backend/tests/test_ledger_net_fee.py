"""Tests for REV-04: Ghi doanh thu NET (trừ phí cổng thẻ/trả góp)."""

from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rbac import Actor
import revenue_routes as rev_mod
from report_routes import _load_ledger_revenue


class FakeQuery:
    def __init__(self, table_name: str, sb: FakeSB):
        self._table_name = table_name
        self._sb = sb
        self._filters: list[tuple[str, str]] = []
        self._is_null_filters: list[tuple[str, str]] = []
        self._or_query: str | None = None
        self._limit_n: int | None = None
        self._update_payload: dict | None = None

    def select(self, *args, **kwargs):
        return self

    def eq(self, col: str, val: str):
        self._filters.append((col, str(val)))
        return self

    def is_(self, col: str, val: str):
        self._is_null_filters.append((col, str(val)))
        return self

    def in_(self, col: str, vals: list):
        # Store as in_ filter
        str_vals = [str(v) for v in vals]
        self._filters.append((col, ("__in__", str_vals)))
        return self

    def gte(self, col: str, val: str):
        self._filters.append((col, ("__gte__", str(val))))
        return self

    def lte(self, col: str, val: str):
        self._filters.append((col, ("__lte__", str(val))))
        return self

    def or_(self, or_expr: str):
        self._or_query = or_expr
        return self

    def limit(self, n: int):
        self._limit_n = n
        return self

    def update(self, payload: dict):
        self._update_payload = dict(payload)
        return self

    def execute(self):
        table_rows = self._sb._tables.get(self._table_name, [])

        # Filter rows
        matched = []
        for r in table_rows:
            keep = True
            for col, val in self._filters:
                r_val = str(r.get(col)) if r.get(col) is not None else None
                if isinstance(val, tuple) and val[0] == "__in__":
                    if r_val not in val[1]:
                        keep = False
                        break
                elif isinstance(val, tuple) and val[0] == "__gte__":
                    if not r_val or r_val < val[1]:
                        keep = False
                        break
                elif isinstance(val, tuple) and val[0] == "__lte__":
                    if not r_val or r_val > val[1]:
                        keep = False
                        break
                elif r_val != str(val):
                    keep = False
                    break

            for col, val in self._is_null_filters:
                if val == "null" and r.get(col) is not None:
                    keep = False
                    break

            if self._or_query and keep:
                # Handle or_ e.g. "don_hang_id.eq.don-1,ma_don_hang.eq.ORD-1"
                or_pass = False
                parts = self._or_query.split(",")
                for p in parts:
                    sub = p.split(".eq.")
                    if len(sub) == 2 and str(r.get(sub[0])) == sub[1]:
                        or_pass = True
                        break
                if not or_pass:
                    keep = False

            if keep:
                matched.append(r)

        if self._update_payload is not None:
            for r in matched:
                r.update(self._update_payload)
            return MagicMock(data=matched)

        if self._limit_n is not None:
            matched = matched[: self._limit_n]

        return MagicMock(data=matched)


class FakeSB:
    def __init__(self, initial_data: dict[str, list[dict]] | None = None):
        self._tables = initial_data or {}

    def table(self, table_name: str):
        self._tables.setdefault(table_name, [])
        return FakeQuery(table_name, self)


def test_stamp_card_row_success():
    orig_row = {
        "id": "row-card-1",
        "so_tien_vnd": 10000000,
        "gmv_rmb": 2702.70,
        "ty_gia_vnd_rmb": 3700.0,
        "payment_method": "Quẹt thẻ",
        "gateway_txn_id": None,
        "phi_cong": 0,
        "so_tien_net": None,
    }
    sb = FakeSB({"so_doanh_thu": [orig_row]})

    ok = rev_mod.stamp_net_fee(
        sb,
        ledger_row_id="row-card-1",
        gateway_txn_id="txn-gw-100",
        gross_vnd=10000000,
        fee_vnd=200000,
        rate=3700.0,
    )
    assert ok is True

    row = sb._tables["so_doanh_thu"][0]
    assert row["phi_cong"] == 200000
    assert row["so_tien_net"] == 9800000
    assert row["so_tien_vnd"] == 10000000  # Gross preserved
    assert row["gateway_txn_id"] == "txn-gw-100"
    assert row["gmv_rmb"] == 2648.65  # Net GMV (9.8M / 3700)


def test_idempotent_stamping():
    orig_row = {
        "id": "row-card-2",
        "so_tien_vnd": 10000000,
        "gmv_rmb": 2702.70,
        "ty_gia_vnd_rmb": 3700.0,
        "payment_method": "Quẹt thẻ",
        "gateway_txn_id": None,
    }
    sb = FakeSB({"so_doanh_thu": [orig_row]})

    # Lần 1 -> OK
    ok1 = rev_mod.stamp_net_fee(
        sb,
        ledger_row_id="row-card-2",
        gateway_txn_id="txn-gw-100",
        gross_vnd=10000000,
        fee_vnd=200000,
        rate=3700.0,
    )
    assert ok1 is True

    # Lần 2 -> False (gateway_txn_id đã khác NULL, không trừ chồng)
    ok2 = rev_mod.stamp_net_fee(
        sb,
        ledger_row_id="row-card-2",
        gateway_txn_id="txn-gw-100",
        gross_vnd=10000000,
        fee_vnd=300000,
        rate=3700.0,
    )
    assert ok2 is False
    assert sb._tables["so_doanh_thu"][0]["phi_cong"] == 200000


def test_bc03_report_uses_net_with_gross_fallback():
    card_stamped = {
        "id": "row-card",
        "sale_crm_name": "Sale A",
        "team": "HN Inhouse",
        "so_tien_vnd": 10000000,
        "so_tien_net": 9800000,
        "phi_cong": 200000,
        "gmv_rmb": 2648.65,
        "ngay_tien_ve": "2026-07-20",
        "is_test": False,
    }
    cash_unstamped = {
        "id": "row-cash",
        "sale_crm_name": "Sale A",
        "team": "HN Inhouse",
        "so_tien_vnd": 5000000,
        "so_tien_net": None,
        "phi_cong": 0,
        "gmv_rmb": 1351.35,
        "ngay_tien_ve": "2026-07-20",
        "is_test": False,
    }
    sb = FakeSB({"so_doanh_thu": [card_stamped, cash_unstamped]})

    out, _ = _load_ledger_revenue(sb, "2026-07-01", "2026-07-31", None)
    entry = list(out.values())[0]

    # Gross total = 10M + 5M = 15M. Net total = 9.8M (card net) + 5M (cash fallback gross) = 14.8M
    assert entry["collected_vnd"] == 14800000


def test_try_auto_stamp_fee_integration():
    ledger_row = {
        "id": "row-auto-1",
        "don_hang_id": "don-100",
        "so_tien_vnd": 10000000,
        "gmv_rmb": 2702.70,
        "ty_gia_vnd_rmb": 3700.0,
        "payment_method": "Quẹt thẻ",
        "gateway_txn_id": None,
    }
    pay_line = {"id": "line-100", "payment_request_id": "pr-100"}
    gw_txn = {
        "id": "gw-txn-100",
        "payment_line_id": "line-100",
        "match_status": "matched",
        "amount": 10000000,
        "net_amount": 9800000,
    }
    sb = FakeSB({
        "so_doanh_thu": [ledger_row],
        "payment_lines": [pay_line],
        "gateway_transactions": [gw_txn],
    })

    ok = rev_mod._try_auto_stamp_fee(
        sb,
        ledger_row_id="row-auto-1",
        pr_id="pr-100",
        gross_vnd=10000000,
        rate=3700.0,
        payment_method="Quẹt thẻ",
    )
    assert ok is True
    assert sb._tables["so_doanh_thu"][0]["so_tien_net"] == 9800000
    assert sb._tables["so_doanh_thu"][0]["phi_cong"] == 200000
