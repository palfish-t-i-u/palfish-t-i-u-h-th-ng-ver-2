// frontend/e2e/journeys/admin-smoke.spec.ts
import { test, expect } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "../helpers/navigation";
import { waitForLoaded, expectTableRows } from "../helpers/assertions";

test.describe("Admin: Auth Accounts + Permissions smoke", () => {
  test("Auth Accounts — page loads with user table", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Tài khoản Auth");
    await expectModuleLoaded(page, "Tài khoản Auth");
    await waitForLoaded(page);

    await expectTableRows(page, 1);

    await expect(
      page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'))
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "e2e-results/admin-auth-accounts.png" });
  });

  test("Permissions — matrix loads with departments × modules", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Phân quyền sử dụng");
    await expectModuleLoaded(page, "Phân quyền");
    await waitForLoaded(page);

    await expect(page.locator("text=Bán hàng")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Nhân sự")).toBeVisible();
    await expect(page.locator("text=Marketing")).toBeVisible();

    await expect(page.locator("text=Bảng thông tin")).toBeVisible();
    await expect(page.locator("text=Quản lý thanh toán")).toBeVisible();

    await expect(
      page.locator("text=Toàn quyền").or(page.locator("text=Chỉ xem"))
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "e2e-results/admin-permissions.png" });
  });
});
