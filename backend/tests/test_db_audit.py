"""Static/unit checks for DB audit RPC callers (2026-06-03)."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from analytics_limits import MAX_ANALYTICS_ROWS, fetch_rows_capped

BACKEND = Path(__file__).resolve().parent.parent


class TestAnalyticsCap(unittest.TestCase):
    def test_fetch_rows_capped_stops_at_cap(self):
        page_size = 1000

        def fetch_page(offset: int, limit: int) -> list[dict]:
            n = min(limit, page_size)
            return [{"id": offset + i} for i in range(n)]

        rows, truncated = fetch_rows_capped(
            fetch_page, page_size=page_size, cap=5000
        )
        self.assertEqual(len(rows), 5000)
        self.assertTrue(truncated)

    def test_max_analytics_rows_constant(self):
        self.assertEqual(MAX_ANALYTICS_ROWS, 50_000)


def _slice_after_def(src: str, name: str, size: int = 1200) -> str:
    needle = f"def {name}"
    idx = src.index(needle)
    return src[idx : idx + size]


class TestRpcCallersSource(unittest.TestCase):
    def test_next_ma_don_uses_rpc_not_select_latest(self):
        src = (BACKEND / "main.py").read_text(encoding="utf-8")
        block = _slice_after_def(src, "_next_ma_don")
        self.assertIn("rpc_next_ma_don", block)
        self.assertNotIn('table("don_hang")', block)

    def test_allocate_pr_id_uses_rpc(self):
        src = (BACKEND / "payment_request_routes.py").read_text(encoding="utf-8")
        block = _slice_after_def(src, "_allocate_pr_id")
        self.assertIn("rpc_next_payment_request_id", block)
        self.assertNotIn("payment_request_sequences", block)

    def test_alloc_sequences_uses_rpc(self):
        src = (BACKEND / "invoice_routes.py").read_text(encoding="utf-8")
        block = _slice_after_def(src, "_alloc_sequences")
        self.assertIn("rpc_allocate_tax_sequences", block)
        self.assertNotIn('table("tax_sequences")', block)

    def test_save_monthly_uses_rpc_not_delete(self):
        src = (BACKEND / "report_routes.py").read_text(encoding="utf-8")
        block = _slice_after_def(src, "_save_monthly", size=1500)
        self.assertIn("save_bc03_monthly", block)
        self.assertNotIn("bc03_kpi_rows", block)
        self.assertNotIn(".delete()", block)

    def test_revenue_fetch_uses_cap_helper(self):
        src = (BACKEND / "revenue_routes.py").read_text(encoding="utf-8")
        block = _slice_after_def(src, "_fetch_so_doanh_thu", size=1500)
        self.assertIn("fetch_rows_capped", block)
        self.assertNotIn("while True", block)

    def test_dashboard_fetch_uses_cap_helper(self):
        src = (BACKEND / "dashboard_routes.py").read_text(encoding="utf-8")
        self.assertGreaterEqual(src.count("fetch_rows_capped"), 2)
        self.assertNotIn("while True:", src)

    def test_activation_guarded_rpc(self):
        src = (BACKEND / "activation_routes.py").read_text(encoding="utf-8")
        self.assertIn("expected_updated_at", src)
        self.assertIn("replace_active_request_uids_data_guarded", src)
        self.assertNotIn("# Python fallback (non-atomic)", src)


if __name__ == "__main__":
    unittest.main()
