"""Đơn tín dụng: ẩn khỏi tab Kích hoạt tới khi mọi lần quẹt thẻ đã ghép giao dịch.

Gate BE: active_requests.pr_id → payment_lines(method in card/installment)
         → gateway_transactions(match_status='matched', payment_line_id).
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import activation_routes  # noqa: E402


# ---------- pure function ----------

def test_is_credit_pending_no_card_lines_false():
    assert activation_routes._is_credit_pending([], {"x"}) is False


def test_is_credit_pending_all_matched_false():
    assert activation_routes._is_credit_pending(["L1", "L2"], {"L1", "L2"}) is False


def test_is_credit_pending_some_unmatched_true():
    assert activation_routes._is_credit_pending(["L1", "L2"], {"L1"}) is True


def test_is_credit_pending_none_matched_true():
    assert activation_routes._is_credit_pending(["L1"], set()) is True


# ---------- batch map + endpoint via FakeSB ----------

class Query:
    def __init__(self, rows):
        self.rows = rows
        self.eqs = []
        self.ins = []
        self._limit = None

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, v):
        self._limit = v
        return self

    def eq(self, k, v):
        self.eqs.append((k, v))
        return self

    def in_(self, k, vals):
        self.ins.append((k, set(str(v) for v in vals)))
        return self

    def ilike(self, *_a, **_k):
        # list_active_requests dùng ilike khi có ?search= — no-op (test không lọc search).
        return self

    def execute(self):
        m = list(self.rows)
        for k, v in self.eqs:
            m = [r for r in m if str(r.get(k, "")) == str(v)]
        for k, vals in self.ins:
            m = [r for r in m if str(r.get(k)) in vals]
        if self._limit is not None:
            m = m[: self._limit]
        return MagicMock(data=m)


class FakeSB:
    def __init__(self):
        self.tables = {
            "active_requests": [
                _ar("AR-CARD", "PR-CARD"),      # card chưa matched → pending
                _ar("AR-DONE", "PR-DONE"),      # card đã matched → không pending
                _ar("AR-QR", "PR-QR"),          # thuần qr → không pending
                _ar("AR-NONE", None),           # không pr → không pending
            ],
            "payment_requests": [
                {"id": "PR-CARD", "name": "A", "target": 1, "received": 1},
                {"id": "PR-DONE", "name": "B", "target": 1, "received": 1},
                {"id": "PR-QR", "name": "C", "target": 1, "received": 1},
            ],
            "payment_lines": [
                {"id": "L-CARD", "payment_request_id": "PR-CARD", "method": "card"},
                {"id": "L-DONE", "payment_request_id": "PR-DONE", "method": "installment"},
                {"id": "L-QR", "payment_request_id": "PR-QR", "method": "qr"},
            ],
            "gateway_transactions": [
                {"payment_line_id": "L-DONE", "match_status": "matched"},
                {"payment_line_id": "L-CARD", "match_status": "pending"},
            ],
        }

    def table(self, name):
        return Query(self.tables.get(name, []))


def _ar(ar_id, pr_id):
    return {
        "id": ar_id,
        "pr_id": pr_id,
        "customer_name": "KH",
        "uids_data": [{"uid": "u1", "phone": "0", "country": "VN",
                       "courses": [{"code": "PF-1", "name": "Goi", "amount": 1, "order_id": ""}]}],
        "status": "pending_order",
        "created_at": "2026-08-14T10:00:00+00:00",
    }


ACTOR = MagicMock(email="ops@test.com", role="system")


def _flag_by_id(payload):
    return {row["id"]: row.get("credit_settlement_pending") for row in payload}


def test_credit_hold_map_direct():
    sb = FakeSB()
    m = activation_routes._credit_hold_map(sb, ["PR-CARD", "PR-DONE", "PR-QR"])
    assert m.get("PR-CARD") is True
    assert "PR-DONE" not in m   # matched → không pending
    assert "PR-QR" not in m     # không phải card → vắng mặt


def test_list_endpoint_sets_flag_per_ar():
    sb = FakeSB()
    app = FastAPI()
    activation_routes.register_activation_routes(app, lambda: sb)
    client = TestClient(app, raise_server_exceptions=False)

    with patch("activation_routes.resolve_actor", return_value=ACTOR):
        resp = client.get("/api/v1/active-requests")

    assert resp.status_code == 200
    flags = _flag_by_id(resp.json())
    assert flags["AR-CARD"] is True     # ẩn
    assert flags["AR-DONE"] is False    # hiện
    assert flags["AR-QR"] is False      # hiện
    assert flags["AR-NONE"] is False    # hiện
