// e2e/payment-tvts-filter.spec.ts
// Chạy dưới project "e2e" (admin account, user.json).
// Kiểm tra bộ lọc TVTS trên sandbox: https://palfish-gmv-manager-sandbox.vercel.app/
//
// Lưu ý: test viết theo BẤT BIẾN — không hard-code tên sale hay số lượng PR.
// Nếu sandbox không có data (options rỗng) → test.skip để tránh false-failure.

import { expect, test } from "@playwright/test";
import { navigateTo } from "./helpers/navigation";

test.describe("TVTS filter — tab Quản lý thanh toán", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Quản lý thanh toán");
    // Chờ toolbar render (nút TVTS hoặc bảng hiện ra)
    await expect(page.locator(".toolbar")).toBeVisible({ timeout: 20_000 });
  });

  test("admin thấy nút TVTS, lọc 1 TVTS → mọi cell TVTS visible đều khớp label đã chọn", async ({ page }) => {
    const tvtsBtn = page.locator("button.filter-chip", { hasText: /TVTS/i });
    await expect(tvtsBtn).toBeVisible({ timeout: 10_000 });

    // Mở panel
    await tvtsBtn.click();
    const panel = page.locator(".tvts-filter__panel");
    await expect(panel).toBeVisible();

    // Đọc label option đầu tiên
    const firstOption = panel.locator(".tvts-filter__item .tvts-filter__label").first();
    const optionCount = await panel.locator(".tvts-filter__item").count();

    if (optionCount === 0) {
      test.skip(true, "Sandbox không có TVTS options — bỏ qua test này");
      return;
    }

    const chosenLabel = await firstOption.textContent();
    if (!chosenLabel) {
      test.skip(true, "Label rỗng — bỏ qua");
      return;
    }

    // Tick option đầu
    await panel.locator(".tvts-filter__item input").first().click();

    // Đóng panel bằng Escape
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // Kiểm tra mọi cell TVTS visible đều khớp label đã chọn
    const tvtsCells = page.locator('[data-testid="pr-tvts-cell"]');
    const cellCount = await tvtsCells.count();
    for (let i = 0; i < cellCount; i++) {
      await expect(tvtsCells.nth(i)).toHaveText(chosenLabel);
    }
  });

  test("chọn xong có badge count = 1 trên nút TVTS", async ({ page }) => {
    const tvtsBtn = page.locator("button.filter-chip", { hasText: /TVTS/i });
    await tvtsBtn.click();

    const panel = page.locator(".tvts-filter__panel");
    const optionCount = await panel.locator(".tvts-filter__item").count();
    if (optionCount === 0) {
      test.skip(true, "Không có options");
      return;
    }

    await panel.locator(".tvts-filter__item input").first().click();
    await page.keyboard.press("Escape");

    // Badge count = 1 xuất hiện bên trong nút TVTS
    const badge = page.locator(".tvts-filter__count");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("1");
  });

  test("F5 → filter reset: badge biến mất, bảng về trạng thái không lọc", async ({ page }) => {
    const tvtsBtn = page.locator("button.filter-chip", { hasText: /TVTS/i });
    await tvtsBtn.click();

    const panel = page.locator(".tvts-filter__panel");
    const optionCount = await panel.locator(".tvts-filter__item").count();
    if (optionCount === 0) {
      test.skip(true, "Không có options");
      return;
    }

    await panel.locator(".tvts-filter__item input").first().click();
    await page.keyboard.press("Escape");

    // Xác nhận badge đang hiện
    await expect(page.locator(".tvts-filter__count")).toBeVisible();

    // F5
    await page.reload();
    await expect(page.locator(".toolbar")).toBeVisible({ timeout: 20_000 });

    // Badge phải biến mất
    await expect(page.locator(".tvts-filter__count")).toBeHidden();
  });
});

// NOTE: Test "role sale KHÔNG thấy nút TVTS" đã cover ở integration test
// (PaymentRequestsTab.tvtsFilter.test.tsx). E2E case này bỏ qua vì cần
// riêng storageState của account sale (auth-role.setup.ts + e2e/.auth/sale.json)
// và yêu cầu project rbac-sale trong playwright.config.ts.
