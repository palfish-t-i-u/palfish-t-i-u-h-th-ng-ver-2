"""
Guardrail for VAC-05 (Đức) — clean fallback 3700 in 3 places.
Run: cd backend && pytest tests/test_vac_05_exchange_rate_no_fallback.py -v
Expected: FAIL on current code (3 hard-code 3700), PASS after Đức replaces with re-query.

Bug locations:
  1. revenue_routes._row_to_ledger line 776  — `or 3700` hard-code on NULL DB column
  2. dashboard_routes._load_exchange_rate     — reads bc03_month_settings, not exchange_rates;
                                               falls back to module-level int 3700
  3. dashboard_routes._kpi_payload via /dashboard/summary — kpi.exchange_rate also 3700

Fix expected: each location must call get_rate_for_date (or equivalent) to return 3800.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

import revenue_routes as rr
import dashboard_routes as dr

TARGET_RATE = 3800            # rate configured in exchange_rates table
HARD_CODED_FALLBACK = 3700   # wrong value returned by current code

# ---------------------------------------------------------------------------
# Shared DB row fixtures
# ---------------------------------------------------------------------------

_LEDGER_ROW_NULL_RATE: dict = {
    "id": "sdt-vac05-001",
    "ngay_tien_ve": "2026-06-01",
    "pay_time": "2026-06-01T10:00:00+00:00",
    "ten_khach": "Nguyen Van A",
    "sdt": "0909000111",
    "uid": "UID001",
    "goi_hoc": "Basic",
    "so_tien_vnd": 10_000_000,
    "gmv_rmb": 2702.70,
    "ty_gia_vnd_rmb": None,   # NULL — the bug surfaces here
    "payment_method": "qr",
    "loai": "new",
    "loai_2": None,
    "sale_crm_name": "Test Sale",
    "team": "TeamA",
    "team_pivot_label": "A",
    "note": "",
    "note2": None,
    "loai_nhap": "tay",
    "don_hang_id": None,
    "ma_don_hang": None,
    "crm_order_id": None,
    "created_by_email": "admin@test.com",
    "updated_by_email": "admin@test.com",
    "created_at": "2026-06-01T10:00:00+00:00",
    "updated_at": "2026-06-01T10:00:00+00:00",
}


# ---------------------------------------------------------------------------
# Test 1 — _row_to_ledger must NOT hard-code 3700 when ty_gia_vnd_rmb is NULL
# ---------------------------------------------------------------------------

class TestRowToLedgerNullRate:
    """
    Bug: revenue_routes._row_to_ledger line 776
        "tyGiaVndRmb": float(row.get("ty_gia_vnd_rmb") or 3700),

    When ty_gia_vnd_rmb is NULL in the DB the `or 3700` kicks in and returns
    3700 regardless of what exchange_rates says.

    Fix: call get_rate_for_date when the column is NULL.

    Approach: call _row_to_ledger directly (pure-unit, Pattern 1).  After the
    fix, the function needs access to `sb` and `ngay` to look up the rate.  We
    verify the returned tyGiaVndRmb is 3800, not 3700.
    """

    def test_null_ty_gia_returns_configured_rate_not_3700(self):
        """Pure unit — call _row_to_ledger with a NULL rate column.

        Current code: returns 3700 (hard-coded fallback).
        Fixed code:   calls get_rate_for_date and returns 3800.

        We patch get_rate_for_date to return 3800 so the test verifies the
        CALL is made, not the DB lookup itself.
        """
        with patch.object(rr, "get_rate_for_date", return_value=Decimal(str(TARGET_RATE))):
            result = rr._row_to_ledger(_LEDGER_ROW_NULL_RATE)

        actual_rate = result["tyGiaVndRmb"]
        assert actual_rate == float(TARGET_RATE), (
            f"tyGiaVndRmb should be {TARGET_RATE} (from exchange_rates table via "
            f"get_rate_for_date) but got {actual_rate}. "
            f"Fix: in _row_to_ledger replace `or 3700` with a get_rate_for_date lookup "
            f"when ty_gia_vnd_rmb is NULL."
        )


# ---------------------------------------------------------------------------
# Test 2 — create_ledger without tyGiaVndRmb in body must use get_rate_for_date
# ---------------------------------------------------------------------------

class TestCreateLedgerRateLookup:
    """
    The create_ledger route has a guard:
        if "tyGiaVndRmb" in body.model_fields_set:
            rate = Decimal(str(body.tyGiaVndRmb or DEFAULT_TY_GIA))
        else:
            rate = get_rate_for_date(sb, ngay)   # <- must go here

    This is currently correct.  The test acts as a regression guardrail:
    verifies that get_rate_for_date IS called and the returned 3800 is what
    ends up in ty_gia_vnd_rmb of the INSERT payload.
    """

    def test_omitting_ty_gia_in_body_calls_get_rate_for_date(self):
        saved_payload: list[dict] = []

        # Build a tight mock that only captures the insert payload.
        sb = MagicMock()
        sdt_table = MagicMock()
        # Chainable builder
        for m in ("select", "update", "delete", "eq", "neq", "in_", "or_",
                  "gte", "lte", "order", "limit", "range", "single", "is_"):
            getattr(sdt_table, m).return_value = sdt_table
        # No duplicates found
        sdt_table.execute.return_value = MagicMock(data=[], count=0)

        def _capturing_insert(payload):
            saved_payload.append(payload)
            t = MagicMock()
            t.execute.return_value = MagicMock(data=[{**payload, "id": "new-row-id"}])
            return t

        sdt_table.insert = _capturing_insert

        # exchange_rates table — not directly used here because we mock get_rate_for_date
        xr_table = MagicMock()
        for m in ("select", "eq", "lte", "order", "limit"):
            getattr(xr_table, m).return_value = xr_table
        xr_table.execute.return_value = MagicMock(data=[{"rate": TARGET_RATE}])

        def _table_router(name: str):
            if name == "so_doanh_thu":
                return sdt_table
            return xr_table

        sb.table.side_effect = _table_router
        sb.rpc.return_value = MagicMock(execute=MagicMock(return_value=MagicMock(data=[])))

        actor = MagicMock()
        actor.email = "admin@test.com"
        actor.role = "manager"
        actor.staff = None

        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        import importlib

        rr_fresh = importlib.reload(rr)

        app = FastAPI()
        rr_fresh.register_revenue_routes(app, lambda: sb)
        client = TestClient(app, raise_server_exceptions=False)

        with patch.object(rr_fresh, "resolve_actor", return_value=actor), \
             patch.object(rr_fresh, "require_module_write"), \
             patch.object(rr_fresh, "get_rate_for_date",
                          return_value=Decimal(str(TARGET_RATE))) as mock_grd, \
             patch.object(rr_fresh, "_is_test_email", return_value=False), \
             patch.object(rr_fresh, "team_to_pivot_label", return_value=None):

            r = client.post(
                "/revenue/ledger",
                json={
                    "ngayTienVe": "2026-06-15",
                    "tenKhach": "Test Khach",
                    "sdt": "0909111222",
                    "uid": "UID-UNIQUE-999",
                    "goiHoc": "Pro",
                    "soTienVnd": 7_400_000,
                    # tyGiaVndRmb intentionally OMITTED so model_fields_set misses it
                },
                headers={"Authorization": "Bearer fake-token"},
            )

        assert r.status_code in (200, 201), (
            f"create_ledger returned {r.status_code}: {r.text}"
        )

        assert mock_grd.called, (
            "get_rate_for_date was NOT called. "
            "The route must call get_rate_for_date when tyGiaVndRmb is absent from the body."
        )

        assert saved_payload, "No insert captured — check test wiring"
        saved_rate = saved_payload[0].get("ty_gia_vnd_rmb")
        assert saved_rate == float(TARGET_RATE), (
            f"ty_gia_vnd_rmb in the INSERT should be {TARGET_RATE} "
            f"(from get_rate_for_date) but got {saved_rate}."
        )


# ---------------------------------------------------------------------------
# Test 3 — _load_exchange_rate must consult exchange_rates, not only bc03_month_settings
# ---------------------------------------------------------------------------

class TestLoadExchangeRateFallback:
    """
    Bug: dashboard_routes._load_exchange_rate reads bc03_month_settings.exchange_rate.
    When that table has no row for the current month it falls back to module-level
    DEFAULT_EXCHANGE_RATE = 3700 (int), ignoring the canonical exchange_rates table
    that revenue_routes.get_rate_for_date uses.

    Reproducing the bug:
    - bc03_month_settings returns empty (no row for this month).
    - exchange_rates has rate=3800.
    - Current code: _load_exchange_rate returns 3700 (the module-level default).
    - Fixed code:   _load_exchange_rate must fall back to exchange_rates and return 3800.

    Pattern: pure unit test (Pattern 1).  Call dr._load_exchange_rate directly with a
    Supabase mock that returns empty for bc03_month_settings and 3800 for exchange_rates.
    """

    def _make_sb_for_load_exchange_rate(self, bc03_rows: list[dict], xr_rows: list[dict]) -> MagicMock:
        sb = MagicMock()
        tables: dict[str, MagicMock] = {}

        def _chain(name: str) -> MagicMock:
            if name not in tables:
                t = MagicMock()
                for m in ("select", "eq", "lte", "order", "limit"):
                    getattr(t, m).return_value = t
                t.execute.return_value = MagicMock(data=[])
                tables[name] = t
            return tables[name]

        sb.table.side_effect = _chain

        _chain("bc03_month_settings").execute.return_value = MagicMock(data=bc03_rows)
        _chain("exchange_rates").execute.return_value = MagicMock(data=xr_rows)

        return sb

    def test_no_bc03_row_returns_exchange_rates_value_not_3700(self):
        """
        When bc03_month_settings has no row for this month AND exchange_rates has 3800,
        _load_exchange_rate must return 3800, not 3700.

        Current code returns 3700 (hard-coded DEFAULT_EXCHANGE_RATE).
        Fixed code returns 3800 (from exchange_rates table).
        """
        sb = self._make_sb_for_load_exchange_rate(
            bc03_rows=[],                          # no per-month override
            xr_rows=[{"rate": TARGET_RATE}],       # canonical rate configured
        )

        result = dr._load_exchange_rate(sb, "2026-06-30")

        assert result == TARGET_RATE, (
            f"_load_exchange_rate returned {result} but expected {TARGET_RATE}. "
            f"When bc03_month_settings has no row for the month, the function must "
            f"fall back to the exchange_rates table (get_rate_for_date) instead of "
            f"the hard-coded DEFAULT_EXCHANGE_RATE = {HARD_CODED_FALLBACK}."
        )

    def test_bc03_override_takes_precedence_over_exchange_rates(self):
        """
        When bc03_month_settings has an explicit rate, that per-month override
        takes precedence (3900), even though exchange_rates says 3800.
        This ensures the two-level fallback order is correct after the fix.
        """
        OVERRIDE_RATE = 3900
        sb = self._make_sb_for_load_exchange_rate(
            bc03_rows=[{"exchange_rate": OVERRIDE_RATE}],
            xr_rows=[{"rate": TARGET_RATE}],
        )

        result = dr._load_exchange_rate(sb, "2026-06-30")

        assert result == OVERRIDE_RATE, (
            f"_load_exchange_rate should return the bc03_month_settings override "
            f"({OVERRIDE_RATE}) when present, but got {result}."
        )
