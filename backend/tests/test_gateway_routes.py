from __future__ import annotations

import io
import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class Query:
    def __init__(self, table, rows):
        self.table = table
        self.rows = rows
        self.filters = []
        self.in_filters = []
        self.patch = None
        self.upsert_rows = None
        self._limit = None

    def select(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, value):
        self._limit = value
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def in_(self, key, values):
        self.in_filters.append((key, set(str(v) for v in values)))
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def or_(self, *_args, **_kwargs):
        return self

    def update(self, patch):
        self.patch = patch
        return self

    def upsert(self, rows, **_kwargs):
        self.upsert_rows = rows
        return self

    def execute(self):
        if self.upsert_rows is not None:
            existing_codes = {str(row.get("txn_code") or row.get("settlement_code")) for row in self.rows}
            inserted = []
            for row in self.upsert_rows:
                code = str(row.get("txn_code") or row.get("settlement_code"))
                if code in existing_codes:
                    continue
                row = {"id": f"id-{len(self.rows) + 1}", **row}
                self.rows.append(row)
                inserted.append(row)
            return MagicMock(data=inserted)

        matched = list(self.rows)
        for key, value in self.filters:
            matched = [row for row in matched if row.get(key) == value]
        for key, values in self.in_filters:
            matched = [row for row in matched if str(row.get(key)) in values]
        if self.patch is not None:
            for row in matched:
                row.update(self.patch)
            return MagicMock(data=matched)
        if self._limit is not None:
            matched = matched[: self._limit]
        return MagicMock(data=matched)


class FakeSB:
    def __init__(self):
        self.tables = {
            "gateway_transactions": [],
            "gateway_settlements": [],
            "payment_lines": [
                {
                    "id": "line-1",
                    "payment_request_id": "PR-1",
                    "amount": 1000,
                    "status": "pending",
                    "created_at": "2026-06-16T10:00:00+00:00",
                    "bill_images": ["https://bill.test/1.jpg"],
                }
            ],
            "payment_requests": [{"id": "PR-1", "name": "Test Customer", "uid": "uid1"}],
        }

    def table(self, name):
        return Query(name, self.tables[name])


ACTOR = MagicMock(email="ops@test.com", role="system")


def build_client(sb: FakeSB):
    import gateway_routes

    app = FastAPI()
    gateway_routes.register_gateway_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False)


def test_payoo_online_parser_keeps_19_digit_order_id():
    from mpos_import import parse_payoo_online

    csv = (
        "STT,Mã đơn hàng,Mã thanh toán,Mã cửa hàng,Tên cửa hàng,Số tiền,Hình thức thanh toán,"
        "Hình thức phát hành thẻ,Ngày thanh toán,Số thẻ,Tên chủ thẻ,Nguồn tiền,Trạng thái,"
        "Phí thanh toán,Số tiền sau phí,Mã chuẩn chi,Số tiền gốc,Loại QR\n"
        "1,8971260616094704777,PM001,S1,Store,17820000,Card,VISA,2026-06-16 11:10,"
        "VISA***4763,***KIEU,VISA,OK,376420,17443580,685288,17820000,\n"
    ).encode("utf-8")

    result = parse_payoo_online(csv)

    txn = result["transactions"][0]
    assert txn["txn_code"] == "8971260616094704777"
    assert txn["amount"] == 17820000
    assert txn["net_amount"] == 17443580


def test_gateway_ingest_requires_extension_token():
    sb = FakeSB()
    client = build_client(sb)

    with patch.dict(os.environ, {"GATEWAY_EXTENSION_INGEST_TOKEN": "secret"}):
        resp = client.post(
            "/api/v1/gateway-sync/ingest?source=payoo&kind=online",
            files={"file": ("payoo.csv", b"a,b\n1,2\n", "text/csv")},
        )

    assert resp.status_code == 401


def test_gateway_ingest_upserts_and_skips_duplicate():
    sb = FakeSB()
    client = build_client(sb)
    csv = (
        "STT,Mã đơn hàng,Số tiền,Ngày thanh toán,Phí thanh toán,Số tiền sau phí\n"
        "1,8971260616094704777,1000,2026-06-16 10:00,10,990\n"
    ).encode("utf-8")

    with patch.dict(os.environ, {"GATEWAY_EXTENSION_INGEST_TOKEN": "secret"}):
        first = client.post(
            "/api/v1/gateway-sync/ingest?source=payoo&kind=online",
            headers={"X-GATEWAY-EXT-TOKEN": "secret"},
            files={"file": ("payoo.csv", csv, "text/csv")},
        )
        second = client.post(
            "/api/v1/gateway-sync/ingest?source=payoo&kind=online",
            headers={"X-GATEWAY-EXT-TOKEN": "secret"},
            files={"file": ("payoo.csv", csv, "text/csv")},
        )

    assert first.status_code == 200
    assert first.json()["inserted"] == 1
    assert second.json()["skipped"] == 1


