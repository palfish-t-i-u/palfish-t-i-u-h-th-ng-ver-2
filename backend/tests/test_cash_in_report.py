from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sepay_routes import classify_cash_in, extract_settlement_code


# Content thật lấy từ bank_transactions sandbox (PC 79492392, ca vàng M3-N1)
REAL_MPOS_SETTLE_CONTENT = (
    "VCBCSH.888210.53e76c202659491fba2e6c027e479f19. 1112608259442547 "
    "CDSNL18846922 TT 381468427 PC 79492392 CT tu 1064604204 CTCP CONG TG THANH"
)


class TestExtractSettlementCode:
    def test_extracts_pc_number_from_real_content(self):
        assert extract_settlement_code(REAL_MPOS_SETTLE_CONTENT) == "79492392"

    def test_no_pc_returns_none(self):
        assert extract_settlement_code("Nguyen Van A chuyen tien hoc phi") is None

    def test_empty_content_returns_none(self):
        assert extract_settlement_code("") is None
        assert extract_settlement_code(None) is None


class TestClassifyCashIn:
    def test_card_row_is_the(self):
        assert classify_cash_in(content="bat ky", payment_line_id=None, is_card=True) == "the"

    def test_tiktok_withdrawal_is_rut_tiktok(self):
        assert classify_cash_in(content="TikTok Shop", payment_line_id=None) == "rut_tiktok"

    def test_mpos_settle_cuc_is_the_gop(self):
        assert classify_cash_in(content=REAL_MPOS_SETTLE_CONTENT, payment_line_id=None) == "the_gop"

    def test_matched_payment_line_is_khach_tra(self):
        assert classify_cash_in(content="CK hoc phi PF12345", payment_line_id="line-1") == "khach_tra"

    def test_unmatched_unknown_content_is_khac(self):
        assert classify_cash_in(content="chuyen nham", payment_line_id=None) == "khac"

    def test_tiktok_checked_before_mpos_settlement_signals(self):
        """TikTok phải thắng dù _is_mpos_settlement() cũng match cùng pattern nội bộ —
        tránh bug gán nhầm rút TikTok thành 'the_gop'."""
        assert classify_cash_in(content="TikTok Shop", payment_line_id=None) != "the_gop"


# ---------------------------------------------------------------------------
# FakeSB — endpoint-level tests cho GET /reports/cash-in + PUT annotation
# ---------------------------------------------------------------------------
from datetime import datetime as _dt


def _parse_dt(v):
    """Parse best-effort để so sánh đúng thứ tự thời gian (không phải lexicographic
    chuỗi) — timestamptz với offset khác nhau (VD +00:00 vs +07:00) so bằng string
    sẽ SAI thứ tự thời gian thật, dù trên Postgres thật lại đúng."""
    s = str(v or "").strip()
    if not s:
        return None
    try:
        return _dt.fromisoformat(s.replace("Z", "+00:00").replace(" ", "T", 1))
    except ValueError:
        return None


def _cmp_ge(row_value, filter_value):
    a, b = _parse_dt(row_value), _parse_dt(filter_value)
    if a is not None and b is not None and (a.tzinfo is None) == (b.tzinfo is None):
        return a >= b
    return str(row_value or "") >= str(filter_value)


def _cmp_le(row_value, filter_value):
    a, b = _parse_dt(row_value), _parse_dt(filter_value)
    if a is not None and b is not None and (a.tzinfo is None) == (b.tzinfo is None):
        return a <= b
    return str(row_value or "") <= str(filter_value)


