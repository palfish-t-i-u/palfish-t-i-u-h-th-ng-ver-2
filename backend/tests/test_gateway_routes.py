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
        self.or_filter = ""

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

    def or_(self, value, **_kwargs):
        self.or_filter = value
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
        if self.or_filter:
            clauses = [clause for clause in self.or_filter.split(",") if ".ilike." in clause]
            needles = []
            cols = []
            for clause in clauses:
                col, needle = clause.split(".ilike.", 1)
                cols.append(col)
                needles.append(needle.replace("*", "").replace("%", "").lower())
            matched = [
                row
                for row in matched
                if any(needle in str(row.get(col) or "").lower() for col in cols for needle in needles)
            ]
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
                    "method": "card",
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
    # PR-2026-0170 bug (08/07): ghép giao dịch xong phải tự xác nhận payment_line
    # khi đã có bill — không được để mãi "Chờ xác nhận" như trước.
    assert sb.tables["payment_lines"][0]["status"] == "paid"
    assert sb.tables["payment_lines"][0]["confirmed_source"] == "gateway"


def test_gateway_match_does_not_auto_confirm_card_without_bill():
    """Soft-lock TOP2.4 giữ nguyên: quẹt thẻ/trả góp chưa có bill thì KHÔNG
    được tự xác nhận dù đã ghép giao dịch — line vẫn phải ở "pending"."""
    sb = FakeSB()
    sb.tables["payment_lines"][0]["bill_images"] = []
    sb.tables["gateway_transactions"].append(
        {
            "id": "txn-nobill",
            "source": "mpos",
            "category": "Quet the",
            "txn_code": "mpos-nobill",
            "amount": 1000,
            "match_status": "pending",
            "paid_at": "2026-06-16T10:05:00+00:00",
        }
    )
    client = build_client(sb)

    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_write"):
            match_resp = client.patch(
                "/api/v1/gateway-txns/txn-nobill/match",
                json={"payment_line_id": "line-1"},
            )

    assert match_resp.status_code == 200
    assert match_resp.json()["match_status"] == "matched"
    assert sb.tables["gateway_transactions"][0]["payment_line_id"] == "line-1"
    assert sb.tables["payment_lines"][0]["status"] == "pending"
    assert "confirmed_source" not in sb.tables["payment_lines"][0]


def test_gateway_match_auto_confirms_non_card_method_without_bill():
    """Method khác card/installment (vd chuyển khoản online) không bị soft-lock
    bill — ghép xong là xác nhận luôn."""
    sb = FakeSB()
    sb.tables["payment_lines"][0]["method"] = "qr"
    sb.tables["payment_lines"][0]["bill_images"] = []
    sb.tables["gateway_transactions"].append(
        {
            "id": "txn-qr",
            "source": "payoo",
            "category": "Trực tuyến",
            "txn_code": "payoo-qr",
            "amount": 1000,
            "net_amount": 990,
            "match_status": "pending",
            "paid_at": "2026-06-16T10:05:00+00:00",
        }
    )
    client = build_client(sb)

    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_write"):
            match_resp = client.patch(
                "/api/v1/gateway-txns/txn-qr/match",
                json={"payment_line_id": "line-1"},
            )

    assert match_resp.status_code == 200
    assert sb.tables["payment_lines"][0]["status"] == "paid"
    assert sb.tables["payment_lines"][0]["verified_total"] == 1000
    assert sb.tables["payment_lines"][0]["verified_received"] == 990
    # Regression 10/7: payment_lines.verified_total/received la bigint tren DB
    # that — gui float (vd 1000.0) bi PostgREST tu choi (22P02 invalid input
    # syntax for type bigint). FakeSB khong serialize JSON nen chi assert ==
    # se khong bat duoc — phai check type int tuong minh.
    assert isinstance(sb.tables["payment_lines"][0]["verified_total"], int)
    assert isinstance(sb.tables["payment_lines"][0]["verified_received"], int)


