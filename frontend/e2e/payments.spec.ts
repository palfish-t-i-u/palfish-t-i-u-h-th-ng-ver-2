import { test, expect } from "@playwright/test";

test.describe("Module Doanh thu — UI Shell & Permissions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the main page to load by asserting the Bảng thông tin heading
    await expect(page.getByRole("heading", { name: "Bảng thông tin" })).toBeVisible({ timeout: 20_000 });

    // Navigate to "Quản lý Doanh thu" tab in sidebar
    await page.click("text=Quản lý Doanh thu");
    // Wait for the sub-tab header/navigation to be visible
    await expect(page.locator("text=Doanh thu").first()).toBeVisible({ timeout: 10_000 });
  });

  test("Hiển thị giao diện Doanh thu với đầy đủ summary cards và grid placeholder", async ({ page }) => {
    // Check 5 summary cards are visible
    await expect(page.locator("text=Tổng GMV")).toBeVisible();
    await expect(page.locator("text=Doanh thu VNĐ")).toBeVisible();
    await expect(page.locator("text=Số đơn")).toBeVisible();
    await expect(page.locator("text=Chưa khớp NH")).toBeVisible();
    await expect(page.locator("text=Chưa kích hoạt CRM")).toBeVisible();

    // Check toolbar buttons visible under full permission (user.json has full/system permission)
    await expect(page.getByRole("button", { name: "Thêm doanh thu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import từ file" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Xuất Excel" })).toBeVisible();

    // Check team filter tabs
    await expect(page.getByRole("button", { name: "Tất cả" })).toBeVisible();
    await expect(page.getByRole("button", { name: "In-house" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "In-house 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();
    await expect(page.getByRole("button", { name: "HCM" })).toBeVisible();

    // Check data table or empty state is present (API now wired)
    await expect(
      page.locator("table").first().or(page.locator("text=Không có dữ liệu"))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Chuyển đổi các sub-tab và hiển thị đúng layout", async ({ page }) => {
    // ── 1. Sub-tab: Báo cáo ──
    await page.click("button:has-text('Báo cáo')");
    // Verify Báo cáo sub-tabs and date filter
    await expect(page.getByRole("button", { name: "BCTB" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Theo Team" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Theo Kênh" })).toBeVisible();
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    // Wait for report data or empty state to load
    await expect(
      page.locator("table").first().or(page.locator("text=Không có dữ liệu")).or(page.locator("text=Không tải được"))
    ).toBeVisible({ timeout: 15_000 });

    // ── 2. Sub-tab: Đối soát ──
    await page.click("button:has-text('Đối soát')");
    await expect(page.locator("text=Đối soát nội bộ")).toBeVisible({ timeout: 15_000 });
    // Check warnings loaded (count badge or clean state)
    await expect(
      page.locator("table").first().or(page.locator("text=dữ liệu sạch"))
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Sub-tab: Danh mục ──
    await page.click("button:has-text('Danh mục')");
    await expect(page.getByRole("button", { name: "Sale", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kênh", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gói học", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Khách hàng", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thêm Sale" })).toBeVisible();
    // Wait for sales data to load
    await expect(
      page.locator("table").first().or(page.locator("text=Không có dữ liệu"))
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── Kịch bản nâng cao: Đánh dấu skip/fixme vì đang chờ API & CRUD components ──

  test.fixme("Filter theo team hoạt động", async () => {
    // Sẽ test khi tích hợp AG Grid và API filter hoạt động
    // 1. Click tab "In-house"
    // 2. Kiểm tra data chỉ hiện team In-house
    // 3. Summary cards cập nhật
  });

  test.fixme("Thêm doanh thu mới", async () => {
    // Sẽ test khi có Dialog nhập liệu và API POST /payments
    // 1. Click nút "+ Thêm doanh thu"
    // 2. Dialog mở ra
    // 3. Điền: uid, pay_time, package, sale, tiền VNĐ
    // 4. Kiểm tra GMV tự tính
    // 5. Click Lưu
    // 6. Toast "Đã thêm"
    // 7. Record mới xuất hiện trong grid
  });

  test.fixme("Sửa inline trong grid", async () => {
    // Sẽ test khi tích hợp AG Grid
    // 1. Double-click ô Note
    // 2. Nhập text mới
    // 3. Press Enter
    // 4. Ô cập nhật
  });

  test.fixme("Hoàn tiền và Khôi phục", async () => {
    // Sẽ test khi có Dialog chi tiết và API refund / restore
    // 1. Click vào 1 dòng → dialog Chi tiết mở
    // 2. Click nút "Hoàn tiền" → Trạng thái chuyển sang "refunded"
    // 3. Click "Khôi phục" → Trạng thái chuyển sang "active"
  });

  test.fixme("Báo cáo BCTB hiển thị pivot và Export Excel", async () => {
    // Sẽ test khi có endpoint báo cáo thật
    // 1. Kiểm tra bảng pivot có hàng (sale) × cột (ngày)
    // 2. Đổi khoảng ngày → data cập nhật
    // 3. Click "Xuất Excel" → download thành công
  });

  test.fixme("Danh mục Sale hiển thị + sửa", async () => {
    // Sẽ test khi có API GET/POST/PATCH danh mục thật
    // 1. Bảng hiện danh sách sales (~190)
    // 2. Click 1 dòng → dialog sửa → Đổi short_code → Lưu → cập nhật
  });
});
