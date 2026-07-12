import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function assertNoHorizontalOverflow(page: Page) {
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX, "Page must not overflow horizontally").toBeLessThanOrEqual(0);
}

export async function openViaThem(page: Page, name: RegExp | string) {
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: "Thêm" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
  await sheet.getByRole("button", { name }).click();
  await expect(sheet).toBeHidden();
}
