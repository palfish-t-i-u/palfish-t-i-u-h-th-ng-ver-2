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

async function openChildViaThem(page: Page, parent: RegExp, child: RegExp) {
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: "Thêm" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
  // First click expands the parent group
  await sheet.getByRole("button", { name: parent }).click();
  // Second click navigates to child
  await sheet.getByRole("button", { name: child }).click();
  await expect(sheet).toBeHidden();
}

test.describe("Mobile GĐ2: Accounting screens", () => {
  test("Quản lý thanh toán: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: /Quản/ })
      .click();
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Đối soát chuyển khoản: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openChildViaThem(page, /Đối soát giao dịch/, /Chuyển khoản/);
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Kích hoạt: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: /Kích/ })
      .click();
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Xuất hóa đơn: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Xuất hóa đơn|Hóa đơn/);
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });
});
