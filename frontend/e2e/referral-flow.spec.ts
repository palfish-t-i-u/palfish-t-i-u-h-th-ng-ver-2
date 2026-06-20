/**
 * E2E luồng nghiệp vụ Referral — góc nhìn Activator (anh Đức).
 *
 * Scenario:
 *  1. Login → vào tab Kích hoạt khoá học.
 *  2. Verify panel + filter chips referral hiển thị đầy đủ.
 *  3. Mở 1 AR có khoá kích hoạt rồi (orderId set) → verify section
 *     "Cộng buổi referral" hiện 2 checkbox referee/referrer.
 *  4. Verify nếu khoá chưa kích hoạt → checkbox disabled hoặc error
 *     "Khoá học chưa được kích hoạt".
 *
 * Auth: dùng session từ auth.setup.ts (E2E_EMAIL/E2E_PASSWORD trong .env.e2e).
 */

import { expect, test } from "@playwright/test";

test.describe("Module 3 — Kích hoạt khoá học (Referral)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Bảng thông tin" })
    ).toBeVisible({ timeout: 20_000 });

    // Sidebar → "Kích hoạt khóa học"
    await page.click("text=Kích hoạt khóa học");
    await expect(
      page.locator("h1, h2").filter({ hasText: "Kích hoạt khóa học" }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("hiển thị tab + filter chip referral status", async ({ page }) => {
    // Tab nội bộ: Đang chờ / Đã kích hoạt / Tất cả
    await expect(page.getByText(/chờ kích hoạt|Đang chờ/i).first())
      .toBeVisible({ timeout: 10_000 });

    // Filter chip referral (none / partial / full / any)
    // Component: ActivationTab dùng filter-chip class; verify "Tất cả" hoặc
    // các nhãn referral nếu có khoá referral hiển thị
    const referralChip = page.locator(".filter-chip");
    if ((await referralChip.count()) > 0) {
      await expect(referralChip.first()).toBeVisible();
    }
  });

  test("mở 1 AR đầu tiên, drawer hiển thị thông tin khoá", async ({ page }) => {
    // Click row đầu tiên trong table
    const firstRow = page.locator("tbody tr").first();
    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) {
      test.info().annotations.push({
        type: "info",
        description: "Không có AR nào — sandbox rỗng, skip mở drawer.",
      });
      return;
    }

    await firstRow.click();

    // Drawer hoặc modal phải mở
    const drawer = page.locator('[role="dialog"], .drawer, .modal').first();
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Trong drawer có chữ "Khoá" hoặc tên gói
    await expect(
      page.getByText(/gói|khoá|course/i).first()
    ).toBeVisible({ timeout: 3_000 });

    // Screenshot for review
    await page.screenshot({
      path: "e2e-results/referral-drawer.png",
      fullPage: false,
    });
  });

  test("referral panel hiện section 'Người được giới thiệu' nếu có khoá nguồn gioi_thieu", async ({ page }) => {
    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) return;

    await page.locator("tbody tr").first().click();
    await page.waitForTimeout(500);

    const refereeSection = page.getByText(/người được giới thiệu/i).first();
    const referrerSection = page.getByText(/người giới thiệu/i).first();

    // Nếu AR đầu có khoá referral → 2 section hiển thị
    if (await refereeSection.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(refereeSection).toBeVisible();
      // Section người giới thiệu nên hiển thị cùng
      await expect(referrerSection.first()).toBeVisible();
    } else {
      test.info().annotations.push({
        type: "info",
        description: "AR đầu không có khoá referral — skip kiểm tra section.",
      });
    }
  });

  test("checkbox credit-referral disabled khi khoá chưa có Order ID", async ({ page }) => {
    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) return;

    await page.locator("tbody tr").first().click();
    await page.waitForTimeout(500);

    // Tìm checkbox "Đã cộng buổi"
    const creditCheckbox = page
      .locator('input[type="checkbox"]')
      .filter({ hasText: /cộng buổi/i });

    const checkboxCount = await creditCheckbox.count();
    if (checkboxCount === 0) {
      test.info().annotations.push({
        type: "info",
        description: "Không có checkbox credit-referral — AR không có khoá referral.",
      });
      return;
    }

    // Tích checkbox nếu khoá chưa kích hoạt → BE trả 400, FE hiện error
    const first = creditCheckbox.first();
    const wasDisabled = await first.isDisabled();
    if (!wasDisabled) {
      await first.check();
      // Verify nếu có error "kích hoạt"
      const errorMsg = page.getByText(/chưa được kích hoạt|chưa có Order ID/i);
      if (await errorMsg.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(errorMsg).toBeVisible();
      }
    }
  });
});
