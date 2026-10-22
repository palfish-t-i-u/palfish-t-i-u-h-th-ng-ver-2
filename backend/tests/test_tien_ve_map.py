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

from activation_routes import _bank_vn_date, _funded_vn_date, _pair_course_dates, _tien_ve_map


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
            {"id": "AR1", "pr_id": "PR1",   # thẻ/trả góp
             "uids_data": [{"courses": [{"code": "C1", "amount": 1000}]}]},
            {"id": "AR2", "pr_id": "PR2",   # CK
             "uids_data": [{"courses": [{"code": "C2", "amount": 1000}]}]},
            {"id": "AR3", "pr_id": "PR3",   # không có line → fallback Sổ
             "uids_data": [{"courses": [{"code": "C3", "amount": 1000}]}]},
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
            {"note": "AR AR3", "ma_don_hang": "C3", "ngay_tien_ve": "2026-08-30"},
        ],
    })


def test_tien_ve_map_the_lay_ngay_funded():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # thẻ/trả góp → ngày tiền về TK (funded), KHÔNG phải ngày quẹt — per-course
    assert out["AR1"] == {"C1": ("2026-09-03", "2026-09-03")}


def test_tien_ve_map_ck_lay_ngay_bank_gio_vn():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # CK → transaction_date đổi giờ VN (+7) = 09-03 — per-course
    assert out["AR2"] == {"C2": ("2026-09-03", "2026-09-03")}


def test_tien_ve_map_fallback_so_khi_khong_co_giao_dich():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # AR3 không có payment_line khớp → fallback ngày Sổ (per-course theo ma_don_hang)
    assert out["AR3"] == {"C3": ("2026-08-30", "2026-08-30")}


def test_tien_ve_map_empty_input():
    assert _tien_ve_map(_fake_sb(), []) == {}


# ---------------------------------------------------------------------------
# _pair_course_dates — ghép line↔khoá per-bé (thuần, không I/O)
# ---------------------------------------------------------------------------

def test_pair_2_be_2_ngay_tach_rieng():
    # Ca PR-2309: 2 bé, 2 line 2 ngày → mỗi bé ngày RIÊNG (sớm=muộn). Dates chưa sort.
    out = _pair_course_dates([("C1", 1000.0), ("C2", 1000.0)], ["2026-10-09", "2026-10-08"])
    assert out == {"C1": ("2026-10-08", "2026-10-08"), "C2": ("2026-10-09", "2026-10-09")}


def test_pair_1_khoa_nhieu_line_giu_range():
    # Tín dụng/cọc: 1 khoá, 2 ngày → giữ (min, max) — KHÔNG regression.
    out = _pair_course_dates([("C1", 35000.0)], ["2026-08-21", "2026-09-03"])
    assert out == {"C1": ("2026-08-21", "2026-09-03")}


def test_pair_lech_so_line_khoa_fallback():
    # 2 khoá nhưng chỉ 1 ngày (1 bé chưa tiền về) → fallback (min,max) cả 2.
    out = _pair_course_dates([("C1", 1000.0), ("C2", 1000.0)], ["2026-10-08"])
    assert out == {"C1": ("2026-10-08", "2026-10-08"), "C2": ("2026-10-08", "2026-10-08")}


def test_pair_co_khoa_0d_fallback():
    # 2 khoá paying + 1 khoá 0đ refer, 2 ngày → paying(2) != courses(3) → fallback cả 3.
    out = _pair_course_dates(
        [("C1", 1000.0), ("C2", 1000.0), ("CR", 0.0)], ["2026-10-08", "2026-10-09"]
    )
    assert out == {
        "C1": ("2026-10-08", "2026-10-09"),
        "C2": ("2026-10-08", "2026-10-09"),
        "CR": ("2026-10-08", "2026-10-09"),
    }


def test_pair_khong_ngay():
    out = _pair_course_dates([("C1", 1000.0)], [])
    assert out == {"C1": (None, None)}
