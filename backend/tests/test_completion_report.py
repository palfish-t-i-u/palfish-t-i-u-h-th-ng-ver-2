from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import payment_request_routes as prr


class Query:
    def __init__(self, table, rows, sb):
        self.table = table
        self.rows = rows
        self.sb = sb
        self.filters = []
        self.in_filters = []
        self._limit = None
        self._order = []

    def select(self, *_args, **_kwargs):
        return self

    def order(self, key, desc=False):
        self._order.append((key, desc))
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
        val = str(value).replace("%", "").lower()
        self.filters.append((key, lambda r: val in str(r.get(key) or "").lower()))
        return self

    def insert(self, payload):
        if self.table == "pr_completion_reports":
            pr_id = payload["pr_id"]
            seq = payload["seq"]
            for r in self.rows:
                if r["pr_id"] == pr_id and r["seq"] == seq:
                    raise Exception("duplicate key value violates unique constraint")
            row = {"id": f"report-uuid-{len(self.rows) + 1}", **payload, "created_at": "2026-07-16T10:00:00+00:00"}
            self.rows.append(row)
            m = MagicMock()
            m.execute.return_value = MagicMock(data=[row])
            return m
        if self.table == "dingtalk_outbox":
            self.sb.outbox.append(payload)
            m = MagicMock()
            m.execute.return_value = MagicMock(data=[payload])
            return m
        return self

    def execute(self):
        matched = list(self.rows)
        for key, value in self.filters:
            if callable(value):
                matched = [row for row in matched if value(row)]
            else:
                matched = [row for row in matched if row.get(key) == value]
        for key, values in self.in_filters:
            matched = [row for row in matched if str(row.get(key)) in values]
        
        for key, desc in reversed(self._order):
            matched.sort(key=lambda r: r.get(key) or "", reverse=desc)

        if self._limit is not None:
            matched = matched[:self._limit]
        return MagicMock(data=matched)


class FakeSB:
    def __init__(self):
        self.tables = {}
        self.outbox = []

    def table(self, name):
        return Query(name, self.tables.get(name, []), self)


# Single global instance of FakeSB for the module
_sb = FakeSB()

# Mock actor with system role to bypass permission checks
ACTOR = MagicMock(email="sale_actor@test.com", role="system")


@pytest.fixture(scope="module")
def client():
    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: _sb)
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def clean_sb():
    _sb.tables = {
        "payment_requests": [],
        "payment_lines": [],
        "nhan_su_sale": [],
        "dingtalk_team_groups": [],
        "pr_completion_reports": [],
        "dingtalk_outbox": [],
    }
    _sb.outbox = []


def _pr(**overrides):
    base = {
        "id": "PR-123", "target": 1000, "received": 1000, "state": "done",
        "sale_email": "sale_actor@test.com", "name": "Học viên A", "child_name": None,
        "is_test": False,
    }
    base.update(overrides)
    return base


def _paid_line(amount=1000, **overrides):
    base = {"id": "line-1", "payment_request_id": "PR-123", "amount": amount, "status": "paid", "method": "qr", "bill_image": "https://example.com/bill.jpg", "bill_images": []}
    base.update(overrides)
    return [base]


# --- TEST CASES ---

# 1. seq=1 happy: message KHÔNG có "Lần #", KHÔNG có "Lý do:"; outbox source_id == report UUID (not pr_id)
def test_seq_1_happy_path(client, monkeypatch):
    monkeypatch.setenv("DINGTALK_DISABLED_EVENTS", "")
    _sb.tables["payment_requests"] = [_pr()]
    _sb.tables["payment_lines"] = _paid_line(1000)
    _sb.tables["nhan_su_sale"] = [{"email": "sale_actor@test.com", "team": "Inhouse 1"}]
    _sb.tables["dingtalk_team_groups"] = [{"team_code": "Inhouse 1", "is_active": True}]

    with patch("payment_request_routes.resolve_actor", return_value=ACTOR):
        resp = client.post("/api/v1/payment-requests/PR-123/report-complete", json={})
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["report"]["seq"] == 1
    assert len(data["reports"]) == 1
    assert data["report"]["id"].startswith("report-uuid-")

    # Verify outbox message
    assert len(_sb.outbox) == 1
    outbox_row = _sb.outbox[0]
    assert outbox_row["event_type"] == "pr_fully_paid"
    assert outbox_row["source_table"] == "pr_completion_reports"
    assert outbox_row["source_id"] == data["report"]["id"]  # Outbox source_id is report UUID, not PR-123
    assert outbox_row["team_code"] == "Inhouse 1"
    
    msg = outbox_row["message"]
    assert "✅ ĐƠN ĐÃ ĐỦ TIỀN — PR-123" in msg
    assert "Lần #1" not in msg
    assert "Lý do:" not in msg
    assert "Tổng net đã thu: 1.000 / 1.000 VND" in msg


# 2. seq=2 thiếu reason -> HTTPException 400
def test_seq_2_missing_reason(client):
    _sb.tables["payment_requests"] = [_pr()]
    _sb.tables["payment_lines"] = _paid_line(1000)
    _sb.tables["nhan_su_sale"] = [{"email": "sale_actor@test.com", "team": "Inhouse 1"}]
    _sb.tables["dingtalk_team_groups"] = [{"team_code": "Inhouse 1", "is_active": True}]
    _sb.tables["pr_completion_reports"] = [{"pr_id": "PR-123", "seq": 1, "reported_by": "system", "total_net": 1000, "target": 1000}]

    with patch("payment_request_routes.resolve_actor", return_value=ACTOR):
        resp = client.post("/api/v1/payment-requests/PR-123/report-complete", json={"reason": ""})
    
    assert resp.status_code == 400
    assert "Lý do báo lại là bắt buộc" in resp.json()["detail"]


