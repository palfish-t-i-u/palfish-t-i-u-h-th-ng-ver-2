"""Tests for REV-02: Cơ chế hoàn/hủy ghi giảm doanh thu (POST /revenue/ledger/{row_id}/refund)."""

from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rbac import Actor
import revenue_routes as rev_mod


class FakeQuery:
    def __init__(self, table_name: str, sb: FakeSB):
        self._table_name = table_name
        self._sb = sb
        self._filters: list[tuple[str, str]] = []
        self._limit_n: int | None = None
        self._insert_data: dict | None = None

    def select(self, *args, **kwargs):
        return self

    def eq(self, col: str, val: str):
        self._filters.append((col, val))
        return self

    def limit(self, n: int):
        self._limit_n = n
        return self

    def insert(self, payload: dict):
        self._insert_data = dict(payload)
        return self

    def execute(self):
        if self._insert_data is not None:
            new_row = dict(self._insert_data)
            if "id" not in new_row:
                new_row["id"] = f"refund-id-{len(self._sb._tables[self._table_name]) + 1}"
            self._sb._tables[self._table_name].append(new_row)
            return MagicMock(data=[new_row])

        result = [dict(r) for r in self._sb._tables.get(self._table_name, [])]
        for col, val in self._filters:
            result = [r for r in result if r.get(col) == val]
        if self._limit_n is not None:
            result = result[: self._limit_n]
        return MagicMock(data=result)


class FakeSB:
    def __init__(self, initial_data: dict[str, list[dict]] | None = None):
        self._tables = initial_data or {}

    def table(self, table_name: str):
        self._tables.setdefault(table_name, [])
        return FakeQuery(table_name, self)


MANAGER_ACTOR = Actor(
    email="manager@company.com",
    user_id="user-mgr-1",
    role="manager",
    staff={"team": "HN Inhouse", "crm_name": "Manager Test"},
    department="sale",
    is_activated=True,
)

SALE_ACTOR = Actor(
    email="sale@company.com",
    user_id="user-sale-1",
    role="sale",
    staff={"team": "HN Inhouse", "crm_name": "Sale Test"},
    department="sale",
    is_activated=True,
)


@pytest.fixture
def original_row():
    return {
        "id": "row-orig-100",
        "so_tien_vnd": 5000000,
        "gmv_rmb": 1351.35,
        "ty_gia_vnd_rmb": 3700.0,
        "ngay_tien_ve": "2026-07-15",
        "pay_time": "2026-07-15T00:00:00+07:00",
        "loai_nhap": "tu_dong",
        "is_test": False,
        "team": "HN Inhouse",
        "team_pivot_label": "HN Inhouse",
        "sale_crm_name": "Nguyen Văn Sale",
        "ma_don_hang": "ORD-2026-001",
        "don_hang_id": "don-hang-100",
        "crm_order_id": "CRM-001",
        "customer_name": "Nguyen Van A",
        "ten_khach": "Nguyen Van A",
        "sdt": "0912345678",
        "uid": "UID12345",
        "goi_hoc": "Gói 1 năm",
        "payment_method": "Chuyển khoản",
    }


def test_full_refund_success(original_row):
    sb = FakeSB({"so_doanh_thu": [original_row]})
    app = FastAPI()
    rev_mod.register_revenue_routes(app, lambda: sb)

    with patch("revenue_routes.resolve_actor", return_value=MANAGER_ACTOR):
        client = TestClient(app)
        res = client.post("/revenue/ledger/row-orig-100/refund", json={"amount": 5000000, "reason": "Khách hủy học"})
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        refund_row = data["refund_row"]

        # Acceptance Criteria 1: Original row untouched, new refund row negative amount
        assert refund_row["so_tien_vnd"] == -5000000
        assert refund_row["loai_nhap"] == "hoan"
        assert refund_row["hoan_ref_id"] == "row-orig-100"
        assert refund_row["ngay_tien_ve"] == "2026-07-15"  # Truy kỳ gốc
        assert refund_row["team"] == "HN Inhouse"
        assert refund_row["sale_crm_name"] == "Nguyen Văn Sale"
        assert refund_row["is_test"] is False

        # Check total sum for that order in so_doanh_thu becomes 0
        all_rows = sb._tables["so_doanh_thu"]
        assert len(all_rows) == 2
        total_sum = sum(r["so_tien_vnd"] for r in all_rows)
        assert total_sum == 0


def test_partial_refunds_and_over_refund_guard(original_row):
    sb = FakeSB({"so_doanh_thu": [original_row]})
    app = FastAPI()
    rev_mod.register_revenue_routes(app, lambda: sb)

    with patch("revenue_routes.resolve_actor", return_value=MANAGER_ACTOR):
        client = TestClient(app)

        # Lần 1: hoàn 2,000,000 VND -> OK
        res1 = client.post("/revenue/ledger/row-orig-100/refund", json={"amount": 2000000, "reason": "Hoàn đợt 1"})
        assert res1.status_code == 200

        # Lần 2: hoàn 2,000,000 VND nữa -> OK (tổng 4M <= 5M)
        res2 = client.post("/revenue/ledger/row-orig-100/refund", json={"amount": 2000000, "reason": "Hoàn đợt 2"})
        assert res2.status_code == 200

        # Lần 3: hoàn thêm 2,000,000 VND (tổng 6M > 5M gốc) -> HTTP 400
        res3 = client.post("/revenue/ledger/row-orig-100/refund", json={"amount": 2000000, "reason": "Hoàn quá tay"})
        assert res3.status_code == 400
        assert "vượt quá" in res3.json()["detail"]


def test_refund_inherits_attributes():
    test_orig = {
        "id": "row-test-999",
        "so_tien_vnd": 10000000,
        "gmv_rmb": 2702.70,
        "ty_gia_vnd_rmb": 3700.0,
        "ngay_tien_ve": "2026-06-01",
        "pay_time": "2026-06-01T00:00:00+07:00",
        "loai_nhap": "tu_dong",
        "is_test": True,
        "team": "HCM Online",
        "sale_crm_name": "Tran Van Sale",
        "ma_don_hang": "ORD-TEST-999",
        "created_by_email": "original@company.com",
    }
    sb = FakeSB({"so_doanh_thu": [test_orig]})
    app = FastAPI()
    rev_mod.register_revenue_routes(app, lambda: sb)

    with patch("revenue_routes.resolve_actor", return_value=MANAGER_ACTOR):
        client = TestClient(app)
        res = client.post("/revenue/ledger/row-test-999/refund", json={"amount": 3000000})
        assert res.status_code == 200
        refund = res.json()["refund_row"]

        assert refund["so_tien_vnd"] == -3000000
        assert refund["is_test"] is True
        assert refund["team"] == "HCM Online"
        assert refund["sale_crm_name"] == "Tran Van Sale"
        assert refund["ngay_tien_ve"] == "2026-06-01"
        assert refund["created_by_email"] == "manager@company.com"


def test_rbac_sale_role_forbidden(original_row):
    sb = FakeSB({"so_doanh_thu": [original_row]})
    app = FastAPI()
    rev_mod.register_revenue_routes(app, lambda: sb)

    with patch("revenue_routes.resolve_actor", return_value=SALE_ACTOR):
        client = TestClient(app)
        res = client.post("/revenue/ledger/row-orig-100/refund", json={"amount": 1000000})
        assert res.status_code == 403
        assert "quyền" in res.json()["detail"].lower()
