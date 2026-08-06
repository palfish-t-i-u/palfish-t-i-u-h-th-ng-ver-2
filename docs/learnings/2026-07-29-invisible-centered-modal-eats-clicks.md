# Modal `.drawer-center` đóng bằng `opacity:0` (thiếu pointer-events:none) → nuốt click toàn tab, "chết sau 1 lần"

**Date:** 2026-07-29
**File:** `frontend/src/styles/prototype-payments.css` (`.drawer.drawer-center`), `frontend/src/components/CardReconciliationTab.tsx`

## Problem

Anh Minh báo tab **Quẹt thẻ** (Đối soát giao dịch): bộ lọc Tất cả/Chưa ghép/Đã ghép/Bỏ qua "không dùng được — chỉ bấm được 1 lần, muốn đổi bộ lọc phải chuyển sang tab khác rồi quay lại". Data + BE + logic filter đều đúng (3 GD matched có thật, memo `filtered` đọc đủ `statusFilter`).

## Trap

Filter chip `onClick={() => setStatusFilter(...)}` là pure state — về lý KHÔNG thể "chết sau 1 lần" theo React. Đọc code JS mãi không ra vì **thủ phạm ở CSS + real browser** (jsdom/unit test không tái hiện được vì bỏ qua `pointer-events`).

`.drawer.drawer-center` khi ĐÓNG:
```css
position: fixed; top:50%; left:50%; transform: translate(-50%,-50%) scale(.96);
opacity: 0;            /* vô hình... nhưng KHÔNG có pointer-events:none */
z-index: 60; width: min(1040px,95vw);
```
Cộng với: `setDrawerOpen(false)` **KHÔNG xoá `drawerId`** → `drawerTxn` vẫn non-null → `<aside>` vẫn render full content (cao ~400-600px). ⇒ Sau khi mở drawer "Đã ghép" 1 lần rồi đóng, một panel **vô hình cỡ 1040×500px nằm giữa viewport vẫn bắt mọi click** đè lên toolbar + hàng bảng. Chuyển tab = component remount (MainPage render theo `case`, chỉ mount view active) = `drawerId` reset null = aside rỗng ~0px = bấm được lại 1 lần.

Manh mối "remount mới bấm lại được" = có overlay/state kẹt sống qua re-render nhưng chết khi unmount → luôn nghĩ tới **phần tử vô hình đè click**, không phải logic filter.

Bản **mobile** (@media max-767) của đúng class này ĐÃ fix từ trước với comment `pointer-events: none; /* nếu không tab chết */` — nhưng nhánh **desktop** không có → bug chỉ hiện trên desktop.

## Insight

`opacity: 0` **không** tắt hit-testing. Một overlay `position:fixed` mà chỉ ẩn bằng `opacity:0`/`scale(0)` vẫn nuốt pointer. Modal đóng phải chặn tương tác bằng MỘT trong: `pointer-events:none`, `visibility:hidden`, `display:none`, hoặc unmount hẳn. Nếu content vẫn render khi đóng (state id không clear) thì `height:auto` không tự co về 0 — overlay to đúng bằng nội dung.

## Rule

- Mọi overlay/modal/drawer ẩn bằng `opacity`/`transform` **BẮT BUỘC** kèm `pointer-events:none` ở trạng thái đóng và `pointer-events:auto` khi `.open`. Grep chéo: nếu bản mobile của một class có `pointer-events:none` khi đóng, bản desktop cũng phải có (và ngược lại).
- Triệu chứng "control chết sau 1 lần, remount/đổi tab mới hồi" → nghi overlay vô hình đè click TRƯỚC khi soi logic handler. Kiểm nhanh trong DevTools: `document.elementFromPoint(x,y)` ngay trên control chết → nếu ra `<aside class="drawer...">` thay vì cái nút thì trúng.
- Đóng modal nên clear luôn id nguồn (vd `setDrawerId(null)`) SAU animation, hoặc ít nhất đừng để content nặng render khi đóng.

**Verify:** desktop, mở drawer "Đã ghép" → đóng → bấm đổi bộ lọc nhiều lần liên tiếp không cần chuyển tab. Liên quan [[2026-07-20-shared-toolbar-filter-dead-on-parallel-tab]] (cùng họ "control hiện mà không nghe", khác cơ chế).
