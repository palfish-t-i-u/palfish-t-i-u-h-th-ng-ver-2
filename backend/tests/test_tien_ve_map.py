"""_tien_ve_map — ngày tiền về L8 lấy từ giao dịch cổng/bank ĐÃ KHỚP.

Màn Tạo gói học (B3) là công cụ đối soát xuất HĐ theo sao kê ngân hàng, nên ngày
"tiền về" = ngày tiền THỰC về TK:
- thẻ/trả góp = gateway_transactions.funded_date (naive VN → CHỈ ::date)
- CK = bank_transactions.transaction_date (timestamptz → giờ VN)
- AR không khớp → fallback ngày Sổ (không hồi quy).
Doanh thu (Sổ/BC02) vẫn = ngày quẹt — KHÁI NIỆM KHÁC, cố ý lệch (như BC04 vs BC02).

Rủi ro cao nhất = bẫy timezone. funded_date là 'timestamp without time zone' (giờ VN
naive) → KHÔNG được đổi timezone; bank transaction_date là timestamptz → PHẢI đổi VN.
Xem docs/learnings/timestamp-vs-date-funded-date-gateway.md.
"""
from __future__ import annotations

from activation_routes import _bank_vn_date, _funded_vn_date, _tien_ve_map


# ---------------------------------------------------------------------------
# Helper thuần — bẫy timezone
# ---------------------------------------------------------------------------

def test_funded_vn_date_naive_giu_nguyen_ngay():
    # funded_date naive (giờ VN) → CHỈ lấy date, KHÔNG đổi tz
    assert _funded_vn_date("2026-09-03T00:00:00") == "2026-09-03"
    assert _funded_vn_date("2026-09-03T23:30:00") == "2026-09-03"


def test_funded_vn_date_chi_co_ngay():
    assert _funded_vn_date("2026-09-03") == "2026-09-03"


def test_funded_vn_date_empty():
    assert _funded_vn_date(None) is None
    assert _funded_vn_date("") is None
    assert _funded_vn_date("rác-không-parse-được") is None


def test_bank_vn_date_doi_gio_vn():
    # 18:00 UTC + 7 = 01:00 VN hôm sau → ngày tiền về VN = 09-03
    assert _bank_vn_date("2026-09-02T18:00:00+00:00") == "2026-09-03"


def test_bank_vn_date_empty():
    assert _bank_vn_date(None) is None
    assert _bank_vn_date("") is None


# ---------------------------------------------------------------------------
# _tien_ve_map — tổng hợp: thẻ (gateway.funded_date), CK (bank), fallback Sổ
# ---------------------------------------------------------------------------

class _FakeQuery:
    """Chain Supabase giả — bỏ qua mọi filter, execute() trả canned rows theo bảng."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def execute(self):
        return type("Res", (), {"data": list(self._rows)})()


class _FakeSB:
    def __init__(self, data):
        self._data = data

    def table(self, name):
        return _FakeQuery(self._data.get(name, []))


def _fake_sb():
    return _FakeSB({
        "active_requests": [
            {"id": "AR1", "pr_id": "PR1"},   # thẻ/trả góp
            {"id": "AR2", "pr_id": "PR2"},   # CK
            {"id": "AR3", "pr_id": "PR3"},   # không có line → fallback Sổ
        ],
        "payment_lines": [
            {"id": "L1", "payment_request_id": "PR1", "method": "installment"},
            {"id": "L2", "payment_request_id": "PR2", "method": "bank"},
        ],
        "gateway_transactions": [
            # quẹt 28/08 nhưng tiền về TK (funded) 03/09 → B3 phải hiện 03/09
            {"payment_line_id": "L1", "funded_date": "2026-09-03T00:00:00"},
        ],
        "bank_transactions": [
            {"payment_line_id": "L2", "transaction_date": "2026-09-02T18:00:00+00:00"},
        ],
        "so_doanh_thu": [
            {"note": "AR AR3", "ngay_tien_ve": "2026-08-30"},
        ],
    })


def test_tien_ve_map_the_lay_ngay_funded():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # thẻ/trả góp → ngày tiền về TK (funded), KHÔNG phải ngày quẹt
    assert out["AR1"] == ("2026-09-03", "2026-09-03")


def test_tien_ve_map_ck_lay_ngay_bank_gio_vn():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # CK → transaction_date đổi giờ VN (+7) = 09-03
    assert out["AR2"] == ("2026-09-03", "2026-09-03")


def test_tien_ve_map_fallback_so_khi_khong_co_giao_dich():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # AR3 không có payment_line khớp → fallback ngày Sổ
    assert out["AR3"] == ("2026-08-30", "2026-08-30")


def test_tien_ve_map_empty_input():
    assert _tien_ve_map(_fake_sb(), []) == {}