def test_gateway_match_idempotent_when_line_already_paid():
    """Ghép vào 1 line đã "paid" từ trước (vd 2 giao dịch ghép nhầm cùng 1 line)
    không được lỗi, không double-confirm."""
    sb = FakeSB()
    sb.tables["payment_lines"][0]["status"] = "paid"
    sb.tables["payment_lines"][0]["confirmed_source"] = "manual"
    sb.tables["gateway_transactions"].append(
        {
            "id": "txn-already-paid",
            "source": "mpos",
            "category": "Quet the",
            "txn_code": "mpos-already-paid",
            "amount": 1000,
            "match_status": "pending",
            "paid_at": "2026-06-16T10:05:00+00:00",
        }
    )
    client = build_client(sb)

    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_write"):
            match_resp = client.patch(
                "/api/v1/gateway-txns/txn-already-paid/match",
                json={"payment_line_id": "line-1"},
            )

    assert match_resp.status_code == 200
    assert sb.tables["payment_lines"][0]["status"] == "paid"
    # Khong bi ghi de nguon xac nhan cu boi luot ghep gateway sau
    assert sb.tables["payment_lines"][0]["confirmed_source"] == "manual"


def test_gateway_match_candidates_search_finds_pr_without_amount_match():
    sb = FakeSB()
    sb.tables["gateway_transactions"].append(
        {
            "id": "txn-search",
            "source": "mpos",
            "category": "Quet the",
            "txn_code": "gw-search",
            "amount": 9999,
            "match_status": "pending",
            "paid_at": "2026-06-16T10:05:00+00:00",
        }
    )
    sb.tables["payment_requests"].append(
        {"id": "PR-SEARCH", "name": "Needle Customer", "uid": "uid-search", "phone": "0909999999"}
    )
    sb.tables["payment_lines"].append(
        {
            "id": "line-search",
            "payment_request_id": "PR-SEARCH",
            "amount": 1234,
            "status": "pending",
            "method": "card",
            "created_at": "2026-06-16T10:01:00+00:00",
            "bill_images": [],
        }
    )
    client = build_client(sb)

    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_access"):
            resp = client.get("/api/v1/gateway-txns/txn-search/match-candidates?search=Needle")

    assert resp.status_code == 200
    assert [row["payment_line_id"] for row in resp.json()] == ["line-search"]


def test_gateway_match_candidates_search_empty_returns_empty():
    sb = FakeSB()
    sb.tables["gateway_transactions"].append(
        {
            "id": "txn-empty",
            "source": "payoo",
            "category": "Online",
            "txn_code": "gw-empty",
            "amount": 1000,
            "match_status": "pending",
            "paid_at": "2026-06-16T10:05:00+00:00",
        }
    )
    client = build_client(sb)

    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_access"):
            resp = client.get("/api/v1/gateway-txns/txn-empty/match-candidates?search=nope")

    assert resp.status_code == 200
    assert resp.json() == []


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


def test_gateway_match_auto_confirm_copies_net_amount():
    sb = FakeSB()
    sb.tables["gateway_transactions"].append(
        {
            "id": "txn-net",
            "source": "mpos",
            "category": "Quet the",
            "txn_code": "mpos-net",
            "amount": 20000,
            "net_amount": 19500,
            "match_status": "pending",
            "paid_at": "2026-06-16T10:05:00+00:00",
        }
    )
    client = build_client(sb)

    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_write"):
            match_resp = client.patch(
                "/api/v1/gateway-txns/txn-net/match",
                json={"payment_line_id": "line-1"},
            )

    assert match_resp.status_code == 200
    assert sb.tables["payment_lines"][0]["status"] == "paid"
    assert sb.tables["payment_lines"][0].get("verified_total") == 20000
    assert sb.tables["payment_lines"][0].get("verified_received") == 19500
    assert isinstance(sb.tables["payment_lines"][0]["verified_total"], int)
    assert isinstance(sb.tables["payment_lines"][0]["verified_received"], int)


def test_gateway_match_auto_confirm_no_net_amount():
    sb = FakeSB()
    sb.tables["gateway_transactions"].append(
        {
            "id": "txn-no-net",
            "source": "mpos",
            "category": "Quet the",
            "txn_code": "mpos-no-net",
            "amount": 20000,
            "net_amount": 0,
            "match_status": "pending",
            "paid_at": "2026-06-16T10:05:00+00:00",
        }
    )
    client = build_client(sb)

    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_write"):
            match_resp = client.patch(
                "/api/v1/gateway-txns/txn-no-net/match",
                json={"payment_line_id": "line-1"},
            )

    assert match_resp.status_code == 200
    assert sb.tables["payment_lines"][0]["status"] == "paid"
    assert "verified_received" not in sb.tables["payment_lines"][0]
    assert "verified_total" not in sb.tables["payment_lines"][0]


