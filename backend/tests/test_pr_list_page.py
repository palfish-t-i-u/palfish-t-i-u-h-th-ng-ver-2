"""GET /payment-requests?view=page — server-side pagination (M2-T2).

Plan: docs/superpowers/plans/2026-09-15-pr-list-server-pagination.md
Mock RPC pr_list_page trả [{pr:{...}, filtered_total: N}] — pattern mock theo
tests/test_pr_list_load_all.py:16-56 (MagicMock chainable query builder).
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _pr_row(i, **overrides):
    row = {
        "id": f"PR-SEED-{i:05d}",
        "name": f"Khach {i}",
        "uid": f"U{i}",
        "phone": f"8439{i:06d}",
        "sale_email": "sale.a@x.com",
        "state": "pending",
        "target": 1_000_000,
        "created_at": f"2026-09-{(i % 28) + 1:02d}T00:00:00+00:00",
    }
    row.update(overrides)
    return row


def _make_client(monkeypatch, rpc_rows, *, allowed_emails=None, line_rows=None, ar_rows=None, record_rpc=None):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    def _table(name):
        t = MagicMock()
        for m in ("select", "eq", "order", "range", "limit", "in_"):
            getattr(t, m).return_value = t
        if name == "payment_lines":
            t.execute.return_value = MagicMock(data=line_rows or [], count=len(line_rows or []))
        elif name == "active_requests":
            t.execute.return_value = MagicMock(data=ar_rows or [])
        else:
            t.execute.return_value = MagicMock(data=[])
        return t

    sb = MagicMock()
    sb.table.side_effect = _table

    def _rpc(fn, params):
        if record_rpc is not None:
            record_rpc.append((fn, params))
        r = MagicMock()
        r.execute.return_value = MagicMock(data=rpc_rows)
        return r

    sb.rpc.side_effect = _rpc

    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: allowed_emails)
    monkeypatch.setattr(prr, "_sale_name_map", lambda sb: {})
    monkeypatch.setattr(prr, "_staff_map", lambda sb: {})

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    return TestClient(app)


def test_view_page_returns_requests_total_page_page_size(monkeypatch):
    rpc_rows = [{"pr": _pr_row(1), "filtered_total": 3}, {"pr": _pr_row(2), "filtered_total": 3}]
    client = _make_client(monkeypatch, rpc_rows)
    res = client.get("/api/v1/payment-requests?view=page&page=1&page_size=50")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["page_size"] == 50
    assert len(body["requests"]) == 2
    assert {r["id"] for r in body["requests"]} == {"PR-SEED-00001", "PR-SEED-00002"}


def test_view_page_empty_result_has_total_zero(monkeypatch):
    client = _make_client(monkeypatch, [])
    res = client.get("/api/v1/payment-requests?view=page")
    assert res.status_code == 200
    body = res.json()
    assert body["requests"] == []
    assert body["total"] == 0


def test_view_page_passes_offset_from_page_number(monkeypatch):
    """page=3, page_size=50 -> p_offset=100 (mirror (page-1)*page_size)."""
    calls: list[tuple[str, dict]] = []
    client = _make_client(monkeypatch, [], record_rpc=calls)
    res = client.get("/api/v1/payment-requests?view=page&page=3&page_size=50")
    assert res.status_code == 200
    fn, params = calls[0]
    assert fn == "pr_list_page"
    assert params["p_limit"] == 50
    assert params["p_offset"] == 100


def test_view_page_date_range_converted_to_vn_offset(monkeypatch):
    """date_from/date_to (YYYY-MM-DD) -> mốc +07:00, KHÔNG dùng TZ trình duyệt (M0-T4b)."""
    calls: list[tuple[str, dict]] = []
    client = _make_client(monkeypatch, [], record_rpc=calls)
    res = client.get(
        "/api/v1/payment-requests?view=page&date_from=2026-09-01&date_to=2026-09-30"
    )
    assert res.status_code == 200
    _, params = calls[0]
    assert params["p_from"] == "2026-09-01T00:00:00+07:00"
    assert params["p_to"] == "2026-09-30T23:59:59.999999+07:00"


def test_view_page_no_date_range_sends_none(monkeypatch):
    calls: list[tuple[str, dict]] = []
    client = _make_client(monkeypatch, [], record_rpc=calls)
    client.get("/api/v1/payment-requests?view=page")
    _, params = calls[0]
    assert params["p_from"] is None
    assert params["p_to"] is None


def test_view_page_forwards_rbac_scope_as_p_emails(monkeypatch):
    calls: list[tuple[str, dict]] = []
    client = _make_client(monkeypatch, [], allowed_emails=["sale.a@x.com"], record_rpc=calls)
    client.get("/api/v1/payment-requests?view=page")
    _, params = calls[0]
    assert params["p_emails"] == ["sale.a@x.com"]


def test_view_page_system_role_sends_none_emails_no_scope(monkeypatch):
    calls: list[tuple[str, dict]] = []
    client = _make_client(monkeypatch, [], allowed_emails=None, record_rpc=calls)
    client.get("/api/v1/payment-requests?view=page")
    _, params = calls[0]
    assert params["p_emails"] is None


def test_view_page_tvts_csv_split_and_lowercased(monkeypatch):
    calls: list[tuple[str, dict]] = []
    client = _make_client(monkeypatch, [], record_rpc=calls)
    client.get("/api/v1/payment-requests?view=page&tvts=A@X.com,B@Y.com")
    _, params = calls[0]
    assert params["p_tvts"] == ["a@x.com", "b@y.com"]


def test_view_page_invalid_bucket_returns_400(monkeypatch):
    client = _make_client(monkeypatch, [])
    res = client.get("/api/v1/payment-requests?view=page&bucket=not-a-bucket")
    assert res.status_code == 400


def test_view_page_invalid_state_returns_400(monkeypatch):
    client = _make_client(monkeypatch, [])
    res = client.get("/api/v1/payment-requests?view=page&state=not-a-state")
    assert res.status_code == 400


def test_view_page_missing_rpc_function_returns_503_migration_hint(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    sb = MagicMock()
    sb.table.side_effect = lambda name: MagicMock(**{
        "select.return_value.eq.return_value.execute.return_value": MagicMock(data=[])
    })

    def _raise_missing(fn, params):
        raise Exception('Could not find the function public.pr_list_page in the schema cache')

    rpc_mock = MagicMock()
    rpc_mock.execute.side_effect = lambda: (_ for _ in ()).throw(
        Exception("Could not find the function public.pr_list_page in the schema cache")
    )
    sb.rpc.return_value = rpc_mock

    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: None)

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    client = TestClient(app)
    res = client.get("/api/v1/payment-requests?view=page")
    assert res.status_code == 503
    assert "migration" in res.json()["detail"].lower()


def test_view_page_response_item_has_ar_id_and_ar_activated(monkeypatch):
    rpc_rows = [{"pr": _pr_row(1), "filtered_total": 1}]
    ar_rows = [{"id": "AR-1", "pr_id": "PR-SEED-00001", "uids_data": [
        {"courses": [{"order_id": "OID-1"}]}
    ]}]
    client = _make_client(monkeypatch, rpc_rows, ar_rows=ar_rows)
    res = client.get("/api/v1/payment-requests?view=page")
    body = res.json()
    item = body["requests"][0]
    assert item["ar_id"] == "AR-1"
    assert item["ar_activated"] is True


def test_view_page_no_ar_means_ar_id_none_not_activated(monkeypatch):
    rpc_rows = [{"pr": _pr_row(1), "filtered_total": 1}]
    client = _make_client(monkeypatch, rpc_rows, ar_rows=[])
    res = client.get("/api/v1/payment-requests?view=page")
    item = res.json()["requests"][0]
    assert item["ar_id"] is None
    assert item["ar_activated"] is False


def test_old_endpoint_without_view_param_unchanged(monkeypatch):
    """KHÔNG truyền view= -> hành vi cũ y hệt, KHÔNG gọi RPC mới (giữ contract B2/B3/B4)."""
    calls: list[tuple[str, dict]] = []
    client = _make_client(monkeypatch, [], record_rpc=calls)
    res = client.get("/api/v1/payment-requests?limit=5")
    assert res.status_code == 200
    assert calls == []  # RPC pr_list_page KHÔNG được gọi ở path cũ
