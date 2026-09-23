"""GET /payment-requests/summary — chips/tabs/kpi/tvts/has_pending_qr (M2-T3).

Plan: docs/superpowers/plans/2026-09-15-pr-list-server-pagination.md
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_client(monkeypatch, summary_payload, *, name_map=None, allowed_emails=None, record_rpc=None):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    sb = MagicMock()

    def _rpc(fn, params):
        if record_rpc is not None:
            record_rpc.append((fn, params))
        r = MagicMock()
        r.execute.return_value = MagicMock(data=summary_payload)
        return r

    sb.rpc.side_effect = _rpc

    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: allowed_emails)
    monkeypatch.setattr(prr, "_sale_name_map", lambda sb: name_map or {})

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    return TestClient(app)


def _payload(**overrides):
    base = {
        "chips": {"all": 10, "pending": 2, "short": 3, "done": 4, "over": 1},
        "tabs": {"tracking": 10, "created": 6, "cancelled": 2},
        "kpi": {"total": 10, "done": 4, "over": 1, "short": 5, "received": 5_000_000, "target": 8_000_000},
        "tvts": [{"email": "sale.a@x.com", "count": 7}, {"email": "__unknown_tvts__", "count": 3}],
        "has_pending_qr": True,
    }
    base.update(overrides)
    return base


def test_summary_returns_chips_tabs_kpi(monkeypatch):
    client = _make_client(monkeypatch, _payload())
    res = client.get("/api/v1/payment-requests/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["chips"] == {"all": 10, "pending": 2, "short": 3, "done": 4, "over": 1}
    assert body["tabs"] == {"tracking": 10, "created": 6, "cancelled": 2}
    assert body["kpi"]["short"] == 5
    assert body["has_pending_qr"] is True


def test_summary_tvts_enriched_with_name_and_label(monkeypatch):
    client = _make_client(
        monkeypatch, _payload(), name_map={"sale.a@x.com": "Nguyễn Thị A"}
    )
    res = client.get("/api/v1/payment-requests/summary")
    tvts = res.json()["tvts"]
    a = next(t for t in tvts if t["email"] == "sale.a@x.com")
    assert a["name"] == "Nguyễn Thị A"
    assert a["label"] == "Nguyễn Thị A"
    assert a["count"] == 7


def test_summary_unknown_tvts_label_is_khong_ro_tvts(monkeypatch):
    """mirror deriveTvtsOptions fallback 'Không rõ TVTS' cho bucket __unknown_tvts__."""
    client = _make_client(monkeypatch, _payload())
    tvts = client.get("/api/v1/payment-requests/summary").json()["tvts"]
    unknown = next(t for t in tvts if t["email"] == "__unknown_tvts__")
    assert unknown["label"] == "Không rõ TVTS"


def test_summary_tvts_falls_back_to_email_local_part_when_no_name(monkeypatch):
    """mirror tvtsLabelOf: saleName > phần trước @ của email > 'Không rõ TVTS'."""
    client = _make_client(monkeypatch, _payload(), name_map={})
    tvts = client.get("/api/v1/payment-requests/summary").json()["tvts"]
    a = next(t for t in tvts if t["email"] == "sale.a@x.com")
    assert a["label"] == "sale.a"


def test_summary_forwards_filters_to_rpc(monkeypatch):
    calls = []
    client = _make_client(monkeypatch, _payload(), record_rpc=calls)
    client.get(
        "/api/v1/payment-requests/summary?date_from=2026-09-01&date_to=2026-09-30&is_test=false&tvts=a@x.com"
    )
    fn, params = calls[0]
    assert fn == "pr_list_summary"
    assert params["p_from"] == "2026-09-01T00:00:00+07:00"
    assert params["p_to"] == "2026-09-30T23:59:59.999999+07:00"
    assert params["p_is_test"] is False
    assert params["p_tvts"] == ["a@x.com"]


def test_summary_missing_rpc_returns_503(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    sb = MagicMock()
    rpc_mock = MagicMock()
    rpc_mock.execute.side_effect = lambda: (_ for _ in ()).throw(
        Exception("Could not find the function public.pr_list_summary in the schema cache")
    )
    sb.rpc.return_value = rpc_mock
    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: None)

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    res = TestClient(app).get("/api/v1/payment-requests/summary")
    assert res.status_code == 503


def test_summary_route_declared_before_dynamic_id_route(monkeypatch):
    """Route-order test tường minh (M2-T9): /summary KHÔNG bị /{payment_request_id} bắt."""
    client = _make_client(monkeypatch, _payload())
    res = client.get("/api/v1/payment-requests/summary")
    assert res.status_code == 200
    # Nếu bị {payment_request_id} bắt nhầm, endpoint detail sẽ query payment_requests
    # theo id="summary" và trả 404 "Khong tim thay" thay vì object summary thật.
    assert "chips" in res.json()
