"""GET /payment-requests/badge-counts — từ 2026-09-24 endpoint gọi RPC pr_badge_counts
(gộp ~36 round-trip cũ -> 1 SQL, 6-13s -> ~100ms). BE chỉ MAP kết quả RPC; đúng-sai của
việc ĐẾM (reconciliation/activation/invoice) verify bằng SQL trực tiếp `select pr_badge_counts(...)`
trên DB (mirror _ar_status_is_pending_order + _course_*), KHÔNG ở unit test này.

Test này chốt tầng BE: gọi đúng RPC + truyền p_emails = scope visible_creator_emails;
map sang int; shape lạ (list-wrap / None) an toàn; RPC lỗi -> 500.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_client(monkeypatch, *, rpc_return, allowed_emails=None, rpc_raises=False):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    calls: dict = {}

    def _rpc(fn, params):
        calls["fn"] = fn
        calls["params"] = params
        m = MagicMock()
        if rpc_raises:
            m.execute.side_effect = RuntimeError("boom")
        else:
            m.execute.return_value = MagicMock(data=rpc_return)
        return m

    sb = MagicMock()
    sb.rpc.side_effect = _rpc

    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: allowed_emails)

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    return TestClient(app), calls


def test_badge_counts_maps_rpc_result(monkeypatch):
    client, calls = _make_client(
        monkeypatch, rpc_return={"reconciliation": 89, "activation": 341, "invoice": 12}
    )
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.status_code == 200
    assert res.json() == {"reconciliation": 89, "activation": 341, "invoice": 12}
    assert calls["fn"] == "pr_badge_counts"


def test_badge_counts_passes_scope_emails(monkeypatch):
    client, calls = _make_client(
        monkeypatch,
        rpc_return={"reconciliation": 1, "activation": 2, "invoice": 3},
        allowed_emails=["sale.a@x.com", "sale.b@x.com"],
    )
    client.get("/api/v1/payment-requests/badge-counts")
    assert calls["params"] == {"p_emails": ["sale.a@x.com", "sale.b@x.com"]}


def test_badge_counts_admin_scope_null_emails(monkeypatch):
    client, calls = _make_client(
        monkeypatch, rpc_return={"reconciliation": 0, "activation": 0, "invoice": 0}, allowed_emails=None
    )
    client.get("/api/v1/payment-requests/badge-counts")
    assert calls["params"] == {"p_emails": None}


def test_badge_counts_list_wrapped_result(monkeypatch):
    # PostgREST đôi khi bọc kết quả RPC trong list 1 phần tử.
    client, _ = _make_client(
        monkeypatch, rpc_return=[{"reconciliation": 5, "activation": 0, "invoice": 0}]
    )
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.json()["reconciliation"] == 5


def test_badge_counts_none_result_safe(monkeypatch):
    client, _ = _make_client(monkeypatch, rpc_return=None)
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.json() == {"reconciliation": 0, "activation": 0, "invoice": 0}


def test_badge_counts_rpc_error_returns_500(monkeypatch):
    client, _ = _make_client(monkeypatch, rpc_return=None, rpc_raises=True)
    res = client.get("/api/v1/payment-requests/badge-counts")
    assert res.status_code == 500
