"""_tien_ve_map — 2 cột "tiền về sớm/muộn nhất" ở B3, lấy từ giao dịch cổng/bank ĐÃ KHỚP.

Nghĩa 2 cột (anh Minh + chị Sương Mai 9/10, chốt lại 23/10):
- SỚM  = ngày GIAO DỊCH làm bé đủ tiền = ngày doanh thu → kế toán lọc cột này để
  xuất HĐ ("doanh thu ngày nào xuất HĐ ngày đó"). CK: ngày bank theo luật 22h
  (ky_tu_gio_thuc); thẻ: ngày quẹt (paid_at ép UTC). Khớp All File chị Hiền.
- MUỘN = ngày tiền về TK (CK: ngày bank giờ VN; thẻ: funded_date naive VN → CHỈ ::date)
  → đối soát sao kê / cục settlement tín dụng.
- AR không khớp → fallback ngày Sổ (không hồi quy).

Rủi ro cao nhất = bẫy timezone. funded_date là 'timestamp without time zone' (giờ VN
naive) → KHÔNG được đổi timezone; bank transaction_date là timestamptz → PHẢI đổi VN;
paid_at cổng → ép UTC. Xem docs/learnings/timestamp-vs-date-funded-date-gateway.md,
2026-08-08-ct1-ngay-tien-ve-don-the-paid-at-utc.md.
"""
from __future__ import annotations

from activation_routes import (
    _bank_revenue_date,
    _bank_vn_date,
    _funded_vn_date,
    _pair_course_dates,
    _swipe_vn_date,
    _tien_ve_map,
)


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


def test_bank_revenue_date_luat_22h():
    # 15:35 UTC = 22:35 VN ngày 20/10 → doanh thu tính 21/10 (luật Thu Hiền)
    assert _bank_revenue_date("2026-10-20T15:35:00+00:00") == "2026-10-21"
    # 10:19 UTC = 17:19 VN → giữ ngày
    assert _bank_revenue_date("2026-10-22T10:19:00+00:00") == "2026-10-22"
    # ngày cuối tháng 22h–24h giữ nguyên tháng đó
    assert _bank_revenue_date("2026-10-31T16:00:00+00:00") == "2026-10-31"
    assert _bank_revenue_date(None) is None


def test_swipe_vn_date_ep_utc():
    # paid_at cổng = timestamptz UTC → (paid_at AT TIME ZONE 'UTC')::date, KHÔNG +7
    assert _swipe_vn_date("2026-08-26T20:36:00+00:00") == "2026-08-26"
    assert _swipe_vn_date(None) is None


# ---------------------------------------------------------------------------
# _tien_ve_map — tổng hợp: thẻ (quẹt + funded), CK (bank), fallback Sổ
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
            {"id": "L1", "payment_request_id": "PR1", "method": "installment", "amount": 1000},
            {"id": "L2", "payment_request_id": "PR2", "method": "bank", "amount": 1000},
        ],
        "gateway_transactions": [
            # quẹt 28/08, tiền về TK (funded) 03/09
            {"payment_line_id": "L1", "paid_at": "2026-08-28T10:00:00+00:00",
             "funded_date": "2026-09-03T00:00:00"},
        ],
        "bank_transactions": [
            {"payment_line_id": "L2", "transaction_date": "2026-09-02T18:00:00+00:00"},
        ],
        "so_doanh_thu": [
            {"note": "AR AR3", "ma_don_hang": "C3", "ngay_tien_ve": "2026-08-30"},
        ],
    })


def test_tien_ve_map_the_som_la_ngay_quet_muon_la_funded():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # thẻ/trả góp: sớm = ngày quẹt (ngày doanh thu), muộn = ngày tiền về TK
    assert out["AR1"] == {"C1": ("2026-08-28", "2026-09-03")}


def test_tien_ve_map_ck_lay_ngay_bank_gio_vn():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # CK → transaction_date đổi giờ VN (+7) = 09-03 (01:00 VN, không dính luật 22h)
    assert out["AR2"] == {"C2": ("2026-09-03", "2026-09-03")}


def test_tien_ve_map_fallback_so_khi_khong_co_giao_dich():
    out = _tien_ve_map(_fake_sb(), ["AR1", "AR2", "AR3"])
    # AR3 không có payment_line khớp → fallback ngày Sổ (per-course theo ma_don_hang)
    assert out["AR3"] == {"C3": ("2026-08-30", "2026-08-30")}


