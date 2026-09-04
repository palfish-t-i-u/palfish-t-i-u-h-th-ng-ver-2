"""_tien_ve_map — ngày tiền về L8 lấy từ giao dịch cổng/bank ĐÃ KHỚP (giữ ngày quẹt).

Bối cảnh: màn Tạo gói học (B3) trước lấy ngày tiền về từ so_doanh_thu (Sổ lên trễ) →
AR chưa có dòng Sổ bị mất ngày → bị lọc khỏi tab. Đổi nguồn sang gateway/bank đã khớp:
- thẻ/trả góp = ngày quẹt (paid_at ép UTC = đúng ngay_tien_ve C-T1 dập vào Sổ)
- CK = transaction_date (giờ VN)
- AR không khớp → fallback ngày Sổ (không hồi quy).

Rủi ro cao nhất = bẫy timezone (double-shift). Test 2 helper thuần + map tổng hợp.
Xem docs/learnings/2026-08-08-ct1-ngay-tien-ve-don-the-paid-at-utc.md.
"""
from __future__ import annotations

from activation_routes import _bank_vn_date, _swipe_utc_date, _tien_ve_map


# ---------------------------------------------------------------------------
# Helper thuần — bẫy timezone
# ---------------------------------------------------------------------------

def test_swipe_utc_date_tzaware_utc():
    assert _swipe_utc_date("2026-09-02T18:00:00+00:00") == "2026-09-02"


def test_swipe_utc_date_naive_khong_double_shift():
    # naive (không tzinfo) giữ nguyên — KHÔNG coi là VN rồi dịch (double-shift 23h→hôm sau)
    assert _swipe_utc_date("2026-09-02T23:30:00") == "2026-09-02"


def test_swipe_utc_date_tzaware_vn_ep_ve_utc():
    # quẹt 02:00 giờ VN (+7) = 19:00 UTC hôm trước → ngày quẹt (UTC) = 09-02
    assert _swipe_utc_date("2026-09-03T02:00:00+07:00") == "2026-09-02"


def test_swipe_utc_date_empty():
    assert _swipe_utc_date(None) is None
    assert _swipe_utc_date("") is None
    assert _swipe_utc_date("rác-không-parse-được") is None


def test_bank_vn_date_doi_gio_vn():
    # 18:00 UTC + 7 = 01:00 VN hôm sau → ngày tiền về VN = 09-03
    assert _bank_vn_date("2026-09-02T18:00:00+00:00") == "2026-09-03"


def test_bank_vn_date_empty():
    assert _bank_vn_date(None) is None
    assert _bank_vn_date("") is None


# ---------------------------------------------------------------------------
# _tien_ve_map — tổng hợp: thẻ (gateway), CK (bank), fallback Sổ
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
            {"id": "AR1", "pr_id": "PR1"},   # thẻ
            {"id": "AR2", "pr_id": "PR2"},   # CK
            {"id": "AR3", "pr_id": "PR3"},   # không có line → fallback Sổ
        ],
        "payment_lines": [
            {"id": "L1", "payment_request_id": "PR1", "method": "card"},
            {"id": "L2", "payment_request_id": "PR2", "method": "bank"},
        ],
        "gateway_transactions": [
            {"payment_line_id": "L1", "paid_at": "2026-09-02T18:00:00+00:00"},
        ],
        "bank_transactions": [
            {"payment_line_id": "L2", "transaction_date": "2026-09-02T18:00:00+00:00"},
        ],
        "so_doanh_thu": [
            {"note": "AR AR3", "ngay_tien_ve": "2026-08-30"},
        ],
    })


def test_tien_ve_map_the_lay_ngay_quet():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # thẻ → ngày quẹt UTC
    assert out["AR1"] == ("2026-09-02", "2026-09-02")


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
