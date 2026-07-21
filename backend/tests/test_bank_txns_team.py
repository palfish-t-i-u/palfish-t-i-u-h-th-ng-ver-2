"""Tests cho PATCH /api/v1/bank-transactions/{txn_id}/team.

Kịch bản:
- set HCM thành công
- set HN đè HCM (loại trừ nhau)
- xoá tag (team="" → null)
- giá trị lạ → 400
- read-only → 403
- txn_id không tồn tại → 404
- audit log được ghi
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, call, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ACTOR_WRITE = MagicMock(email="ke_toan@test.com", role="ke_toan_truong")
ACTOR_READONLY = MagicMock(email="readonly@test.com", role="viewer")

SAMPLE_TXN = {"txn_id": "txn-abc", "team": None, "match_status": "pending", "amount": 1_000_000}


@pytest.fixture(autouse=True)
def _reset_router():
    import sepay_routes as sp_mod
    sp_mod.router.routes.clear()
    yield
    sp_mod.router.routes.clear()


def _make_sb(txn_row=SAMPLE_TXN, raise_on_update=False):
    sb = MagicMock()

    def table_side_effect(name):
        t = MagicMock()
        t.select.return_value = t
        t.eq.return_value = t
        t.limit.return_value = t
        t.order.return_value = t
        t.range.return_value = t

        if name == "bank_transactions":
            select_res = MagicMock()
            select_res.data = [txn_row] if txn_row else []
            t.execute.return_value = select_res

            update_res = MagicMock()
            update_res.data = [txn_row]

            def update_side(payload):
                u = MagicMock()
                u.eq.return_value = u
                if raise_on_update:
                    u.execute.side_effect = Exception("DB error")
                else:
                    u.execute.return_value = update_res
                return u

            t.update.side_effect = update_side

        return t

    sb.table.side_effect = table_side_effect
    return sb


def _make_client(sb, actor=ACTOR_WRITE):
    from sepay_routes import register_sepay_routes

    app = FastAPI()
    with (
        patch("sepay_routes.resolve_actor", return_value=actor),
        patch("sepay_routes.require_module_write") as mock_rbac,
    ):
        if actor is ACTOR_READONLY:
            from fastapi import HTTPException
            mock_rbac.side_effect = HTTPException(403, "Forbidden")
        register_sepay_routes(app, lambda: sb)

    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_set_hcm():
    sb = _make_sb()
    with (
        patch("sepay_routes.resolve_actor", return_value=ACTOR_WRITE),
        patch("sepay_routes.require_module_write"),
        patch("audit.log_audit") as mock_audit,
    ):
        client = _make_client(sb)
        res = client.patch("/api/v1/bank-transactions/txn-abc/team?team=HCM")
    assert res.status_code == 200
    data = res.json()
    assert data["team"] == "HCM"
    assert data["txn_id"] == "txn-abc"


def test_set_hn_overwrites_hcm():
    txn = {**SAMPLE_TXN, "team": "HCM"}
    sb = _make_sb(txn_row=txn)
    with (
        patch("sepay_routes.resolve_actor", return_value=ACTOR_WRITE),
        patch("sepay_routes.require_module_write"),
        patch("audit.log_audit"),
    ):
        client = _make_client(sb)
        res = client.patch("/api/v1/bank-transactions/txn-abc/team?team=HN")
    assert res.status_code == 200
    assert res.json()["team"] == "HN"


def test_clear_team():
    txn = {**SAMPLE_TXN, "team": "HCM"}
    sb = _make_sb(txn_row=txn)
    with (
        patch("sepay_routes.resolve_actor", return_value=ACTOR_WRITE),
        patch("sepay_routes.require_module_write"),
        patch("audit.log_audit"),
    ):
        client = _make_client(sb)
        res = client.patch("/api/v1/bank-transactions/txn-abc/team?team=")
    assert res.status_code == 200
    assert res.json()["team"] is None


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------

def test_invalid_team_value():
    sb = _make_sb()
    with (
        patch("sepay_routes.resolve_actor", return_value=ACTOR_WRITE),
        patch("sepay_routes.require_module_write"),
    ):
        client = _make_client(sb)
        res = client.patch("/api/v1/bank-transactions/txn-abc/team?team=SAIGON")
    assert res.status_code == 400


def test_txn_not_found():
    sb = _make_sb(txn_row=None)
    with (
        patch("sepay_routes.resolve_actor", return_value=ACTOR_WRITE),
        patch("sepay_routes.require_module_write"),
    ):
        client = _make_client(sb)
        res = client.patch("/api/v1/bank-transactions/txn-unknown/team?team=HCM")
    assert res.status_code == 404


def test_read_only_forbidden():
    sb = _make_sb()
    with patch("sepay_routes.resolve_actor", return_value=ACTOR_READONLY):
        client = _make_client(sb, actor=ACTOR_READONLY)
        res = client.patch("/api/v1/bank-transactions/txn-abc/team?team=HCM")
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

def test_audit_log_written():
    sb = _make_sb()
    with (
        patch("sepay_routes.resolve_actor", return_value=ACTOR_WRITE),
        patch("sepay_routes.require_module_write"),
        patch("audit.log_audit") as mock_audit,
    ):
        client = _make_client(sb)
        client.patch("/api/v1/bank-transactions/txn-abc/team?team=HN")

    # Không assert call signature cứng (có thể bị patch theo cách khác),
    # chỉ assert audit được gọi ít nhất 1 lần với action đúng
    calls_flat = [str(c) for c in mock_audit.call_args_list]
    assert any("recon.bank_txn_team_set" in s for s in calls_flat), (
        f"Audit log không ghi 'recon.bank_txn_team_set'. Calls: {mock_audit.call_args_list}"
    )
