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

test.describe("Mobile GĐ3: Báo cáo + Admin", () => {
  test("Báo cáo BC01: bảng scroll ngang, không tràn", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Báo cáo/);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Tài khoản Auth: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Tài khoản Auth/);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Phân quyền: bảng scroll ngang, không tràn ngoài", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Phân quyền/);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });
});
