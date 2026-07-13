"""DingTalk Tin #1 'pr_fully_paid' (đơn đã đủ tiền) — producer + recompute hook.

Fires once per PR when recompute_payment_request_totals transitions state -> done.
Xem docs/HANDOFF_DUC_2026-07-13_NOTIFICATION.md (Part C).
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import payment_request_routes as prr  # noqa: E402


class _ChainTable:
    """Read-only table stub: select/eq/ilike/limit chain -> fixed rows."""

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

    def execute(self):
        return MagicMock(data=self._rows)


class _PrTable:
    """payment_requests stub: select returns live row; update mutates it in place
    (so a 2nd recompute call sees the new state -- mirrors real DB persistence)."""

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


class _OutboxTable:
    """dingtalk_outbox stub: insert() raises on duplicate (source_table, source_id,
    event_type) -- mirrors the real UNIQUE index (dedup backstop, G13)."""

    def __init__(self, sb):
        self._sb = sb

    def insert(self, payload):
        key = (payload["source_table"], payload["source_id"], payload["event_type"])
        if key in self._sb.seen_keys:
            raise Exception("duplicate key value violates unique constraint")
        self._sb.seen_keys.add(key)
        self._sb.outbox.append(payload)
        m = MagicMock()
        m.execute.return_value = MagicMock(data=[payload])
        return m


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
        if name == "dingtalk_outbox":
            return _OutboxTable(self)
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


def test_pr_fully_paid_enqueued_once_on_done():
    sb = _FakeSB(
        _pr(),
        _paid_line(1000),
        staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
        group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
    )
    prr.recompute_payment_request_totals(sb, "PR-1")
    prr.recompute_payment_request_totals(sb, "PR-1")  # idempotent -- old_state đã là "done"

    fully = [r for r in sb.outbox if r["event_type"] == "pr_fully_paid"]
    assert len(fully) == 1
    assert "PR-1" in fully[0]["message"]


def test_pr_fully_paid_not_enqueued_when_state_stays_short():
    sb = _FakeSB(
        _pr(target=2000),
        _paid_line(1000),  # 1000 < 2000 -> state vẫn "short"
        staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
        group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
    )
    prr.recompute_payment_request_totals(sb, "PR-1")
    assert sb.outbox == []


def test_pr_fully_paid_skips_when_no_active_team_group():
    sb = _FakeSB(
        _pr(),
        _paid_line(1000),
        staff_rows=[{"email": "sale@test.com", "team": "Inhouse 9"}],
        group_rows=[],  # không có group cho team này -- KHÔNG fallback OPS
    )
    prr.recompute_payment_request_totals(sb, "PR-1")
    assert sb.outbox == []


def test_pr_fully_paid_skips_when_pr_is_test():
    sb = _FakeSB(
        _pr(is_test=True),
        _paid_line(1000),
        staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
        group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
    )
    prr.recompute_payment_request_totals(sb, "PR-1")
    assert sb.outbox == []


def test_pr_fully_paid_respects_disabled_events_flag(monkeypatch):
    monkeypatch.setenv("DINGTALK_DISABLED_EVENTS", "pr_fully_paid")
    sb = _FakeSB(
        _pr(),
        _paid_line(1000),
        staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
        group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
    )
    prr.recompute_payment_request_totals(sb, "PR-1")
    assert sb.outbox == []


def test_pr_fully_paid_producer_never_raises_on_duplicate_insert():
    """Backstop G13: nếu producer bị gọi 2 lần cho cùng PR (transition guard bị
    bypass), UNIQUE(source_table, source_id, event_type) chặn dòng thứ 2 --
    except: pass phải nuốt lỗi, không được raise lên caller."""
    sb = _FakeSB(
        _pr(),
        [],
        staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
        group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
    )
    prr._enqueue_pr_fully_paid_dingtalk(sb, sb.pr_row, 1000)
    prr._enqueue_pr_fully_paid_dingtalk(sb, sb.pr_row, 1000)  # duplicate -- must not raise
    fully = [r for r in sb.outbox if r["event_type"] == "pr_fully_paid"]
    assert len(fully) == 1
