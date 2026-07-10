"""
Legacy endpoint auth hardening — guardrail tests.

Verify all legacy endpoints in main.py require authentication.
Pattern: source-code analysis (same as test_audit_auth.py).

Endpoints covered:
- GET /orders (was: auth optional → anonymous gets all data)
- POST /orders (was: no auth)
- PATCH /orders/{id} (was: X-Operator-Role header bypass)
- POST /orders/{id}/cancel (was: X-Operator-Role header bypass)
- POST /info-code (was: no auth)
- GET /info-code/{code}/status (was: no auth)
- GET /webhook/events (was: no auth → leaks transaction data)
- POST /crm/activate (was: no auth → anyone activates CRM orders)
- POST /webhook/bank-simulate (was: no auth → anyone fakes bank payments)
- POST /orders/{id}/bill (was: auth optional)
- GET /payos/transactions (was: auth optional)
"""

from __future__ import annotations

import inspect
import re

import pytest


def _get_main_func_source(func_name: str) -> str:
    """Extract a function's source from main.py by exact name."""
    import main

    full = inspect.getsource(main)
    pattern = rf"(def\s+{func_name}\b[^:]*:.*?)(?=\n@app\.|\ndef\s|\nregister_|\Z)"
    match = re.search(pattern, full, re.S)
    return match.group(1) if match else ""


def _requires_auth(source: str) -> bool:
    """Check that handler calls resolve_actor and authorization is NOT optional."""
    has_resolve = bool(re.search(r"resolve_actor", source))
    # authorization: str | None = Header(None) is optional — NOT sufficient
    auth_optional = bool(
        re.search(r"authorization:\s*str\s*\|\s*None", source)
    )
    return has_resolve and not auth_optional


def _has_x_operator_role_fallback(source: str) -> bool:
    """Check if handler uses _require_ops() call or x_operator_role as a parameter/variable."""
    has_require_ops = bool(re.search(r"_require_ops\s*\(", source))
    has_x_op_role_param = bool(re.search(r"x_operator_role\s*[=:]", source))
    return has_require_ops or has_x_op_role_param


# ─── CRITICAL: bank-simulate must be sandbox-only ───


class TestBankSimulateLocked:

    def test_bank_simulate_requires_auth(self):
        """POST /webhook/bank-simulate must require JWT auth."""
        source = _get_main_func_source("bank_simulate")
        assert source, "bank_simulate function not found"
        assert re.search(r"resolve_actor", source), (
            "CRITICAL: /webhook/bank-simulate has no auth. "
            "Anyone can fake a bank payment arriving."
        )

    def test_bank_simulate_sandbox_only(self):
        """POST /webhook/bank-simulate must be blocked in production."""
        source = _get_main_func_source("bank_simulate")
        assert source, "bank_simulate function not found"
        assert re.search(r"is_sandbox_env|sandbox", source, re.I), (
            "CRITICAL: /webhook/bank-simulate is available in production. "
            "Must be gated to sandbox only."
        )


# ─── HIGH: endpoints that must require mandatory auth ───


class TestOrdersRequireAuth:

    def test_list_orders_mandatory_auth(self):
        """GET /orders — auth must be mandatory, not optional."""
        source = _get_main_func_source("list_orders")
        assert source, "list_orders not found"
        assert _requires_auth(source), (
            "GET /orders has optional auth. Without token, returns ALL orders "
            "to anonymous callers."
        )

    def test_create_order_requires_auth(self):
        """POST /orders — must require auth."""
        source = _get_main_func_source("create_order")
        assert source, "create_order not found"
        assert re.search(r"resolve_actor", source), (
            "POST /orders has no auth. Anyone can create orders."
        )

    def test_patch_order_no_header_bypass(self):
        """PATCH /orders/{id} — must NOT fall back to X-Operator-Role."""
        source = _get_main_func_source("patch_order")
        assert source, "patch_order not found"
        assert not _has_x_operator_role_fallback(source), (
            "PATCH /orders/{id} trusts client-supplied X-Operator-Role header. "
            "Any caller can set 'X-Operator-Role: ops' to bypass auth."
        )
        assert _requires_auth(source), (
            "PATCH /orders/{id} must require mandatory JWT auth."
        )

    def test_cancel_order_no_header_bypass(self):
        """POST /orders/{id}/cancel — must NOT fall back to X-Operator-Role."""
        source = _get_main_func_source("cancel_order")
        assert source, "cancel_order not found"
        assert not _has_x_operator_role_fallback(source), (
            "POST /orders/{id}/cancel trusts client-supplied X-Operator-Role header."
        )
        assert _requires_auth(source), (
            "POST /orders/{id}/cancel must require mandatory JWT auth."
        )

    def test_upload_bill_mandatory_auth(self):
        """POST /orders/{id}/bill — auth must be mandatory."""
        source = _get_main_func_source("upload_order_bill")
        assert source, "upload_order_bill not found"
        assert _requires_auth(source), (
            "POST /orders/{id}/bill has optional auth. Must be mandatory."
        )


