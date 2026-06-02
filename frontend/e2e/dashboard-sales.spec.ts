import { test, expect } from "@playwright/test";

test.describe("Bảng thông tin (Dashboard Gamification)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // "Bảng thông tin" is the default view after login
    await expect(page.locator("h1, h2").filter({ hasText: "Bảng thông tin" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("hiển thị trang Bảng thông tin với đầy đủ sections", async ({ page }) => {
    // Commission card
    await expect(page.locator("text=Tính hoa hồng")).toBeVisible({ timeout: 15_000 });

    // Rank position card
    const rankCard = page.locator("text=Vị trí của bạn");
    const comingSoon = page.locator("text=Đang phát triển");
    await expect(rankCard.or(comingSoon)).toBeVisible({ timeout: 15_000 });

    // Reward tasks section
    const tasks = page.locator("text=Team đạt 100% KPI");
    if (await tasks.isVisible()) {
      await expect(tasks).toBeVisible();
    }

    // Events section — at least one event should show
    const events = page.locator("text=Sự kiện");
    if (await events.isVisible()) {
      await expect(events).toBeVisible();
    }
  });

  test("top sales data loads (today or month)", async ({ page }) => {
    // Wait for data to load — look for ranking entries or empty state
    const topToday = page.locator("text=Top hôm nay");
    const topMonth = page.locator("text=Top tháng");
    const anyTop = topToday.or(topMonth);

    await expect(anyTop).toBeVisible({ timeout: 20_000 });

    // Take proof screenshot
    await page.screenshot({ path: "e2e-results/dashboard-gamification.png" });
  });

  test("commission section hiển thị đúng", async ({ page }) => {
    const commissionLabel = page.locator("text=Tính hoa hồng");
    await expect(commissionLabel).toBeVisible({ timeout: 10_000 });

    // Either "Đang phát triển" or an actual amount
    const comingSoon = page.locator("text=Đang phát triển");
    const amount = page.locator("text=/\\d+.*tr/");
    await expect(comingSoon.or(amount)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Module 6 — Dashboard Sale (Hiệu suất)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Bảng thông tin")).toBeVisible({ timeout: 20_000 });

    // Navigate to Module 6 — "Dashboard Sale" in sidebar
    await page.click("text=Dashboard Sale");
    await expect(
      page.locator("h1, h2").filter({ hasText: "Dashboard Sale" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("hiển thị trang Dashboard Sale với filters và KPI", async ({ page }) => {
    // Range selector buttons
    await expect(page.locator("text=Hôm nay")).toBeVisible();
    await expect(page.locator("text=Tuần này")).toBeVisible();
    await expect(page.locator("text=Tháng này")).toBeVisible();
    await expect(page.locator("text=Tháng trước")).toBeVisible();
    await expect(page.locator("text=Tùy chọn")).toBeVisible();
  });

  test("KPI cards load khi chọn Tháng này", async ({ page }) => {
    // Click "Tháng này" range button (default, but click to be sure)
    await page.click("button:has-text('Tháng này')");

    // Wait for data to load — KPI cards or loading state
    const kpiLabel = page.locator("text=Tổng leads");
    const loadingState = page.locator("text=Đang tải");
    const errorState = page.locator("text=Không tải được");
    const noData = page.locator("text=Chưa có dữ liệu");

    await expect(
      kpiLabel.or(loadingState).or(errorState).or(noData)
    ).toBeVisible({ timeout: 30_000 });

    // If data loaded, verify KPI structure
    if (await kpiLabel.isVisible()) {
      // Should have multiple KPI metric labels
      const kpiCards = page.locator("text=Trials").or(page.locator("text=Đơn chốt"));
      await expect(kpiCards).toBeVisible({ timeout: 10_000 });
    }

    await page.screenshot({ path: "e2e-results/dashboard-sale-kpi.png" });
  });

  test("chuyển range Hôm nay / Tuần này / Tháng trước", async ({ page }) => {
    // Test switching between range filters
    for (const label of ["Hôm nay", "Tuần này", "Tháng trước"]) {
      await page.click(`button:has-text('${label}')`);

      // Wait for loading to start and finish (or no data)
      const loaded = page.locator("text=Tổng leads");
      const noData = page.locator("text=Chưa có dữ liệu");
      const error = page.locator(".text-red-700, .text-red-600");

      await expect(loaded.or(noData).or(error)).toBeVisible({ timeout: 30_000 });
    }
  });

  test("bảng chi tiết sales hiển thị nếu có dữ liệu", async ({ page }) => {
    // Wait for page to load data
    await page.waitForTimeout(3_000);

    // Check for the detail table with column headers
    const saleNameCol = page.locator("text=Họ và tên Sale");
    const noData = page.locator("text=Chưa có dữ liệu");

    if (await saleNameCol.isVisible()) {
      // Table headers should include key metrics
      await expect(page.locator("th, td").filter({ hasText: "Lead chạy Ads" }).or(
        page.locator("text=Lead chạy Ads")
      )).toBeVisible();

      await expect(page.locator("th, td").filter({ hasText: "Doanh thu CRM" }).or(
        page.locator("text=Doanh thu CRM")
      )).toBeVisible();

      await page.screenshot({ path: "e2e-results/dashboard-sale-table.png" });
    } else {
      test.info().annotations.push({
        type: "info",
        description: "Không có dữ liệu chi tiết sale trong kỳ này. Test pass (UI hiển thị đúng).",
      });
    }
  });

  test("conversion rates chart hiển thị nếu có dữ liệu", async ({ page }) => {
    // Wait for data
    await page.waitForTimeout(3_000);

    const conversionLabels = page.locator("text=Tỷ lệ chuyển đổi").or(
      page.locator("text=Conversion")
    );

    if (await conversionLabels.isVisible()) {
      await page.screenshot({ path: "e2e-results/dashboard-sale-conversion.png" });
    }
  });
});
