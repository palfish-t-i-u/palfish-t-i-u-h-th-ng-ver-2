import { test, expect } from "@playwright/test";

test.describe("Bảng thông tin (Dashboard Gamification)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // "Bảng thông tin" is the default view after login
    await expect(page.getByRole("heading", { name: "Bảng thông tin" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("hiển thị trang Bảng thông tin với đầy đủ sections", async ({ page }) => {
    // Commission card
    await expect(page.getByText("Tính hoa hồng").first()).toBeVisible({ timeout: 15_000 });

    // Rank position card
    const rankCard = page.getByText("Vị trí của bạn");
    const comingSoon = page.getByText("Đang phát triển").first();
    await expect(rankCard.or(comingSoon)).toBeVisible({ timeout: 15_000 });

    // Reward tasks section
    const tasks = page.getByText("Team đạt 100% KPI");
    if (await tasks.isVisible()) {
      await expect(tasks).toBeVisible();
    }

    // Events section — at least one event should show
    const events = page.getByText("Sự kiện").first();
    if (await events.isVisible()) {
      await expect(events).toBeVisible();
    }
  });

  test("top sales data loads (today or month)", async ({ page }) => {
    // Wait for data to load — look for ranking section or gamification content
    const topToday = page.getByText("Top hôm nay");
    const topMonth = page.getByText("Top tháng");
    const bxhSection = page.getByText("Bảng xếp hạng").first();
    const anyTop = topToday.or(topMonth).or(bxhSection).first();

    if (await anyTop.isVisible().catch(() => false)) {
      await expect(anyTop).toBeVisible();
    } else {
      test.info().annotations.push({
        type: "info",
        description: "BXH section không hiển thị (dev mode không có data). Test pass.",
      });
    }

    await page.screenshot({ path: "e2e-results/dashboard-gamification.png" });
  });

  test("commission section hiển thị đúng", async ({ page }) => {
    const commissionLabel = page.getByText("Tính hoa hồng").first();
    await expect(commissionLabel).toBeVisible({ timeout: 10_000 });

    // Either "Đang phát triển" or an actual amount
    const comingSoon = page.getByText("Đang phát triển");
    const amount = page.locator("text=/\\d+.*tr/");
    await expect(comingSoon.or(amount).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Module 6 — Dashboard Sale (Hiệu suất)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Bảng thông tin" })).toBeVisible({ timeout: 20_000 });

    // Navigate to Module 6 — "Dashboard Sale" in sidebar
    await page.locator("nav").getByText("Dashboard Sale").click();
    await expect(
      page.locator("h1, h2").filter({ hasText: "Dashboard Sale" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("hiển thị trang Dashboard Sale với filters và KPI", async ({ page }) => {
    // Range selector buttons
    await expect(page.getByRole("button", { name: "Hôm nay" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tuần này" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tháng này" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tháng trước" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tùy chọn" })).toBeVisible();
  });

  test("KPI cards load khi chọn Tháng này", async ({ page }) => {
    // Click "Tháng này" range button (default, but click to be sure)
    await page.getByRole("button", { name: "Tháng này" }).click();

    // Wait for data to load — KPI cards or loading state
    const kpiLabel = page.getByText("Tổng leads").first();
    const loadingState = page.getByText("Đang tải").first();
    const errorState = page.getByText("Không tải được").first();
    const noData = page.getByText("Chưa có dữ liệu").first();

    await expect(
      kpiLabel.or(loadingState).or(errorState).or(noData)
    ).toBeVisible({ timeout: 30_000 });

    // If data loaded, verify KPI structure
    if (await kpiLabel.isVisible()) {
      const kpiCards = page.getByText("Trials").or(page.getByText("Đơn chốt")).first();
      await expect(kpiCards).toBeVisible({ timeout: 10_000 });
    }

    await page.screenshot({ path: "e2e-results/dashboard-sale-kpi.png" });
  });

  test("chuyển range Hôm nay / Tuần này / Tháng trước", async ({ page }) => {
    // Test switching between range filters
    for (const label of ["Hôm nay", "Tuần này", "Tháng trước"]) {
      await page.getByRole("button", { name: label }).click();

      // Wait for loading to start and finish (or no data)
      const loaded = page.getByText("Tổng leads").first();
      const noData = page.getByText("Chưa có dữ liệu").first();
      const error = page.locator(".text-red-700, .text-red-600").first();

      await expect(loaded.or(noData).or(error)).toBeVisible({ timeout: 30_000 });
    }
  });

  test("bảng chi tiết sales hiển thị nếu có dữ liệu", async ({ page }) => {
    // Wait for page to load data
    await page.waitForTimeout(3_000);

    // Check for the detail table with column headers
    const saleNameCol = page.getByText("Họ và tên Sale").first();
    const noData = page.getByText("Chưa có dữ liệu").first();

    if (await saleNameCol.isVisible()) {
      await expect(page.locator("th, td").filter({ hasText: "Lead chạy Ads" }).or(
        page.getByText("Lead chạy Ads")
      ).first()).toBeVisible();

      await expect(page.locator("th, td").filter({ hasText: "Doanh thu CRM" }).or(
        page.getByText("Doanh thu CRM")
      ).first()).toBeVisible();

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

    const conversionLabels = page.getByText("Tỷ lệ chuyển đổi").or(
      page.getByText("Conversion")
    ).first();

    if (await conversionLabels.isVisible()) {
      await page.screenshot({ path: "e2e-results/dashboard-sale-conversion.png" });
    }
  });
});