class TestInfoCodeRequiresAuth:

    def test_create_info_code_requires_auth(self):
        """POST /info-code — must require mandatory auth."""
        source = _get_main_func_source("create_info_code")
        assert source, "create_info_code not found"
        assert _requires_auth(source), (
            "POST /info-code has no auth. Anyone can create info codes."
        )

    def test_info_code_status_requires_auth(self):
        """GET /info-code/{code}/status — must require auth."""
        source = _get_main_func_source("info_code_status")
        assert source, "info_code_status not found"
        assert re.search(r"resolve_actor", source), (
            "GET /info-code/{code}/status has no auth. "
            "Anyone can probe payment status of any code."
        )


class TestWebhookEventsRequiresAuth:

    def test_webhook_events_requires_auth(self):
        """GET /webhook/events — must require auth (leaks transaction data)."""
        source = _get_main_func_source("webhook_events")
        assert source, "webhook_events not found"
        assert _requires_auth(source), (
            "GET /webhook/events has no auth. Leaks transaction amounts and info codes."
        )


class TestCrmActivateRequiresAuth:

    def test_crm_activate_requires_auth(self):
        """POST /crm/activate — must require auth."""
        source = _get_main_func_source("crm_activate")
        assert source, "crm_activate not found"
        assert _requires_auth(source), (
            "POST /crm/activate has no auth. "
            "Anyone can mark CRM orders as activated."
        )


class TestPayosTransactionsRequiresAuth:

    def test_payos_transactions_mandatory_auth(self):
        """GET /payos/transactions — auth must be mandatory."""
        source = _get_main_func_source("list_payos_transactions")
        assert source, "list_payos_transactions not found"
        assert _requires_auth(source), (
            "GET /payos/transactions has optional auth. Must be mandatory."
        )


# ─── MEDIUM: .env.example must not contain real secrets ───


class TestEnvExampleSanitized:

    def test_no_real_jwt_in_env_example(self):
        """backend/.env.example must not contain real Supabase JWTs."""
        from pathlib import Path

        env_example = Path(__file__).resolve().parent.parent / ".env.example"
        if not env_example.exists():
            pytest.skip(".env.example not found")
        content = env_example.read_text()
        assert "eyJ" not in content, (
            ".env.example contains a real JWT token (starts with eyJ). "
            "Replace with a placeholder like YOUR_SERVICE_ROLE_KEY."
        )

    def test_no_real_sepay_secret_in_env_example(self):
        """backend/.env.example must not contain real SePay secrets."""
        from pathlib import Path

        env_example = Path(__file__).resolve().parent.parent / ".env.example"
        if not env_example.exists():
            pytest.skip(".env.example not found")
        content = env_example.read_text()
        assert "palfish-toiuu" not in content, (
            ".env.example contains a real-looking SePay webhook secret. "
            "Replace with YOUR_SEPAY_WEBHOOK_SECRET."
        )
        assert "palfish_danew" not in content, (
            ".env.example contains a real-looking SePay API token. "
            "Replace with YOUR_SEPAY_API_TOKEN."
        )


# ─── GUARDRAIL: _require_ops must be removed ───


class TestRequireOpsRemoved:

    def test_require_ops_function_removed(self):
        """_require_ops() trusts client headers — must be deleted."""
        import main

        assert not hasattr(main, "_require_ops"), (
            "_require_ops() still exists. This function trusts a client-supplied "
            "X-Operator-Role header — any caller can set it to 'ops'. "
            "Replace all usages with resolve_actor() + can_confirm_payment()."
        )
