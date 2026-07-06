// frontend/e2e/mobile-sales.spec.ts
import { expect, test, type Page } from "@playwright/test";

async function openViaThem(page: Page, name: RegExp) {
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: "Thêm" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
  await sheet.getByRole("button", { name }).click();
  await expect(sheet).toBeHidden();
}

test.describe("Mobile GĐ1: màn Sales", () => {
  test("Bảng thông tin: không tràn ngang, BXH render", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: "Bảng" })
      .click();
    await expect(page.getByText(/Bảng xếp hạng tháng/)).toBeVisible();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Sổ doanh thu: card view, không render bảng", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Sổ doanh thu/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Sổ doanh thu/i);
    await expect(page.locator("main table")).toHaveCount(0);
  });

  test("Dashboard Sale: KPI cards hiện, không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Dashboard Sale/);
    await expect(page.getByText("Tổng số L1")).toBeVisible();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });
});