def test_tien_ve_map_empty_input():
    assert _tien_ve_map(_fake_sb(), []) == {}


# ---------------------------------------------------------------------------
# _pair_course_dates — đổ tiền line→khoá theo số tiền (thuần, không I/O)
# line = (ngày giao dịch, ngày tiền về TK, số tiền)
# ---------------------------------------------------------------------------

def _ck(d, amt):
    """Line CK: ngày giao dịch = ngày tiền về TK."""
    return (d, d, float(amt))


def test_pair_pr2309_moi_line_dung_tien_1_be():
    # Ca PR-2309: 2 bé, mỗi line đúng tiền 1 bé → mỗi bé ngày RIÊNG. Line chưa sort.
    out = _pair_course_dates(
        [("C1", 17_820_000.0), ("C2", 17_820_000.0)],
        [_ck("2026-10-09", 17_820_000), _ck("2026-10-08", 17_820_000)],
    )
    assert out == {"C1": ("2026-10-08", "2026-10-08"), "C2": ("2026-10-09", "2026-10-09")}


def test_pair_coc_2_be_pr2548():
    # PR-2548: cọc 5tr 20/10 + 29,98tr 22/10, 2 bé × 17,49tr → cả 2 bé đủ tiền 22/10.
    # Sớm của bé 1 = 22/10 (KHÔNG phải ngày cọc 20/10) → chị Mai lọc sớm=22/10 ra đủ 2 bé.
    out = _pair_course_dates(
        [("CC-2548-001", 17_490_000.0), ("CC-2548-002", 17_490_000.0)],
        [_ck("2026-10-20", 5_000_000), _ck("2026-10-22", 29_980_000)],
    )
    assert out == {
        "CC-2548-001": ("2026-10-22", "2026-10-22"),
        "CC-2548-002": ("2026-10-22", "2026-10-22"),
    }


def test_pair_nhieu_dot_coc():
    # 5tr/5tr/5tr/10tr/9,98tr cho 2 bé × 17,49tr: bé 1 đủ ở đợt 4, bé 2 đủ ở đợt 5.
    out = _pair_course_dates(
        [("C1", 17_490_000.0), ("C2", 17_490_000.0)],
        [
            _ck("2026-10-15", 5_000_000),
            _ck("2026-10-17", 5_000_000),
            _ck("2026-10-19", 5_000_000),
            _ck("2026-10-20", 10_000_000),
            _ck("2026-10-22", 9_980_000),
        ],
    )
    assert out == {"C1": ("2026-10-20", "2026-10-20"), "C2": ("2026-10-22", "2026-10-22")}


def test_pair_3_be_coc_pr1383():
    # PR-1383: cọc 3tr 29/8 + 50,46tr 31/8, 3 bé × 17,82tr → cả 3 đủ tiền 31/8 (khớp All File).
    out = _pair_course_dates(
        [("C1", 17_820_000.0), ("C2", 17_820_000.0), ("C3", 17_820_000.0)],
        [_ck("2026-08-29", 3_000_000), _ck("2026-08-31", 50_460_000)],
    )
    assert out == {c: ("2026-08-31", "2026-08-31") for c in ("C1", "C2", "C3")}


def test_pair_the_quet_khac_ngay_tien_ve():
    # Đơn thẻ: quẹt 01/09, tiền về TK 03/09 → sớm 01/09 (doanh thu), muộn 03/09 (sao kê).
    out = _pair_course_dates([("C1", 15_000_000.0)], [("2026-09-01", "2026-09-03", 15_000_000.0)])
    assert out == {"C1": ("2026-09-01", "2026-09-03")}


def test_pair_coc_ck_cong_the():
    # Cọc CK 2tr 21/08 + quẹt thẻ 13tr 01/09 (về TK 03/09), 1 bé 15tr:
    # sớm = ngày quẹt làm đủ tiền, muộn = ngày tiền về TK muộn nhất.
    out = _pair_course_dates(
        [("C1", 15_000_000.0)],
        [_ck("2026-08-21", 2_000_000), ("2026-09-01", "2026-09-03", 13_000_000.0)],
    )
    assert out == {"C1": ("2026-09-01", "2026-09-03")}


