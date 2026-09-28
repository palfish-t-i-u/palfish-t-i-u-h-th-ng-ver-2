"""Regression: hủy (reject) lần thanh toán phải nhả giao dịch ngân hàng + thẻ
đã ghép về pending. Tái hiện sự cố PR-2026-1819 (giao dịch mồ côi treo
manual_matched trỏ line rejected).

Canh trực tiếp helper _unlink_reconciliation_txns — đơn vị chứa fix.
Guardrail: G2 (không đụng txn line khác), G3 (cả 2 bảng bank+gateway),
G4 (line không có txn vẫn chạy), G5 (không đụng payment_lines).
Xem docs/plans/PLAN_REJECT_LINE_UNLINK_BANK_TXN_2026-09-28.md.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import payment_request_routes as prr


class Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.patch = None
        self._limit = None

    def select(self, *_args, **_kwargs):
        return self

    def limit(self, value):
        self._limit = value
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def update(self, patch):
        self.patch = patch
        return self

    def execute(self):
        matched = list(self.rows)
        for key, value in self.filters:
            matched = [row for row in matched if row.get(key) == value]
        if self.patch is not None:
            for row in matched:
                row.update(self.patch)
            return MagicMock(data=matched)
        if self._limit is not None:
            matched = matched[: self._limit]
        return MagicMock(data=matched)


class FakeSB:
    def __init__(self):
        self.tables = {
            # L1 = line bị reject (đã gắn 1 bank txn SePay thật + 1 gateway thẻ)
            # L2 = line khác, txn của nó KHÔNG được đụng
            "bank_transactions": [
                {"txn_id": "T1", "amount": 9010000, "match_status": "manual_matched",
                 "payment_line_id": "L1", "matched_by": "ketoan@x", "matched_payment_id": "p1"},
                {"txn_id": "T2", "amount": 5000000, "match_status": "manual_matched",
                 "payment_line_id": "L2", "matched_by": "ketoan@x", "matched_payment_id": "p2"},
            ],
            "gateway_transactions": [
                {"id": "G1", "amount": 9010000, "match_status": "matched",
                 "payment_line_id": "L1", "matched_by": "ketoan@x", "matched_at": "2026-09-28T00:00:00+00:00"},
            ],
            "payment_lines": [
                {"id": "L1", "payment_request_id": "PR-A", "status": "rejected"},
                {"id": "L2", "payment_request_id": "PR-B", "status": "paid"},
            ],
        }

    def table(self, name):
        return Query(self.tables.setdefault(name, []))


def _bank(sb, txn_id):
    return next(r for r in sb.tables["bank_transactions"] if r["txn_id"] == txn_id)


def _gw(sb, gid):
    return next(r for r in sb.tables["gateway_transactions"] if r["id"] == gid)


@patch("audit.log_audit", lambda *a, **k: None)
def test_reject_unlinks_bank_and_gateway():
    """G3: reject L1 → bank T1 + gateway G1 về pending, payment_line_id NULL."""
    sb = FakeSB()
    prr._unlink_reconciliation_txns(sb, "L1", "ketoan@x")

    t1 = _bank(sb, "T1")
    assert t1["match_status"] == "pending"
    assert t1["payment_line_id"] is None
    assert t1["matched_by"] is None
    assert t1["matched_payment_id"] is None
    assert t1["updated_at"]  # bank CÓ updated_at → phải set
    # bẫy schema: bank không có cột matched_at → helper KHÔNG được set
    assert "matched_at" not in t1

    g1 = _gw(sb, "G1")
    assert g1["match_status"] == "pending"
    assert g1["payment_line_id"] is None
    assert g1["matched_by"] is None
    assert g1["matched_at"] is None
    # bẫy schema: gateway không có matched_payment_id NGOẠI updated_at → KHÔNG set
    assert "matched_payment_id" not in g1
    assert "updated_at" not in g1


@patch("audit.log_audit", lambda *a, **k: None)
def test_reject_does_not_touch_other_line_txn():
    """G2: txn T2 (thuộc L2) nguyên vẹn sau khi reject L1."""
    sb = FakeSB()
    prr._unlink_reconciliation_txns(sb, "L1", "ketoan@x")

    t2 = _bank(sb, "T2")
    assert t2["match_status"] == "manual_matched"
    assert t2["payment_line_id"] == "L2"
    assert t2["matched_by"] == "ketoan@x"


@patch("audit.log_audit", lambda *a, **k: None)
def test_reject_does_not_touch_payment_lines():
    """G5: helper chỉ nhả txn, KHÔNG đụng payment_lines (status line do nhánh reject lo)."""
    sb = FakeSB()
    before = [dict(r) for r in sb.tables["payment_lines"]]
    prr._unlink_reconciliation_txns(sb, "L1", "ketoan@x")
    assert sb.tables["payment_lines"] == before


@patch("audit.log_audit", lambda *a, **k: None)
def test_reject_line_without_txn_ok():
    """G4: reject line không có txn nào → không throw, không đụng txn khác."""
    sb = FakeSB()
    prr._unlink_reconciliation_txns(sb, "L-no-txn", "ketoan@x")

    assert _bank(sb, "T1")["match_status"] == "manual_matched"
    assert _bank(sb, "T2")["match_status"] == "manual_matched"
    assert _gw(sb, "G1")["match_status"] == "matched"