# 3. seq=2 có reason: message có " - Lần #2" và "\nLý do: {reason}"
def test_seq_2_with_reason(client, monkeypatch):
    monkeypatch.setenv("DINGTALK_DISABLED_EVENTS", "")
    _sb.tables["payment_requests"] = [_pr()]
    _sb.tables["payment_lines"] = _paid_line(1000)
    _sb.tables["nhan_su_sale"] = [{"email": "sale_actor@test.com", "team": "Inhouse 1"}]
    _sb.tables["dingtalk_team_groups"] = [{"team_code": "Inhouse 1", "is_active": True}]
    _sb.tables["pr_completion_reports"] = [{"pr_id": "PR-123", "seq": 1, "reported_by": "system", "total_net": 1000, "target": 1000}]

    with patch("payment_request_routes.resolve_actor", return_value=ACTOR):
        resp = client.post("/api/v1/payment-requests/PR-123/report-complete", json={"reason": "Khách mua thêm"})
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["report"]["seq"] == 2
    assert len(data["reports"]) == 2

    assert len(_sb.outbox) == 1
    msg = _sb.outbox[0]["message"]
    assert "✅ ĐƠN ĐÃ ĐỦ TIỀN — PR-123 - Lần #2" in msg
    assert "Lý do: Khách mua thêm" in msg


# 4. PR state != done/over -> 400 (assert_pr_paid)
def test_pr_not_fully_paid(client):
    _sb.tables["payment_requests"] = [_pr(state="short", received=500)]
    _sb.tables["payment_lines"] = _paid_line(500)
    _sb.tables["nhan_su_sale"] = [{"email": "sale_actor@test.com", "team": "Inhouse 1"}]
    _sb.tables["dingtalk_team_groups"] = [{"team_code": "Inhouse 1", "is_active": True}]

    with patch("payment_request_routes.resolve_actor", return_value=ACTOR):
        resp = client.post("/api/v1/payment-requests/PR-123/report-complete", json={})
    
    assert resp.status_code == 400
    assert "Payment Request chưa thanh toán đủ" in resp.json()["detail"]


# 5. paid line thiếu bill -> 400 (assert_all_paid_lines_have_bill)
def test_paid_line_missing_bill(client):
    _sb.tables["payment_requests"] = [_pr()]
    _sb.tables["payment_lines"] = _paid_line(1000, bill_image="", bill_images=[])
    _sb.tables["nhan_su_sale"] = [{"email": "sale_actor@test.com", "team": "Inhouse 1"}]
    _sb.tables["dingtalk_team_groups"] = [{"team_code": "Inhouse 1", "is_active": True}]

    with patch("payment_request_routes.resolve_actor", return_value=ACTOR):
        resp = client.post("/api/v1/payment-requests/PR-123/report-complete", json={})
    
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "MISSING_BILLS"


# 6. actor không có quyền PR (_can_access_request False) -> 403
def test_rbac_no_access(client):
    _sb.tables["payment_requests"] = [_pr(sale_email="other_sale@test.com")]
    _sb.tables["payment_lines"] = _paid_line(1000)
    _sb.tables["nhan_su_sale"] = [{"email": "sale_actor@test.com", "team": "Inhouse 1"}]
    _sb.tables["dingtalk_team_groups"] = [{"team_code": "Inhouse 1", "is_active": True}]

    # Temporarily set actor to a sale user with restricted view access
    limited_actor = MagicMock(email="sale_actor@test.com", role="sale")
    with patch("payment_request_routes.resolve_actor", return_value=limited_actor):
        with patch("payment_request_routes.visible_creator_emails", return_value=["sale_actor@test.com"]):
            resp = client.post("/api/v1/payment-requests/PR-123/report-complete", json={})
    
    assert resp.status_code == 403
    assert "Khong co quyen thao tac phieu nay" in resp.json()["detail"]


# 7. is_test PR -> report được tạo, outbox KHÔNG insert
def test_is_test_pr_skips_outbox(client, monkeypatch):
    monkeypatch.setenv("DINGTALK_DISABLED_EVENTS", "")
    _sb.tables["payment_requests"] = [_pr(is_test=True)]
    _sb.tables["payment_lines"] = _paid_line(1000)
    _sb.tables["nhan_su_sale"] = [{"email": "sale_actor@test.com", "team": "Inhouse 1"}]
    _sb.tables["dingtalk_team_groups"] = [{"team_code": "Inhouse 1", "is_active": True}]

    with patch("payment_request_routes.resolve_actor", return_value=ACTOR):
        resp = client.post("/api/v1/payment-requests/PR-123/report-complete", json={})
    
    assert resp.status_code == 200
    assert len(_sb.tables["pr_completion_reports"]) == 1
    assert len(_sb.outbox) == 0


# 8. dingtalk_event_enabled('pr_fully_paid') False -> report tạo, outbox skip
def test_disabled_event_skips_outbox(client, monkeypatch):
    monkeypatch.setenv("DINGTALK_DISABLED_EVENTS", "pr_fully_paid")
    _sb.tables["payment_requests"] = [_pr()]
    _sb.tables["payment_lines"] = _paid_line(1000)
    _sb.tables["nhan_su_sale"] = [{"email": "sale_actor@test.com", "team": "Inhouse 1"}]
    _sb.tables["dingtalk_team_groups"] = [{"team_code": "Inhouse 1", "is_active": True}]

    with patch("payment_request_routes.resolve_actor", return_value=ACTOR):
        resp = client.post("/api/v1/payment-requests/PR-123/report-complete", json={})
    
    assert resp.status_code == 200
    assert len(_sb.tables["pr_completion_reports"]) == 1
    assert len(_sb.outbox) == 0
