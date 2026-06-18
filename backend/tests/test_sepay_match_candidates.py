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
        self.patch = None
        self._limit = None

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

    def update(self, patch):
        self.patch = patch
        return self

    def execute(self):
        matched = list(self.rows)
        for key, value in self.filters:
            matched = [row for row in matched if row.get(key) == value]
        for key, values in self.in_filters:
            matched = [row for row in matched if str(row.get(key)) in values]
        if self.patch is not None:
            for row in matched:
                row.update(self.patch)
            return MagicMock(data=matched)
        if self._limit is not None:
            matched = matched[: self._limit]
        return MagicMock(data=matched)


class FakeSB:
    def __init__(self):
        self.tables = {
            "bank_transactions": [
                {
                    "txn_id": "txn-bank-1",
                    "amount": 5000500,
                    "match_status": "needs_review",
                }
            ],
            "payment_lines": [
                {
                    "id": "line-1",
                    "payment_request_id": "PR-1",
                    "amount": 5000000,
                    "method": "transfer",
                    "status": "pending",
                    "transfer_code": "TT001",
                    "created_at": "2026-06-18T10:00:00+00:00",
                },
                {
                    "id": "line-other",
                    "payment_request_id": "PR-2",
                    "amount": 999999,
                    "method": "transfer",
                    "status": "pending",
                    "transfer_code": "TT002",
                    "created_at": "2026-06-18T10:05:00+00:00",
                },
            ],
            "payment_requests": [
                {
                    "id": "PR-1",
                    "name": "Parent One",
                    "uid": "uid-1",
                    "phone": "0901000001",
                    "child_name": "Be Bin",
                    "sale_email": "sale@test.com",
                },
                {
                    "id": "PR-2",
                    "name": "Parent Two",
                    "uid": "uid-2",
                    "phone": "0901000002",
                    "child_name": "",
                    "sale_email": "other@test.com",
                },
            ],
            "nhan_su_sale": [
                {
                    "email": "sale@test.com",
                    "display_name": "Sale Test",
                    "crm_name": "CRM Sale",
                    "team": "Team Hanoi",
                    "sub_team": "Sub A",
                },
                {
                    "email": "other@test.com",
                    "display_name": "Other Sale",
                    "crm_name": "",
                    "team": "Team Other",
                    "sub_team": "",
                },
            ],
        }

    def table(self, name):
        return Query(self.tables[name])


ACTOR = MagicMock(email="ops@test.com", role="system")


def build_client(sb: FakeSB):
    import sepay_routes

    app = FastAPI()
    sepay_routes.register_sepay_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False)


def test_bank_candidates_enrichment_amount_exact_and_discrepancy():
    sb = FakeSB()
    client = build_client(sb)

    with patch("sepay_routes.resolve_actor", return_value=ACTOR):
        with patch("sepay_routes.require_module_write"):
            candidates = client.get(
                "/api/v1/bank-transactions/txn-bank-1/match-candidates?amount_exact=5000000"
            )
        with patch("sepay_routes.require_module_write"):
            with patch("payment_request_routes.recompute_payment_request_totals"):
                match = client.patch(
                    "/api/v1/bank-transactions/txn-bank-1/match?payment_line_id=line-1"
                )

    assert candidates.status_code == 200
    rows = candidates.json()
    assert len(rows) == 1
    assert rows[0]["payment_line_id"] == "line-1"
    assert rows[0]["child_name"] == "Be Bin"
    assert rows[0]["sale_name"] == "Sale Test"
    assert rows[0]["team_name"] == "Team Hanoi"

    assert match.status_code == 200
    assert match.json()["discrepancy_amount"] == 500
    assert sb.tables["bank_transactions"][0]["discrepancy_amount"] == 500
