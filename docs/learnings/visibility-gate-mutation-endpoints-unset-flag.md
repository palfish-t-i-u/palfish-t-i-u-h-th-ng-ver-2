# Visibility gate bị bẻ gãy bởi mutation endpoints trả AR vào FE state merge

**Related files:** `backend/activation_routes.py`, `frontend/src/contexts/PaymentFlowContext.tsx`

**Problem:** Đơn tín dụng ẩn khỏi tab Kích hoạt (gate `credit_settlement_pending`) nhưng tái hiện ngay sau khi sale tạo, sửa, hoặc điền order ID — dù tiền chưa về.

**Trap:** Wire cờ gate chỉ ở `list_active_requests` (endpoint nhiều AR). `get_active_request` và mọi mutation endpoint (create / append / patch / order-id / issue-invoice…) trả về **1 AR** với cờ default `False`. `PaymentFlowContext` merge response này thẳng vào state `activeRequests` (`setActiveRequests((prev) => prev.map(x => x.id === id ? ar : x))` hoặc `[ar, ...prev]` — xem `PaymentFlowContext.tsx:428,453,492,506,536,554,621,644,684,698`). Kết quả: đơn tín dụng vừa tạo/sửa **hiện lại ngay** tới lần refetch list kế tiếp.

**Insight:** Trong kiến trúc này, FE không refetch list sau mỗi mutation — nó merge response mutation vào state client. Bất kỳ cờ nào trên AR mà mutation endpoint không set đúng sẽ ghi đè giá trị đúng trong state. Cờ gate cần phải được tính và trả về **ở mọi endpoint trả 1 AR**, không chỉ list.

Với `activation_routes.py`, `grep -n "_serialize_ar(" activation_routes.py` ra 15 dòng — 1 def + 1 list + **13 mutation/detail single-AR**. Bỏ sót bất kỳ dòng nào trong 13 → gate bị bẻ gãy theo từng mutation.

**Rule:** Khi thêm cờ gate/visibility vào API response của AR (hoặc bất kỳ entity nào FE giữ trong state và merge mutation responses), đếm số call site của `_serialize_*` / `to_dict` / serializer tương đương. Nếu có nhiều hơn 1, phải wire cờ ở MỌI call site. Pattern an toàn: centralize 1 wrapper `_serialize_ar_with_hold(sb, row, ...)` tính cờ live, thay tất cả call site đơn-entity bằng wrapper; list/batch giữ nguyên (dùng precomputed batch map). Verify: `grep -c "_serialize_ar_with_hold(" backend/activation_routes.py` == 14 (1 def + 13 call site); `grep -n "_serialize_ar(" backend/activation_routes.py | grep -v "def _serialize_ar\|_with_hold\|list_active_requests"` → rỗng.

**Verify:** `grep -c "_serialize_ar_with_hold(" backend/activation_routes.py` — kết quả phải là **14**.