def test_pair_the_chua_co_funded_lay_ngay_quet():
    out = _pair_course_dates([("C1", 1000.0)], [("2026-09-01", None, 1000.0)])
    assert out == {"C1": ("2026-09-01", "2026-09-01")}


def test_pair_thieu_trong_nguong_2pct():
    # Thiếu 1% (phí cổng) → bé cuối vẫn coi là đủ ở lần cuối.
    out = _pair_course_dates(
        [("C1", 1_000_000.0), ("C2", 1_000_000.0)],
        [_ck("2026-10-08", 1_000_000), _ck("2026-10-09", 980_000)],
    )
    assert out == {"C1": ("2026-10-08", "2026-10-08"), "C2": ("2026-10-09", "2026-10-09")}


def test_pair_thieu_qua_nguong_fallback():
    # 2 khoá nhưng mới về tiền 1 bé (thiếu 50%) → bé đầy giữ ngày riêng, bé chưa đầy
    # nhận (min,max) cả PR, không mất ngày.
    out = _pair_course_dates([("C1", 1000.0), ("C2", 1000.0)], [_ck("2026-10-08", 1000)])
    assert out == {"C1": ("2026-10-08", "2026-10-08"), "C2": ("2026-10-08", "2026-10-08")}


def test_pair_khoa_0d():
    # Khoá 0đ refer → (min,max) cả PR; khoá có tiền vẫn đổ dần.
    out = _pair_course_dates(
        [("C1", 1000.0), ("CR", 0.0), ("C2", 1000.0)],
        [_ck("2026-10-08", 1000), _ck("2026-10-09", 1000)],
    )
    assert out == {
        "C1": ("2026-10-08", "2026-10-08"),
        "CR": ("2026-10-08", "2026-10-09"),
        "C2": ("2026-10-09", "2026-10-09"),
    }


def test_pair_tra_du_trong_nguong_bo_qua_phan_du():
    # Dư 1% (làm tròn) → vẫn đổ dần, phần dư bỏ qua: bé đủ ngay line đầu.
    out = _pair_course_dates([("C1", 1000.0)], [_ck("2026-10-08", 1000), _ck("2026-10-09", 10)])
    assert out == {"C1": ("2026-10-08", "2026-10-08")}


def test_pair_pr_chia_nhieu_ar_fallback():
    # PR có 2 AR: line 17tr 08/10 của AR1, line 17tr 09/10 của AR2. Gọi cho AR2 (1 khoá)
    # thấy tiền PR dư gấp đôi → KHÔNG đổ từ 0 (sẽ lấy tiền AR1 → 08/10 sai), fallback (min,max).
    out = _pair_course_dates(
        [("K2", 17_000_000.0)],
        [_ck("2026-10-08", 17_000_000), _ck("2026-10-09", 17_000_000)],
    )
    assert out == {"K2": ("2026-10-08", "2026-10-09")}


def test_pair_khong_ngay():
    out = _pair_course_dates([("C1", 1000.0)], [])
    assert out == {"C1": (None, None)}


def test_tien_ve_map_coc_2_be_end_to_end():
    # _tien_ve_map ráp line.amount + ngày bank → đổ tiền per-bé (PR-2548). Line cọc
    # 22:35 VN 20/10 dính luật 22h nhưng không làm bé nào đủ tiền → không ảnh hưởng.
    sb = _FakeSB({
        "active_requests": [
            {"id": "AR9", "pr_id": "PR9", "uids_data": [
                {"courses": [{"code": "K1", "amount": 17_490_000}]},
                {"courses": [{"code": "K2", "amount": 17_490_000}]},
            ]},
        ],
        "payment_lines": [
            {"id": "LA", "payment_request_id": "PR9", "method": "qr", "amount": 5_000_000},
            {"id": "LB", "payment_request_id": "PR9", "method": "qr", "amount": 29_980_000},
        ],
        "gateway_transactions": [],
        "bank_transactions": [
            {"payment_line_id": "LA", "transaction_date": "2026-10-20T15:35:00+00:00"},
            {"payment_line_id": "LB", "transaction_date": "2026-10-22T10:19:00+00:00"},
        ],
        "so_doanh_thu": [],
    })
    out = _tien_ve_map(sb, ["AR9"])
    assert out["AR9"] == {"K1": ("2026-10-22", "2026-10-22"), "K2": ("2026-10-22", "2026-10-22")}
