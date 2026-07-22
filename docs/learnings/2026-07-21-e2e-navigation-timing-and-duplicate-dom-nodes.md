# E2E: async sidebar render race + always-in-DOM duplicate nav nodes + snake_case/camelCase drift

**Related files:** `frontend/e2e/helpers/navigation.ts`, `frontend/e2e/helpers/api-client.ts`, `frontend/src/layouts/AppShell.tsx`

**Problem:** BC03 e2e test (desktop + mobile) fail hoài ở bước `navigateTo(page, "BC03 — Báo cáo tổng bộ")`, dù account có đủ quyền. Ba nguyên nhân riêng biệt cộng dồn:

1. **Race điều kiện lúc load trang.** Sidebar (`aside nav`) render dựa trên permission fetch async sau `page.goto("/")`. `navigateTo()` gọi `.isVisible()` (kiểm tra tức thời, KHÔNG polling/retry) ngay sau goto — nếu check trúng lúc sidebar chưa kịp render, trả về `false` "giả" (không phải do thiếu quyền), rồi bỏ qua luôn bước mở rộng "Báo cáo" — im lặng fail 5-8s sau dù trang cuối cùng vẫn load xong.
2. **AppShell render CẢ HAI** `<aside><nav>` (desktop, `hidden md:flex`) VÀ `<nav aria-label="Điều hướng chính">` (bottom bar mobile, `md:hidden`) — luôn permanently trong DOM, chỉ ẩn/hiện bằng CSS theo viewport. Locator không scope (`page.locator("nav")`, `getByText(...)` không giới hạn vùng) khớp nhầm bản sao ẩn ở bottom bar.
3. Sidebar còn có 1 text node KHÔNG bấm được ("tiêu đề section", đứng trước trong DOM) trùng nhãn với nút thật ("Báo cáo ›" — accessible name có luôn dấu `›`). `getByText(...).first()` chọn nhầm tiêu đề, không phải nút.

**Trap:**
- `.isVisible()` (không `.waitFor()`) ngay sau khi điều hướng/load trang — trông giống một "kiểm tra an toàn" nhưng thực chất là race condition nếu nội dung phụ thuộc fetch async.
- Locator không scope vào 1 container cụ thể (`aside nav` desktop vs `nav[aria-label=...]` mobile) sẽ khớp cả 2 bản sao luôn nằm trong DOM — chỉ khác CSS visibility, Playwright vẫn đếm chúng khi resolve locator.
- `getByText(label, {exact:false}).first()` chọn theo thứ tự DOM, không theo "cái nào bấm được" — dễ trúng nhầm text tĩnh thay vì phần tử tương tác thật.
- Field tên trả về từ API là camelCase (`tenKhach`) nhưng code cleanup filter theo snake_case (`ten_khach`) — filter luôn rỗng, không throw lỗi gì, chỉ âm thầm không tìm thấy gì → cleanup không chạy, rác tích tụ vĩnh viễn trong DB, và mọi test phụ thuộc kết quả filter (vd. lấy ID để test Edit) tự skip vĩnh viễn qua `test.skip(!id, ...)`.

**Insight:**
- Chờ chính container cha (vd. `SIDEBAR_NAV`) hiện ra bằng `.waitFor({state:"visible"})` TRƯỚC, rồi mới check từng item con — đừng chỉ chờ item lá.
- Luôn ưu tiên `getByRole("button", {name, exact:false})` hơn `getByText(...)` khi mục tiêu là phần tử TƯƠNG TÁC — role filter loại bỏ text node tĩnh trùng nhãn.
- Đặt hằng số scope riêng cho desktop nav (`const SIDEBAR_NAV = "aside nav"`) và không tái sử dụng file helper đó cho test mobile (dùng `e2e/helpers/mobile.ts` riêng) — tránh nhầm lẫn 2 cơ chế nav hoàn toàn khác nhau (desktop expand submenu vs mobile "nhảy thẳng child[0]").
- Field name filter trong test helper (`entry.ten_khach`, v.v.) PHẢI khớp đúng casing API thật trả về — không suy đoán từ tên cột DB (snake_case) khi response đã convert sang camelCase.

**Rule:**
1. Sau `page.goto()`, luôn chờ container cha hiện ra (`.waitFor({state:"visible"})`) trước khi thao tác lên phần tử con bên trong nó.
2. Không dùng `.isVisible()` (instant, non-retry) làm điều kiện rẽ nhánh logic ngay sau một thao tác load/điều hướng — chỉ dùng sau khi đã có `.waitFor()` hoặc `expect(...).toBeVisible()` đảm bảo ổn định.
3. Component render nhiều bản sao cùng nội dung theo viewport (desktop/mobile) → luôn scope locator vào đúng 1 container, không match trên toàn `page`.
4. Trước khi filter/parse field từ response JSON trong test helper, in thử 1 response mẫu ra để xác nhận đúng casing — đừng suy đoán.

**Verify:** `npx playwright test e2e/journeys/revenue-reporting.spec.ts --project=journeys -g "BC03|Sổ doanh thu"` — toàn bộ 7 test pass, không còn item nào tự skip do `createdLedgerId` rỗng; `manual-cleanup.ts` báo tìm thấy + xoá đúng số dòng `[E2E-TEST]` còn sót trong DB.
