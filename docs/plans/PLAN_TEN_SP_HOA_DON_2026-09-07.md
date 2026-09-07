# PLAN — Đổi tên sản phẩm trên hóa đơn (mã gói nội bộ → "Khóa học N tháng/buổi")

> Ngày: 2026-09-07 · Dự án: `gmv` (palfish-gmv-reconciliation-v2)
> Nguồn duyệt: `palfish-internal-notes/invoice-ten-sp-thang-2026-09-06.md`
> Yêu cầu: chị Sương Mai · Điền + duyệt bảng: chị Thu Hiền (kế toán)
> **Chuẩn duy nhất = cột "Số tháng đúng (chị Thu Hiền xác nhận)".** Bỏ qua cột "Minh hiểu" + tranh luận công thức ÷8/÷12.

> ✅ Bảng bản cuối (2026-09-07, SM đã sửa 3 ô /M → "N buổi"). Số liệu dưới là chuẩn.

## Bối cảnh 1 dòng

Cột "Tên sản phẩm" khi xuất HĐ B4 đang in nguyên mã gói nội bộ (`2/W- NEW 24 PHI+2 HN`). Đổi thành: **`Khóa học tiếng Anh <NN tháng | N buổi> giáo viên <Philippines | Âu Mỹ>`**, tra theo đúng bảng chị Hiền.

## Approach (BE-only)

**1. Thêm bảng tra + hàm quy đổi** trong `backend/activation_routes.py`, đặt ngay TRƯỚC `_course_to_tax_order` (hiện dòng 2132). `re` đã import (dòng 12).

```python
# ── Tên SP hóa đơn: mã gói nội bộ -> tên dễ đọc ─────────────────────────────
# CHUẨN = cột "Số tháng đúng" chị Thu Hiền điền (palfish-internal-notes/
# invoice-ten-sp-thang-2026-09-06.md). key = (họ gói, số buổi TRẢ PHÍ) -> giá trị
# ghi: "NN tháng" (2 chữ số) khi chẵn, ngược lại ghi thẳng "N buổi" (đúng như chị điền).
_INVOICE_NAME_TABLE: dict[tuple[str, int], str] = {
    ("2/W", 24): "03 tháng", ("2/W", 32): "04 tháng", ("2/W", 48): "06 tháng",
    ("2/W", 72): "09 tháng", ("2/W", 96): "12 tháng", ("2/W", 144): "18 tháng",
    ("2/W", 192): "24 tháng",
    ("3/W", 24): "02 tháng", ("3/W", 48): "04 tháng", ("3/W", 96): "08 tháng",
    ("3/W", 120): "10 tháng",
    ("12/M", 30): "30 buổi", ("12/M", 60): "05 tháng", ("12/M", 90): "90 buổi",
    ("12/M", 120): "120 buổi", ("12/M", 150): "150 buổi",
    # 8/M: theo đúng cột chị Thu Hiền điền (chuẩn duy nhất, không suy diễn công thức).
    # (bản cuối SM sửa 2026-09-07: 8/M 60 & 120 -> "N buổi", không phải "N tháng")
    ("8/M", 30): "30 buổi", ("8/M", 60): "60 buổi", ("8/M", 120): "120 buổi",
}
_INVOICE_TEACHER_LABEL = {"PHI": "Philippines", "US-UK": "Âu Mỹ"}


def _course_invoice_name(raw: str) -> str:
    """Đổi mã gói nội bộ -> tên SP dễ đọc cho hóa đơn.
    Bỏ qua NEW/UPSALE/REFER/Both AB/Only A, +buổi tặng, HN/HCM.
    Trả "" nếu không tra được (gói ngoài bảng / free text) -> caller fallback tên thô."""
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
```

**2. Gọi hàm** trong `_course_to_tax_order`, sửa dòng **2140**:

```python
# OLD (2140):
product_name = _clean_text(course.get("name")) or _clean_text(course.get("code"))
# NEW (chốt B: gói ngoài bảng giữ tên thô, KHÔNG để trống):
raw_name = _clean_text(course.get("name")) or _clean_text(course.get("code"))
product_name = _course_invoice_name(raw_name) or raw_name
```

Dòng 2153-2154 giữ nguyên (`taxProductName` + `goiHoc` = `product_name`). Tra được → tên đẹp; không tra được → fallback tên gói thô (hành vi hiện tại).

**3. Test** — thêm `backend/tests/test_course_invoice_name.py` (unit thuần hàm) + thêm 1 integration test trong `test_invoice_export_course_name.py`.

## Guardrail

