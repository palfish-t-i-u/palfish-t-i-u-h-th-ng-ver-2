"""GĐ1 payments module — unit + source checks."""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from payment_logic import compute_gmv_final

BACKEND = Path(__file__).resolve().parent.parent


class TestComputeGmvFinal(unittest.TestCase):
    def test_before_cutoff_uses_gmv_rmb(self):
        pt = datetime(2026, 5, 31, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(
            compute_gmv_final(pt, Decimal("5000000"), Decimal("1350.50")),
            Decimal("1350.50"),
        )

    def test_before_cutoff_missing_rmb_is_zero(self):
        pt = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.assertEqual(compute_gmv_final(pt, Decimal("1000"), None), Decimal("0"))

    def test_from_cutoff_uses_vnd_rate(self):
        pt = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(
            compute_gmv_final(pt, Decimal("3700000"), Decimal("999")),
            Decimal("1000.00"),
        )

    def test_naive_pay_time_treated_as_utc(self):
        pt = datetime(2026, 6, 2, 10, 0)
        self.assertEqual(
            compute_gmv_final(pt, Decimal("7400"), None),
            Decimal("2.00"),
        )


class TestPaymentsRegistration(unittest.TestCase):
    def test_main_registers_payment_routes(self):
        src = (BACKEND / "main.py").read_text(encoding="utf-8")
        self.assertIn("from payment_routes import register_payment_routes", src)
        self.assertIn("register_payment_routes(app, _supabase)", src)

    def test_payment_routes_endpoints(self):
        src = (BACKEND / "payment_routes.py").read_text(encoding="utf-8")
        for path in (
            '"/api/v1/payments"',
            '"/api/v1/payments/{payment_id}"',
            '"/api/v1/payments/{payment_id}/refund"',
            '"/api/v1/payments/{payment_id}/restore"',
            '"/api/v1/payments/{payment_id}/link-crm"',
            '"/api/v1/customers/search"',
            '"/api/v1/payments/master/sales"',
            '"/api/v1/payments/master/channels"',
            '"/api/v1/payments/master/packages"',
        ):
            self.assertIn(path, src, msg=f"missing route {path}")

    def test_list_filters_deleted_at(self):
        src = (BACKEND / "payment_routes.py").read_text(encoding="utf-8")
        self.assertIn('is_("deleted_at", "null")', src)

    def test_soft_delete_requires_system(self):
        src = (BACKEND / "payment_routes.py").read_text(encoding="utf-8")
        block = src[src.index("def delete_payment") : src.index("def delete_payment") + 400]
        self.assertIn('require_min_role(actor, "system")', block)
        self.assertIn("deleted_at", block)

    def test_rbac_payments_module_key(self):
        src = (BACKEND / "payment_routes.py").read_text(encoding="utf-8")
        self.assertIn('"payments"', src)
        self.assertIn("require_module_access", src)
        self.assertIn("require_module_write", src)


class TestRevenueUntouched(unittest.TestCase):
    def test_revenue_routes_no_payments_table(self):
        src = (BACKEND / "revenue_routes.py").read_text(encoding="utf-8")
        self.assertNotIn('table("payments")', src)
        self.assertIn('table("so_doanh_thu")', src)

    def test_migration_sql_exists(self):
        mig = BACKEND.parent / "docs" / "migrations" / "2026-06-07-payments-module.sql"
        self.assertTrue(mig.is_file())
        text = mig.read_text(encoding="utf-8")
        self.assertIn("payment_id    uuid PRIMARY KEY", text)
        self.assertIn("payments_bizkey", text)
        self.assertIn("NOTIFY pgrst", text)

    def test_migrate_script_skeleton(self):
        script = BACKEND / "scripts" / "migrate_payments.py"
        self.assertTrue(script.is_file())
        text = script.read_text(encoding="utf-8")
        self.assertIn("--dry-run", text.lower())
        self.assertIn("--apply", text)
        self.assertIn("parse_danang_row", text)  # imported from sheet_row_parsers
        self.assertIn("Danang REV", text)

    def test_danang_column_map_in_parsers(self):
        src = (BACKEND / "sheet_row_parsers.py").read_text(encoding="utf-8")
        self.assertIn("DANANG_COLUMN_MAP", src)
        self.assertIn('"channel_code": 14', src)
        self.assertIn('"sales": 15', src)


class TestMasterCrud(unittest.TestCase):
    MODELS = (
        "SaleCreate",
        "SalePatch",
        "ChannelCreate",
        "ChannelPatch",
        "PackageCreate",
        "PackagePatch",
        "CustomerPatch",
    )

    MASTER_WRITE_PATHS = (
        '"/api/v1/payments/master/sales"',
        '"/api/v1/payments/master/sales/{sale_id}"',
        '"/api/v1/payments/master/channels"',
        '"/api/v1/payments/master/channels/{channel_id}"',
        '"/api/v1/payments/master/packages"',
        '"/api/v1/payments/master/packages/{package_id}"',
        '"/api/v1/payments/master/customers/{uid}"',
    )

    def test_master_crud_models_exist(self):
        src = (BACKEND / "payment_routes.py").read_text(encoding="utf-8")
        for model in self.MODELS:
            self.assertIn(f"class {model}(BaseModel)", src, msg=f"missing {model}")

    def test_master_crud_endpoint_paths(self):
        src = (BACKEND / "payment_routes.py").read_text(encoding="utf-8")
        for path in self.MASTER_WRITE_PATHS:
            self.assertIn(path, src, msg=f"missing path {path}")

    def test_master_write_uses_require_module_write(self):
        src = (BACKEND / "payment_routes.py").read_text(encoding="utf-8")
        for fn in (
            "create_sale_master",
            "patch_sale_master",
            "create_channel_master",
            "patch_channel_master",
            "create_package_master",
            "patch_package_master",
            "patch_customer_master",
        ):
            start = src.index(f"def {fn}")
            block = src[start : start + 500]
            self.assertIn("require_module_write(sb, actor, \"payments\")", block, fn)


class TestPaymentActionPayloads(unittest.TestCase):
    def test_refund_restore_link_crm_source(self):
        src = (BACKEND / "payment_routes.py").read_text(encoding="utf-8")
        self.assertIn('"status": "refunded"', src)
        self.assertIn('"status": "active"', src)
        self.assertIn("crm_activated", src)
        self.assertIn("crm_order_id", src)

    def test_patch_recomputes_gmv_final(self):
        src = (BACKEND / "payment_routes.py").read_text(encoding="utf-8")
        block = src[src.index("def patch_payment") : src.index("def patch_payment") + 2000]
        self.assertIn("compute_gmv_final", block)
        self.assertIn("sale_id", block)


if __name__ == "__main__":
    unittest.main()
