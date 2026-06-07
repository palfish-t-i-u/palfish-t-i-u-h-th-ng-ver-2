import { expect, type Page } from "@playwright/test";

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  const toast = typeof text === "string"
    ? page.locator(`text=${text}`).first()
    : page.locator("div").filter({ hasText: text }).first();
  await expect(toast).toBeVisible({ timeout: 10_000 });
}

export async function waitForLoaded(page: Page): Promise<void> {
  // Wait for common loading indicators to disappear
  const spinner = page.locator("text=Đang tải").or(page.locator(".animate-pulse")).first();
  try {
    await spinner.waitFor({ state: "hidden", timeout: 30_000 });
  } catch {
    // If no spinner was found, the page is already loaded
  }
}

export async function expectEmptyState(page: Page, text?: string): Promise<void> {
  const selector = text
    ? page.locator(`text=${text}`).first()
    : page.locator("text=Chưa có dữ liệu").or(page.locator("text=Không có dữ liệu")).first();
  await expect(selector).toBeVisible({ timeout: 10_000 });
}

export async function expectTableRows(page: Page, min: number): Promise<void> {
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(min);
}
