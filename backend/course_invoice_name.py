"""Đổi mã gói học nội bộ -> tên sản phẩm dễ đọc để in trên hóa đơn.

CHUẨN DUY NHẤT = cột "Số tháng đúng (chị Thu Hiền xác nhận)" — bản cuối chị SM
sửa 2026-09-07. Encode đúng ô chị điền, KHÔNG suy diễn công thức ÷8/÷12
(2/W & 3/W ra "NN tháng"; các gói /M phần lớn ra "N buổi").

Tách module riêng (chỉ phụ thuộc `re`) để test độc lập, không kéo theo app import.
Nguồn: palfish-internal-notes/invoice-ten-sp-thang-2026-09-06.md
       docs/plans/PLAN_TEN_SP_HOA_DON_2026-09-07.md
"""
from __future__ import annotations

import re

# key = (họ gói, số buổi TRẢ PHÍ) -> giá trị ghi trên hóa đơn ("NN tháng" | "N buổi").
_INVOICE_NAME_TABLE: dict[tuple[str, int], str] = {
    ("2/W", 24): "03 tháng", ("2/W", 32): "04 tháng", ("2/W", 48): "06 tháng",
    ("2/W", 72): "09 tháng", ("2/W", 96): "12 tháng", ("2/W", 144): "18 tháng",
    ("2/W", 192): "24 tháng",
    ("3/W", 24): "02 tháng", ("3/W", 48): "04 tháng", ("3/W", 96): "08 tháng",
    ("3/W", 120): "10 tháng",
    ("12/M", 30): "30 buổi", ("12/M", 60): "05 tháng", ("12/M", 90): "90 buổi",
    ("12/M", 120): "120 buổi", ("12/M", 150): "150 buổi",
    ("8/M", 30): "30 buổi", ("8/M", 60): "60 buổi", ("8/M", 120): "120 buổi",
}
_INVOICE_TEACHER_LABEL = {"PHI": "Philippines", "US-UK": "Âu Mỹ"}


def course_invoice_name(raw: str) -> str:
    """Mã gói nội bộ (vd "2/W- NEW 24 PHI+2 HN") -> "Khóa học tiếng Anh 03 tháng
    giáo viên Philippines". Bỏ qua NEW/UPSALE/REFER/Both AB/Only A, +buổi tặng, HN/HCM.

    Trả "" nếu không tra được (gói ngoài bảng / free text) để caller fallback tên thô.
    """
    text = (raw or "").upper()
    fam = re.match(r"\s*(\d+/[WM])", text)
    tea = re.search(r"(\d+)\s*(PHI|US-UK)", text)
    if not fam or not tea:
        return ""
    value = _INVOICE_NAME_TABLE.get((fam.group(1), int(tea.group(1))))
    teacher = _INVOICE_TEACHER_LABEL.get(tea.group(2))
    if not value or not teacher:
        return ""
    return f"Khóa học tiếng Anh {value} giáo viên {teacher}"
