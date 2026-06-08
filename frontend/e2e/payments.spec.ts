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

  test("Hiển thị giao diện Doanh thu với đầy đủ summary cards và AG Grid", async ({ page }) => {
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

    // Check AG Grid renders or empty state shows
    await expect(
      page.locator(".ag-root-wrapper").first().or(page.locator("text=Không có dữ liệu"))
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
    // Wait for AG Grid or empty state
    await expect(
      page.locator(".ag-root-wrapper").first().or(page.locator("text=Không có dữ liệu"))
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── Tests tương tác CRUD (AG Grid đã tích hợp) ──

  test("Filter theo team hoạt động", async ({ page }) => {
    // Wait for grid to load
    await expect(
      page.locator(".ag-root-wrapper").first().or(page.locator("text=Không có dữ liệu"))
    ).toBeVisible({ timeout: 15_000 });

    // Click In-house tab
    await page.getByRole("button", { name: "In-house" }).first().click();
    // Wait for data refresh (either grid or empty state)
    await expect(
      page.locator(".ag-root-wrapper").first().or(page.locator("text=Không có dữ liệu"))
    ).toBeVisible({ timeout: 15_000 });

    // Verify the In-house tab is now active (has primary styling)
    const tab = page.getByRole("button", { name: "In-house" }).first();
    await expect(tab).toHaveClass(/text-gmv-primary/);
  });

  test("Nút Thêm doanh thu mở dialog", async ({ page }) => {
    // Click add button
    await page.getByRole("button", { name: "Thêm doanh thu" }).click();

    // Dialog should open with form fields
    await expect(page.locator("text=Thêm khoản doanh thu")).toBeVisible();
    await expect(page.locator("text=Khách hàng (UID)")).toBeVisible();
    await expect(page.locator("text=Thời gian thanh toán")).toBeVisible();

    // Close dialog
    const closeBtn = page.locator('[role="dialog"] button, .fixed button').filter({ hasText: "Hủy" }).first();
    // Try close via Hủy or the X button
    await page.getByRole("button", { name: "Hủy" }).first().click();
  });

  test("Nút Import mở dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Import từ file" }).click();
    await expect(page.locator("text=Import doanh thu từ file")).toBeVisible();
    await expect(page.locator("text=Chọn file")).toBeVisible();
    await page.getByRole("button", { name: "Đóng" }).click();
  });

  test.fixme("Sửa inline trong AG Grid", async () => {
    // Test khi có data thật:
    // 1. Double-click ô Note
    // 2. Nhập text mới
    // 3. Press Enter
    // 4. Toast "Đã lưu" hiện
    // 5. Ô cập nhật
  });

  test.fixme("Hoàn tiền và Khôi phục qua dialog Chi tiết", async () => {
    // Test khi có data thật:
    // 1. Click vào 1 dòng → dialog Chi tiết mở
    // 2. Click nút "Hoàn tiền" → Trạng thái chuyển sang "refunded"
    // 3. Click "Khôi phục" → Trạng thái chuyển sang "active"
  });

  test.fixme("Danh mục Sale hiển thị AG Grid editable", async () => {
    // Test khi có data thật:
    // 1. Bảng Sale AG Grid hiện danh sách
    // 2. Double-click ô short_code → sửa → Enter → lưu
    // 3. Nút Thêm Sale → dialog → điền → Lưu → dòng mới
  });
});