def test_mark_line_paid_extra_none_backward_compat():
    from payment_request_routes import _mark_line_paid

    sb = FakeSB()
    # Call directly like payos webhook does
    res = _mark_line_paid(sb, "line-1", actor_email="system:payos", source="payos")

    assert res["payment_line"]["status"] == "paid"
    assert sb.tables["payment_lines"][0]["status"] == "paid"
    assert sb.tables["payment_lines"][0]["confirmed_source"] == "payos"
    assert "verified_received" not in sb.tables["payment_lines"][0]


def test_gateway_match_verified_amounts_are_int_not_float():
    """Regression bug thật 10/7 (prod/sandbox): gateway_transactions.amount/
    net_amount tu mpos_import.py co the la float (vd 9828000.0). payment_lines.
    verified_total/verified_received la cot bigint tren DB that — PostgREST
    tu choi float co dau thap phan voi loi 22P02 'invalid input syntax for
    type bigint'. match_gateway_txn phai ep int truoc khi gui, khong duoc de
    lot float."""
    sb = FakeSB()
    sb.tables["gateway_transactions"].append(
        {
            "id": "txn-float",
            "source": "mpos",
            "category": "Tra gop",
            "txn_code": "mpos-float",
            "amount": 9_828_000.0,
            "net_amount": 9_582_785.7,
            "match_status": "pending",
            "paid_at": "2026-06-16T10:05:00+00:00",
        }
    )
    client = build_client(sb)

    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_write"):
            match_resp = client.patch(
                "/api/v1/gateway-txns/txn-float/match",
                json={"payment_line_id": "line-1"},
            )

    assert match_resp.status_code == 200
    line = sb.tables["payment_lines"][0]
    assert line["status"] == "paid"
    assert isinstance(line["verified_total"], int), f"verified_total phai la int, dang la {type(line['verified_total'])}"
    assert isinstance(line["verified_received"], int), f"verified_received phai la int, dang la {type(line['verified_received'])}"
    assert line["verified_total"] == 9_828_000
    assert line["verified_received"] == 9_582_785


def test_match_writes_verified_received_on_already_paid_line():
    """T8 — line xác nhận (paid) TRƯỚC rồi mới ghép gateway → net vẫn phải ghi."""
    sb = FakeSB()
    sb.tables["payment_lines"][0].update({
        "id": "line-net", "amount": 25240000, "status": "paid", "method": "card",
        "bill_images": ["https://bill.test/x.jpg"], "payment_request_id": "PR-1",
    })
    sb.tables["gateway_transactions"].append({
        "id": "gw-net", "amount": 25240000, "net_amount": 24785680,
        "match_status": "pending", "payment_line_id": None,
    })
    client = build_client(sb)
    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_write"):
            with patch("payment_request_routes.recompute_payment_request_totals",
                       return_value={"payment_request": {}, "received": 0, "target": 0, "state": "done"}):
                resp = client.patch("/api/v1/gateway-txns/gw-net/match",
                                    json={"payment_line_id": "line-net"})
    assert resp.status_code == 200
    line = next(l for l in sb.tables["payment_lines"] if l["id"] == "line-net")
    assert line["verified_received"] == 24785680   # net ghi dù đã paid
    assert line["verified_total"] == 25240000


def test_match_candidates_finds_line_entered_as_net():
    """T9 — sale nhập line theo NET (sau phí) → tick Khớp tiền vẫn tìm ra."""
    sb = FakeSB()
    sb.tables["payment_lines"][0].update({
        "id": "line-netamt", "amount": 8602425, "status": "pending", "method": "card",
        "bill_images": ["https://bill.test/y.jpg"], "payment_request_id": "PR-1",
    })
    sb.tables["gateway_transactions"].append({
        "id": "gw-2", "amount": 8823000, "net_amount": 8602425,
        "match_status": "pending", "paid_at": "2026-07-12T10:00:00+00:00",
    })
    client = build_client(sb)
    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_access"):
            resp = client.get("/api/v1/gateway-txns/gw-2/match-candidates")
    assert resp.status_code == 200
    ids = {c["payment_line_id"] for c in resp.json()}
    assert "line-netamt" in ids   # tìm theo net 8.602.425
