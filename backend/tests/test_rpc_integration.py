"""
Integration tests — call real Supabase RPC functions to catch SQL bugs
(variable/column collisions, missing tables, permission errors, etc.)

These tests hit the REAL database. They are skipped by default.
Run with:  pytest backend/tests/test_rpc_integration.py -v

Requires backend/.env with valid SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import os
import re
import sys
import uuid
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# ── load .env from backend dir ──────────────────────────────────────────────

_env_path = BACKEND_DIR / ".env"
if _env_path.is_file():
    for line in _env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if key and val and key not in os.environ:
            os.environ[key] = val


def _get_supabase():
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key or "fake" in url.lower() or "YOUR_" in key:
        return None
    try:
        from supabase import create_client

        return create_client(url, key)
    except Exception:
        return None


sb = _get_supabase()
requires_supabase = pytest.mark.skipif(sb is None, reason="No real Supabase credentials")


# ── Sequence-based RPCs (safe, just increment counters) ─────────────────────


@requires_supabase
class TestSequenceRpcs:
    """RPCs that allocate sequential IDs — the exact category that had the bug."""

    def test_next_payment_request_id_returns_valid_format(self):
        res = sb.rpc("next_payment_request_id", {}).execute()
        pr_id = res.data if isinstance(res.data, str) else str(res.data)
        assert re.match(r"^PR-\d{4}-\d{4,}$", pr_id), f"Unexpected PR-ID format: {pr_id}"

    def test_next_payment_request_id_with_explicit_year(self):
        res = sb.rpc("next_payment_request_id", {"p_year": 9999}).execute()
        pr_id = res.data if isinstance(res.data, str) else str(res.data)
        assert pr_id.startswith("PR-9999-"), f"Expected year 9999 prefix: {pr_id}"

    def test_next_payment_request_id_increments(self):
        r1 = sb.rpc("next_payment_request_id", {"p_year": 8888}).execute()
        r2 = sb.rpc("next_payment_request_id", {"p_year": 8888}).execute()
        id1 = r1.data if isinstance(r1.data, str) else str(r1.data)
        id2 = r2.data if isinstance(r2.data, str) else str(r2.data)
        seq1 = int(id1.rsplit("-", 1)[-1])
        seq2 = int(id2.rsplit("-", 1)[-1])
        assert seq2 == seq1 + 1, f"Expected sequential: {id1} -> {id2}"

    def test_next_ma_don_returns_valid_format(self):
        res = sb.rpc("next_ma_don", {}).execute()
        ma = res.data if isinstance(res.data, str) else str(res.data)
        assert re.match(r"^KH\d{3,}$", ma), f"Unexpected ma_don format: {ma}"

    def test_allocate_tax_sequences_returns_start_values(self):
        test_key = f"test_{uuid.uuid4().hex[:8]}"
        res = sb.rpc("allocate_tax_sequences", {"p_date_key": test_key, "p_n": 3}).execute()
        data = res.data
        if isinstance(data, list):
            data = data[0]
        assert "inv_start" in data, f"Missing inv_start: {data}"
        assert "prod_start" in data, f"Missing prod_start: {data}"
        assert isinstance(data["inv_start"], (int, float))
        assert isinstance(data["prod_start"], (int, float))

    def test_allocate_tax_sequences_zero_n(self):
        res = sb.rpc("allocate_tax_sequences", {"p_date_key": "test_zero", "p_n": 0}).execute()
        data = res.data
        if isinstance(data, list):
            data = data[0]
        assert data["inv_start"] == 0
        assert data["prod_start"] == 0


# ── Pure functions (no side effects) ────────────────────────────────────────


@requires_supabase
class TestPureRpcs:
    def test_derive_ar_status_empty(self):
        res = sb.rpc("derive_ar_status_from_uids", {"p_uids": "[]"}).execute()
        assert res.data == "pending_order"

    def test_derive_ar_status_null(self):
        res = sb.rpc("derive_ar_status_from_uids", {"p_uids": None}).execute()
        assert res.data == "pending_order"

    def test_derive_ar_status_with_order(self):
        uids = [{"uid": "U1", "courses": [{"code": "C1", "order_id": "ORD1", "invoiced": False}]}]
        import json
        res = sb.rpc("derive_ar_status_from_uids", {"p_uids": json.dumps(uids)}).execute()
        assert res.data in ("activated", "pending_order")

    def test_derive_ar_status_invoiced(self):
        uids = [{"uid": "U1", "courses": [{"code": "C1", "order_id": "ORD1", "invoiced": True, "invoice_id": "INV1"}]}]
        import json
        res = sb.rpc("derive_ar_status_from_uids", {"p_uids": json.dumps(uids)}).execute()
        assert res.data in ("invoiced", "pending_order")


# ── Transactional RPCs (create temp data, then clean up) ────────────────────


@requires_supabase
class TestBc03Rpc:
    TEST_MONTH = "9999-01"

    def teardown_method(self):
        try:
            sb.table("bc03_kpi_rows").delete().eq("month_key", self.TEST_MONTH).execute()
            sb.table("bc03_month_settings").delete().eq("month_key", self.TEST_MONTH).execute()
        except Exception:
            pass

    def test_save_bc03_monthly_round_trip(self):
        rows = '[{"sale_name":"Test Sale","b2_orders":5,"b4_gmv_vnd":1000000,"sort_order":0}]'
        res = sb.rpc(
            "save_bc03_monthly",
            {
                "p_month_key": self.TEST_MONTH,
                "p_exchange_rate": 3700,
                "p_actor": "integration-test",
                "p_rows": rows,
            },
        ).execute()
        data = res.data
        if isinstance(data, list):
            data = data[0] if data else {}
        if isinstance(data, str):
            import json
            data = json.loads(data)
        assert data.get("ok") is True


# ── Active Request atomic RPCs (need a temp AR row) ─────────────────────────


@requires_supabase
class TestActiveRequestAtomicRpcs:
    ar_id: str | None = None

    def setup_method(self):
        self.ar_id = f"test-ar-{uuid.uuid4().hex[:8]}"
        sb.table("active_requests").insert(
            {
                "id": self.ar_id,
                "pr_id": None,
                "customer_name": "Integration Test",
                "status": "pending_order",
                "is_test": True,
                "uids_data": [
                    {
                        "uid": "U-TEST",
                        "courses": [
                            {"code": "C-TEST", "name": "Test Course", "amount": 100000}
                        ],
                    }
                ],
            }
        ).execute()

    def teardown_method(self):
        if self.ar_id:
            try:
                sb.table("active_requests").delete().eq("id", self.ar_id).execute()
            except Exception:
                pass

    def test_replace_uids_snapshot(self):
        new_uids = [{"uid": "U-NEW", "courses": [{"code": "C-NEW", "name": "New", "amount": 50000}]}]
        import json
        res = sb.rpc(
            "replace_active_request_uids_snapshot",
            {"p_ar_id": self.ar_id, "p_uids_data": json.dumps(new_uids)},
        ).execute()
        row = res.data
        if isinstance(row, list):
            row = row[0]
        assert row["id"] == self.ar_id

    def test_request_invoice_atomic(self):
        uids_with_order = [
            {
                "uid": "U-TEST",
                "courses": [
                    {"code": "C-TEST", "name": "Test Course", "amount": 100000, "order_id": "ORD-1"}
                ],
            }
        ]
        sb.table("active_requests").update({"uids_data": uids_with_order}).eq("id", self.ar_id).execute()

        res = sb.rpc(
            "request_ar_invoice_atomic",
            {"p_ar_id": self.ar_id, "p_requested_at": "2026-01-01T00:00:00Z"},
        ).execute()
        row = res.data
        if isinstance(row, list):
            row = row[0]
        assert row["id"] == self.ar_id
        assert row["status"] in ("ready_invoice", "pending_order", "activated")

    def test_guarded_update_conflict_detection(self):
        import json
        from datetime import datetime, timezone

        wrong_ts = "2000-01-01T00:00:00+00:00"
        new_uids = [{"uid": "U-CONFLICT", "courses": []}]
        res = sb.rpc(
            "replace_active_request_uids_data_guarded",
            {
                "p_ar_id": self.ar_id,
                "p_expected_updated_at": wrong_ts,
                "p_uids_data": json.dumps(new_uids),
                "p_status": "pending_order",
            },
        ).execute()
        data = res.data
        if isinstance(data, str):
            data = json.loads(data)
        assert data["ok"] is False
        assert data["conflict"] is True


# ── Append bill RPC ─────────────────────────────────────────────────────────


@requires_supabase
class TestAppendBillRpc:
    pr_id: str | None = None
    line_id: str | None = None

    def setup_method(self):
        self.pr_id = f"PR-TEST-{uuid.uuid4().hex[:6]}"
        sb.table("payment_requests").insert(
            {
                "id": self.pr_id,
                "name": "Bill Test",
                "uid": "U-BILL",
                "phone": "0000000000",
                "country": "VN",
                "address": "",
                "ward": "",
                "province": "",
                "note": "",
                "email": "",
                "target": 100000,
                "received": 0,
                "state": "pending",
                "is_test": True,
                "sale_email": "integration-test@dev",
            }
        ).execute()

        line_res = (
            sb.table("payment_lines")
            .insert(
                {
                    "payment_request_id": self.pr_id,
                    "method": "cash",
                    "amount": 100000,
                    "status": "pending",
                    "transfer_code": "TT-TEST",
                    "is_test": True,
                }
            )
            .execute()
        )
        self.line_id = line_res.data[0]["id"]

    def teardown_method(self):
        try:
            if self.line_id:
                sb.table("payment_lines").delete().eq("id", self.line_id).execute()
            if self.pr_id:
                sb.table("payment_requests").delete().eq("id", self.pr_id).execute()
        except Exception:
            pass

    def test_append_bill_creates_array(self):
        res = sb.rpc(
            "append_payment_line_bill",
            {"p_line_id": self.line_id, "p_bill_url": "https://example.com/bill-1.jpg"},
        ).execute()

        line = sb.table("payment_lines").select("bill_images").eq("id", self.line_id).single().execute()
        images = line.data.get("bill_images") or []
        assert "https://example.com/bill-1.jpg" in images
