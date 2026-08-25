"""Test M4 phiếu lương — đọc/xác nhận (Milestone B): list · detail+audit · confirm · review.

RBAC + auto-khoá review (mùng 4) verify bằng fake Supabase + patch resolve_actor / visible_payslip_codes.
"""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import payroll_routes  # noqa: E402
from payroll_routes import register_payroll_routes  # noqa: E402


class _R:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store, table):
        self.store = store
        self.table = table
        self.filters = []
        self._update = None
        self._insert = None
        self._limit = None

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def eq(self, k, v):
        self.filters.append((k, v))
        return self

    def in_(self, k, vs):
        self.filters.append((k, list(vs)))
        return self

    def update(self, p):
        self._update = p
        return self

    def insert(self, p):
        self._insert = p
        return self

    def _match(self, row):
        for k, v in self.filters:
            if isinstance(v, list):
                if row.get(k) not in v:
                    return False
            elif row.get(k) != v:
                return False
        return True

    def execute(self):
        rows = self.store.setdefault(self.table, [])
        if self._insert is not None:
            item = dict(self._insert)
            rows.append(item)
            return _R([item])
        if self._update is not None:
            updated = []
            for row in rows:
                if self._match(row):
                    row.update(self._update)
                    updated.append(dict(row))
            return _R(updated)
        matched = [dict(r) for r in rows if self._match(r)]
        if self._limit:
            matched = matched[: self._limit]
        return _R(matched)


class _FakeSB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _Query(self.store, name)


def _seed():
    return {
        "payslips": [
            {"id": "id-1", "code": "HN0001", "name": "A", "ky_luong": "2026-07",
             "stage": "truoc_thue", "review_status": "none", "confirm_status": "none",
             "payload_json": {"Name": "A", "Cong": 24}},
            {"id": "id-2", "code": "HN0002", "name": "B", "ky_luong": "2026-07",
             "stage": "truoc_thue", "review_status": "none", "confirm_status": "none",
             "payload_json": {"Name": "B"}},
        ],
        "payslip_views": [],
    }


def _client(store):
    app = FastAPI()
    register_payroll_routes(app, lambda: _FakeSB(store))
    return TestClient(app)


def _actor(ma_nv="HN0001", role="sale"):
    return SimpleNamespace(email="a@x.com", role=role, staff={"ma_nv": ma_nv})


def test_list_filters_by_visible_codes():
    store = _seed()
    client = _client(store)
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor()), \
         patch.object(payroll_routes, "visible_payslip_codes", lambda *_a, **_k: ["HN0001"]):
        r = client.get("/api/payroll/payslips", headers={"Authorization": "Bearer x"})
    assert r.status_code == 200, r.text
    codes = [p["code"] for p in r.json()["payslips"]]
    assert codes == ["HN0001"]


def test_list_system_sees_all():
    store = _seed()
    client = _client(store)
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor(role="system")), \
         patch.object(payroll_routes, "visible_payslip_codes", lambda *_a, **_k: None):
        r = client.get("/api/payroll/payslips", headers={"Authorization": "Bearer x"})
    assert r.status_code == 200
    assert {p["code"] for p in r.json()["payslips"]} == {"HN0001", "HN0002"}


def test_list_empty_codes_returns_empty():
    store = _seed()
    client = _client(store)
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor()), \
         patch.object(payroll_routes, "visible_payslip_codes", lambda *_a, **_k: []):
        r = client.get("/api/payroll/payslips", headers={"Authorization": "Bearer x"})
    assert r.status_code == 200
    assert r.json()["payslips"] == []


def test_detail_forbidden_when_not_visible():
    store = _seed()
    client = _client(store)
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor()), \
         patch.object(payroll_routes, "visible_payslip_codes", lambda *_a, **_k: ["HN0001"]):
        r = client.get("/api/payroll/payslips/id-2", headers={"Authorization": "Bearer x"})
    assert r.status_code == 403


