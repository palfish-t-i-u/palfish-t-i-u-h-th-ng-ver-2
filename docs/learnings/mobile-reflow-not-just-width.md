# Mobile pass phải reflow nội dung, không chỉ chỉnh bề rộng drawer

**Related files:** `frontend/src/styles/prototype-payments.css`, `frontend/src/components/CardReconciliationTab.tsx`, `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`, `frontend/src/components/ui/RowCard.tsx`

**Problem:** Sau đợt "mobile UI Phase 0-4" (đổi drawer width → 100vw, thêm tap-target 44px), anh Hiếu vẫn báo UI mobile "vỡ, chật, dồn nén". 9 ảnh QLTT + ĐSGD cho thấy: search đè filter-chip, title ép wrap 4 dòng dọc, số tiền đè memo, 2 cột ghép|ảnh-bill bị nén, nút foot tràn ngang.

**Trap:** Coi "làm mobile" = thu nhỏ container (drawer width 100vw) + phóng to vùng chạm. Cách này KHÔNG chạm tới nguyên nhân "chật/dồn nén": layout desktop-first nhồi vào 375px vẫn giữ nguyên các flex-row `nowrap` và grid nhiều cột. Container hẹp lại nhưng NỘI DUNG bên trong vẫn cố dàn ngang → crush (chữ ép 1 cột dọc) hoặc overflow (nút/tab tràn mép) hoặc overlap (absolute/space-between đè lên text wrap).

**Insight:** Vỡ mobile của app desktop-first nằm ở tầng REFLOW nội dung, không phải kích thước khung. Bốn thủ phạm lặp lại, mỗi cái cần một kiểu reflow riêng:
1. Grid nhiều cột (`gridTemplateColumns: "1.6fr 1fr"`) → phải collapse `1fr` ở mobile.
2. Flex-row `justify-content: space-between` / `nowrap` (toolbar, panel-head, sync-bar, drawer-foot) → phải `flex-wrap` + cho phần tử chính `flex-basis: 100%`.
3. Text dài không khoảng trắng (memo CK "MBVCB.xxx") → `break-words`, nếu không tràn ra đè phần tử `shrink-0` bên phải.
4. Phần tử hover-only (tooltip) → ẩn trên mobile (touch không hover + hay tràn mép).
Grep `pageOverflow == 0` chỉ bắt được thủ phạm #2/#3 (overflow ngang), KHÔNG bắt #1 (crush trong khung) — 2 cột nén vào 375px vẫn `pageOverflow == 0` mà nhìn vẫn vỡ. Phải mở từng drawer/màn ở 375px đo mắt, không chỉ dựa overflow-ngang.

**Rule:** Khi nhận task "mobile hoá" một tab desktop-first, TRƯỚC khi sửa width, quét component tìm 4 pattern: `gridTemplateColumns` nhiều cột, `justifyContent: "space-between"` / `.toolbar`/`.panel-head`/`-foot`, text tự do (memo/tên/nội dung CK) trong header `flex`, và `tooltip`/hover cue. Mỗi cái viết rule reflow trong `@media (max-width:767px)`. Nghiệm thu: mở TỪNG drawer/modal ở 375px (không chỉ list) — `pageOverflow==0` là điều kiện cần, không đủ; phải xác nhận không có cột nào bị nén < ~120px và không có text đè nhau.

**Verify:** `grep -c "gridTemplateColumns" frontend/src/components/CardReconciliationTab.tsx` (mỗi grid nhiều cột phải có class + rule collapse tương ứng trong prototype-payments.css `@media max-767`); `grep -n "card-match-grid\|card-info-grid\|card-sync-bar" frontend/src/styles/prototype-payments.css` phải khớp class đã gắn ở component.
