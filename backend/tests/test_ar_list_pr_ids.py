"""GET /api/v1/active-requests?pr_ids= — lọc AR theo tập PR cụ thể + guard cap-1000 (M2-T6).

Plan: docs/superpowers/plans/2026-09-15-pr-list-server-pagination.md
Trước đây query KHÔNG .range() → PostgREST mặc định cắt 1000 dòng/response, im lặng
mất dữ liệu nếu AR > 1000 (prod hiện 941/1000, sát ngưỡng).
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _RangeAwareQuery:
    def __init__(self, rows):
        self.rows = list(rows)
        self.filters = []
        self._range = None

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self.filters.append(("eq", key, value))
        return self

    def in_(self, key, values):
        values = set(str(v) for v in values)
        self.filters.append(("in", key, values))
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self):
        matched = self.rows
        for kind, key, value in self.filters:
            if kind == "eq":
                matched = [r for r in matched if r.get(key) == value]
            else:
                matched = [r for r in matched if str(r.get(key)) in value]
        if self._range is not None:
            start, end = self._range
            matched = matched[start : end + 1]
        return MagicMock(data=matched)


def _make_client(monkeypatch, ar_rows):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import activation_routes as ar

    class _Actor:
        email = "admin@test.com"
        role = "system"

    sb = MagicMock()
    sb.table.side_effect = lambda name: _RangeAwareQuery(ar_rows) if name == "active_requests" else _RangeAwareQuery([])

    monkeypatch.setattr(ar, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(ar, "_fetch_prs_by_ids", lambda sb, ids: {})
    monkeypatch.setattr(ar, "_tien_ve_map", lambda sb, ids: {})
    monkeypatch.setattr(ar, "_credit_hold_map", lambda sb, ids: {})

    app = FastAPI()
    ar.register_activation_routes(app, lambda: sb)
    return TestClient(app)


def _ar(i, pr_id):
    return {
        "id": f"AR-{i}", "pr_id": pr_id, "status": "pending_order",
        "uids_data": [], "created_at": f"2026-09-{(i % 28) + 1:02d}T00:00:00+00:00",
        "customer_name": f"KH {i}",
    }


def test_pr_ids_filters_to_only_those_pr(monkeypatch):
    rows = [_ar(1, "PR-A"), _ar(2, "PR-B"), _ar(3, "PR-A")]
    client = _make_client(monkeypatch, rows)
    res = client.get("/api/v1/active-requests?pr_ids=PR-A")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 2
    assert {r["pr_id"] for r in body} == {"PR-A"}


def test_pr_ids_csv_multiple(monkeypatch):
    rows = [_ar(1, "PR-A"), _ar(2, "PR-B"), _ar(3, "PR-C")]
    client = _make_client(monkeypatch, rows)
    res = client.get("/api/v1/active-requests?pr_ids=PR-A,PR-C")
    body = res.json()
    assert {r["pr_id"] for r in body} == {"PR-A", "PR-C"}


def test_no_pr_ids_returns_all_unchanged_behavior(monkeypatch):
    rows = [_ar(1, "PR-A"), _ar(2, "PR-B")]
    client = _make_client(monkeypatch, rows)
    res = client.get("/api/v1/active-requests")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_no_pr_ids_loops_past_1000_without_dropping_rows(monkeypatch):
    """Trước fix: KHÔNG .range() -> PostgREST cắt ở 1000. Sau fix: loop .range() tới
    khi hết, không mất 1 dòng nào dù > 1000 AR."""
    rows = [_ar(i, f"PR-{i}") for i in range(1250)]
    client = _make_client(monkeypatch, rows)
    res = client.get("/api/v1/active-requests")
    assert res.status_code == 200
    assert len(res.json()) == 1250


def test_no_pr_ids_under_1000_single_page_no_warning_needed(monkeypatch):
    rows = [_ar(i, f"PR-{i}") for i in range(50)]
    client = _make_client(monkeypatch, rows)
    res = client.get("/api/v1/active-requests")
    assert len(res.json()) == 50


def test_status_filter_still_works_with_pr_ids(monkeypatch):
    rows = [
        {**_ar(1, "PR-A"), "status": "activated"},
        {**_ar(2, "PR-A"), "status": "pending_order"},
    ]
    client = _make_client(monkeypatch, rows)
    res = client.get("/api/v1/active-requests?pr_ids=PR-A&status=activated")
    body = res.json()
    assert len(body) == 1
    assert body[0]["status"] == "activated"


def test_pr_ids_capped_at_100(monkeypatch):
    """Guard cap-1000 (M2-T6): pr_ids CSV vượt 100 id bị cắt còn 100 — tránh 1 request
    hydrate quá to (FE chỉ nên gửi 1 trang PR-list ≤50-100 id)."""
    ids = [f"PR-{i}" for i in range(150)]
    rows = [_ar(i, f"PR-{i}") for i in range(150)]
    client = _make_client(monkeypatch, rows)
    res = client.get(f"/api/v1/active-requests?pr_ids={','.join(ids)}")
    assert res.status_code == 200
    assert len(res.json()) == 100
