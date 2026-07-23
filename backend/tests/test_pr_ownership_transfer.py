"""Tạo hộ + chuyển giao PR (đề xuất Sale Leader 22/07).

Ma trận quyền:
- Tạo hộ: chỉ leader/manager/system, owner phải trong scope + active.
- Chuyển giao: trục sale ↔ leader (≥1 đầu là leader/manager) — không sale↔sale 1 bước.
- Nhật ký pr_ownership_log là bắt buộc với transfer: ghi fail → revert sale_email.
- is_test theo CHỦ SỞ HỮU (đổi @dev ↔ thật phải sync payment_lines).
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

LEADER = MagicMock(email="leader@pf.vn", role="leader", staff={"team": "IH1", "sub_team": "Team Nina"})
MANAGER = MagicMock(email="manager@pf.vn", role="manager", staff={"team": "IH1", "sub_team": None})
SALE_A = MagicMock(email="salea@pf.vn", role="sale", staff={"team": "IH1", "sub_team": "Team Nina"})
OPS = MagicMock(email="ketoan@pf.vn", role="ops", staff={})

STAFF_ROWS = [
    {"email": "leader@pf.vn", "role": "leader", "team": "IH1", "sub_team": "Team Nina",
     "crm_name": "LeaderNina", "display_name": "Đào Thị Trang", "is_active": True},
    {"email": "salea@pf.vn", "role": "sale", "team": "IH1", "sub_team": "Team Nina",
     "crm_name": "SaleA", "display_name": "Sale A", "is_active": True},
    {"email": "saleb@pf.vn", "role": "sale", "team": "IH1", "sub_team": "Team Nina",
     "crm_name": "SaleB", "display_name": "Sale B", "is_active": True},
    {"email": "manager@pf.vn", "role": "manager", "team": "IH1", "sub_team": None,
     "crm_name": "ManagerIH1", "display_name": "Manager IH1", "is_active": True},
    {"email": "nghi@pf.vn", "role": "sale", "team": "IH1", "sub_team": "Team Nina",
     "crm_name": "Nghi", "display_name": "Đã nghỉ", "is_active": False},
    {"email": "test.user@dev", "role": "sale", "team": "IH1", "sub_team": "Team Nina",
     "crm_name": "TestUser", "display_name": "Test User", "is_active": True},
]

TEAM_SCOPE = ["leader@pf.vn", "salea@pf.vn", "saleb@pf.vn", "manager@pf.vn", "test.user@dev"]


@pytest.fixture(autouse=True)
def _reset_router():
    import payment_request_routes as pr_mod

    pr_mod.router.routes.clear()
    yield
    pr_mod.router.routes.clear()


class _Q:
    def __init__(self, sb, table):
        self.sb = sb
        self.table_name = table
        self._filters: list[tuple] = []
        self._action = "select"
        self._payload = None

    def select(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        return self

    def eq(self, c, v):
        self._filters.append(("eq", c, v))
        return self

    def ilike(self, c, v):
        self._filters.append(("ilike", c, v))
        return self

    def in_(self, c, v):
        self._filters.append(("in", c, list(v)))
        return self

    def update(self, patch):
        self._action = "update"
        self._payload = patch
        return self

    def insert(self, row):
        self._action = "insert"
        self._payload = row
        return self

    def _match(self, row):
        for op, c, v in self._filters:
            rv = row.get(c)
            if op == "eq" and rv != v:
                return False
            if op == "ilike" and str(rv or "").lower() != str(v).lower():
                return False
            if op == "in" and rv not in v:
                return False
        return True

    def execute(self):
        rows = self.sb.tables.setdefault(self.table_name, [])
        if self._action == "insert":
            if self.table_name in self.sb.fail_insert:
                raise RuntimeError(f"forced insert fail: {self.table_name}")
            self.sb.inserts.append((self.table_name, dict(self._payload)))
            rows.append(dict(self._payload))
            return MagicMock(data=[dict(self._payload)])
        if self._action == "update":
            self.sb.updates.append((self.table_name, dict(self._payload), list(self._filters)))
            out = []
            for r in rows:
                if self._match(r):
                    r.update(self._payload)
                    out.append(dict(r))
            return MagicMock(data=out)
        return MagicMock(data=[dict(r) for r in rows if self._match(r)])


class _FakeSB:
    def __init__(self, tables=None):
        self.tables = {k: [dict(r) for r in v] for k, v in (tables or {}).items()}
        self.inserts: list[tuple] = []
        self.updates: list[tuple] = []
        self.fail_insert: set[str] = set()

    def table(self, name):
        return _Q(self, name)


def _pr_row(**over):
    row = {
        "id": "PR-2026-0100", "name": "Khach", "phone": "0900000001",
        "sale_email": "salea@pf.vn", "is_test": False, "state": "pending",
        "target": 1000000, "received": 0, "created_at": "2026-07-20T03:00:00Z",
    }
    row.update(over)
    return row


def _make_client(sb):
    import payment_request_routes

    app = FastAPI()
    payment_request_routes.register_payment_request_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False)


def _ctx(actor, scope=TEAM_SCOPE):
    return (
        patch("payment_request_routes.resolve_actor", return_value=actor),
        patch("payment_request_routes.require_module_write"),
        patch("payment_request_routes.require_module_access"),
        patch("payment_request_routes.visible_creator_emails", return_value=scope),
    )


def _transfer(actor, sb, pr_id="PR-2026-0100", to="leader@pf.vn", reason=None, scope=TEAM_SCOPE):
    client = _make_client(sb)
    p1, p2, p3, p4 = _ctx(actor, scope)
    with p1, p2, p3, p4:
        return client.post(
            f"/api/v1/payment-requests/{pr_id}/transfer",
            json={"to_sale_email": to, **({"reason": reason} if reason else {})},
        )


def _base_tables(pr=None):
    return {
        "payment_requests": [pr or _pr_row()],
        "nhan_su_sale": STAFF_ROWS,
        "pr_ownership_log": [],
        "payment_lines": [{"id": "L1", "payment_request_id": "PR-2026-0100", "is_test": False}],
    }


# ------------------------- Chuyển giao -------------------------


def test_sale_transfers_own_pr_to_leader():
    sb = _FakeSB(_base_tables())
    res = _transfer(SALE_A, sb, to="leader@pf.vn", reason="ban giao")
    assert res.status_code == 200
    assert sb.tables["payment_requests"][0]["sale_email"] == "leader@pf.vn"
    logs = [r for t, r in sb.inserts if t == "pr_ownership_log"]
    assert len(logs) == 1
    assert logs[0]["action"] == "transfer"
    assert logs[0]["from_sale_email"] == "salea@pf.vn"
    assert logs[0]["to_sale_email"] == "leader@pf.vn"
    assert logs[0]["actor_email"] == "salea@pf.vn"
    assert logs[0]["reason"] == "ban giao"


def test_sale_cannot_transfer_others_pr():
    sb = _FakeSB(_base_tables(_pr_row(sale_email="saleb@pf.vn")))
    res = _transfer(SALE_A, sb, to="leader@pf.vn")
    assert res.status_code == 403


def test_sale_to_sale_blocked_even_for_leader():
    """Trục sale ↔ leader: leader cũng không được chuyển thẳng saleA → saleB."""
    sb = _FakeSB(_base_tables())
    res = _transfer(LEADER, sb, to="saleb@pf.vn")
    assert res.status_code == 400
    assert "2 bước" in res.json()["detail"]
    assert sb.tables["payment_requests"][0]["sale_email"] == "salea@pf.vn"


def test_leader_pulls_sale_pr_to_self_then_gives_saleb():
    sb = _FakeSB(_base_tables())
    res1 = _transfer(LEADER, sb, to="leader@pf.vn")
    assert res1.status_code == 200
    res2 = _transfer(LEADER, sb, to="saleb@pf.vn")
    assert res2.status_code == 200
    assert sb.tables["payment_requests"][0]["sale_email"] == "saleb@pf.vn"
    logs = [r for t, r in sb.inserts if t == "pr_ownership_log"]
    assert [r["action"] for r in logs] == ["transfer", "transfer"]


def test_ops_cannot_transfer():
    sb = _FakeSB(_base_tables())
    res = _transfer(OPS, sb, to="leader@pf.vn")
    assert res.status_code == 403


def test_transfer_to_inactive_staff_rejected():
    sb = _FakeSB(_base_tables(_pr_row(sale_email="leader@pf.vn")))
    res = _transfer(LEADER, sb, to="nghi@pf.vn")
    assert res.status_code == 400


def test_transfer_to_unknown_email_rejected():
    sb = _FakeSB(_base_tables(_pr_row(sale_email="leader@pf.vn")))
    res = _transfer(LEADER, sb, to="ngoai@la.com")
    assert res.status_code == 400


def test_transfer_cancelled_pr_rejected():
    sb = _FakeSB(_base_tables(_pr_row(state="cancelled")))
    res = _transfer(LEADER, sb, to="leader@pf.vn")
    assert res.status_code == 400


def test_transfer_same_owner_rejected():
    sb = _FakeSB(_base_tables())
    res = _transfer(LEADER, sb, to="salea@pf.vn")
    assert res.status_code == 400


def test_out_of_scope_target_rejected():
    """Leader IH1 không chuyển cho người ngoài scope (visible_creator_emails)."""
    sb = _FakeSB(_base_tables())
    res = _transfer(LEADER, sb, to="leader@pf.vn", scope=["salea@pf.vn"])
    assert res.status_code == 403


def test_log_insert_fail_reverts_owner():
    sb = _FakeSB(_base_tables())
    sb.fail_insert.add("pr_ownership_log")
    res = _transfer(SALE_A, sb, to="leader@pf.vn")
    assert res.status_code == 500
    # Đã revert về chủ cũ
    assert sb.tables["payment_requests"][0]["sale_email"] == "salea@pf.vn"


def test_transfer_to_dev_account_syncs_is_test():
    sb = _FakeSB(_base_tables(_pr_row(sale_email="leader@pf.vn")))
    res = _transfer(LEADER, sb, to="test.user@dev")
    assert res.status_code == 200
    assert sb.tables["payment_requests"][0]["is_test"] is True
    line_updates = [u for u in sb.updates if u[0] == "payment_lines"]
    assert line_updates and line_updates[0][1] == {"is_test": True}


# ------------------------- Tạo hộ -------------------------

CREATE_BODY = {"name": "Khach", "phone": "0900000009", "target": 5000000, "lead_source": "hotline"}


def _create(actor, sb, body, scope=TEAM_SCOPE):
    client = _make_client(sb)
    p1, p2, p3, p4 = _ctx(actor, scope)
    with p1, p2, p3, p4, patch(
        "payment_request_routes._allocate_pr_id", return_value="PR-2026-0999"
    ):
        return client.post("/api/v1/payment-requests", json=body)


def test_leader_creates_on_behalf():
    sb = _FakeSB(_base_tables())
    res = _create(LEADER, sb, {**CREATE_BODY, "owner_sale_email": "salea@pf.vn"})
    assert res.status_code == 200
    created = [r for t, r in sb.inserts if t == "payment_requests"][0]
    assert created["sale_email"] == "salea@pf.vn"
    logs = [r for t, r in sb.inserts if t == "pr_ownership_log"]
    assert logs[0]["action"] == "create_on_behalf"
    assert logs[0]["actor_email"] == "leader@pf.vn"
    assert logs[0]["to_sale_email"] == "salea@pf.vn"


def test_sale_cannot_create_on_behalf():
    sb = _FakeSB(_base_tables())
    res = _create(SALE_A, sb, {**CREATE_BODY, "owner_sale_email": "saleb@pf.vn"})
    assert res.status_code == 403


def test_create_on_behalf_out_of_scope_rejected():
    sb = _FakeSB(_base_tables())
    res = _create(LEADER, sb, {**CREATE_BODY, "owner_sale_email": "saleb@pf.vn"}, scope=["salea@pf.vn"])
    assert res.status_code == 403


def test_plain_create_logs_create_action():
    sb = _FakeSB(_base_tables())
    res = _create(SALE_A, sb, CREATE_BODY)
    assert res.status_code == 200
    created = [r for t, r in sb.inserts if t == "payment_requests"][0]
    assert created["sale_email"] == "salea@pf.vn"
    logs = [r for t, r in sb.inserts if t == "pr_ownership_log"]
    assert logs[0]["action"] == "create"


def test_create_on_behalf_for_dev_account_sets_is_test():
    sb = _FakeSB(_base_tables())
    res = _create(LEADER, sb, {**CREATE_BODY, "owner_sale_email": "test.user@dev"})
    assert res.status_code == 200
    created = [r for t, r in sb.inserts if t == "payment_requests"][0]
    assert created["is_test"] is True


# ------------------------- Owner options -------------------------


def test_owner_options_for_sale_returns_leaders_same_subteam():
    sb = _FakeSB(_base_tables())
    client = _make_client(sb)
    p1, p2, p3, p4 = _ctx(SALE_A)
    with p1, p2, p3, p4:
        res = client.get("/api/v1/payment-requests/owner-options")
    assert res.status_code == 200
    emails = {o["email"] for o in res.json()["options"]}
    # Leader cùng sub_team + manager cả team; không có sale thường
    assert emails == {"leader@pf.vn", "manager@pf.vn"}
