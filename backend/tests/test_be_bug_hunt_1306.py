"""BE Bug Hunt 13/06 — restore PR + đối soát chính xác."""

from __future__ import annotations

import importlib
import inspect
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from rbac import Actor

ACTOR = Actor(
    email="ops@test.com",
    user_id="user-1",
    role="system",
    staff=None,
    is_activated=True,
)


class TestTransferCodeDescriptionMatch:
    def test_substring_false_positive_avoided(self):
        import payment_request_routes as pr

        pr = importlib.reload(pr)
        assert pr._transfer_code_in_description("12345", "Thanh toan 012345") is False

    def test_exact_token_matches(self):
        import payment_request_routes as pr

        pr = importlib.reload(pr)
        assert pr._transfer_code_in_description("012345", "Thanh toan 012345") is True
        assert pr._transfer_code_in_description("FH9VT", "0901 Ha FH9VT") is True


class TestMarkLinePaidIdempotency:
    def test_paid_line_not_updated_again(self):
        import payment_request_routes as pr

        pr = importlib.reload(pr)
        sb = MagicMock()
        existing_line = {
            "id": "line-1",
            "payment_request_id": "PR-2026-0001",
            "status": "paid",
            "paid_at": "2026-06-13T10:00:00+00:00",
            "amount": 1000000,
        }
        select_chain = MagicMock()
        select_chain.select.return_value = select_chain
        select_chain.eq.return_value = select_chain
        select_chain.limit.return_value = select_chain
        select_chain.execute.return_value = MagicMock(data=[existing_line])

        pr_table = MagicMock()
        pr_table.select.return_value = pr_table
        pr_table.eq.return_value = pr_table
        pr_table.limit.return_value = pr_table
        pr_table.execute.return_value = MagicMock(
            data=[{"id": "PR-2026-0001", "target": 1000000, "received": 1000000, "state": "done"}]
        )
        lines_table = MagicMock()
        lines_table.select.return_value = lines_table
        lines_table.eq.return_value = lines_table
        lines_table.execute.return_value = MagicMock(
            data=[{"amount": 1000000, "status": "paid"}]
        )
        update_table = MagicMock()

        def table(name):
            if name == "payment_lines":
                if not hasattr(table, "_phase"):
                    table._phase = "select"
                if table._phase == "select":
                    return select_chain
                return update_table
            if name == "payment_requests":
                return pr_table
            raise AssertionError(name)

        sb.table.side_effect = table

        with patch.object(pr, "recompute_payment_request_totals", return_value={"state": "done"}):
            result = pr._mark_line_paid(sb, "line-1")

        update_table.update.assert_not_called()
        assert result["payment_line"]["paid_at"] == "2026-06-13T10:00:00+00:00"


class TestDuplicateOrderId:
    def test_duplicate_on_other_course_raises_409(self):
        import activation_routes as ar

        ar = importlib.reload(ar)
        sb = MagicMock()
        sb.table.return_value.select.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "AR-2026-0001",
                    "uids_data": [
                        {"courses": [{"code": "C1", "order_id": "ORD-999"}]},
                    ],
                }
            ]
        )

        with pytest.raises(HTTPException) as exc:
            ar._assert_order_id_available(sb, "AR-2026-0002", "C2", "ORD-999")

        assert exc.value.status_code == 409

    def test_same_ar_course_is_idempotent(self):
        import activation_routes as ar

        ar = importlib.reload(ar)
        sb = MagicMock()
        sb.table.return_value.select.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "AR-2026-0001",
                    "uids_data": [
                        {"courses": [{"code": "C1", "order_id": "ORD-999"}]},
                    ],
                }
            ]
        )

        ar._assert_order_id_available(sb, "AR-2026-0001", "C1", "ORD-999")


class TestInvoiceReminderDefense:
    def _build_client(self):
        import payment_request_routes as pr

        pr = importlib.reload(pr)
        sb = MagicMock()
        app = FastAPI()
        pr.register_payment_request_routes(app, lambda: sb)
        return TestClient(app, raise_server_exceptions=False), sb

    def test_underpaid_pr_returns_400(self):
        client, sb = self._build_client()
        sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "PR-2026-0001",
                    "target": 5000000,
                    "received": 1000000,
                    "state": "short",
                    "sale_email": "ops@test.com",
                }
            ]
        )

        with patch("payment_request_routes.resolve_actor", return_value=ACTOR):
            with patch("payment_request_routes.require_module_write"):
                with patch("payment_request_routes._can_access_request", return_value=True):
                    resp = client.post(
                        "/api/v1/payment-requests/PR-2026-0001/invoice-remind",
                        json={"note": "test"},
                        headers={"Authorization": "Bearer token"},
                    )

        assert resp.status_code == 400
        assert "chua thu du tien" in resp.json()["detail"]


class TestRestoreEndpointSource:
    def test_restore_route_exists(self):
        import payment_request_routes as pr

        source = inspect.getsource(pr)
        assert "/payment-requests/{payment_request_id}/restore" in source
        assert "cancelled_at" in source
        assert "_compute_state(received, target)" in source


class TestCreatePaymentLineFullPR:
    def _build_client(self):
        import payment_request_routes as pr

        pr = importlib.reload(pr)
        sb = MagicMock()
        app = FastAPI()
        pr.register_payment_request_routes(app, lambda: sb)
        return TestClient(app, raise_server_exceptions=False), sb

    def test_full_pr_returns_structured_error(self):
        client, sb = self._build_client()
        sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": "PR-2026-0001",
                    "target": 5000000,
                    "received": 5000000,
                    "state": "done",
                    "sale_email": "ops@test.com",
                }
            ]
        )

        with patch("payment_request_routes.resolve_actor", return_value=ACTOR):
            with patch("payment_request_routes.require_module_write"):
                with patch("payment_request_routes._can_access_request", return_value=True):
                    resp = client.post(
                        "/api/v1/payment-requests/PR-2026-0001/payment-lines",
                        json={"amount": 1000000, "method": "qr"},
                        headers={"Authorization": "Bearer token"},
                    )

        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["code"] == "PR_ALREADY_FULL"
        assert detail["received"] == 5000000
        assert detail["target"] == 5000000


class TestValidateCourseAmountsFailClosed:
    def test_ar_query_error_raises_500(self):
        import activation_routes as ar

        ar = importlib.reload(ar)
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.execute.side_effect = RuntimeError(
            "db down"
        )
        pr = {"id": "PR-2026-0001", "target": 1000000, "received": 1000000}

        with pytest.raises(HTTPException) as exc:
            ar._validate_course_amounts(sb, pr, [{"courses": [{"amount": 100000}]}])

        assert exc.value.status_code == 500
        assert "loi doc AR" in exc.value.detail