def test_detail_returns_payload_and_logs_audit():
    store = _seed()
    client = _client(store)
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor()), \
         patch.object(payroll_routes, "visible_payslip_codes", lambda *_a, **_k: None):
        r = client.get("/api/payroll/payslips/id-1", headers={"Authorization": "Bearer x"})
    assert r.status_code == 200, r.text
    assert r.json()["payslip"]["phieu"]["Cong"] == 24
    assert len(store["payslip_views"]) == 1
    assert store["payslip_views"][0]["viewer_email"] == "a@x.com"


def test_confirm_owner_sets_confirmed():
    store = _seed()
    client = _client(store)
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor("HN0001")):
        r = client.patch("/api/payroll/payslips/id-1/confirm", headers={"Authorization": "Bearer x"})
    assert r.status_code == 200, r.text
    assert r.json()["payslip"]["confirm_status"] == "confirmed"
    assert store["payslips"][0]["confirm_status"] == "confirmed"


def test_confirm_non_owner_403():
    store = _seed()
    client = _client(store)
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor("HN0002")):
        r = client.patch("/api/payroll/payslips/id-1/confirm", headers={"Authorization": "Bearer x"})
    assert r.status_code == 403


def test_confirm_fires_gate_push():
    """Confirm thành công → xếp task push ghi ngược sheet với đúng code/ky/stage."""
    store = _seed()
    client = _client(store)
    calls = []
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor("HN0001")), \
         patch.object(payroll_routes, "_push_confirm_to_gate",
                      lambda code, ky, stage: calls.append((code, ky, stage))):
        r = client.patch("/api/payroll/payslips/id-1/confirm", headers={"Authorization": "Bearer x"})
    assert r.status_code == 200, r.text
    assert calls == [("HN0001", "2026-07", "truoc_thue")]


def test_confirmations_lists_confirmed_only():
    store = _seed()
    store["payslips"][0]["confirm_status"] = "confirmed"
    store["payslips"][0]["confirmed_at"] = "2026-07-05T00:00:00Z"
    client = _client(store)
    with patch.dict(os.environ, {"GATE_TOKEN": "secret"}):
        r = client.get(
            "/api/payroll/payslips/confirmations",
            headers={"X-Gate-Token": "secret"},
        )
    assert r.status_code == 200, r.text
    confs = r.json()["confirmations"]
    assert [c["code"] for c in confs] == ["HN0001"]  # chỉ phiếu confirmed
    assert confs[0]["stage"] == "truoc_thue"


def test_confirmations_filter_by_ky():
    store = _seed()
    store["payslips"][0]["confirm_status"] = "confirmed"
    store["payslips"][1]["confirm_status"] = "confirmed"
    store["payslips"][1]["ky_luong"] = "2026-06"
    client = _client(store)
    with patch.dict(os.environ, {"GATE_TOKEN": "secret"}):
        r = client.get(
            "/api/payroll/payslips/confirmations?ky_luong=2026-07",
            headers={"X-Gate-Token": "secret"},
        )
    assert r.status_code == 200, r.text
    assert [c["code"] for c in r.json()["confirmations"]] == ["HN0001"]  # HN0002 kỳ khác → lọc


def test_confirmations_bad_token_401():
    store = _seed()
    client = _client(store)
    with patch.dict(os.environ, {"GATE_TOKEN": "secret"}):
        r = client.get(
            "/api/payroll/payslips/confirmations",
            headers={"X-Gate-Token": "wrong"},
        )
    assert r.status_code == 401


def test_review_locked_for_past_period():
    store = _seed()
    store["payslips"][0]["ky_luong"] = "2020-01"  # đã quá mùng 4/2020-02
    client = _client(store)
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor("HN0001")):
        r = client.patch("/api/payroll/payslips/id-1/review", headers={"Authorization": "Bearer x"})
    assert r.status_code == 409


def test_review_open_for_far_future_period():
    store = _seed()
    store["payslips"][0]["ky_luong"] = "2099-12"  # chưa tới mùng 4/2100-01
    client = _client(store)
    with patch.object(payroll_routes, "resolve_actor", lambda *_a, **_k: _actor("HN0001")):
        r = client.patch("/api/payroll/payslips/id-1/review", headers={"Authorization": "Bearer x"})
    assert r.status_code == 200, r.text
    assert r.json()["payslip"]["review_status"] == "requested"