- **G1 — Không vỡ test cũ (nhờ fallback):** `test_course_to_tax_order_keeps_package_name_after_invoice_issued` dùng fixture `2/W- NEW 24 buoi` (thiếu tag GV ⇒ hàm trả "" ⇒ fallback về chính nó). Assert cũ `== "2/W- NEW 24 buoi"` **vẫn pass** — KHÔNG cần sửa. Chỉ THÊM 1 integration test tên thật để chứng minh có quy đổi.
- **G2 — Không phá fix 12/8 (bẫy JSONB):** hàm mới chỉ ĐỌC `course["name"]`, không ghi (xem `docs/learnings/invoice-export-course-field-naming-trap.md`).
- **G3 — Gói ngoài bảng → giữ tên gói thô** (chốt B). Bao gồm 5/W VIP (không bán nữa) + gói gõ tay/mới. Không để trống.
- **G4 — Chuẩn = cột chị Thu Hiền điền:** encode đúng số chị điền cho MỌI họ (kể cả 8/M). Không suy diễn, không đối chiếu ÷8/÷12. Cột "Minh hiểu" chỉ tham khảo.
- **G5 — Chỉ đụng đường xuất B4 tự động** (`_course_to_tax_order`). KHÔNG đụng endpoint Ops nhập tay `invoice_routes.py:498` (vẫn validate taxProductName không rỗng — flow khác).
- **G6 — Parser bỏ qua biến thể:** đối chiếu 65 dòng `coursePackages.ts` — mọi dòng có `<số> <PHI|US-UK>`; NEW/UPSALE/REFER/Both AB (A-PH)/Only A/HN/HCM/`+N`/`+N+N` nằm ngoài 2 nhóm capture ⇒ không nhiễu.

## Test (dự kiến)

`backend/tests/test_course_invoice_name.py` — `import activation_routes as ar`, gọi `ar._course_invoice_name(...)`:

| Input (raw course name) | Expected |
|---|---|
| `2/W- NEW 24 PHI+2 HN` | `Khóa học tiếng Anh 03 tháng giáo viên Philippines` |
| `2/W- NEW 24 US-UK+1 HN` | `...03 tháng giáo viên Âu Mỹ` |
| `2/W- UPSALE 48 PHI+5 HCM` | `...06 tháng giáo viên Philippines` |
| `2/W- Both AB (A-PH) REFER 32 PHI+3` | `...04 tháng giáo viên Philippines` |
| `2/W- NEW 72 PHI+7` | `...09 tháng giáo viên Philippines` |
| `12/M - NEW 60 PHI+20 HN` | `...05 tháng giáo viên Philippines` |
| `12/M - NEW 90 PHI+30 HN` | `Khóa học tiếng Anh 90 buổi giáo viên Philippines` |
| `12/M - NEW 30 PHI+10 HN` | `...30 buổi giáo viên Philippines` |
| `12/M - NEW 120 PHI+40 HN` | `...120 buổi giáo viên Philippines` |
| `12/M - NEW 150 PHI+50 HN` | `...150 buổi giáo viên Philippines` |
| `3/W - NEW 96 PHI+10+10 HN` | `...08 tháng giáo viên Philippines` |
| `3/W- COMBO 48 US-UK+2 HN` | `...04 tháng giáo viên Âu Mỹ` |
| `8/M - NEW 60 US-UK+10 HN` | `...60 buổi giáo viên Âu Mỹ` |
| `5/W- VIP 96 US-UK+5 HN` | `""` (ngoài bảng → caller giữ tên thô) |
| `2/W- NEW 24 buoi` | `""` (thiếu tag GV) |
| `Gói tự gõ linh tinh` | `""` |

Thêm vào `test_invoice_export_course_name.py`:
- `test_course_to_tax_order_converts_known_package_name`: `_course(name="2/W- NEW 24 PHI+2 HN")` → assert `taxProductName == goiHoc == "Khóa học tiếng Anh 03 tháng giáo viên Philippines"`.

## Verify (validation loop)

1. `cd backend && py -3 -m pytest tests/test_course_invoice_name.py tests/test_invoice_export_course_name.py -q` → tất cả pass.
2. (FE không đụng) `cd frontend && npx tsc -b` → optional.
3. Đối chiếu lại G1–G6.

## Đánh giá 5 tiêu chí

1. **Triệt để** — ✅ Đúng cột chị duyệt; xử lý tháng/buổi + 2 loại GV + gói ngoài bảng.
2. **Không lỗi con** — ✅ Fallback tên thô ⇒ test cũ không vỡ, gói lạ không mất tên.
3. **Không tăng gánh nặng hạ tầng** — ✅ BE-only, 0 dependency mới, 0 migration.
4. **Tối ưu token** — ✅ ~19 entry + 1 hàm ~15 dòng + sửa 1 dòng gọi.
5. **Bền vững qua compact** — ✅ Plan self-contained: path:line + code nguyên văn + bảng đầy đủ.

## Phân bổ thực thi

Opus inline. 3 file: `activation_routes.py` (thêm bảng+hàm, sửa dòng 2140), `tests/test_course_invoice_name.py` (mới), `tests/test_invoice_export_course_name.py` (thêm 1 test).

## Đã chốt

- Gói ngoài bảng → **giữ tên gói thô** (B).
- 8/M → **encode đúng số chị Hiền điền** (không tranh luận công thức).

## Lưu ý còn lại (không chặn)

- Trong /M chỉ dòng 14 (12/M · 60 buổi) ghi "05 tháng"; còn lại ghi "N buổi". Encode y như chị điền; nếu chị muốn "60 buổi" cho đồng bộ thì sửa 1 entry.
