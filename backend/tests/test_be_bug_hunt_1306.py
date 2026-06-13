"""BE Bug Hunt 13/06 — restore PR + đối soát chính xác."""

from __future__ import annotations

import importlib
import inspect
import uuid
from datetime import date
from decimal import Decimal
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

SALE_ACTOR = Actor(
    email="sale@test.com",
    user_id="sale-1",
    role="sale",
    staff={"team": "HN", "sub_team": "A", "crm_name": "Sale Test", "department": "sale"},
    is_activated=True,
)

LEADER_ACTOR = Actor(
    email="leader@test.com",
    user_id="leader-1",
    role="leader",
    staff={"team": "HN", "sub_team": "A", "crm_name": "Leader Test", "department": "sale"},
    is_activated=True,
)

MANAGER_ACTOR = Actor(
    email="manager@test.com",
    user_id="manager-1",
    role="manager",
    staff={"team": "HN", "crm_name": "Manager Test", "department": "sale"},
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


class TestAuthPatches:
    def _crm_client(self):
        import crm_routes as crm

        crm = importlib.reload(crm)
        app = FastAPI()
        sb = MagicMock()
        crm.register_crm_routes(app, lambda: sb)
        return TestClient(app, raise_server_exceptions=False), sb

    def test_crm_sync_requires_manager(self):
        client, _sb = self._crm_client()

        with patch("crm_routes.resolve_actor", return_value=SALE_ACTOR):
            sale_resp = client.post(
                "/crm/sync",
                json={"sync_date": "2026-06-13"},
                headers={"Authorization": "Bearer token"},
            )

        with patch("crm_routes.resolve_actor", return_value=MANAGER_ACTOR):
            with patch(
                "crm_routes._run_incremental_day_sync",
                return_value={
                    "rows_fetched": 1,
                    "upserted": 1,
                    "show_type_used": "all",
                    "department_id_used": "1",
                },
            ):
                manager_resp = client.post(
                    "/crm/sync",
                    json={"sync_date": "2026-06-13"},
                    headers={"Authorization": "Bearer token"},
                )

        assert sale_resp.status_code == 403
        assert manager_resp.status_code == 200
        assert manager_resp.json()["rows_upserted"] == 1

    def test_crm_backfill_requires_manager(self):
        client, _sb = self._crm_client()

        with patch("crm_routes.resolve_actor", return_value=SALE_ACTOR):
            sale_resp = client.post(
                "/crm/sync/backfill",
                json={"start_date": "2026-06-12", "end_date": "2026-06-13", "concurrency": 1},
                headers={"Authorization": "Bearer token"},
            )

        with patch("crm_routes.resolve_actor", return_value=MANAGER_ACTOR):
            with patch("crm_routes._run_backfill_range", return_value={"ok": True}):
                manager_resp = client.post(
                    "/crm/sync/backfill",
                    json={"start_date": "2026-06-12", "end_date": "2026-06-13", "concurrency": 1},
                    headers={"Authorization": "Bearer token"},
                )

        assert sale_resp.status_code == 403
        assert manager_resp.status_code == 200
        assert manager_resp.json()["ok"] is True

    def test_crm_token_status_requires_leader(self):
        client, _sb = self._crm_client()

        with patch("crm_routes.resolve_actor", return_value=SALE_ACTOR):
            sale_resp = client.get(
                "/crm/token-status",
                headers={"Authorization": "Bearer token"},
            )

        with patch("crm_routes.resolve_actor", return_value=LEADER_ACTOR):
            with patch("crm_routes._get_cookie", return_value="cookie"):
                leader_resp = client.get(
                    "/crm/token-status",
                    headers={"Authorization": "Bearer token"},
                )

        assert sale_resp.status_code == 403
        assert leader_resp.status_code == 200
        assert leader_resp.json()["hasToken"] is True

    def test_payos_webhook_old_rejects_unsigned(self):
        import os
        import payment_request_routes as pr

        pr = importlib.reload(pr)
        app = FastAPI()
        pr.register_payment_request_routes(app, lambda: MagicMock())
        client = TestClient(app, raise_server_exceptions=False)

        with patch.dict(os.environ, {"PAYOS_CHECKSUM_KEY": "test-secret"}):
            resp = client.post(
                "/api/v1/payos-webhook",
                json={"data": {"orderCode": "99999"}},
            )

        assert resp.status_code == 400
        assert "Invalid signature" in resp.text


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


class TestNotifications:
    class _NotificationsQuery:
        def __init__(self, rows):
            self.rows = rows
            self.filters = []
            self.null_filters = []
            self.patch = None
            self._limit = None

        def select(self, *_args, **_kwargs):
            return self

        def update(self, patch):
            self.patch = patch
            return self

        def eq(self, key, value):
            self.filters.append((key, value))
            return self

        def is_(self, key, value):
            self.null_filters.append((key, value))
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, value):
            self._limit = value
            return self

        def execute(self):
            matched = list(self.rows)
            for key, value in self.filters:
                matched = [row for row in matched if row.get(key) == value]
            for key, value in self.null_filters:
                if value == "null":
                    matched = [row for row in matched if row.get(key) is None]
            if self.patch is not None:
                for row in matched:
                    row.update(self.patch)
            if self._limit is not None:
                matched = matched[: self._limit]
            return MagicMock(data=matched)

    class _FakeSB:
        def __init__(self):
            self.rows = [
                {
                    "id": "n1",
                    "user_email": "ops@test.com",
                    "kind": "ar_confirmed",
                    "payload": {"ar_id": "AR-1"},
                    "created_at": "2026-06-13T00:00:00+00:00",
                    "read_at": None,
                },
                {
                    "id": "n2",
                    "user_email": "other@test.com",
                    "kind": "ar_confirmed",
                    "payload": {},
                    "created_at": "2026-06-13T00:00:01+00:00",
                    "read_at": None,
                },
            ]

        def table(self, name):
            assert name == "notifications"
            return TestNotifications._NotificationsQuery(self.rows)

    def _build_client(self):
        import notification_routes as routes

        routes = importlib.reload(routes)
        sb = self._FakeSB()
        app = FastAPI()
        routes.register_notification_routes(app, lambda: sb)
        return TestClient(app, raise_server_exceptions=False), sb

    def test_list_and_mark_read_are_scoped_to_actor_email(self):
        client, sb = self._build_client()
        with patch("notification_routes.resolve_actor", return_value=ACTOR):
            list_resp = client.get(
                "/api/v1/notifications?unread=true",
                headers={"Authorization": "Bearer token"},
            )
            mark_resp = client.post(
                "/api/v1/notifications/n1/read",
                headers={"Authorization": "Bearer token"},
            )

        assert list_resp.status_code == 200
        body = list_resp.json()
        assert [row["id"] for row in body["notifications"]] == ["n1"]
        assert mark_resp.status_code == 200
        assert sb.rows[0]["read_at"] is not None
        assert sb.rows[1]["read_at"] is None


