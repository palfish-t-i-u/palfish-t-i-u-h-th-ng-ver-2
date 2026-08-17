# DingTalk bill + Tổng phải đồng bộ với predicate "đủ tạm" của pr_guards

**Related files:** `backend/utils/zalo_message_builder.py`, `backend/activation_routes.py:1225-1258`, `backend/pr_guards.py`

**Problem:** Tính năng "đủ tạm" (ship 7/8, commit a4745e4) cho phép tạo gói học khi line thẻ/trả góp có bill nhưng vẫn `status='pending'`. Tin DingTalk `activation_request_created` dựng theo giả định line đã `paid`:
- "Tổng" dùng `received` (= 0 khi chưa ghép mPOS) → hiện "Tổng: 0 VND"
- Bill query dùng `.eq("status","paid")` → bỏ qua line pending → không có ảnh bill

Ca thực tế: 3 AR ngày 12/8 (Trịnh Thị Hoa / Nguyễn Ngọc Phương / Bui Thi Thai Duong) phải bắn lại thủ công.

**Trap 1 — `"0"` string truthy:**
```python
# SAI — str "0" is truthy, int 0 is not, behavior khác nhau
if pr_received:
    total_val = pr_received  # vẫn "0" không fallback

# ĐÚNG — ép float, so > 0
def _num(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0
recv_f = _num(pr_received)
total_val = recv_f if recv_f > 0 else target_f
```

**Trap 2 — `.in_()` không được mock:**
`_mock_chain_table` (test_dingtalk_ar_created.py:30) mock các method: `select, eq, ilike, order, limit`.
Dùng `.in_("status", ["paid","pending"])` → AttributeError trong test. Bỏ filter trong query, lọc trong Python:
```python
# Bỏ .eq("status","paid") khỏi query Supabase
# Lọc trong Python:
is_paid = line_status == "paid"
is_provisional = (
    line_method in _PROVISIONAL_METHODS
    and line_status == "pending"
    and _line_has_bill(line)
)
if not (is_paid or is_provisional):
    continue
```

**Trap 3 — predicate lệch activatable_received:**
Tự viết lại "có bill" check → lệch `_line_has_bill` trong `pr_guards`. Import trực tiếp:
```python
from pr_guards import _PROVISIONAL_METHODS, _line_has_bill
```

**Insight:** Revenue rule (xác nhận chị Hiền 12/8): ghi nhận theo **số sau khi trừ phí** = `payment_requests.target`, không phải giá gói (tổng biên lai). `received=0` là bình thường khi chưa ghép mPOS; dùng `target` làm "Tổng tạm tính".

**Rule:** Khi thêm feature có cổng điều kiện mới (provisional, partial, etc.), đồng thời cập nhật TẤT CẢ consumer downstream (notification builder, report, display) để dùng cùng predicate. Guard mới mà notification builder giả định guard cũ → sự cố kép (Tổng=0 + mất ảnh). Dùng `_PROVISIONAL_METHODS + _line_has_bill` từ `pr_guards` làm source of truth — không nhân bản predicate.
