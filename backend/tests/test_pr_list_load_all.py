"""GĐ1 load-all PR list (2026-07-11).

Plan: docs/superpowers/plans/2026-07-11-pr-list-load-all-gd1.md
Bug: FE chỉ nạp 100 PR mới nhất → ~90 PR cũ ẩn khỏi search/KPI/chip.
GĐ1: BE trả `total` (count exact theo RBAC) + chunk in_() theo 100 id.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_client(monkeypatch, pr_rows, line_rows, total=None, record_in=None):
    """FastAPI TestClient với fake supabase — pattern từ test_health_check_and_bill_column."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    class _Actor:
        email = "admin@test.com"

    def _table(name):
        t = MagicMock()
        for m in ("select", "eq", "order", "range", "limit", "single"):
            getattr(t, m).return_value = t

        def _in(col, ids):
            if record_in is not None:
                record_in.append((name, list(ids)))
            return t

        t.in_.side_effect = _in
        if name == "payment_requests":
            t.execute.return_value = MagicMock(
                data=pr_rows, count=total if total is not None else len(pr_rows)
            )
        elif name == "payment_lines":
            t.execute.return_value = MagicMock(data=line_rows, count=None)
        else:
            t.execute.return_value = MagicMock(data=[], count=None)
        return t

    sb = MagicMock()
    sb.table.side_effect = _table

    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: None)
    monkeypatch.setattr(prr, "_sale_name_map", lambda sb: {})

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    return TestClient(app)


def _pr(i):
    return {"id": f"PR{i}", "sale_email": "s@x.com", "state": "pending",
            "created_at": f"2026-01-{(i % 28) + 1:02d}T00:00:00Z"}


def test_list_response_includes_total(monkeypatch):
    """Response phải có total = count exact (kể cả khi trang trả ít hơn)."""
    client = _make_client(monkeypatch, [_pr(1), _pr(2)], [], total=190)
    res = client.get("/api/v1/payment-requests?limit=2")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 190
    assert len(body["requests"]) == 2


def test_list_empty_still_has_total(monkeypatch):
    """Trang rỗng (offset vượt cuối) vẫn phải trả total — FE cần nó để dừng loop."""
    client = _make_client(monkeypatch, [], [], total=190)
    res = client.get("/api/v1/payment-requests?limit=500&offset=500")
    assert res.status_code == 200
    body = res.json()
    assert body["requests"] == []
    assert body["total"] == 190


def test_lines_and_ar_queries_chunked_by_100(monkeypatch):
    """250 PR → payment_lines + active_requests mỗi bảng 3 lượt in_ (100/100/50)."""
    calls: list[tuple[str, list]] = []
    pr_rows = [_pr(i) for i in range(250)]
    client = _make_client(monkeypatch, pr_rows, [], total=250, record_in=calls)
    res = client.get("/api/v1/payment-requests?limit=500")
    assert res.status_code == 200
    line_chunks = [len(ids) for name, ids in calls if name == "payment_lines"]
    ar_chunks = [len(ids) for name, ids in calls if name == "active_requests"]
    assert line_chunks == [100, 100, 50]
    assert ar_chunks == [100, 100, 50]


def test_chunked_helper():
    from payment_request_routes import _chunked

    assert list(_chunked([1, 2, 3, 4, 5], 2)) == [[1, 2], [3, 4], [5]]
    assert list(_chunked([], 2)) == []
    assert list(_chunked([1], 5)) == [[1]]


def test_gzip_middleware_registered():
    """JSON list ~2KB/PR chưa nén — gzip giảm ~80% wire. Middleware phải được đăng ký."""
    from fastapi.middleware.gzip import GZipMiddleware
    import main

    assert any(m.cls is GZipMiddleware for m in main.app.user_middleware)
