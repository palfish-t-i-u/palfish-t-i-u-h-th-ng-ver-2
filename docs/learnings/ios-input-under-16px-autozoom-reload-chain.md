# iOS auto-zoom input < 16px → chuỗi zoom-out → reload mất tab đang xem

**Related files:** `frontend/src/styles/prototype-payments.css`, `frontend/src/components/payment-request/TvtsFilterDropdown.tsx`, `frontend/index.html`

**Problem:** Sale không lọc PR theo 1 TVTS trên iPhone: focus ô "Tìm TVTS…" → màn tự zoom vào; zoom-out tay thì trang reload về "Bảng thông tin" → không bao giờ xem được PR của 1 sale.

**Trap:** (1) Coi là 2 lỗi rời — đi sửa "reload". Sai: reload chỉ là hệ quả. (2) Thử rule chung `.gmv-prototype input { font-size: 16px }` KHÔNG `!important` → thua đặc hiệu: `.gmv-prototype .tvts-filter__head input` (0,2,1) đè `.gmv-prototype input` (0,1,1) dù cùng/ sau source → font vẫn 12.5px, auto-zoom vẫn còn. (3) Tưởng viewport `user-scalable=no`/`maximum-scale=1` chặn được — iOS bỏ qua vì accessibility, input vẫn zoom.

**Insight:** iOS Safari/WebKit **auto-zoom mọi input khi focus nếu `font-size < 16px`** (viewport ở đây là `initial-scale=1.0`, không có gì chặn). Chuỗi: auto-zoom → user buộc zoom-out tay → trên máy ít RAM/nhiều tab (ảnh: Brave 13 tab, pin 36%) iOS **discard trang** rồi reload khi tương tác → SPA remount về **tab mặc định** (active-tab lưu trong React state, KHÔNG ở URL/storage) = "Bảng thông tin". Gốc rễ = auto-zoom; chặn nó là chặn cả chuỗi. Nhiều input app < 16px (tvts 12.5px, `.toolbar .search` 14px) → không chỉ 1 chỗ. Fix: blanket floor `font-size: 16px !important` cho input/select/textarea trong `@media (max-width:767px)` (loại checkbox/radio); `!important` để thắng rule component đặc hiệu. Chỉ create-pr-modal từng được vá 16px (scoped) trước đó — sót phần còn lại.

**Rule:** Mọi `input:not([checkbox]):not([radio])`/`select`/`textarea` dạng text trên mobile PHẢI `font-size ≥ 16px` để chặn iOS auto-zoom — đặt 1 rule chung trong `@media max-767` với `!important` (không thì thua đặc hiệu rule component). KHÔNG nghiệm thu auto-zoom trên Chromium/preview desktop (chỉ WebKit/iOS mới zoom) — phải thử trên iPhone thật. Nếu app còn reload-về-tab-mặc-định làm phiền: cân nhắc lưu active-tab vào `sessionStorage`/URL để reload iOS không đá user về Dashboard (phòng thủ tầng 2). Xem thêm [[mobile-drawer-100vh-hides-foot-use-dvh]].

**Verify:** `grep -n "font-size: 16px !important" frontend/src/styles/prototype-payments.css` — phải có rule `input/select/textarea` trong block `@media (max-width: 767px)` (comment "iOS auto-zoom fix").
