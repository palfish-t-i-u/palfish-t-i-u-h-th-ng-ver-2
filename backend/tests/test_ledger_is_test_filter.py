"""Tests for REV-01 Việc 7: is_test filter on Sổ doanh thu + BC01/BC02/BC03."""

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


# ---------------------------------------------------------------------------
# Minimal FakeQuery / FakeSB supporting is_test, ngay_tien_ve, loai_nhap
# ---------------------------------------------------------------------------

class FakeQuery:
    def __init__(self, table_name: str, sb: "FakeSB"):
        self._table_name = table_name
        self._sb = sb
        self._filters: list[tuple] = []
        self._range: tuple[int, int] | None = None
        self._limit_n: int | None = None
        self._count_mode: str | None = None
        self._select_cols: str = "*"

    def select(self, cols: str = "*", count: str | None = None):
        self._select_cols = cols
        if count:
            self._count_mode = count
        return self

    def order(self, *args, **kwargs):
        return self

    def gte(self, col: str, val):
        self._filters.append(("gte", col, val))
        return self

    def lte(self, col: str, val):
        self._filters.append(("lte", col, val))
        return self

    def eq(self, col: str, val):
        self._filters.append(("eq", col, val))
        return self

    def in_(self, col: str, vals: list):
        self._filters.append(("in_", col, vals))
        return self

    def or_(self, clause: str):
        return self

    def range(self, start: int, end: int):
        self._range = (start, end)
        return self

    def limit(self, n: int):
        self._limit_n = n
        return self

    def execute(self):
        rows = list(self._sb._tables.get(self._table_name, []))
        for op, col, val in self._filters:
            if op == "eq":
                rows = [r for r in rows if r.get(col) == val]
            elif op == "gte":
                rows = [r for r in rows if (r.get(col) or "") >= val]
            elif op == "lte":
                rows = [r for r in rows if (r.get(col) or "") <= val]
            elif op == "in_":
                rows = [r for r in rows if r.get(col) in val]
        # Count BEFORE limit/range — matches PostgREST exact count behaviour
        count_before_limit = len(rows)
        if self._limit_n is not None:
            rows = rows[: self._limit_n]
        if self._range is not None:
            start, end = self._range
            rows = rows[start: end + 1]
        mock_count = count_before_limit if self._count_mode else None
        return MagicMock(data=rows, count=mock_count)


class FakeSB:
    def __init__(self, initial_data: dict[str, list[dict]] | None = None):
        self._tables = initial_data or {}

    def table(self, name: str) -> FakeQuery:
        self._tables.setdefault(name, [])
        return FakeQuery(name, self)


# ---------------------------------------------------------------------------
# Test data
# ---------------------------------------------------------------------------

ROW_REAL_1 = {
    "id": "row-real-1",
    "so_tien_vnd": 3_000_000,
    "gmv_rmb": 810.0,
    "ty_gia_vnd_rmb": 3700.0,
    "ngay_tien_ve": "2026-07-15",
    "pay_time": "2026-07-15T00:00:00+07:00",
    "loai_nhap": "tu_dong",
    "is_test": False,
    "team": "HN Inhouse",
    "team_pivot_label": "HN Inhouse",
    "sale_crm_name": "Nguyen Van Sale",
}

ROW_REAL_2 = {
    "id": "row-real-2",
    "so_tien_vnd": 2_000_000,
    "gmv_rmb": 540.0,
    "ty_gia_vnd_rmb": 3700.0,
    "ngay_tien_ve": "2026-07-10",
    "pay_time": "2026-07-10T00:00:00+07:00",
    "loai_nhap": "import:gsheet:SM",
    "is_test": False,
    "team": "HN Inhouse",
    "team_pivot_label": "HN Inhouse",
    "sale_crm_name": "Tran Thi Sale",
}

ROW_TEST = {
    "id": "row-test-1",
    "so_tien_vnd": 9_999_999,
    "gmv_rmb": 2702.7,
    "ty_gia_vnd_rmb": 3700.0,
    "ngay_tien_ve": "2026-07-15",
    "pay_time": "2026-07-15T00:00:00+07:00",
    "loai_nhap": "tu_dong",
    "is_test": True,
    "team": "HN Inhouse",
    "team_pivot_label": "HN Inhouse",
    "sale_crm_name": "test.user@dev",
}

ADMIN_ACTOR = Actor(
    email="admin@test.com",
    user_id="user-admin-1",
    role="admin",
    staff=None,
    department="sale",
    is_activated=True,
)


def make_app(rows: list[dict]):
    sb = FakeSB({"so_doanh_thu": list(rows)})
    app = FastAPI()
    rev_mod.register_revenue_routes(app, lambda: sb)
    return app, sb


# ---------------------------------------------------------------------------
# AC1: default trả chỉ dòng is_test=False
# ---------------------------------------------------------------------------

def test_list_ledger_default_excludes_test_rows():
    app, _ = make_app([ROW_REAL_1, ROW_REAL_2, ROW_TEST])
    with patch("revenue_routes.resolve_actor", return_value=ADMIN_ACTOR), \
         patch("revenue_routes.require_module_access"), \
         patch("revenue_routes.enforce_report_scope", return_value=(None, None)):
        client = TestClient(app)
        res = client.get("/revenue/ledger")
    assert res.status_code == 200
    data = res.json()
    ids = [r["id"] for r in data["rows"]]
    assert "row-test-1" not in ids
    assert "row-real-1" in ids
    assert "row-real-2" in ids
    assert data["count"] == 2


# ---------------------------------------------------------------------------
# AC2: include_test=true trả cả 3 dòng
# ---------------------------------------------------------------------------

def test_list_ledger_include_test_returns_all():
    app, _ = make_app([ROW_REAL_1, ROW_REAL_2, ROW_TEST])
    with patch("revenue_routes.resolve_actor", return_value=ADMIN_ACTOR), \
         patch("revenue_routes.require_module_access"), \
         patch("revenue_routes.enforce_report_scope", return_value=(None, None)):
        client = TestClient(app)
        res = client.get("/revenue/ledger?include_test=true")
    assert res.status_code == 200
    data = res.json()
    ids = [r["id"] for r in data["rows"]]
    assert "row-test-1" in ids
    assert data["count"] == 3


# ---------------------------------------------------------------------------
# AC3: dòng import:* is_test=false vẫn hiển thị (ROW_REAL_2 là import:gsheet)
# ---------------------------------------------------------------------------

def test_import_row_not_filtered_out():
    app, _ = make_app([ROW_REAL_2])
    with patch("revenue_routes.resolve_actor", return_value=ADMIN_ACTOR), \
         patch("revenue_routes.require_module_access"), \
         patch("revenue_routes.enforce_report_scope", return_value=(None, None)):
        client = TestClient(app)
        res = client.get("/revenue/ledger")
    assert res.status_code == 200
    ids = [r["id"] for r in res.json()["rows"]]
    assert "row-real-2" in ids


# ---------------------------------------------------------------------------
# Unit test: apply_revenue_filters gọi eq("is_test", False) đúng
# ---------------------------------------------------------------------------

def test_apply_revenue_filters_adds_is_test_false():
    query = MagicMock()
    query.eq.return_value = query
    result = rev_mod.apply_revenue_filters(query, include_test=False)
    query.eq.assert_called_once_with("is_test", False)
    assert result is query


def test_apply_revenue_filters_include_test_skips_filter():
    query = MagicMock()
    result = rev_mod.apply_revenue_filters(query, include_test=True)
    query.eq.assert_not_called()
    assert result is query
