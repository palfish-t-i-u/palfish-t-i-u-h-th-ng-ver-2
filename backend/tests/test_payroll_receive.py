"""Test M4 phiếu lương — endpoint nhận phiếu từ PhieuLuongGate.

POST /api/payroll/payslips/receive
- Xác thực header X-Gate-Token (sai/thiếu -> 401; chưa cấu hình -> 503)
- Validate meta.code / ky_luong / stage + phieu (thiếu/sai -> 422)
- Upsert vào ``payslips`` theo khóa code|ky_luong|stage (idempotent, on_conflict đúng)
"""

from __future__ import annotations

import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from payroll_routes import register_payroll_routes  # noqa: E402

_TOKEN = "test-gate-secret"


class _Exec:
    def __init__(self, captured):
        self._c = captured

    def execute(self):
        return type("R", (), {"data": [self._c.get("row")]})()


class _Table:
    def __init__(self, name, captured):
        self._name = name
        self._c = captured

    def upsert(self, row, on_conflict=None, **_kw):
        self._c["table"] = self._name
        self._c["row"] = row
        self._c["on_conflict"] = on_conflict
        return _Exec(self._c)


class _FakeSB:
    def __init__(self, captured):
        self._c = captured

    def table(self, name):
        return _Table(name, self._c)


def _client():
    captured: dict = {}
    app = FastAPI()
    register_payroll_routes(app, lambda: _FakeSB(captured))
    return TestClient(app), captured


def _payload(stage="truoc_thue", code="HN0001", ky="2026-07", phieu=None):
    return {
        "meta": {"source": "sheet-gate", "version": 1, "code": code,
                 "ky_luong": ky, "stage": stage, "stage_label": "x"},
        "phieu": phieu if phieu is not None else {"Name": "Nguyen Van A", "Cong": 24},
    }


def setup_module(_module):
    os.environ["GATE_TOKEN"] = _TOKEN


def test_receive_happy_upserts_by_key():
    client, captured = _client()
    r = client.post("/api/payroll/payslips/receive", json=_payload(),
                    headers={"X-Gate-Token": _TOKEN})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert captured["table"] == "payslips"
    assert captured["on_conflict"] == "code,ky_luong,stage"
    row = captured["row"]
    assert row["code"] == "HN0001"
    assert row["ky_luong"] == "2026-07"
    assert row["stage"] == "truoc_thue"
    assert row["name"] == "Nguyen Van A"
    assert row["payload_json"]["Cong"] == 24
    assert "updated_at" in row


def test_receive_wrong_token_401():
    client, _ = _client()
    r = client.post("/api/payroll/payslips/receive", json=_payload(),
                    headers={"X-Gate-Token": "nope"})
    assert r.status_code == 401


def test_receive_missing_token_401():
    client, _ = _client()
    r = client.post("/api/payroll/payslips/receive", json=_payload())
    assert r.status_code == 401


def test_receive_bad_stage_422():
    client, _ = _client()
    r = client.post("/api/payroll/payslips/receive", json=_payload(stage="xxx"),
                    headers={"X-Gate-Token": _TOKEN})
    assert r.status_code == 422


def test_receive_missing_code_422():
    client, _ = _client()
    body = _payload()
    body["meta"].pop("code")
    r = client.post("/api/payroll/payslips/receive", json=body,
                    headers={"X-Gate-Token": _TOKEN})
    assert r.status_code == 422


def test_receive_empty_phieu_422():
    client, _ = _client()
    r = client.post("/api/payroll/payslips/receive", json=_payload(phieu={}),
                    headers={"X-Gate-Token": _TOKEN})
    assert r.status_code == 422
