// frontend/e2e/journeys/admin-smoke.spec.ts
import { test, expect } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "../helpers/navigation";
import { waitForLoaded } from "../helpers/assertions";

test.describe("Admin: Auth Accounts + Permissions smoke", () => {
  test("Auth Accounts — page loads with user table", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Tài khoản Auth");
    await expectModuleLoaded(page, "Tài khoản Auth");
    await waitForLoaded(page);

    // Table always renders; empty state message may appear alongside it
    await expect(page.locator("table").first()).toBeVisible({ timeout: 15_000 });

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

    // Departments — at least one visible, or loading/empty state
    const dept = page.getByText("Bán hàng").first();
    const emptyState = page.getByText("Chưa có dữ liệu").or(page.getByText("Đang tải")).first();
    await expect(dept.or(emptyState)).toBeVisible({ timeout: 10_000 });

    if (await dept.isVisible()) {
      await expect(page.getByText("Bảng thông tin").first()).toBeVisible();
      await expect(page.getByText("Quản lý thanh toán").first()).toBeVisible();

      await expect(
        page.getByText("Toàn quyền").or(page.getByText("Chỉ xem")).first()
      ).toBeVisible({ timeout: 5_000 });
    }

    await page.screenshot({ path: "e2e-results/admin-permissions.png" });
  });
});
