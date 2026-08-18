from __future__ import annotations
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from leads_routes import _normalize_phone9, _sort_leads


def test_normalize_phone9_formats():
    assert _normalize_phone9("0912 345 678") == "912345678"
    assert _normalize_phone9("+84 912 345 678") == "912345678"
    assert _normalize_phone9("84-912345678") == "912345678"
    assert _normalize_phone9("(091) 234-5678") == "912345678"
    assert _normalize_phone9("12345678") is None          # <9 số
    assert _normalize_phone9("") is None


def test_sort_leads_order_matches_gmv_new():
    # ⚠️ EXPECTED = ['d','a','c','b'] — KHÔNG phải ['d','c','a','b'].
    # ORDER BY doc Hiếu §7: (has_date, same_ec, date DESC) — same_ec ƯU TIÊN HƠN date.
    # → a (cùng EC1, ngày cũ hơn) PHẢI đứng TRƯỚC c (khác EC9, ngày mới hơn).
    # Nếu test fail ở đây: SỬA test cho khớp, TUYỆT ĐỐI KHÔNG sửa _sort_leads
    leads = [
        {"lead_id": "a", "lead_date": "2026-07-01", "ec": "EC1"},   # cùng EC, ngày cũ
        {"lead_id": "b", "lead_date": None,          "ec": "EC1"},   # NULL → cuối
        {"lead_id": "c", "lead_date": "2026-08-01", "ec": "EC9"},   # khác EC, ngày mới
        {"lead_id": "d", "lead_date": "2026-08-01", "ec": "EC1"},   # cùng EC, ngày mới → đầu
    ]
    out = _sort_leads(leads, ec_sale="EC1")
    assert [l["lead_id"] for l in out] == ["d", "a", "c", "b"]


def test_sort_leads_no_ec_falls_back_to_date_desc():
    leads = [
        {"lead_id": "x", "lead_date": "2026-06-01", "ec": "E"},
        {"lead_id": "y", "lead_date": "2026-09-01", "ec": "E"},
    ]
    out = _sort_leads(leads, ec_sale=None)
    assert [l["lead_id"] for l in out] == ["y", "x"]
