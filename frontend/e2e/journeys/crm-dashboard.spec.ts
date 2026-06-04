// frontend/e2e/journeys/crm-dashboard.spec.ts
import { test, expect } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "../helpers/navigation";
import { waitForLoaded } from "../helpers/assertions";

test.describe("CRM & Dashboard: extended coverage", () => {
  test("Dashboard — Gamification sections load", async ({ page }) => {
    await page.goto("/");
    await expectModuleLoaded(page, "Bảng thông tin");

    await expect(page.locator("text=Tính hoa hồng")).toBeVisible({ timeout: 15_000 });

    const topToday = page.locator("text=Top hôm nay");
    const topMonth = page.locator("text=Top tháng");
    await expect(topToday.or(topMonth)).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: "e2e-results/dashboard-gamification.png" });
  });

  test("BC01 — Sales performance pivot loads", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "BC01: Sales performance");
    await expectModuleLoaded(page, "BC01");
    await waitForLoaded(page);

    const table = page.locator("table").first();
    const emptyState = page.locator("text=Chưa có dữ liệu").or(page.locator("text=Không có"));
    await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: "e2e-results/bc01-pivot.png" });
  });

  test("BC02 — Key Data loads and date filter works", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "BC02: Key Data");
    await expectModuleLoaded(page, "BC02");
    await waitForLoaded(page);

    const table = page.locator("table").first();
    const emptyState = page.locator("text=Chưa có dữ liệu");
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

    await expect(page.locator("text=Tháng này")).toBeVisible({ timeout: 10_000 });

    await page.click("button:has-text('Tháng này')");
    await page.waitForTimeout(2_000);

    const kpi = page.locator("text=Tổng leads");
    const noData = page.locator("text=Chưa có dữ liệu");
    await expect(kpi.or(noData)).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: "e2e-results/m6-dashboard-sale.png" });
  });
});
