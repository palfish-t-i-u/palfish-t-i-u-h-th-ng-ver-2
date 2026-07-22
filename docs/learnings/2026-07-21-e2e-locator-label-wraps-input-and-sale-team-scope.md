# E2E: label wraps input (not sibling) + sale-role reports force-scoped to own team

**Related files:** `frontend/e2e/journeys/revenue-reporting.spec.ts`, `frontend/src/components/LedgerFormModal.tsx`, `backend/rbac.py` (`enforce_report_scope`, `visible_creator_emails`), `frontend/e2e/helpers/api-client.ts`, `frontend/e2e/helpers/navigation.ts`

**Problem:** "Sổ doanh thu — Create ledger entry" e2e test đã fail lâu ngày ở bước điều hướng (permission gap trên `test.user@dev`). Sau khi cấp override quyền `revenueLedger`, test chạy tới xa hơn nhưng lộ ra 3 lớp bug hoàn toàn khác nhau, không cái nào liên quan tới quyền:

1. **Locator `label:has-text(X) ~ input` không bao giờ khớp.** `LedgerFormModal.tsx`'s `Field` component render `<label><span>{label}</span>{children}</label>` — input là **con** của label, không phải anh em (`~` là sibling combinator, yêu cầu cùng cấp cha). Hầu hết field "may mắn" chạy được nhờ locator `.or()` fallback qua `placeholder`, nhưng field "Real Pay (VND)" fallback bằng `input[placeholder*="VND"]` lại khớp NHẦM sang field "GMV (RMB)" (placeholder của nó là "Tự tính VND ÷ 3700…", cũng chứa chuỗi "VND"). Kết quả: mọi dòng ledger do test tạo bị hoán đổi ngược `soTienVnd`/`gmvRmb` một cách im lặng — không throw lỗi gì, chỉ sai dữ liệu.
2. **Text label test giả định sai** — code cho rằng label là "Tên khách"/"Số tiền", nhưng label thật là "User Name"/"Real Pay (VND)" (giao diện đã đổi sang tiếng Anh một phần, test không theo kịp).
3. **`enforce_report_scope()` (backend/rbac.py:195) ép mọi truy vấn Sổ doanh thu của role `sale`/`leader` về ĐÚNG team gắn với tài khoản** (`nhan_su_sale.team`), bất kể dropdown "Team" trên UI hiển thị/gửi gì. Test tạo dòng với `team: "Inhouse 1"` cứng, nhưng account test (`test.user@dev`) thực ra có role `sale` + team `"Inhouse 2"` — dòng vừa tạo bị lọc mất, kể cả khi chính người tạo tìm lại (không phải bug, là tính năng bảo vệ dữ liệu theo team).

**Trap:**
- Thấy field không fill được → thêm locator `.or()` fallback bằng placeholder cho "chắc ăn", nhưng nếu 2 placeholder khác nhau tình cờ share một substring, fallback có thể âm thầm trúng field khác — không có strict-mode error nào bật lên nếu `.first()` chỉ trả về 1 kết quả hợp lệ (dù sai).
- Thấy tài khoản test có quyền `full` cho 1 module thì mặc định nó sẽ "thấy được mọi thứ" trong module đó — bỏ qua khả năng có thêm một lớp **data-scope theo role** (team/department) áp riêng, độc lập với permission-level (view/edit/none).
- `getByRole("button", {name:"Trial"})`/`text=Trial` không scope theo vùng UI → khớp luôn cả sidebar description text ("...trial/referral...") hoặc nav item khác chứa substring trùng tên tab.

**Insight:**
- Với form có `<label>` bọc `<input>` (label lồng, không dùng `htmlFor`), locator đúng là `dialog.getByLabel("Tên label")` — Playwright tự hiểu implicit label association (bọc lẫn `for=id`), không cần đoán cấu trúc DOM.
- Trước khi viết fixture dữ liệu test (team, department…), luôn kiểm tra `GET /me` (hoặc tương đương) để biết **role + team thật** của tài khoản test đang dùng — đừng hardcode giá trị "hợp lý" mà không xác minh.
- Khi 1 test tương tác với modal/dialog, luôn scope locator vào `page.getByRole("dialog")` trước, tránh khớp nhầm phần tử cùng tên ở nền phía sau (search input, filter dropdown, nav item...).

**Rule:**
1. Field trong form/modal → ưu tiên `getByLabel(...)` thay vì `label:has-text() ~ input` hay đoán placeholder.
2. Trước khi hardcode team/department/role trong test fixture, gọi thử `/me` (hoặc endpoint tương đương) để xác nhận giá trị thật của tài khoản test.
3. Mọi locator thao tác bên trong modal phải scope qua `page.getByRole("dialog")` (hoặc container tương đương), không thao tác thẳng trên `page`.
4. Nếu 1 flow "tạo xong không thấy lại" trong lúc mọi permission đều đã đúng → nghi ngờ có thêm lớp **report/data scope theo role** (`enforce_report_scope` và tương tự) trước khi nghi ngờ code UI.

**Verify:** `npx playwright test e2e/journeys/revenue-reporting.spec.ts --project=journeys -g "Sổ doanh thu"` — cả 5 test (Smoke/Create/Edit/Filter) xanh, dòng tạo đúng `soTienVnd`/`gmvRmb`, cleanup tự xoá dòng test thành công (không rác lại trong DB).