class Query:
    def __init__(self, table, rows):
        self.table = table
        self.rows = rows
        self.preds = []
        self._limit = None
        self._order = None
        self.upsert_rows = None
        self.insert_row = None

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self.preds.append(lambda r: r.get(key) == value)
        return self

    def neq(self, key, value):
        self.preds.append(lambda r: r.get(key) != value)
        return self

    def gt(self, key, value):
        self.preds.append(lambda r: float(r.get(key) or 0) > value)
        return self

    def gte(self, key, value):
        self.preds.append(lambda r: _cmp_ge(r.get(key), value))
        return self

    def lte(self, key, value):
        self.preds.append(lambda r: _cmp_le(r.get(key), value))
        return self

    def in_(self, key, values):
        values = set(str(v) for v in values)
        self.preds.append(lambda r: str(r.get(key)) in values)
        return self

    def order(self, key, desc=False):
        self._order = (key, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def upsert(self, rows, **_k):
        self.upsert_rows = rows if isinstance(rows, list) else [rows]
        return self

    def insert(self, row):
        self.insert_row = row
        return self

    def execute(self):
        if self.upsert_rows is not None:
            for row in self.upsert_rows:
                key = (row.get("source"), str(row.get("txn_id")))
                self.rows[:] = [r for r in self.rows if (r.get("source"), str(r.get("txn_id"))) != key]
                self.rows.append(row)
            return MagicMock(data=self.upsert_rows)
        if self.insert_row is not None:
            self.rows.append(self.insert_row)
            return MagicMock(data=[self.insert_row])

        matched = [r for r in self.rows if all(p(r) for p in self.preds)]
        if self._order:
            key, desc = self._order
            matched = sorted(matched, key=lambda r: r.get(key) or "", reverse=desc)
        if self._limit is not None:
            matched = matched[: self._limit]
        return MagicMock(data=matched)


class FakeSB:
    def __init__(self, tables: dict):
        self.tables = {k: list(v) for k, v in tables.items()}

    def table(self, name):
        return Query(name, self.tables.setdefault(name, []))


# Ca vàng M3-N1 — nguyên số liệu thật lấy từ sandbox
GOLDEN_GATEWAY_ROWS = [
    {"id": "g1", "source": "mpos", "settlement_code": "79492392", "net_amount": 9340500.0,
     "funded_date": "2026-08-25 02:29:24", "match_status": "pending", "payment_line_id": None},
    {"id": "g2", "source": "mpos", "settlement_code": "79492392", "net_amount": 17676000.0,
     "funded_date": "2026-08-25 02:29:24", "match_status": "pending", "payment_line_id": None},
    {"id": "g3", "source": "mpos", "settlement_code": "79492392", "net_amount": 25057500.0,
     "funded_date": "2026-08-25 02:29:24", "match_status": "pending", "payment_line_id": None},
    {"id": "g4", "source": "mpos", "settlement_code": "79492392", "net_amount": 8658000.0,
     "funded_date": "2026-08-25 02:29:24", "match_status": "pending", "payment_line_id": None},
]
GOLDEN_BANK_CUC = {
    "txn_id": "b1", "amount": 60732000.0, "account_number": "1680011668899",
    "match_status": "ignored", "content": REAL_MPOS_SETTLE_CONTENT,
    "transaction_date": "2026-08-25T03:26:00+00:00", "payment_line_id": None, "team": None,
}


def _make_fake_sb(**overrides) -> FakeSB:
    tables = {
        "gateway_transactions": GOLDEN_GATEWAY_ROWS,
        "bank_transactions": [GOLDEN_BANK_CUC],
        "payment_lines": [],
        "payment_requests": [],
        "nhan_su_sale": [],
        "cash_in_annotations": [],
        "exchange_rates": [{"effective_from": "2026-01-01", "rate": 3700}],
        "audit_logs": [],
        "department_permissions": [],
        "permission_overrides": [],
    }
    tables.update(overrides)
    return FakeSB(tables)


import report_routes as rr


class TestBc04HybridDedup:
    def test_settled_pc_excludes_bank_cuc_keeps_4_card_rows(self):
        """PC 79492392 đã có ở gateway (4 dòng thẻ) → cục bank phải bị loại,
        không được đếm trùng 60.732.000 hai lần."""
        sb = _make_fake_sb()
        result = rr._build_bc04_rows(sb, "2026-08-25", "2026-08-25", 0, None)
        assert len(result["rows"]) == 4
        assert all(r["source"] == "gateway" for r in result["rows"])
        assert result["summary"]["total_input"] == pytest.approx(60732000.0)
        assert result["summary"]["closing_balance"] == pytest.approx(60732000.0)

    def test_unsettled_pc_keeps_bank_cuc(self):
        """PC không có trong gateway (chưa đồng bộ) → giữ nguyên cục bank, không mất tiền."""
        sb = _make_fake_sb(gateway_transactions=[])
        result = rr._build_bc04_rows(sb, "2026-08-25", "2026-08-25", 0, None)
        assert len(result["rows"]) == 1
        assert result["rows"][0]["source"] == "bank"
        assert result["rows"][0]["input"] == pytest.approx(60732000.0)
        assert result["summary"]["total_input"] == pytest.approx(60732000.0)

    def test_never_double_counts_when_both_present(self):
        """Bất kể thứ tự nào, tổng tiền vào luôn = 60.732.000 — không hơn, không kém."""
        sb = _make_fake_sb()
        result = rr._build_bc04_rows(sb, "2026-08-25", "2026-08-25", 0, None)
        assert result["summary"]["total_input"] == pytest.approx(60732000.0)


class TestBc04CumulativeBalanceAndRmb:
    def test_opening_balance_carries_and_accumulates_in_date_order(self):
        gateway_rows = [
            {"id": "d1", "source": "mpos", "settlement_code": None, "net_amount": 1000000.0,
             "funded_date": "2026-08-26 09:00:00", "match_status": "pending", "payment_line_id": None},
        ]
        bank_rows = [
            {"txn_id": "b2", "amount": 500000.0, "account_number": "1680011668899",
             "match_status": "auto_matched", "content": "Nguyen Van A CK hoc phi",
             "transaction_date": "2026-08-25T08:00:00+00:00", "payment_line_id": None, "team": None},
        ]
        sb = _make_fake_sb(gateway_transactions=gateway_rows, bank_transactions=bank_rows)
        result = rr._build_bc04_rows(sb, "2026-08-25", "2026-08-26", 9_000_000, None)

        assert [r["date"] for r in result["rows"]] == ["2026-08-25", "2026-08-26"]
        assert result["rows"][0]["balance"] == pytest.approx(9_500_000.0)
        assert result["rows"][1]["balance"] == pytest.approx(10_500_000.0)
        assert result["summary"]["closing_balance"] == pytest.approx(10_500_000.0)
        # Thu RMB = Input / tỷ giá kỳ (mặc định 3700 khi không có exchange_rates riêng)
        assert result["rows"][0]["rmb"] == pytest.approx(500000.0 / 3700, abs=0.01)

    def test_bank_timezone_conversion_does_not_shift_day(self):
        """transaction_date 2026-08-25T23:30:00+07:00 (giờ VN) phải được gom vào
        ngày 2026-08-25 — nếu lấy .date() thẳng từ UTC sẽ lệch sang 2026-08-25 16:30 UTC,
        vẫn cùng ngày dương lịch UTC ở case này nên dùng mốc sát nửa đêm VN để bẫy lỗi thật:
        00:30 giờ VN (17:30 UTC hôm trước) phải thuộc ngày VN kế tiếp, không phải hôm trước."""
        bank_rows = [
            {"txn_id": "b3", "amount": 200000.0, "account_number": "1680011668899",
             "match_status": "auto_matched", "content": "CK dau ngay",
             "transaction_date": "2026-08-24T17:30:00+00:00",  # = 2026-08-25 00:30 VN
             "payment_line_id": None, "team": None},
        ]
        sb = _make_fake_sb(gateway_transactions=[], bank_transactions=bank_rows)
        result = rr._build_bc04_rows(sb, "2026-08-25", "2026-08-25", 0, None)
        assert len(result["rows"]) == 1
        assert result["rows"][0]["date"] == "2026-08-25"

    def test_no_transactions_in_range_returns_empty_not_error(self):
        sb = _make_fake_sb(gateway_transactions=[], bank_transactions=[])
        result = rr._build_bc04_rows(sb, "2026-01-01", "2026-01-01", 0, None)
        assert result["rows"] == []
        assert result["days"] == []
        assert result["summary"]["closing_balance"] == 0

    def test_rows_within_same_day_ordered_chronologically_not_by_source(self):
        """Bank CK lúc 08:00 phải đứng TRƯỚC thẻ funded lúc 09:00 cùng ngày — không
        phải cứ gateway lên trước bank do sort theo 'source' (bug tiềm ẩn nếu bỏ sort_ts)."""
        gateway_rows = [
            {"id": "late", "source": "mpos", "settlement_code": None, "net_amount": 1000.0,
             "funded_date": "2026-08-26 09:00:00", "match_status": "pending", "payment_line_id": None},
        ]
        bank_rows = [
            {"txn_id": "early", "amount": 2000.0, "account_number": "1680011668899",
             "match_status": "auto_matched", "content": "CK som",
             "transaction_date": "2026-08-26T01:00:00+00:00",  # 08:00 VN
             "payment_line_id": None, "team": None},
        ]
        sb = _make_fake_sb(gateway_transactions=gateway_rows, bank_transactions=bank_rows)
        result = rr._build_bc04_rows(sb, "2026-08-26", "2026-08-26", 0, None)
        assert [r["txn_id"] for r in result["rows"]] == ["early", "late"]

    def test_exchange_rate_lookup_cached_per_date_not_per_row(self):
        """Nhiều dòng cùng ngày chỉ được gọi get_rate_for_date 1 lần cho phần tính RMB theo
        dòng (cache theo ngày) — tránh N+1 query exchange_rates khi báo cáo có nhiều giao
        dịch/ngày. +1 lần cố định khác cho summary.rate (không phụ thuộc số dòng) → tổng 2,
        không phải 5 (bằng số dòng) nếu thiếu cache."""
        gateway_rows = [
            {"id": f"g{i}", "source": "mpos", "settlement_code": None, "net_amount": 1000.0,
             "funded_date": "2026-08-26 0{}:00:00".format(i), "match_status": "pending",
             "payment_line_id": None}
            for i in range(1, 6)
        ]
        sb = _make_fake_sb(gateway_transactions=gateway_rows, bank_transactions=[])
        with patch.object(rr, "get_rate_for_date", wraps=rr.get_rate_for_date) as spy:
            result = rr._build_bc04_rows(sb, "2026-08-26", "2026-08-26", 0, None)
        assert len(result["rows"]) == 5
        assert spy.call_count == 2


class TestBc04ResponseShapeMatchesFeContract:
    """Đối chiếu đúng shape frontend/src/types/cashIn.ts (Đức đã code trước khi BE xong,
    theo shape tự đoán) — khoá lại để tránh lệch contract khi 2 bên merge."""

    def test_summary_and_days_have_all_fe_expected_fields(self):
        gateway_rows = [
            {"id": "g1", "source": "mpos", "settlement_code": None, "net_amount": 1000000.0,
             "funded_date": "2026-08-26 09:00:00", "match_status": "pending", "payment_line_id": None},
        ]
        bank_rows = [
            {"txn_id": "b1", "amount": 500000.0, "account_number": "1680011668899",
             "match_status": "auto_matched", "content": "Nguyen Van A CK hoc phi",
             "transaction_date": "2026-08-26T02:00:00+00:00", "payment_line_id": None, "team": None},
        ]
        sb = _make_fake_sb(gateway_transactions=gateway_rows, bank_transactions=bank_rows)
        result = rr._build_bc04_rows(sb, "2026-08-26", "2026-08-26", 1_000_000, None)

        summary = result["summary"]
        for key in ("total_input", "total_rmb", "opening_balance", "closing_balance", "rate"):
            assert key in summary, f"summary thiếu field '{key}' — FE cashIn.ts cần field này"
        assert summary["total_input"] == pytest.approx(1_500_000.0)
        assert summary["opening_balance"] == pytest.approx(1_000_000.0)
        assert summary["closing_balance"] == pytest.approx(2_500_000.0)
        assert summary["rate"] > 0

        assert len(result["days"]) == 1
        day = result["days"][0]
        for key in ("date", "total_input", "total_rmb", "ending_balance"):
            assert key in day, f"days[] thiếu field '{key}' — FE cashIn.ts cần field này"
        assert day["total_input"] == pytest.approx(1_500_000.0)
        assert day["ending_balance"] == pytest.approx(2_500_000.0)

        for row in result["rows"]:
            for key in ("source", "txn_id", "date", "details", "group", "output", "input",
                        "balance", "income", "expenditure", "business_line", "team", "note",
                        "rmb", "data_source", "main_cat", "detail"):
                assert key in row, f"rows[] thiếu field '{key}' — FE CashInRowRaw cần field này"
        groups = {r["source"]: r["group"] for r in result["rows"]}
        assert groups["gateway"] == "the"
        assert groups["bank"] == "khac"  # khong match payment_line_id trong fixture nay


class TestBc04BankRowTeamResolution:
    """File mẫu thật của chị Vân (越南教育管报 2026.xlsx, sheet HN BANK 26) cho thấy
    cột Team của DÒNG BANK (CK khách, data_source=HN BANK) hiện tên team sale thật
    (VD 'In-house 1') — phải join payment_line_id giống hệt dòng thẻ (spec §6 bước 3:
    'Non-card → join payment_line_id lấy sale/team'), KHÔNG dùng bank_transactions.team
    (đó là tag chi nhánh HCM/HN thủ công, thực tế 100% đang null trên sandbox)."""

    def test_matched_bank_ck_resolves_sale_team_via_payment_line(self):
        bank_rows = [
            {"txn_id": "b_matched", "amount": 1000000.0, "account_number": "1680011668899",
             "match_status": "auto_matched", "content": "Nguyen Van A CK hoc phi",
             "transaction_date": "2026-08-25T02:00:00+00:00",
             "payment_line_id": "line-1", "team": "HN"},  # cot team cu (HCM/HN) PHAI bi bo qua
        ]
        sb = _make_fake_sb(
            gateway_transactions=[],
            bank_transactions=bank_rows,
            payment_lines=[{"id": "line-1", "payment_request_id": "PR-1"}],
            payment_requests=[{"id": "PR-1", "sale_email": "sale.a@palfish.vn"}],
            nhan_su_sale=[{"email": "sale.a@palfish.vn", "team": "In-house 1", "sub_team": None}],
        )
        result = rr._build_bc04_rows(sb, "2026-08-25", "2026-08-25", 0, None)
        assert len(result["rows"]) == 1
        assert result["rows"][0]["team"] == "In-house 1"

    def test_unmatched_bank_ck_has_empty_team_not_hcm_hn_tag(self):
        """Dòng bank chưa match payment_line_id (VD rút TikTok, khoản lạ) → team rỗng,
        kể cả khi bank_transactions.team có tag HCM/HN — tag đó không còn được dùng."""
        bank_rows = [
            {"txn_id": "b_unmatched", "amount": 500000.0, "account_number": "1680011668899",
             "match_status": "pending", "content": "chuyen nham tien",
             "transaction_date": "2026-08-25T02:00:00+00:00",
             "payment_line_id": None, "team": "HCM"},
        ]
        sb = _make_fake_sb(gateway_transactions=[], bank_transactions=bank_rows)
        result = rr._build_bc04_rows(sb, "2026-08-25", "2026-08-25", 0, None)
        assert result["rows"][0]["team"] == ""


class TestBc04AnnotationOverride:
    def test_manual_annotation_overrides_auto_classification(self):
        sb = _make_fake_sb(cash_in_annotations=[
            {"source": "bank", "txn_id": "b1", "business_line": "Không tính quản báo / 不计入管报",
             "main_cat": "Chuyển nhầm / 转账错误", "note": "KH bấm nhầm, đã hoàn"},
        ])
        # Không có gateway → giữ cục bank b1 để annotation áp được
        sb.tables["gateway_transactions"] = []
        result = rr._build_bc04_rows(sb, "2026-08-25", "2026-08-25", 0, None)
        row = result["rows"][0]
        assert row["business_line"] == "Không tính quản báo / 不计入管报"
        assert row["note"] == "KH bấm nhầm, đã hoàn"


def _make_actor(email="user@test.com", role="sale", department=None, staff=None):
    from rbac import Actor
    return Actor(email=email, user_id="u1", role=role, staff=staff or {}, department=department)


class TestBc04Rbac:
    def _client(self, sb: FakeSB):
        app = FastAPI()
        rr.register_report_routes(app, lambda: sb)
        return TestClient(app)

    def test_sale_department_gets_403(self):
        sb = _make_fake_sb()
        client = self._client(sb)
        with patch.object(rr, "resolve_actor", return_value=_make_actor(department="sale")):
            resp = client.get("/reports/cash-in", params={"from": "2026-08-25", "to": "2026-08-25"})
        assert resp.status_code == 403

    def test_hr_department_gets_200(self):
        sb = _make_fake_sb()
        client = self._client(sb)
        with patch.object(rr, "resolve_actor", return_value=_make_actor(department="hr")):
            resp = client.get("/reports/cash-in", params={"from": "2026-08-25", "to": "2026-08-25"})
        assert resp.status_code == 200
        assert resp.json()["summary"]["total_input"] == pytest.approx(60732000.0)

    def test_marketing_department_put_annotation_gets_403(self):
        """marketing = 'none' trên bc04 → cả read lẫn write đều bị chặn."""
        sb = _make_fake_sb()
        client = self._client(sb)
        with patch.object(rr, "resolve_actor", return_value=_make_actor(department="marketing")):
            resp = client.put(
                "/reports/cash-in/bank/b1/annotation",
                json={"note": "test"},
            )
        assert resp.status_code == 403

    def test_hr_put_annotation_persists_and_audits(self):
        sb = _make_fake_sb()
        client = self._client(sb)
        with patch.object(rr, "resolve_actor", return_value=_make_actor(email="van@test.com", department="hr")):
            resp = client.put(
                "/reports/cash-in/bank/b1/annotation",
                json={"business_line": "Giáo dục / 教育", "main_cat": "Doanh thu / 收入", "note": "ok"},
            )
        assert resp.status_code == 200
        saved = sb.tables["cash_in_annotations"]
        assert len(saved) == 1
        assert saved[0]["note"] == "ok"
        assert saved[0]["updated_by_email"] == "van@test.com"
        assert len(sb.tables["audit_logs"]) == 1
        assert sb.tables["audit_logs"][0]["action"] == "cash_in_annotation_update"
