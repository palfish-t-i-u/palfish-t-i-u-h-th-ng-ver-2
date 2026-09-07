"""Bảng quy đổi tên SP hóa đơn — mã gói nội bộ -> "Khóa học tiếng Anh N tháng/buổi".

Chuẩn = cột "Số tháng đúng" chị Thu Hiền điền (bản cuối SM sửa 2026-09-07).
Xem docs/plans/PLAN_TEN_SP_HOA_DON_2026-09-07.md +
palfish-internal-notes/invoice-ten-sp-thang-2026-09-06.md.
"""
from __future__ import annotations

import pytest

from course_invoice_name import course_invoice_name

PHI = "Philippines"
AM = "Âu Mỹ"


def _name(value: str, teacher: str) -> str:
    return f"Khóa học tiếng Anh {value} giáo viên {teacher}"


@pytest.mark.parametrize(
    "raw,expected",
    [
        # ── 2/W: buổi ÷ 8 -> tháng (2 chữ số) ──────────────────────────────
        ("2/W- NEW 24 PHI+2 HN", _name("03 tháng", PHI)),
        ("2/W- NEW 24 US-UK+1 HN", _name("03 tháng", AM)),
        ("2/W- NEW 32 US-UK+2 HN", _name("04 tháng", AM)),
        ("2/W- NEW 48 PHI+5 HCM", _name("06 tháng", PHI)),
        ("2/W- NEW 72 PHI+7", _name("09 tháng", PHI)),
        ("2/W- NEW 72 US-UK+5", _name("09 tháng", AM)),
        ("2/W- NEW 96 PHI+10 HN", _name("12 tháng", PHI)),
        ("2/W- NEW 144 PHI+15 HN", _name("18 tháng", PHI)),
        ("2/W- NEW 192 PHI+20 HN", _name("24 tháng", PHI)),
        # NEW/UPSALE/REFER/Both AB/Only A + HN/HCM đều bị bỏ qua, ra cùng tên
        ("2/W- UPSALE 48 PHI+5 HN", _name("06 tháng", PHI)),
        ("2/W- Both AB (A-PH) REFER 32 PHI+3", _name("04 tháng", PHI)),
        ("2/W- Only A REFER 24 PHI+2 HN", _name("03 tháng", PHI)),
        # ── 3/W: buổi ÷ 12 -> tháng ─────────────────────────────────────────
        ("3/W - NEW 24 PHI+2+2 HN", _name("02 tháng", PHI)),
        ("3/W - NEW 96 PHI+10+10 HN", _name("08 tháng", PHI)),
        ("3/W- COMBO 48 US-UK+2 HN", _name("04 tháng", AM)),
        ("3/W- UPSALE 120 US-UK+6 HN", _name("10 tháng", AM)),
        # ── 12/M: theo đúng ô chị điền (60 -> "05 tháng"; còn lại -> "N buổi") ──
        ("12/M - NEW 30 PHI+10 HN", _name("30 buổi", PHI)),
        ("12/M - NEW 60 PHI+20 HN", _name("05 tháng", PHI)),
        ("12/M - Both AB REFER 60 PHI +20 HN", _name("05 tháng", PHI)),
        ("12/M - NEW 90 PHI+30 HN", _name("90 buổi", PHI)),
        ("12/M - NEW 120 PHI+40 HN", _name("120 buổi", PHI)),
        ("12/M - NEW 150 PHI+50 HN", _name("150 buổi", PHI)),
        # ── 8/M: bản cuối SM sửa -> tất cả "N buổi" ─────────────────────────
        ("8/M - NEW 30 US-UK+5 HN", _name("30 buổi", AM)),
        ("8/M - NEW 60 US-UK+10 HN", _name("60 buổi", AM)),
        ("8/M - NEW 120 US-UK+20 HN", _name("120 buổi", AM)),
    ],
)
def test_course_invoice_name_maps_known_packages(raw, expected):
    assert course_invoice_name(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "5/W- VIP 96 US-UK+5 HN",  # không bán nữa, ngoài bảng
        "2/W- NEW 24 buoi",        # thiếu tag giáo viên
        "Gói tự gõ linh tinh",     # free text
        "",
    ],
)
def test_course_invoice_name_returns_empty_when_not_in_table(raw):
    """Gói ngoài bảng -> "" để caller (_course_to_tax_order) fallback về tên gói thô."""
    assert course_invoice_name(raw) == ""
