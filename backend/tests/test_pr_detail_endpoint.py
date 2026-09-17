"""GET /payment-requests/{id} — hydrate 1 PR đầy đủ ngoài trang đang xem (M2-T4).

Đặt CUỐI cụm GET /payment-requests/* trong payment_request_routes.py — test này
xác nhận route-order tường minh: /summary và /badge-counts KHÔNG bị route động
{payment_request_id} bắt nhầm (xem test_pr_summary_endpoint.py và
test_badge_counts.py cho 2 route kia; ở đây test luôn cả việc /{id} với id lạ
trả đúng 404, không lẫn với "owner-options").
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_client(monkeypatch, pr_row, *, line_rows=None, ar_rows=None, allowed_emails=None, report_rows=None):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    def _table(name):
        t = MagicMock()
        for m in ("select", "eq", "order", "range", "limit", "in_"):
            getattr(t, m).return_value = t
        if name == "payment_requests":
            t.execute.return_value = MagicMock(data=[pr_row] if pr_row else [])
        elif name == "payment_lines":
            t.execute.return_value = MagicMock(data=line_rows or [])
        elif name == "active_requests":
            t.execute.return_value = MagicMock(data=ar_rows or [])
        elif name == "pr_completion_reports":
            t.execute.return_value = MagicMock(data=report_rows or [])
        else:
            t.execute.return_value = MagicMock(data=[])
        return t

    sb = MagicMock()
    sb.table.side_effect = _table

    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: allowed_emails)
    monkeypatch.setattr(prr, "_sale_name_map", lambda sb: {})
    monkeypatch.setattr(prr, "_staff_map", lambda sb: {})

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    return TestClient(app)


def _pr(**overrides):
    row = {
        "id": "PR-2026-0999", "name": "Test User", "uid": "U1", "phone": "84900000000",
        "sale_email": "sale.a@x.com", "state": "pending", "target": 1_000_000,
        "created_at": "2026-09-01T00:00:00+00:00",
    }
    row.update(overrides)
    return row


def test_detail_returns_full_item_shape(monkeypatch):
    client = _make_client(monkeypatch, _pr())
    res = client.get("/api/v1/payment-requests/PR-2026-0999")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "PR-2026-0999"
    assert "payments" in body
    assert "ar_id" in body and "ar_activated" in body


def test_detail_not_found_returns_404(monkeypatch):
    client = _make_client(monkeypatch, None)
    res = client.get("/api/v1/payment-requests/PR-DOES-NOT-EXIST")
    assert res.status_code == 404


def test_detail_out_of_scope_returns_404_not_403(monkeypatch):
    """Ngoài scope RBAC -> 404 (KHÔNG lộ thông tin tồn tại bằng 403) — mirror plan §M2-T4."""
    client = _make_client(monkeypatch, _pr(sale_email="other@x.com"), allowed_emails=["sale.a@x.com"])
    res = client.get("/api/v1/payment-requests/PR-2026-0999")
    assert res.status_code == 404


def test_detail_in_scope_returns_200(monkeypatch):
    client = _make_client(monkeypatch, _pr(sale_email="sale.a@x.com"), allowed_emails=["sale.a@x.com"])
    res = client.get("/api/v1/payment-requests/PR-2026-0999")
    assert res.status_code == 200


def test_detail_computes_ar_activated_from_order_id(monkeypatch):
    ar_rows = [{"id": "AR-1", "pr_id": "PR-2026-0999", "uids_data": [
        {"courses": [{"order_id": "OID-9"}]}
    ]}]
    client = _make_client(monkeypatch, _pr(), ar_rows=ar_rows)
    body = client.get("/api/v1/payment-requests/PR-2026-0999").json()
    assert body["ar_id"] == "AR-1"
    assert body["ar_activated"] is True


def test_detail_route_registered_after_static_literal_routes(monkeypatch):
    """Route-order tường minh (M2-T9): FastAPI/Starlette match theo THỨ TỰ ĐĂNG KÝ —
    /{payment_request_id} (path động 2 đoạn) phải đứng SAU mọi route GET tĩnh cùng
    2 đoạn (summary, badge-counts, owner-options), nếu không sẽ bắt nhầm chúng."""
    client = _make_client(monkeypatch, _pr())
    app = client.app
    get_paths = [
        route.path
        for route in app.router.routes
        if getattr(route, "path", "").startswith("/api/v1/payment-requests")
        and "GET" in getattr(route, "methods", set())
    ]
    dynamic_idx = get_paths.index("/api/v1/payment-requests/{payment_request_id}")
    for static_path in (
        "/api/v1/payment-requests/summary",
        "/api/v1/payment-requests/badge-counts",
        "/api/v1/payment-requests/owner-options",
    ):
        assert static_path in get_paths, f"{static_path} chưa đăng ký"
        assert get_paths.index(static_path) < dynamic_idx, (
            f"{static_path} phải đăng ký TRƯỚC /{{payment_request_id}} — "
            "nếu không sẽ bị route động bắt nhầm khi request tới"
        )
