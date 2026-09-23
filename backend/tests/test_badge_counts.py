"""GET /payment-requests/badge-counts — {reconciliation, activation, invoice} (M2-T5, Opus inline).

reconciliation mirror countAwaitingTransactions (paymentFlowUtils.ts:180-191): 1 line
không cancelled/rejected/paid LUÔN là 'awaiting' → đơn giản hoá thành count(status='pending').
activation mirror countPendingAr (:193-195) qua deriveArStatus (:131-137).
invoice mirror countPendingInvoice (:197-207): course có invoice_requested_at mà chưa invoiced.
"""
from __future__ import annotations

import os
import sys
from typing import Any
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _FilterableQuery:
    """Fake query builder áp eq() thật (không blindly trả nguyên list) — để test
    xác nhận đúng câu lệnh .eq('status','pending') THỰC SỰ được gọi, không phải
    chỉ tin theo data cố định sẵn."""

    def __init__(self, rows):
        self.rows = list(rows)
        self.filters: list[tuple[str, Any]] = []

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def neq(self, key, value):
        self.filters.append((key, ("__neq__", value)))
        return self

    def in_(self, key, values):
        values = set(str(v) for v in values)
        self.filters.append((key, ("__in__", values)))
        return self

    def execute(self):
        matched = self.rows
        for key, value in self.filters:
            if isinstance(value, tuple) and value[0] == "__neq__":
                matched = [r for r in matched if r.get(key) != value[1]]
            elif isinstance(value, tuple) and value[0] == "__in__":
                matched = [r for r in matched if str(r.get(key)) in value[1]]
            else:
                matched = [r for r in matched if r.get(key) == value]
        return MagicMock(data=matched, count=len(matched))


def _make_client(monkeypatch, *, pr_rows, line_rows=None, ar_rows=None, allowed_emails=None):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    def _table(name):
        if name == "payment_requests":
            return _FilterableQuery(pr_rows)
        if name == "payment_lines":
            return _FilterableQuery(line_rows or [])
        if name == "active_requests":
            return _FilterableQuery(ar_rows or [])
        return _FilterableQuery([])

    sb = MagicMock()
    sb.table.side_effect = _table

    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: allowed_emails)

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    return TestClient(app)


def _pr(i):
    return {"id": f"PR-{i}", "sale_email": "sale.a@x.com", "state": "pending"}


def test_reconciliation_counts_pending_lines_only(monkeypatch):
    """Line paid/rejected KHÔNG tính; chỉ status='pending' tính vào reconciliation."""
    lines = [
        {"id": "l1", "status": "pending", "method": "qr", "payment_request_id": "PR-1"},
        {"id": "l2", "status": "paid", "method": "qr", "payment_request_id": "PR-1"},
        {"id": "l3", "status": "rejected", "method": "qr", "payment_request_id": "PR-1"},
        {"id": "l4", "status": "pending", "method": "cash", "payment_request_id": "PR-1"},
    ]
    client = _make_client(monkeypatch, pr_rows=[_pr(1)], line_rows=lines)
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.status_code == 200
    assert res.json()["reconciliation"] == 2


def test_activation_case1_no_ar_at_all(monkeypatch):
    """PR không có AR nào -> activation = 0 (không tính, vì chưa 'Đã tạo gói học' để chờ)."""
    client = _make_client(monkeypatch, pr_rows=[_pr(1)], ar_rows=[])
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.json()["activation"] == 0


def test_activation_empty_courses_is_pending_order(monkeypatch):
    """AR tồn tại nhưng uids_data rỗng -> deriveArStatus rơi vào pending_order (đếm)."""
    ars = [{"id": "AR-1", "pr_id": "PR-1", "uids_data": []}]
    client = _make_client(monkeypatch, pr_rows=[_pr(1)], ar_rows=ars)
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.json()["activation"] == 1


def test_activation_all_courses_have_order_id_not_pending(monkeypatch):
    ars = [{"id": "AR-1", "pr_id": "PR-1", "uids_data": [
        {"courses": [{"order_id": "OID-1"}, {"order_id": "OID-2"}]}
    ]}]
    client = _make_client(monkeypatch, pr_rows=[_pr(1)], ar_rows=ars)
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.json()["activation"] == 0


