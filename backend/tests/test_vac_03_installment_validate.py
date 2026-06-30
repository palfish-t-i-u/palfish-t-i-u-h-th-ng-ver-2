"""
Guardrail for VAC-03 (Đạt) — Bug 1B-07.
Run: cd backend && pytest tests/test_vac_03_installment_validate.py -v
Expected: FAIL on current code (no validation), PASS after fix.

Bug: POST /api/v1/payment-requests/{id}/payment-lines with method=installment
does NOT reject the case where sale_received > installment_total.
A sale can accidentally record that they received MORE than the total installment
contract amount, which is logically impossible and corrupts reconciliation data.

Fix: add a guard in create_payment_line (payment_request_routes.py around
line 1960-1966) that raises HTTP 400 when method=="installment" and
sale_received > installment_total (both parsed via _parse_amount).

Implementation note: the route uses closure-captured `get_supabase`
(register_payment_request_routes binds it as a local at line 1541), so
patching pr.get_supabase has no effect. We patch `_sb_or_503` directly
to bypass the closure entirely.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import payment_request_routes as pr
from main import app

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

PR_ROW = {
    "id": "PR-2026-0099",
    "name": "Nguyễn Văn A",
    "child_name": "Bé Bình",
    "phone": "912345678",
    "country": "VN",
    "state": "pending",
    "target": 10_000_000,
    "received": 0,
    "is_test": False,
    "sale_email": "sale@test.com",
}

INSERTED_LINE_ROW = {
    "id": "line-installment-001",
    "payment_request_id": "PR-2026-0099",
    "method": "installment",
    "status": "pending",
    "amount": 3_000_000,
    "transfer_code": "ABCDE",
    "installment_platform": "MoMo",
    "installment_total": 3_300_000,
    "sale_received": 3_000_000,
    "is_test": False,
}


@pytest.fixture
def client():
    return TestClient(app)


def _mock_sb_for_create(pr_row: dict, inserted_line: dict | None = None):
    """
    MagicMock Supabase client wired with per-table chain.

    Tables hit by create_payment_line:
      1. payment_requests SELECT → [pr_row]
      2. payment_lines    SELECT (existing count) → []
      3. payment_lines    INSERT → [inserted_line]
      4. payment_requests SELECT * (recompute totals) → [pr_row]
      5. payment_lines    SELECT amount,status (recompute) → []
      6. payment_requests UPDATE → [pr_row]
    """
    line_to_return = inserted_line or INSERTED_LINE_ROW
    sb = MagicMock()
    tables: dict = {}

    def _chain(table_name: str):
        if table_name not in tables:
            t = MagicMock()
            t.select.return_value = t
            t.insert.return_value = t
            t.update.return_value = t
            t.delete.return_value = t
            t.eq.return_value = t
            t.neq.return_value = t
            t.limit.return_value = t
            t.order.return_value = t
            t.range.return_value = t
            t.execute.return_value = MagicMock(data=[], count=0)
            tables[table_name] = t
        return tables[table_name]

    sb.table.side_effect = _chain
    sb.rpc.return_value = MagicMock(
        execute=MagicMock(return_value=MagicMock(data=1))
    )

    sb.table("payment_requests").execute.return_value = MagicMock(
        data=[pr_row], count=1
    )
    sb.table("payment_lines").insert.return_value.execute.return_value = MagicMock(
        data=[line_to_return], count=1
    )
    return sb


def _totals(received: int):
    """recompute_payment_request_totals return shape used by create_payment_line."""
    return {
        "payment_request": {**PR_ROW, "received": received, "state": "pending"},
        "received": received,
        "target": PR_ROW["target"],
        "state": "pending",
    }


def _post_installment(client, *, sale_received, installment_total, amount=3_000_000):
    return client.post(
        f"/api/v1/payment-requests/{PR_ROW['id']}/payment-lines",
        json={
            "amount": amount,
            "method": "installment",
            "installment_platform": "MoMo",
            "installment_total": installment_total,
            "sale_received": sale_received,
        },
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestInstallmentSaleReceivedValidation:
    """
    VAC-03 / Bug 1B-07 — sale_received must not exceed installment_total.

    Current code (unfixed): no such check exists. Case 1 returns 200/201 (BUG).
    After fix: Case 1 returns HTTP 400. Cases 2/3 unchanged.
    """

    def test_case1_sale_received_exceeds_installment_total_must_be_400(self, client):
        """
        Bug: sale_received (3_500_000) > installment_total (3_300_000).
        CURRENT: 200/201 (bug). AFTER FIX: 400.
        """
        sb = _mock_sb_for_create(PR_ROW)
        with (
            patch.object(pr, "_sb_or_503", return_value=sb),
            patch.object(pr, "resolve_actor", return_value=MagicMock(email="admin@test.com")),
            patch.object(pr, "require_module_write"),
            patch.object(pr, "_can_access_request", return_value=True),
            patch.object(pr, "recompute_payment_request_totals", return_value=_totals(3_000_000)),
            patch.object(pr, "log_audit"),
        ):
            r = _post_installment(client, sale_received=3_500_000, installment_total=3_300_000)

        assert r.status_code == 400, (
            f"Expected 400 when sale_received > installment_total, got {r.status_code}. "
            f"Response: {r.text}"
        )

    def test_case2_sale_received_equals_installment_total_must_succeed(self, client):
        """Sanity: sale_received == installment_total → 200/201."""
        sb = _mock_sb_for_create(PR_ROW)
        with (
            patch.object(pr, "_sb_or_503", return_value=sb),
            patch.object(pr, "resolve_actor", return_value=MagicMock(email="admin@test.com")),
            patch.object(pr, "require_module_write"),
            patch.object(pr, "_can_access_request", return_value=True),
            patch.object(pr, "recompute_payment_request_totals", return_value=_totals(3_300_000)),
            patch.object(pr, "log_audit"),
        ):
            r = _post_installment(client, sale_received=3_300_000, installment_total=3_300_000)

        assert r.status_code in (200, 201), (
            f"Expected 200/201 when sale_received == installment_total, got {r.status_code}. "
            f"Response: {r.text}"
        )

    def test_case3_sale_received_below_installment_total_must_succeed(self, client):
        """Sanity: sale_received < installment_total → 200/201."""
        sb = _mock_sb_for_create(PR_ROW)
        with (
            patch.object(pr, "_sb_or_503", return_value=sb),
            patch.object(pr, "resolve_actor", return_value=MagicMock(email="admin@test.com")),
            patch.object(pr, "require_module_write"),
            patch.object(pr, "_can_access_request", return_value=True),
            patch.object(pr, "recompute_payment_request_totals", return_value=_totals(2_000_000)),
            patch.object(pr, "log_audit"),
        ):
            r = _post_installment(client, sale_received=2_000_000, installment_total=3_300_000)

        assert r.status_code in (200, 201), (
            f"Expected 200/201 when sale_received < installment_total, got {r.status_code}. "
            f"Response: {r.text}"
        )

    def test_case1_string_amounts_also_rejected(self, client):
        """Edge: amounts sent as strings ('3.500.000') must also be validated."""
        sb = _mock_sb_for_create(PR_ROW)
        with (
            patch.object(pr, "_sb_or_503", return_value=sb),
            patch.object(pr, "resolve_actor", return_value=MagicMock(email="admin@test.com")),
            patch.object(pr, "require_module_write"),
            patch.object(pr, "_can_access_request", return_value=True),
            patch.object(pr, "recompute_payment_request_totals", return_value=_totals(3_000_000)),
            patch.object(pr, "log_audit"),
        ):
            r = client.post(
                f"/api/v1/payment-requests/{PR_ROW['id']}/payment-lines",
                json={
                    "amount": "3.000.000",
                    "method": "installment",
                    "installment_platform": "Home Credit",
                    "installment_total": "3.300.000",
                    "sale_received": "3.500.000",
                },
            )

        assert r.status_code == 400, (
            f"Expected 400 for string amounts where sale_received > installment_total, "
            f"got {r.status_code}. Response: {r.text}"
        )
