# `flex:1` nuốt `width:100%` — muốn item chiếm trọn dòng phải dùng `flex-basis:100%`

**Related files:** `frontend/src/styles/prototype-payments.css`

**Problem:** Ô search trong `.toolbar` (QLTT + ĐSGD) đè lên filter-chip ở mobile, dù đã có rule `@media (max-width:767px) { .toolbar .search { width: 100%; min-width: 0; } }`. Rule nhìn đúng nhưng không có tác dụng — search vẫn không chiếm hết dòng, chip vẫn tràn lên đè.

**Trap:** Thấy phần tử flex không rộng hết dòng → thêm `width: 100%`. Với flex item, khi `flex-basis` KHÁC `auto`, trình duyệt bỏ qua `width` để tính main size. `.search` có `flex: 1` = `flex: 1 1 0%` → basis = `0%` (không phải auto) → `width: 100%` bị nuốt hoàn toàn. Item co về kích thước nội dung, chip chen cùng dòng → đè.

**Insight:** Trên trục chính của flex container, `flex-basis` thắng `width`/`height`. `flex: 1` (shorthand) set basis = `0%`, nên mọi `width` sau đó vô nghĩa. Muốn một flex item ép xuống dòng riêng (full-row) trong container `flex-wrap`, phải set chính `flex-basis: 100%` (hoặc `flex: 1 1 100%`) — không phải `width: 100%`.

**Rule:** Sửa bề rộng một phần tử có `display:flex` cha (hoặc chính nó là flex item): kiểm `flex`/`flex-basis` của nó TRƯỚC. Nếu basis ≠ auto (vd `flex:1`), dùng `flex-basis: <giá trị>` thay cho `width`. Muốn full-row + wrap phần còn lại xuống dưới: `flex: 1 1 100%`.

**Verify:** `grep -n "toolbar .search" frontend/src/styles/prototype-payments.css` — rule mobile phải dùng `flex: 1 1 100%` / `flex-basis`, KHÔNG dùng `width: 100%`. Đo runtime: ở 375px, `getComputedStyle($('.toolbar .search')).flexBasis === "100%"` và chip đầu nằm dưới đáy search (không cùng hàng).
