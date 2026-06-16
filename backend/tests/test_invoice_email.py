"""Tests — invoice delivery log API (kế toán ghi nhận đã gửi hóa đơn)."""

from __future__ import annotations

import importlib
import re
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from rbac import Actor

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MIGRATION = REPO_ROOT / "docs" / "migrations" / "2026-05-24-invoice-email-logs.sql"

ACTOR = Actor(
    email="invoice.ops@test.com",
    user_id="user-1",
    role="system",
    staff=None,
    is_activated=True,
)

AR_ID = "AR-2026-0042"
PR_ID = "PR-2026-0007"


class _ExecuteResult:
    def __init__(self, data=None):
        self.data = data if data is not None else []


class _InvoiceEmailLogsTable:
    def __init__(self) -> None:
        self.rows: list[dict] = []
        self.insert_payloads: list[dict] = []
        self._filter_ar_id: str | None = None
        self._pending_insert: dict | None = None

    def select(self, *_args, **_kwargs):
        self._pending_insert = None
        return self

    def insert(self, payload):
        row = dict(payload)
        if not row.get("id"):
            row["id"] = str(uuid.uuid4())
        self.insert_payloads.append(row)
        self.rows.append(row)
        self._pending_insert = row
        return self

    def eq(self, _col, value):
        self._filter_ar_id = value
        return self

    def order(self, _col, desc=False):
        self._order_desc = desc
        return self

    def execute(self):
        if self._pending_insert is not None:
            row = self._pending_insert
            self._pending_insert = None
            return _ExecuteResult([row])
        data = list(self.rows)
        if self._filter_ar_id is not None:
            data = [r for r in data if r.get("active_request_id") == self._filter_ar_id]
        if getattr(self, "_order_desc", False):
            data = sorted(data, key=lambda r: r.get("sent_at") or "", reverse=True)
        return _ExecuteResult(data)


class _ActiveRequestsTable:
    def __init__(self, row: dict | None) -> None:
        self.row = row
        self._eq_id: str | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, _col, value):
        self._eq_id = value
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.row and self.row.get("id") == self._eq_id:
            return _ExecuteResult([self.row])
        return _ExecuteResult([])


class _PaymentRequestsTable:
    def __init__(self, row: dict | None) -> None:
        self.row = row
        self._eq_id: str | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, _col, value):
        self._eq_id = value
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.row and self.row.get("id") == self._eq_id:
            return _ExecuteResult([self.row])
        return _ExecuteResult([])


class _CaptureSupabase:
    def __init__(
        self,
        *,
        ar_row: dict | None = None,
        pr_row: dict | None = None,
    ) -> None:
        self.invoice_email_logs = _InvoiceEmailLogsTable()
        self.active_requests = _ActiveRequestsTable(ar_row)
        self.payment_requests = _PaymentRequestsTable(pr_row)

    def table(self, name: str):
        if name == "invoice_email_logs":
            return self.invoice_email_logs
        if name == "active_requests":
            return self.active_requests
        if name == "payment_requests":
            return self.payment_requests
        raise AssertionError(f"Unexpected table access: {name}")


def _build_client(sb: _CaptureSupabase) -> TestClient:
    import invoice_email_routes as mod

    importlib.reload(mod)
    app = FastAPI()
    mod.register_invoice_email_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def ar_with_pr():
    return {
        "id": AR_ID,
        "pr_id": PR_ID,
        "customer_name": "Nguyen Van A",
        "status": "invoiced",
    }


@pytest.fixture
def pr_with_email():
    return {
        "id": PR_ID,
        "name": "Nguyen Van A",
        "email": "customer@example.com",
        "phone": "0901234567",
    }