def test_activation_all_courses_invoiced_not_pending(monkeypatch):
    """Mọi course đã invoiced -> status 'invoiced', KHÔNG phải pending_order dù chưa có orderId."""
    ars = [{"id": "AR-1", "pr_id": "PR-1", "uids_data": [
        {"courses": [{"invoiced": True}, {"invoiced": True}]}
    ]}]
    client = _make_client(monkeypatch, pr_rows=[_pr(1)], ar_rows=ars)
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.json()["activation"] == 0


def test_activation_partial_order_id_still_pending(monkeypatch):
    """1/2 course có orderId (không phải TẤT CẢ) -> vẫn pending_order, KHÔNG phải activated."""
    ars = [{"id": "AR-1", "pr_id": "PR-1", "uids_data": [
        {"courses": [{"order_id": "OID-1"}, {"order_id": ""}]}
    ]}]
    client = _make_client(monkeypatch, pr_rows=[_pr(1)], ar_rows=ars)
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.json()["activation"] == 1


def test_invoice_counts_requested_not_yet_invoiced(monkeypatch):
    ars = [{"id": "AR-1", "pr_id": "PR-1", "uids_data": [
        {"courses": [
            {"invoice_requested_at": "2026-09-01T00:00:00Z", "invoiced": False},
            {"invoice_requested_at": "2026-09-02T00:00:00Z", "invoiced": True},  # đã xuất -> không tính
            {"invoice_requested_at": None, "invoiced": False},  # chưa yêu cầu -> không tính
        ]}
    ]}]
    client = _make_client(monkeypatch, pr_rows=[_pr(1)], ar_rows=ars)
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.json()["invoice"] == 1


def test_badge_counts_scoped_by_rbac_emails(monkeypatch):
    """Chỉ đếm trên payment_requests trong scope RBAC — sale chỉ thấy PR của mình."""
    client = _make_client(
        monkeypatch, pr_rows=[_pr(1)], allowed_emails=["sale.a@x.com"],
        line_rows=[{"id": "l1", "status": "pending", "payment_request_id": "PR-1"}],
    )
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.status_code == 200
    assert res.json()["reconciliation"] == 1


def test_badge_counts_no_pr_in_scope_returns_all_zero(monkeypatch):
    client = _make_client(monkeypatch, pr_rows=[])
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.json() == {"reconciliation": 0, "activation": 0, "invoice": 0}


class _RangedQuery:
    """Fake query builder mô phỏng PostgREST cắt 1000 dòng/response — .range() SLICE
    thật (khác _FilterableQuery.range() no-op) để verify vòng loop pr_query gộp đủ
    khi payment_requests > 1000 dòng (G1-T1, badge-counts trước đây bị cắt)."""

    def __init__(self, rows):
        self.rows = list(rows)

    def select(self, *_a, **_k):
        return self

    def neq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._start, self._end = start, end
        return self

    def execute(self):
        return MagicMock(data=self.rows[self._start : self._end + 1])


def test_badge_counts_over_1000_pr_not_cut_by_postgrest_default(monkeypatch):
    """payment_requests > 1000 dòng (scope admin/ops) -> pr_query phải loop .range()
    gộp đủ, không dừng ở batch đầu (mô phỏng lỗi F1 đã sửa: trước đây thiếu .range()
    nên PostgREST tự cắt 1000, badge đếm thiếu ~40%)."""
    total_pr = 1234
    pr_rows = [{"id": f"PR-{i}", "sale_email": "sale.a@x.com", "state": "pending"} for i in range(total_pr)]
    # Tất cả 1234 PR đều có 1 line pending -> reconciliation phải = 1234 nếu KHÔNG bị cắt.
    line_rows = [
        {"id": f"l{i}", "status": "pending", "payment_request_id": f"PR-{i}"} for i in range(total_pr)
    ]

    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    def _table(name):
        if name == "payment_requests":
            return _RangedQuery(pr_rows)
        if name == "payment_lines":
            return _FilterableQuery(line_rows)
        if name == "active_requests":
            return _FilterableQuery([])
        return _FilterableQuery([])

    sb = MagicMock()
    sb.table.side_effect = _table
    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: None)

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    client = TestClient(app)

    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.status_code == 200
    assert res.json()["reconciliation"] == total_pr
