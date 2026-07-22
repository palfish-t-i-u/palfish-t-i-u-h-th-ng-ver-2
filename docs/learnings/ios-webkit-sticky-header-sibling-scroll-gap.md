# iOS/WebKit: sticky header với scroll-container là sibling → chèn khoảng trống lớn

**Related files:** `frontend/src/components/auth/auth-accounts.css`, `frontend/src/components/auth/AccountDetailDrawer.tsx`

**Problem:** Drawer chi tiết tài khoản Auth trên iOS (Safari/Brave) có ~250px khoảng trống dư phía trên header; header + summary bar bị đẩy lệch xuống. KHÔNG lỗi trên Chromium/desktop.

**Trap:** Ba bẫy nối nhau. (1) Đổ lỗi `position:fixed` bị ancestor tạo containing-block → portal drawer ra `document.body`. SAI: `.aa-drawer` đo `top:0` ở CẢ Chromium lẫn WebKit (`badAncestors=[]`), portal không sửa vì gap nằm TRONG drawer, phía trên header — không phải drawer bị lệch. (2) Test mobile chỉ bằng Chromium (Playwright project mặc định `devices["Pixel 5"]`) → gap KHÔNG hiện → xanh giả. (3) Đo `.aa-drawer` top (luôn = 0) thay vì đo gap thị giác trên header, nên tưởng "không repro được".

**Insight:** `.aa-drawer-header` để `position: sticky; top: 0` nhưng scroll-container của nó là **sibling** (`.aa-drawer-scroll` — `flex:1; overflow-y:auto`), KHÔNG phải ancestor. `sticky` chỉ có nghĩa khi có **scrolling ancestor**. Chromium: no-op (header đứng yên là child đầu của flex-column). WebKit/iOS: chèn khoảng trống phantom lớn phía trên header + mis-scroll nội dung. Header vốn là child đầu flex-column nên tự nằm trên cùng — không cần sticky.

**Rule:** Bug layout drawer/bottom-sheet mobile PHẢI verify trên **WebKit** (thêm Playwright project tạm với `devices["iPhone 13"]`), không chỉ Chromium — Chromium giấu lỗi WebKit-specific. `position: sticky` cần **scrolling ancestor**; nếu phần scroll nằm ở sibling thì bỏ sticky (phần tử tĩnh trong flex-column tự đứng đầu). Khi KHÔNG repro được ở Chromium mà user thấy trên iPhone → nghi WebKit-specific ngay, và đo phần tử con (header) chứ không chỉ container.

**Verify:** `grep -n "position: static" frontend/src/components/auth/auth-accounts.css` — phải còn rule mobile tắt sticky header (trong block `@media (max-width: 767px)`).