class TestInvoiceDeliveryMigration:
    def test_migration_is_idempotent(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        assert "CREATE TABLE IF NOT EXISTS public.invoice_email_logs" in sql
        assert "ADD COLUMN IF NOT EXISTS channel" in sql
        assert "CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_active_request_id" in sql
        assert sql.count("CREATE TABLE IF NOT EXISTS public.invoice_email_logs") == 1

    def test_migration_has_channel_check(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        assert "channel" in sql
        assert "invoice_email_logs_channel_check" in sql
        assert "'email'" in sql
        assert "'zalo'" in sql


class TestInvoiceDeliveryLogEndpoint:
    def test_missing_auth_returns_401(self, ar_with_pr, pr_with_email):
        sb = _CaptureSupabase(ar_row=ar_with_pr, pr_row=pr_with_email)
        client = _build_client(sb)

        resp = client.post(f"/api/v1/invoices/{AR_ID}/delivery-log", json={})

        assert resp.status_code == 401

    def test_active_request_not_found_returns_404(self, ar_with_pr, pr_with_email):
        sb = _CaptureSupabase(ar_row=None, pr_row=pr_with_email)
        client = _build_client(sb)

        with patch("invoice_email_routes.resolve_actor", return_value=ACTOR):
            with patch("invoice_email_routes.require_module_write"):
                resp = client.post(
                    f"/api/v1/invoices/{AR_ID}/delivery-log",
                    json={"channel": "email"},
                    headers={"Authorization": "Bearer fake-token"},
                )

        assert resp.status_code == 404

    def test_email_channel_uses_pr_email_when_sent_to_missing(
        self, ar_with_pr, pr_with_email
    ):
        sb = _CaptureSupabase(ar_row=ar_with_pr, pr_row=pr_with_email)
        client = _build_client(sb)

        with patch("invoice_email_routes.resolve_actor", return_value=ACTOR):
            with patch("invoice_email_routes.require_module_write"):
                resp = client.post(
                    f"/api/v1/invoices/{AR_ID}/delivery-log",
                    json={"channel": "email"},
                    headers={"Authorization": "Bearer fake-token"},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["log"]["sent_to"] == "customer@example.com"
        assert body["log"]["status"] == "sent"
        assert body["log"]["channel"] == "email"
        assert sb.invoice_email_logs.insert_payloads[0]["status"] == "sent"

    def test_invalid_email_returns_400(self, ar_with_pr, pr_with_email):
        sb = _CaptureSupabase(ar_row=ar_with_pr, pr_row=pr_with_email)
        client = _build_client(sb)

        with patch("invoice_email_routes.resolve_actor", return_value=ACTOR):
            with patch("invoice_email_routes.require_module_write"):
                resp = client.post(
                    f"/api/v1/invoices/{AR_ID}/delivery-log",
                    json={"channel": "email", "sent_to": "not-an-email"},
                    headers={"Authorization": "Bearer fake-token"},
                )

        assert resp.status_code == 400
        assert sb.invoice_email_logs.insert_payloads == []

    def test_zalo_channel_succeeds_without_email(self, ar_with_pr, pr_with_email):
        sb = _CaptureSupabase(ar_row=ar_with_pr, pr_row=pr_with_email)
        client = _build_client(sb)

        with patch("invoice_email_routes.resolve_actor", return_value=ACTOR):
            with patch("invoice_email_routes.require_module_write"):
                resp = client.post(
                    f"/api/v1/invoices/{AR_ID}/delivery-log",
                    json={"channel": "zalo", "note": "Da gui qua Zalo"},
                    headers={"Authorization": "Bearer fake-token"},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["log"]["channel"] == "zalo"
        assert body["log"]["status"] == "sent"
        assert body["log"]["sent_to"] == "0901234567"
        assert body["log"]["metadata"]["note"] == "Da gui qua Zalo"

    def test_zalo_channel_fallback_when_no_phone(self, ar_with_pr):
        pr_no_phone = {"id": PR_ID, "name": "Nguyen Van A", "email": "a@b.com"}
        sb = _CaptureSupabase(ar_row=ar_with_pr, pr_row=pr_no_phone)
        client = _build_client(sb)

        with patch("invoice_email_routes.resolve_actor", return_value=ACTOR):
            with patch("invoice_email_routes.require_module_write"):
                resp = client.post(
                    f"/api/v1/invoices/{AR_ID}/delivery-log",
                    json={"channel": "zalo"},
                    headers={"Authorization": "Bearer fake-token"},
                )

        assert resp.status_code == 200
        assert resp.json()["log"]["sent_to"] == "zalo"


class TestInvoiceDeliveryLogListEndpoint:
    def test_list_logs_newest_first_with_channel(self, ar_with_pr, pr_with_email):
        sb = _CaptureSupabase(ar_row=ar_with_pr, pr_row=pr_with_email)
        sb.invoice_email_logs.rows = [
            {
                "id": "log-old",
                "active_request_id": AR_ID,
                "payment_request_id": PR_ID,
                "sent_to": "first@example.com",
                "sent_by_email": ACTOR.email,
                "sent_at": "2026-05-24T10:00:00+00:00",
                "status": "sent",
                "channel": "email",
                "error_message": None,
                "provider_message_id": None,
                "metadata": {},
            },
            {
                "id": "log-new",
                "active_request_id": AR_ID,
                "payment_request_id": PR_ID,
                "sent_to": "0909999888",
                "sent_by_email": ACTOR.email,
                "sent_at": "2026-05-24T11:00:00+00:00",
                "status": "sent",
                "channel": "zalo",
                "error_message": None,
                "provider_message_id": None,
                "metadata": {"note": "Zalo"},
            },
        ]
        client = _build_client(sb)

        with patch("invoice_email_routes.resolve_actor", return_value=ACTOR):
            with patch("invoice_email_routes.require_module_write"):
                resp = client.get(
                    f"/api/v1/invoices/{AR_ID}/delivery-log",
                    headers={"Authorization": "Bearer fake-token"},
                )

        assert resp.status_code == 200
        logs = resp.json()["logs"]
        assert len(logs) == 2
        assert logs[0]["channel"] == "zalo"
        assert logs[1]["channel"] == "email"
        for key in (
            "id",
            "sent_to",
            "sent_by_email",
            "sent_at",
            "status",
            "channel",
            "error_message",
            "provider_message_id",
            "metadata",
        ):
            assert key in logs[0]


class TestInvoiceEmailService:
    def test_is_valid_email(self):
        import invoice_email_service as svc

        assert svc.is_valid_email("a@b.com") is True
        assert svc.is_valid_email("bad") is False


class TestInvoiceDeliveryRoutesSource:
    def test_handlers_use_module4_write_and_delivery_log_paths(self):
        import invoice_email_routes as mod

        source = open(mod.__file__, encoding="utf-8").read()
        assert 'require_module_write(sb, actor, "module4")' in source
        assert "resolve_actor(sb, authorization)" in source
        assert "/delivery-log" in source
        assert "send-email" not in source
        assert "email-logs" not in source
        assert "send_invoice_email" not in source
        assert re.search(r'pr_row\.get\("email"\)', source)