def test_gateway_match_candidates_and_match_flow():
    sb = FakeSB()
    sb.tables["gateway_transactions"].append(
        {
            "id": "txn-1",
            "source": "payoo",
            "category": "Trực tuyến",
            "txn_code": "payoo-1",
            "amount": 1000,
            "fee": 10,
            "net_amount": 990,
            "match_status": "pending",
            "paid_at": "2026-06-16T10:05:00+00:00",
        }
    )
    client = build_client(sb)

    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_access"):
            cand_resp = client.get("/api/v1/gateway-txns/txn-1/match-candidates")
        with patch("gateway_routes.require_module_write"):
            match_resp = client.patch(
                "/api/v1/gateway-txns/txn-1/match",
                json={"payment_line_id": "line-1"},
            )

    assert cand_resp.status_code == 200
    assert cand_resp.json()[0]["has_bill"] is True
    assert cand_resp.json()[0]["bill_images"] == ["https://bill.test/1.jpg"]
    assert match_resp.status_code == 200
    assert match_resp.json()["match_status"] == "matched"
    assert sb.tables["gateway_transactions"][0]["payment_line_id"] == "line-1"


def test_payoo_orders_json_parser_maps_real_fields():
    from mpos_import import parse_payoo_orders

    orders = [
        {
            "OrderNo": "8971260616094704777",
            "MoneyAmount": 17820000,
            "TransactionFeeEcomer": 376420,
            "MoneyAmountAfterFee": 17443580,
            "PurchaseDate": "16/06/2026 11:10:14",
            "CardNumber": "VISA***4763",
            "PaymentCustomerName": "ton thi my kieu",
            "BankCardHolderName": "***KIEU",
            "BankName": "VISA",
            "BillingCode": "",
            "InstallmentBankName": "",
            "InstallmentPeriod": 0,
        }
    ]

    txn = parse_payoo_orders(orders)["transactions"][0]
    assert txn["txn_code"] == "8971260616094704777"  # 19 số giữ nguyên string
    assert txn["amount"] == 17820000
    assert txn["fee"] == 376420
    assert txn["net_amount"] == 17443580
    assert txn["category"] == "Trực tuyến"
    assert txn["cardholder_name"] == "ton thi my kieu"
    assert txn["paid_at"].startswith("2026-06-16T11:10")


def test_payoo_orders_json_detects_installment():
    from mpos_import import parse_payoo_orders

    orders = [
        {
            "OrderNo": "8971260422201706311",
            "MoneyAmount": 18320000,
            "TransactionFeeEcomer": 2057704,
            "MoneyAmountAfterFee": 16262296,
            "PurchaseDate": "22/04/2026 20:20:00",
            "InstallmentBankName": "VPBank",
            "InstallmentPeriod": 12,
        }
    ]

    txn = parse_payoo_orders(orders)["transactions"][0]
    assert txn["category"] == "Trả góp"
    assert txn["installment_term"] == 12
    assert txn["bank"] == "VPBank"


def test_gateway_ingest_orders_json_upserts_and_dedups():
    sb = FakeSB()
    client = build_client(sb)
    orders = [
        {
            "OrderNo": "8971260616094704777",
            "MoneyAmount": 1000,
            "TransactionFeeEcomer": 10,
            "MoneyAmountAfterFee": 990,
            "PurchaseDate": "16/06/2026 10:00:00",
        }
    ]

    with patch.dict(os.environ, {"GATEWAY_EXTENSION_INGEST_TOKEN": "secret"}):
        first = client.post(
            "/api/v1/gateway-sync/ingest-orders?source=payoo&kind=online",
            headers={"X-GATEWAY-EXT-TOKEN": "secret"},
            json={"orders": orders},
        )
        second = client.post(
            "/api/v1/gateway-sync/ingest-orders?source=payoo&kind=online",
            headers={"X-GATEWAY-EXT-TOKEN": "secret"},
            json={"orders": orders},
        )

    assert first.status_code == 200
    assert first.json()["inserted"] == 1
    assert second.json()["skipped"] == 1


def test_gateway_ingest_orders_rejects_bad_token():
    sb = FakeSB()
    client = build_client(sb)
    with patch.dict(os.environ, {"GATEWAY_EXTENSION_INGEST_TOKEN": "secret"}):
        resp = client.post(
            "/api/v1/gateway-sync/ingest-orders?source=payoo&kind=online",
            json={"orders": []},
        )
    assert resp.status_code == 401
