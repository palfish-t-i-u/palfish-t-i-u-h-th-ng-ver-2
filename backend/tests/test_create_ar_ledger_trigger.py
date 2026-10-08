"""TẠO AR + BỔ SUNG phải trigger ghi Sổ (sync_ledger).

Bug (pilot 08/10): `_sync_ledger_courses_from_uids` chỉ được gọi ở đường SỬA
(PATCH). Đường TẠO (`create_active_request`) và BỔ SUNG (`append`) không gọi
→ đơn báo-xong-chưa-kích-hoạt không vào Sổ. Fix: gọi sync ở cả 2 đường đó.
Test này chốt đúng wiring (sync được gọi với ar_id + uids_data đúng).
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _Actor:
    email = "admin@test.com"
    role = "system"


def _client_with(monkeypatch, sb, sync_mock):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import activation_routes as ar

    monkeypatch.setattr(ar, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(ar, "_serialize_ar_with_hold", lambda *a, **k: {"ok": True})
    monkeypatch.setattr(ar, "_sync_ledger_courses_from_uids", sync_mock)

    app = FastAPI()
    ar.register_activation_routes(app, lambda: sb)
    return TestClient(app), ar


def test_create_ar_triggers_ledger_sync(monkeypatch):
    """POST tạo AR báo đơn → gọi sync với (sb, ar_id, uids_data của AR vừa lưu)."""
    saved_ar = {"id": "AR-NEW-1",
                "uids_data": [{"uid": "u1", "courses": [{"code": "CC-1", "amount": 1000}]}]}
    sb = MagicMock()
    sync_mock = MagicMock()
    client, ar = _client_with(monkeypatch, sb, sync_mock)
    monkeypatch.setattr(ar, "_parse_create_ar_payload",
                        lambda payload: ("pr-1", "KH Test",
                                         [{"uid": "u1", "courses": [{"name": "Goi", "amount": 1000}]}]))
    monkeypatch.setattr(ar, "_save_active_request", lambda *a, **k: (saved_ar, {"id": "pr-1"}))

    resp = client.post("/api/v1/payment-requests/pr-1/active-requests",
                       json={"uids": [{"uid": "u1", "courses": [{"name": "Goi", "amount": 1000}]}]})

    assert resp.status_code == 200, resp.text
    sync_mock.assert_called_once()
    args = sync_mock.call_args[0]
    assert args[0] is sb
    assert args[1] == "AR-NEW-1"
    assert args[2] == saved_ar["uids_data"]


def test_append_ar_triggers_ledger_sync(monkeypatch):
    """POST báo đơn bổ sung → gọi sync với (sb, ar_id, uids_data đã merge)."""
    ar_row = {"id": "AR-APP-1", "pr_id": "pr-1", "status": "pending_order", "uids_data": []}
    merged = [{"uid": "u1", "courses": [{"code": "CC-2", "amount": 2000}]}]
    new_blocks = [{"uid": "u1", "courses": [{"code": "CC-2", "amount": 2000}]}]

    sb = MagicMock()
    tbl = sb.table.return_value
    tbl.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [ar_row]
    tbl.update.return_value.eq.return_value.execute.return_value.data = [{**ar_row, "uids_data": merged}]

    sync_mock = MagicMock()
    client, ar = _client_with(monkeypatch, sb, sync_mock)
    monkeypatch.setattr(ar, "_fetch_payment_request", lambda sb, pr_id: {"id": "pr-1"})
    monkeypatch.setattr(ar, "assert_pr_paid", lambda sb, pr: None)
    monkeypatch.setattr(ar, "assert_all_paid_lines_have_bill", lambda sb, pr: None)
    monkeypatch.setattr(ar, "_parse_create_ar_payload", lambda payload: (None, None, new_blocks))
    monkeypatch.setattr(ar, "_append_children_core",
                        lambda sb, ar_row, pr, uids_in: (new_blocks, merged, "pending_order"))
    monkeypatch.setattr(ar, "_writeback_pr_uid_from_ar", lambda *a, **k: None)
    monkeypatch.setattr(ar, "_enqueue_activation_request_created_dingtalk", lambda *a, **k: None)

    resp = client.post("/api/v1/active-requests/AR-APP-1/append",
                       json={"uids": [{"uid": "u1", "courses": [{"name": "Goi 2", "amount": 2000}]}]})

    assert resp.status_code == 200, resp.text
    sync_mock.assert_called_once()
    args = sync_mock.call_args[0]
    assert args[0] is sb
    assert args[1] == "AR-APP-1"
    assert args[2] == merged
