// frontend/e2e/helpers/navigation.ts
import { expect, type Page } from "@playwright/test";

export async function navigateTo(page: Page, sidebarLabel: string): Promise<void> {
  // Handle nested items under "Báo cáo" parent
  const BC_CHILDREN = ["BC01: Sales performance", "BC02: Key Data", "BC03 — Báo cáo tổng bộ"];
  if (BC_CHILDREN.includes(sidebarLabel)) {
    const child = page.locator("nav").getByText(sidebarLabel, { exact: false }).first();
    const childVisible = await child.isVisible().catch(() => false);
    if (!childVisible) {
      // Sidebar có 2 chỗ chứa "Báo cáo": tiêu đề section (text thường, không
      // click được, đứng TRƯỚC trong DOM) và nút thật "Báo cáo ›" (chevron
      // nằm trong cùng accessible name). getByText(...).first() từng chọn
      // nhầm tiêu đề section — dùng getByRole("button", ...) để chỉ khớp nút.
      const parent = page.locator("nav").getByRole("button", { name: "Báo cáo", exact: false }).first();
      if (await parent.isVisible().catch(() => false)) {
        await parent.click();
        await page.waitForTimeout(300);
      }
    }
  }

  const item = page.locator("nav").getByText(sidebarLabel, { exact: false }).first();
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
  await page.waitForTimeout(500);
}

export async function expectModuleLoaded(page: Page, heading: string): Promise<void> {
  await expect(
    page.locator("h1, h2, h3").filter({ hasText: heading }).first()
  ).toBeVisible({ timeout: 15_000 });
}

export async function expectSidebarVisible(page: Page, label: string): Promise<void> {
  await expect(
    page.locator("nav").getByText(label, { exact: false }).first()
  ).toBeVisible({ timeout: 5_000 });
}

export async function expectSidebarHidden(page: Page, label: string): Promise<void> {
  await expect(
    page.locator("nav").getByText(label, { exact: false }).first()
  ).not.toBeVisible({ timeout: 3_000 });
}
