"""T6 — list_active_requests phải trả về payment_request.sale_name enriched từ nhan_su_sale."""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.in_filters = []
        self._limit = None
        self._desc = False

    def select(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, value):
        self._limit = value
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def in_(self, key, values):
        self.in_filters.append((key, set(str(v) for v in values)))
        return self

    def ilike(self, key, value):
        self.filters.append((key, value.lower()))
        return self

    def execute(self):
        matched = list(self.rows)
        for key, value in self.filters:
            matched = [row for row in matched if str(row.get(key, "")).lower() == str(value).lower()]
        for key, values in self.in_filters:
            matched = [row for row in matched if str(row.get(key)) in values]
        if self._limit is not None:
            matched = matched[: self._limit]
        return MagicMock(data=matched)


class FakeSB:
    def __init__(self):
        self.tables = {
            "active_requests": [
                {
                    "id": "AR-001",
                    "pr_id": "PR-001",
                    "customer_name": "Nguyen Van A",
                    "uids_data": [{"uid": "u1", "phone": "0900000000", "country": "VN", "courses": [
                        {"code": "PF-001", "name": "Goi A", "amount": 5000000, "order_id": ""}
                    ]}],
                    "status": "pending_order",
                    "created_at": "2026-07-01T10:00:00+00:00",
                },
            ],
            "payment_requests": [
                {
                    "id": "PR-001",
                    "name": "Nguyen Van A",
                    "uid": "u1",
                    "phone": "0900000001",
                    "child_name": "Be Bin",
                    "sale_email": "hoa@palfish.com",
                    "target": 5000000,
                    "received": 5000000,
                    "state": "done",
                },
            ],
            "nhan_su_sale": [
                {
                    "email": "hoa@palfish.com",
                    "display_name": "Nguyen Thi Hoa",
                    "crm_name": "Hoa CRM",
                    "team": "Inhouse 1",
                },
            ],
        }

    def table(self, name):
        return Query(self.tables.get(name, []))


ACTOR = MagicMock(email="ops@test.com", role="system")


def build_client(sb: FakeSB):
    import activation_routes

    app = FastAPI()
    activation_routes.register_activation_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False)


def test_ar_list_returns_sale_name_from_nhan_su_sale():
    sb = FakeSB()
    client = build_client(sb)

    with patch("activation_routes.resolve_actor", return_value=ACTOR):
        resp = client.get("/api/v1/active-requests")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    pr_snippet = data[0].get("payment_request", {})
    assert pr_snippet.get("sale_email") == "hoa@palfish.com"
    assert pr_snippet.get("sale_name") == "Nguyen Thi Hoa"   # display_name wins over crm_name


def test_ar_list_with_valid_status_filter():
    sb = FakeSB()
    client = build_client(sb)

    with patch("activation_routes.resolve_actor", return_value=ACTOR):
        resp = client.get("/api/v1/active-requests?status=pending_order")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0].get("status") == "pending_order"


def test_ar_list_with_invalid_status_filter():
    sb = FakeSB()
    client = build_client(sb)

    with patch("activation_routes.resolve_actor", return_value=ACTOR):
        resp = client.get("/api/v1/active-requests?status=invalid_status")

    assert resp.status_code == 400
    detail = resp.json().get("detail", "")
    assert "status không hợp lệ" in detail
    assert "pending_order" in detail

