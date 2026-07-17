"""Load-all CK ngoài chờ ghép (2026-07-17).

Bug: GET /api/v1/bank-transactions LIMIT 200 theo created_at DESC →
giao dịch pending cũ (>200 dòng mới hơn) biến mất khỏi tab "CK ngoài chờ ghép".
Fix: offset paging (range) + status alias unmatched/matched.
Plan: docs/superpowers/plans/2026-07-17-bank-txns-load-all-unmatched.md
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ACTOR = MagicMock(email="ops@test.com", role="system")


@pytest.fixture(autouse=True)
def _reset_router():
    """Xóa routes trên module-level router giữa các test — tránh handler cũ leak."""
    import sepay_routes as sp_mod

    sp_mod.router.routes.clear()
    yield
    sp_mod.router.routes.clear()


class _RecordingQuery:
    """Ghi lại filter được gọi — assert query shape, không giả lập Postgrest."""

    def __init__(self, rows, calls):
        self.rows = rows
        self.calls = calls

    def select(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def range(self, start, end):
        self.calls.append(("range", start, end))
        return self

    def limit(self, value):
        self.calls.append(("limit", value))
        return self

    def eq(self, col, val):
        self.calls.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self.calls.append(("in", col, list(vals)))
        return self

    def gte(self, col, val):
        self.calls.append(("gte", col, val))
        return self

    def lte(self, col, val):
        self.calls.append(("lte", col, val))
        return self

    def execute(self):
        return MagicMock(data=self.rows)


class _FakeSB:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def table(self, name):
        return _RecordingQuery(self.rows, self.calls)


def _client_and_sb(rows=None):
    import sepay_routes

    sb = _FakeSB(rows or [])
    app = FastAPI()
    sepay_routes.register_sepay_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False), sb


def _get(client, url):
    with patch("sepay_routes.resolve_actor", return_value=ACTOR):
        with patch("sepay_routes.require_module_write"):
            return client.get(url)


def test_offset_maps_to_range():
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions?limit=500&offset=1000")
    assert res.status_code == 200
    assert ("range", 1000, 1499) in sb.calls


def test_default_call_keeps_old_window():
    """Không param → range(0,199) ≡ limit 200 cũ — caller cũ không đổi hành vi."""
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions")
    assert res.status_code == 200
    assert ("range", 0, 199) in sb.calls


def test_status_unmatched_uses_in_filter():
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions?status=unmatched")
    assert res.status_code == 200
    assert ("in", "match_status", ["pending", "needs_review"]) in sb.calls


def test_status_matched_uses_in_filter():
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions?status=matched")
    assert res.status_code == 200
    assert ("in", "match_status", ["auto_matched", "manual_matched"]) in sb.calls


def test_status_plain_still_eq():
    """status đơn (vd ignored) vẫn eq như cũ."""
    client, sb = _client_and_sb()
    res = _get(client, "/api/v1/bank-transactions?status=ignored")
    assert res.status_code == 200
    assert ("eq", "match_status", "ignored") in sb.calls


def test_response_stays_bare_array():
    """Contract FE: response là bare array, KHÔNG bọc object."""
    rows = [{"txn_id": "t1"}, {"txn_id": "t2"}]
    client, _sb = _client_and_sb(rows)
    res = _get(client, "/api/v1/bank-transactions")
    assert res.json() == rows