class TestExchangeRatesAndGsheet:
    def test_get_rate_for_date_uses_latest_effective_rate(self):
        import revenue_routes as revenue

        revenue = importlib.reload(revenue)
        sb = MagicMock()
        chain = MagicMock()
        chain.select.return_value = chain
        chain.lte.return_value = chain
        chain.order.return_value = chain
        chain.limit.return_value = chain
        chain.execute.return_value = MagicMock(data=[{"rate": "3655.25"}])
        sb.table.return_value = chain

        assert revenue.get_rate_for_date(sb, date(2026, 6, 13)) == Decimal("3655.25")

    def test_loose_fp_includes_phone_to_reduce_collision(self):
        import gsheet_ledger_import as gsheet

        gsheet = importlib.reload(gsheet)
        row_a = {"uid": "U1", "ngay_tien_ve": "2026-06-13", "so_tien_vnd": 5000000, "sdt": "0901"}
        row_b = {"uid": "U1", "ngay_tien_ve": "2026-06-13", "so_tien_vnd": 5000000, "sdt": "0902"}

        assert gsheet._loose_fp(row_a) != gsheet._loose_fp(row_b)


class TestOpsRole:
    def test_ops_no_longer_normalizes_to_system(self):
        import rbac

        rbac = importlib.reload(rbac)

        assert rbac._normalize_role("ops") == "ops"
        assert rbac._rank("ops") == 2
        assert rbac._normalize_role("admin") == "system"
