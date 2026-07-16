"""DingTalk Tin #1 'pr_fully_paid' (đơn đã đủ tiền) — verify that auto-trigger is removed."""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import payment_request_routes as prr  # noqa: E402


class _ChainTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def ilike(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def execute(self):
        return MagicMock(data=self._rows)


class _PrTable:
    def __init__(self, sb):
        self._sb = sb
        self._pending_update = None

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def update(self, payload):
        self._pending_update = payload
        return self

    def execute(self):
        if self._pending_update is not None:
            self._sb.pr_row.update(self._pending_update)
            self._pending_update = None
        return MagicMock(data=[dict(self._sb.pr_row)])


class _FakeSB:
    def __init__(self, pr_row, line_rows, staff_rows=None, group_rows=None):
        self.pr_row = pr_row
        self.line_rows = line_rows
        self.staff_rows = staff_rows or []
        self.group_rows = group_rows or []
        self.outbox: list[dict] = []
        self.seen_keys: set[tuple] = set()

    def table(self, name):
        if name == "payment_requests":
            return _PrTable(self)
        if name == "payment_lines":
            return _ChainTable(self.line_rows)
        if name == "nhan_su_sale":
            return _ChainTable(self.staff_rows)
        if name == "dingtalk_team_groups":
            return _ChainTable(self.group_rows)
        if name == "pr_completion_reports":
            return _ChainTable([])
        return MagicMock()


def _pr(**overrides):
    base = {
        "id": "PR-1", "target": 1000, "received": 0, "state": "short",
        "sale_email": "sale@test.com", "name": "Học viên A", "child_name": None,
        "is_test": False,
    }
    base.update(overrides)
    return base


def _paid_line(amount=1000, **overrides):
    base = {"amount": amount, "status": "paid", "method": "qr", "verified_received": None}
    base.update(overrides)
    return [base]


def test_pr_fully_paid_no_longer_auto_enqueued_on_done():
    """Verify that transitioning state -> done during recompute does NOT automatically enqueue outbox."""
    sb = _FakeSB(
        _pr(),
        _paid_line(1000),
        staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
        group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
    )
    prr.recompute_payment_request_totals(sb, "PR-1")
    assert sb.pr_row["state"] == "done"
    # Ensure no pr_fully_paid event was enqueued automatically
    fully = [r for r in sb.outbox if r["event_type"] == "pr_fully_paid"]
    assert len(fully) == 0
