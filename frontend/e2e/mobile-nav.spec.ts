// frontend/e2e/mobile-nav.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Mobile: bottom nav + sheet Thêm", () => {
  test("mở được module ngoài 4 slot đầu qua sheet Thêm", async ({ page }) => {
    await page.goto("/");
    const bottomNav = page.getByRole("navigation", { name: "Điều hướng chính" });
    await expect(bottomNav).toBeVisible();

    await bottomNav.getByRole("button", { name: "Thêm" }).click();
    const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
    await expect(sheet).toBeVisible();

    // Account full quyền: "Sổ doanh thu" nằm ngoài 4 slot đầu
    await sheet.getByRole("button", { name: /Sổ doanh thu/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Sổ doanh thu/i);
  });

  test("sheet Thêm expand nhóm con (Đối soát giao dịch)", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: "Thêm" })
      .click();
    const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
    await sheet.getByRole("button", { name: /Đối soát giao dịch/ }).click();
    await sheet.getByRole("button", { name: /Chuyển khoản/ }).click();
    await expect(sheet).toBeHidden();
  });

  test("sidebar desktop không hiện trên mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("aside")).toBeHidden();
  });
});
