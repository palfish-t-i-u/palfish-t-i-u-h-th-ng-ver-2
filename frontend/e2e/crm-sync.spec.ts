import { test, expect } from "@playwright/test";

test.describe("Module 5 — Đồng bộ CRM", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Bảng thông tin")).toBeVisible({ timeout: 20_000 });

    // Navigate to Module 5 — "Đồng bộ CRM" in the sidebar
    await page.click("text=Đồng bộ CRM");
    await expect(page.locator("text=Trạng thái kết nối CRM")).toBeVisible({ timeout: 10_000 });
  });

  test("hiển thị trang Đồng bộ CRM với đầy đủ UI", async ({ page }) => {
    // Page title
    await expect(page.locator("h1, h2").filter({ hasText: "Đồng bộ CRM" })).toBeVisible();

    // Token status section exists
    await expect(page.locator("text=Trạng thái kết nối CRM")).toBeVisible();

    // Token status shows one of: active / missing / loading
    const tokenActive = page.locator("text=Token CRM đang hoạt động");
    const tokenMissing = page.locator("text=Chưa có token CRM");
    const tokenLoading = page.locator("text=Đang kiểm tra token");
    await expect(
      tokenActive.or(tokenMissing).or(tokenLoading)
    ).toBeVisible({ timeout: 10_000 });

    // Sync date input
    await expect(page.locator('input[type="date"]')).toBeVisible();

    // Quick date buttons
    await expect(page.locator("text=Hôm qua")).toBeVisible();
    await expect(page.locator("text=Hôm nay")).toBeVisible();

    // Sync button or instructions section
    const syncBtn = page.locator("text=LẤY DỮ LIỆU");
    const instructions = page.locator("text=Hướng dẫn cài Chrome Extension");
    await expect(syncBtn.or(instructions)).toBeVisible();

    // Instructions section
    await expect(instructions).toBeVisible();
  });

  test("token status hiển thị đúng trạng thái", async ({ page }) => {
    // Wait for token check to complete (pulse animation stops)
    const tokenActive = page.locator("text=Token CRM đang hoạt động");
    const tokenMissing = page.locator("text=Chưa có token CRM");

    // Eventually one of these should appear (loading state resolves)
    await expect(tokenActive.or(tokenMissing)).toBeVisible({ timeout: 15_000 });

    if (await tokenActive.isVisible()) {
      // If token is active, verify the timestamp is shown
      await expect(page.locator("text=cập nhật lần cuối")).toBeVisible();
    } else {
      // If no token, verify the instruction message
      await expect(page.locator("text=Hãy cài Extension")).toBeVisible();
    }
  });

  test("nút quick-date 'Hôm nay' cập nhật input date", async ({ page }) => {
    const dateInput = page.locator('input[type="date"]');
    const todayIso = new Date().toISOString().slice(0, 10);

    await page.click("text=Hôm nay");
    await expect(dateInput).toHaveValue(todayIso);
  });

  test("nút quick-date 'Hôm qua' cập nhật input date", async ({ page }) => {
    const dateInput = page.locator('input[type="date"]');
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterdayIso = d.toISOString().slice(0, 10);

    await page.click("text=Hôm qua");
    await expect(dateInput).toHaveValue(yesterdayIso);
  });

  test("bấm LẤY DỮ LIỆU triggers sync flow", async ({ page }) => {
    const syncBtn = page.locator("button", { hasText: "LẤY DỮ LIỆU" });

    // If button exists and is not disabled, click it
    if (await syncBtn.isVisible()) {
      const isDisabled = await syncBtn.isDisabled();

      if (!isDisabled) {
        await syncBtn.click();

        // Should show loading state OR toast OR error
        const loadingText = page.locator("text=Đang đồng bộ");
        const successToast = page.locator("text=thành công");
        const errorMsg = page.locator(".text-red-700");

        await expect(
          loadingText.or(successToast).or(errorMsg)
        ).toBeVisible({ timeout: 30_000 });

        // Wait for sync to complete
        await expect(
          successToast.or(errorMsg)
        ).toBeVisible({ timeout: 120_000 });

        // Take a screenshot of the result
        await page.screenshot({ path: "e2e-results/crm-sync-result.png" });
      } else {
        // Button disabled = no token → verify disabled state
        await expect(syncBtn).toBeDisabled();
        test.info().annotations.push({
          type: "info",
          description: "Sync button disabled — CRM token chưa có. Test pass (UI đúng).",
        });
      }
    }
  });

  test("nút Làm mới refresh trạng thái token", async ({ page }) => {
    await page.click("text=Làm mới");

    // Should briefly show loading state then resolve
    const tokenActive = page.locator("text=Token CRM đang hoạt động");
    const tokenMissing = page.locator("text=Chưa có token CRM");
    await expect(tokenActive.or(tokenMissing)).toBeVisible({ timeout: 15_000 });
  });
});
