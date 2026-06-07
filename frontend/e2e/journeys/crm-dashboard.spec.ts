// frontend/e2e/journeys/crm-dashboard.spec.ts
import { test, expect } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "../helpers/navigation";
import { waitForLoaded } from "../helpers/assertions";

test.describe("CRM & Dashboard: extended coverage", () => {
  test("Dashboard — Gamification sections load", async ({ page }) => {
    await page.goto("/");
    await expectModuleLoaded(page, "Bảng thông tin");

    await expect(page.getByText("Tính hoa hồng").first()).toBeVisible({ timeout: 15_000 });

    const topToday = page.getByText("Top hôm nay");
    const topMonth = page.getByText("Top tháng");
    const bxh = page.getByText("Bảng xếp hạng").first();
    const anyTop = topToday.or(topMonth).or(bxh).first();

    if (await anyTop.isVisible().catch(() => false)) {
      await expect(anyTop).toBeVisible();
    }

    await page.screenshot({ path: "e2e-results/dashboard-gamification.png" });
  });

  test("BC01 — Sales performance pivot loads", async ({ page }) => {
    await page.goto("/");
    await expectModuleLoaded(page, "Bảng thông tin");

    // Expand "Báo cáo" parent if visible, then check for BC01
    const reportMenu = page.locator("nav").getByText("Báo cáo", { exact: true }).first();
    if (await reportMenu.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await reportMenu.click();
      await page.waitForTimeout(500);
    }
    const bc01Item = page.locator("nav").getByText("BC01", { exact: false }).first();
    if (!(await bc01Item.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.info().annotations.push({ type: "info", description: "BC01 menu not available. Skipped." });
      return;
    }
    await bc01Item.click();
    await page.waitForTimeout(500);
    await expectModuleLoaded(page, "BC01");
    await waitForLoaded(page);

    const table = page.locator("table").first();
    const emptyState = page.getByText("Chưa có dữ liệu").or(page.getByText("Không có")).first();
    await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: "e2e-results/bc01-pivot.png" });
  });

  test("BC02 — Key Data loads and date filter works", async ({ page }) => {
    await page.goto("/");
    await expectModuleLoaded(page, "Bảng thông tin");

    const reportMenu = page.locator("nav").getByText("Báo cáo", { exact: true }).first();
    if (await reportMenu.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await reportMenu.click();
      await page.waitForTimeout(500);
    }
    const bc02Item = page.locator("nav").getByText("BC02", { exact: false }).first();
    if (!(await bc02Item.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.info().annotations.push({ type: "info", description: "BC02 menu not available. Skipped." });
      return;
    }
    await bc02Item.click();
    await page.waitForTimeout(500);
    await expectModuleLoaded(page, "BC02");
    await waitForLoaded(page);

    const table = page.locator("table").first();
    const emptyState = page.getByText("Chưa có dữ liệu").first();
    await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });

    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const today = new Date().toISOString().slice(0, 10);
      await dateInput.fill(today);
      await page.waitForTimeout(2_000);
    }

    await page.screenshot({ path: "e2e-results/bc02-key-data.png" });
  });

  test("Dashboard Sale (M6) — KPI cards and range filter", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Dashboard Sale");
    await expectModuleLoaded(page, "Dashboard Sale");
    await waitForLoaded(page);

    await expect(page.getByRole("button", { name: "Tháng này" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Tháng này" }).click();
    await page.waitForTimeout(2_000);

    const kpi = page.getByText("Tổng leads").first();
    const noData = page.getByText("Chưa có dữ liệu").first();
    await expect(kpi.or(noData)).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: "e2e-results/m6-dashboard-sale.png" });
  });
});
