// e2e/pr-transfer-smoke.spec.ts — chạy project "e2e" (admin account, user.json).
// Smoke tạo hộ + chuyển giao PR (23/7) trên FE local → BE sandbox thật:
// - modal Tạo PR có ô "Sale sở hữu PR" (owner-options 200 từ BE)
// - drawer PR có nút "Chuyển sale" + thông tin sở hữu (ownership-log 200)
// - modal Chuyển sale mở được (KHÔNG chuyển thật — chỉ smoke UI + API đọc)
// Viết theo BẤT BIẾN: không hard-code tên sale/PR; sandbox rỗng → skip.

import { expect, test } from "@playwright/test";
import { navigateTo } from "./helpers/navigation";

test.describe("Tạo hộ + chuyển giao PR — smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Quản lý thanh toán");
    await expect(page.locator(".toolbar")).toBeVisible({ timeout: 20_000 });
  });

  test("modal Tạo PR có ô 'Sale sở hữu PR' (admin thấy, options load từ BE)", async ({ page }) => {
    await page.getByRole("button", { name: /Tạo Payment Request/i }).click();
    await expect(page.getByText("Tạo Payment Request mới")).toBeVisible();
    await expect(page.getByText("Sale sở hữu PR", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.locator(".modal").getByRole("button", { name: "Huỷ", exact: true }).click();
  });

  test("drawer PR: nút Chuyển sale + thông tin sở hữu + modal chuyển mở được", async ({ page }) => {
    // Chỉ row thật (có PR-ID) — tránh click trúng row placeholder "Không có PR nào
    // khớp" khi list chưa fetch xong (race lần chạy đầu).
    const rows = page.locator("table tbody tr").filter({ hasText: /PR-/ });
    const hasRow = await rows
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRow) {
      test.skip(true, "Sandbox không có PR — bỏ qua");
      return;
    }
    await rows.first().click();

    const transferBtn = page.getByRole("button", { name: /Chuyển sale|Bàn giao cho leader/ });
    await expect(transferBtn).toBeVisible({ timeout: 15_000 });

    // Lịch sử giấu sau nút "Xem lịch sử" (kiểu CRM) → modal 2 nhật ký
    await page.getByRole("button", { name: "Xem lịch sử", exact: true }).click();
    await expect(page.getByText(/Lịch sử PR —/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Lịch sử lưu chuyển (sở hữu)")).toBeVisible();
    await expect(page.getByText(/Tạo PR|Tạo hộ|Chuyển giao/).first()).toBeVisible({ timeout: 15_000 });
    await page.locator(".modal").getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(page.getByText(/Lịch sử PR —/)).not.toBeVisible();

    await transferBtn.click();
    await expect(page.getByText(/Chuyển sale —|Bàn giao PR cho leader —/)).toBeVisible();
    await expect(page.getByText("Chuyển cho").first()).toBeVisible();
    // Đóng — không chuyển thật trên sandbox
    await page.locator(".modal").getByRole("button", { name: "Huỷ", exact: true }).click();
    await expect(page.getByText(/Chuyển sale —|Bàn giao PR cho leader —/)).not.toBeVisible();
  });
});
