"""Toggle hold_activation qua PATCH /api/v1/active-requests/{ar_id} (29/08).

Sale tu doi "Tao goi hoc ngay / Chua tao goi hoc" sau khi bao don, thay vi phai
nho admin sua thang DB. Xem docs/PLAN_HOLD_ACTIVATION_TOGGLE_2026-08-29.md.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import activation_routes as ar
from rbac import Actor


def _generic_empty_table():
    """Fake table cho moi bang KHONG phai active_requests — moi chain tra rong,
    khong crash cac helper best-effort (_fetch_prs_by_ids, dingtalk enqueue, tien_ve...)."""
    m = MagicMock()
    for method in (
        "select", "eq", "neq", "gt", "gte", "lte", "in_", "order", "limit",
        "or_", "ilike", "update", "insert", "upsert",
    ):
        getattr(m, method).return_value = m
    m.execute.return_value = MagicMock(data=[])
    return m


class _ActiveRequestsTable:
    """Fake bang active_requests — ho tro select().eq().limit().execute() va
    update(patch).eq().execute(), giu state that de PATCH lien tiep phan anh dung."""

    def __init__(self, row: dict):
        self.row = dict(row)
        self._update_patch: dict | None = None

    def select(self, *_a, **_k):
        return self

    def eq(self, _key, _value):
        return self

    def limit(self, _n):
        return self

    def update(self, patch: dict):
        self._update_patch = patch
        return self

    def execute(self):
        if self._update_patch is not None:
            self.row.update(self._update_patch)
            self._update_patch = None
        return MagicMock(data=[dict(self.row)])


class FakeSB:
    def __init__(self, ar_row: dict):
        self.ar_table = _ActiveRequestsTable(ar_row)

    def table(self, name):
        if name == "active_requests":
            return self.ar_table
        return _generic_empty_table()


def _actor(email="sale@palfish.vn", role="sale"):
    return Actor(email=email, user_id="u1", role=role, staff={}, department="sale")


def _make_client(ar_row: dict):
    sb = FakeSB(ar_row)
    app = FastAPI()
    ar.register_activation_routes(app, lambda: sb)
    client = TestClient(app)
    return client, sb


BASE_AR_ROW = {
    "id": "AR-2026-0650",
    "pr_id": "PR-2026-0650",
    "customer_name": "Nguyen Van A",
    "uids_data": [{"uid": "U1", "courses": [{"code": "CC-0650-001", "name": "Goi A", "amount": 1000000}]}],
    "status": "pending_order",
    "hold_activation": False,
    "hold_note": None,
    "created_at": "2026-08-29T10:00:00Z",
    "updated_at": "2026-08-29T10:00:00Z",
    "info_confirmed_at": None,
    "is_test": False,
}


class TestHoldActivationToggle:
    def test_sale_toggles_to_chua_tao_goi_hoc(self):
        """pending_order + hold_activation=true -> 200, luu dung, hold_note luon None."""
        client, sb = _make_client(BASE_AR_ROW)
        with patch.object(ar, "resolve_actor", return_value=_actor()):
            resp = client.patch(
                f"/api/v1/active-requests/{BASE_AR_ROW['id']}",
                json={"hold_activation": True},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["hold_activation"] is True
        assert body["hold_note"] is None
        assert sb.ar_table.row["hold_activation"] is True
        assert sb.ar_table.row["hold_note"] is None

    def test_sale_toggles_back_to_tao_ngay(self):
        """Doi tu hold=True ve False cung hoat dong (2 chieu, khong bi khoa 1 huong)."""
        row = {**BASE_AR_ROW, "hold_activation": True, "hold_note": "PH ban viec"}
        client, sb = _make_client(row)
        with patch.object(ar, "resolve_actor", return_value=_actor()):
            resp = client.patch(
                f"/api/v1/active-requests/{row['id']}",
                json={"hold_activation": False},
            )
        assert resp.status_code == 200
        assert resp.json()["hold_activation"] is False
        assert sb.ar_table.row["hold_note"] is None  # bi xoa dung theo guardrail

    def test_hold_note_always_cleared_on_patch(self):
        """Sale doi hold_activation=True nhung khong gui hold_note -> BE tu ep None,
        khong giu note cu tu lan truoc (guardrail: khong co o nhap ghi chu qua PATCH)."""
        row = {**BASE_AR_ROW, "hold_activation": False, "hold_note": "note cu tu form bao don"}
        client, sb = _make_client(row)
        with patch.object(ar, "resolve_actor", return_value=_actor()):
            client.patch(f"/api/v1/active-requests/{row['id']}", json={"hold_activation": True})
        assert sb.ar_table.row["hold_note"] is None

    @pytest.mark.parametrize("blocked_status", ["activated", "invoiced"])
    def test_blocked_when_already_activated_or_invoiced(self, blocked_status):
        """Don da kich hoat/xuat HD -> 400, KHONG duoc doi hold_activation nua."""
        row = {**BASE_AR_ROW, "status": blocked_status}
        client, sb = _make_client(row)
        with patch.object(ar, "resolve_actor", return_value=_actor()):
            resp = client.patch(
                f"/api/v1/active-requests/{row['id']}",
                json={"hold_activation": True},
            )
        assert resp.status_code == 400
        # Khong duoc ghi de DB khi bi chan
        assert sb.ar_table.row["hold_activation"] is False

    def test_allowed_for_other_pending_statuses(self):
        """ready_invoice / partial_order van chua phai activated/invoiced -> van sua duoc."""
        for status in ("ready_invoice", "partial_order"):
            row = {**BASE_AR_ROW, "status": status, "hold_activation": False}
            client, sb = _make_client(row)
            with patch.object(ar, "resolve_actor", return_value=_actor()):
                resp = client.patch(
                    f"/api/v1/active-requests/{row['id']}",
                    json={"hold_activation": True},
                )
            assert resp.status_code == 200, f"status={status} phai cho sua duoc"
            assert sb.ar_table.row["hold_activation"] is True

    def test_hold_activation_none_is_noop_not_error(self):
        """Khong gui hold_activation (None) -> khong dung nhanh nay, cac field khac
        van xu ly binh thuong (VD info_confirmed) — khong bi anh huong boi thay doi."""
        row = dict(BASE_AR_ROW)
        client, sb = _make_client(row)
        with patch.object(ar, "resolve_actor", return_value=_actor()):
            resp = client.patch(
                f"/api/v1/active-requests/{row['id']}",
                json={"info_confirmed": True},
            )
        assert resp.status_code == 200
        # hold_activation khong doi (van False nhu ban dau) va khong co trong response patch
        assert sb.ar_table.row["hold_activation"] is False

    def test_empty_body_returns_400(self):
        """Khong gui field nao -> 400 'Khong co du lieu de cap nhat' (hanh vi cu, khong doi)."""
        client, sb = _make_client(dict(BASE_AR_ROW))
        with patch.object(ar, "resolve_actor", return_value=_actor()):
            resp = client.patch(f"/api/v1/active-requests/{BASE_AR_ROW['id']}", json={})
        assert resp.status_code == 400
