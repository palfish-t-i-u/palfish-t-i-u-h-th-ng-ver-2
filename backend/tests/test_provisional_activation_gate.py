"""Cổng "đủ tạm" pre-mPOS: đơn quẹt thẻ/trả góp báo đơn được ngay khi có bill.

Bao trùm:
- activatable_received: net(paid) + gross(pending card/installment CÓ bill).
- assert_pr_paid(sb, pr) chữ ký mới.
- G-ZALO (cao nhất): cổng KHÔNG ghi payment_lines → trigger trg_payment_paid_zalo
  không thể fire → không có tin "ĐÃ VÀO TK" giả. Test assert 0 thao tác ghi.
"""
from __future__ import annotations

import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pr_guards import activatable_received, assert_pr_paid


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Chỉ hỗ trợ read-chain của activatable_received; ghi lại mọi thao tác ghi."""

    def __init__(self, table, rows, writes):
        self.table = table
        self.rows = rows
        self.writes = writes
        self.filters = []

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def in_(self, key, values):
        self.filters.append((key, ("in", set(str(v) for v in values))))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        matched = list(self.rows)
        for key, value in self.filters:
            if isinstance(value, tuple) and value[0] == "in":
                matched = [r for r in matched if str(r.get(key)) in value[1]]
            else:
                matched = [r for r in matched if r.get(key) == value]
        return _Result(matched)

    # --- mọi thao tác ghi đều bị ghi nhận (không được xảy ra ở đường cổng) ---
    def update(self, payload):
        self.writes.append(("update", self.table, payload))
        return self

    def insert(self, payload):
        self.writes.append(("insert", self.table, payload))
        return self

    def delete(self):
        self.writes.append(("delete", self.table, None))
        return self


class FakeSB:
    def __init__(self, lines=None):
        self.tables = {"payment_lines": lines or []}
        self.writes = []

    def table(self, name):
        return _Query(name, self.tables.get(name, []), self.writes)


def _line(method="card", status="pending", amount=1000, bill=True):
    row = {"payment_request_id": "PR-1", "method": method, "status": status,
           "amount": amount, "bill_image": "https://x/b.jpg" if bill else "",
           "bill_images": []}
    return row


def _pr(received=0, target=1000, **ov):
    base = {"id": "PR-1", "received": received, "target": target}
    base.update(ov)
    return base


# --------------------------------------------------------------------------
# activatable_received — ma trận
# --------------------------------------------------------------------------

class TestActivatableReceived:
    def test_paid_qr_equals_received(self):
        # line paid không được cộng lại (received đã gồm nó); pending rỗng
        sb = FakeSB(lines=[])
        assert activatable_received(sb, _pr(received=2000)) == 2000

    def test_card_pending_with_bill_adds_gross(self):
        sb = FakeSB(lines=[_line("card", "pending", 1000, bill=True)])
        assert activatable_received(sb, _pr(received=0)) == 1000

    def test_card_pending_without_bill_excluded(self):
        sb = FakeSB(lines=[_line("card", "pending", 1000, bill=False)])
        assert activatable_received(sb, _pr(received=0)) == 0

    def test_qr_pending_excluded(self):
        sb = FakeSB(lines=[_line("qr", "pending", 1000, bill=True)])
        assert activatable_received(sb, _pr(received=0)) == 0

    def test_cash_pending_excluded(self):
        sb = FakeSB(lines=[_line("cash", "pending", 1000, bill=True)])
        assert activatable_received(sb, _pr(received=0)) == 0

    def test_installment_pending_billimages_adds_gross(self):
        row = _line("installment", "pending", 1500, bill=False)
        row["bill_images"] = ["https://x/1.jpg"]
        sb = FakeSB(lines=[row])
        assert activatable_received(sb, _pr(received=0)) == 1500

    def test_mixed_qr_paid_plus_card_pending(self):
        # received (qr net) = 500; card pending gross 700 → 1200
        sb = FakeSB(lines=[_line("card", "pending", 700, bill=True)])
        assert activatable_received(sb, _pr(received=500)) == 1200

    def test_empty_id_returns_received_no_query(self):
        sb = FakeSB(lines=[_line("card", "pending", 9999, bill=True)])
        # id rỗng → không query → chỉ received gốc
        assert activatable_received(sb, _pr(received=300, id="")) == 300

    def test_query_error_failclosed_returns_received(self):
        class BoomSB:
            def table(self, _n):
                raise RuntimeError("db down")
        assert activatable_received(BoomSB(), _pr(received=800)) == 800


# --------------------------------------------------------------------------
# assert_pr_paid — chữ ký mới
# --------------------------------------------------------------------------

class TestAssertPrPaid:
    def test_card_only_deadlock_passes_with_bill(self):
        sb = FakeSB(lines=[_line("card", "pending", 1000, bill=True)])
        # received thật = 0, state short — trước đây bị chặn; nay đủ tạm → pass
        assert_pr_paid(sb, _pr(received=0, target=1000, state="short"))  # no raise

    def test_card_only_without_bill_blocked(self):
        sb = FakeSB(lines=[_line("card", "pending", 1000, bill=False)])
        with pytest.raises(HTTPException) as exc:
            assert_pr_paid(sb, _pr(received=0, target=1000, state="short"))
        assert exc.value.status_code == 400
        assert "da_thu=0/1000" in exc.value.detail

    def test_state_done_passes_even_without_lines(self):
        sb = FakeSB(lines=[])
        assert_pr_paid(sb, _pr(received=1000, target=1000, state="done"))  # no raise

    def test_qr_pending_still_blocked(self):
        sb = FakeSB(lines=[_line("qr", "pending", 1000, bill=True)])
        with pytest.raises(HTTPException) as exc:
            assert_pr_paid(sb, _pr(received=0, target=1000, state="short"))
        assert exc.value.status_code == 400


# --------------------------------------------------------------------------
# G-ZALO (regression cao nhất) — cổng KHÔNG ghi payment_lines
# --------------------------------------------------------------------------

class TestGZaloNoLineWrite:
    def test_gate_performs_zero_writes(self):
        """assert_pr_paid + activatable_received cho đơn card pending+bill KHÔNG
        được update/insert/delete bảng nào. Line giữ pending → trg_payment_paid_zalo
        không fire → không có tin "ĐÃ VÀO TK" giả (sự cố PR-2026-0945 7/8)."""
        sb = FakeSB(lines=[_line("card", "pending", 1000, bill=True)])
        assert_pr_paid(sb, _pr(received=0, target=1000, state="short"))
        activatable_received(sb, _pr(received=0, target=1000))
        assert sb.writes == [], f"Cổng không được ghi DB, nhưng thấy: {sb.writes}"


# --------------------------------------------------------------------------
# Q4 / G-LEDGERDATE — sổ lấy ngày/kiểu từ line thẻ pending khi chưa có line paid
# --------------------------------------------------------------------------

class TestLedgerResolverProvisional:
    def _sb_card_pending(self):
        row = _line("card", "pending", 1000, bill=True)
        row["created_at"] = "2026-08-05T10:00:00+00:00"
        row["paid_at"] = None
        return FakeSB(lines=[row])

    def test_date_falls_back_to_card_created_at(self):
        from datetime import date
        import revenue_routes as rr
        d = rr._resolve_payment_date_from_pr(self._sb_card_pending(), "PR-1")
        assert d == date(2026, 8, 5)  # ngày quẹt, KHÔNG phải hôm nay

    def test_method_falls_back_to_card_line(self):
        import revenue_routes as rr
        m = rr._resolve_payment_method_from_pr(self._sb_card_pending(), "PR-1")
        assert m != "", "kiểu thanh toán không được rỗng cho đơn thẻ pending"

    def test_no_line_returns_today_and_empty(self):
        from datetime import datetime, timezone
        import revenue_routes as rr
        sb = FakeSB(lines=[])
        assert rr._resolve_payment_date_from_pr(sb, "PR-1") == datetime.now(timezone.utc).date()
        assert rr._resolve_payment_method_from_pr(sb, "PR-1") == ""
