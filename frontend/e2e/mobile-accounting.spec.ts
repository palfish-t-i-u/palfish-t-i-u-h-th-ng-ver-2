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

test.describe("Mobile GĐ2: màn Kế toán", () => {
  test("B1 Payment Requests: card view, không render bảng", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Payment Request/);
    await expect(page.locator(".mobile-card-list")).toBeVisible();
    await expect(page.locator(".tbl-wrap table")).not.toBeVisible();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("B2 Đối soát: card view, không render bảng", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Đối soát/);
    await expect(page.locator(".tbl-wrap table")).not.toBeVisible();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("B3 Kích hoạt: card view, không render bảng", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Kích hoạt/);
    await expect(page.locator(".tbl-wrap table")).not.toBeVisible();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("B4 Hoá đơn: card view, không render bảng", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Hoá đơn|Xuất hóa đơn/);
    await expect(page.locator(".tbl-wrap table")).not.toBeVisible();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("B5 Đối soát card: card view, không render bảng", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Quẹt thẻ/);
    await expect(page.locator(".mobile-card-list")).toBeVisible();
    await expect(page.locator(".tbl-wrap.desktop-only table")).not.toBeVisible();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });
});
