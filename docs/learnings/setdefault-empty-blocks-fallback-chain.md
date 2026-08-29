# setdefault với giá trị rỗng chặn fallback chain + che giá trị merge

**Related files:** `backend/activation_routes.py` (`_build_invoice_course_patch`)

**Problem:** Thêm fallback nhiều tầng cho `patch` dict (`tax_code ← pr.tax_id`, `invoice_customer_name ← pr.invoice_customer_name → pr.name`) bằng idiom sẵn có `patch.setdefault(key, _clean_text(pr.get(...)))` — 2 test fail ngay: gate báo "thiếu tên" dù `pr["name"]` có giá trị.

**Trap:** `_clean_text(None)` trả `""`, và `setdefault(key, "")` **ghi `""` vào dict**. Từ đó:
1. Tầng fallback sau (`setdefault` lần 2 cùng key) không bao giờ chạy — key đã tồn tại, dù giá trị rỗng.
2. `preview = {**course, **patch}` — `""` trong patch **đè mất giá trị thật trên course** (VD course có `tax_code` do kế toán điền, pr không có `tax_id` → preview thấy `""` → gate chặn sai).

Idiom gốc trong code trông vô hại vì mỗi key chỉ có 1 tầng fallback và nguồn PR (phone/address) hầu như luôn có giá trị — bẫy chỉ lộ khi thêm tầng thứ 2 hoặc nguồn thường rỗng.

**Insight:** `if not patch.get(k): patch.setdefault(k, maybe_empty)` không phải "fill nếu thiếu" — nó là "chiếm chỗ key kể cả bằng rác rỗng". Fill-nếu-thiếu đúng nghĩa phải kiểm tra giá trị nguồn trước khi ghi.

**Rule:** Fallback vào dict sẽ được merge/preview: CHỈ ghi khi giá trị nguồn non-empty —

```python
def _fill_from_pr(key: str, pr_key: str) -> None:
    if patch.get(key) or not pr:
        return
    val = _clean_text(pr.get(pr_key))
    if val:
        patch[key] = val
```

Kèm theo: khi 1 key có 2 nguồn với ý nghĩa khác nhau (tên pháp lý vs tên hiển thị), capture giá trị "tường minh" ra biến riêng TRƯỚC khi áp fallback hiển thị — gate đọc biến đó, không đọc dict sau merge.

**Verify:** `py -m pytest tests/test_invoice_export_course_name.py -q` — các test `test_build_invoice_course_patch_*` cover cả 2 nhánh bẫy.
