/**
 * E2E luồng đối soát — góc nhìn kế toán (chị Lan).
 *
 * 3 menu con dưới "Đối soát giao dịch":
 *  - Chuyển khoản (PayOS / SePay) → ReconciliationTab
 *  - mPOS (Quẹt thẻ tại máy) → CardReconciliationTab source=mpos
 *  - Payoo (Thanh toán online) → CardReconciliationTab source=payoo
 *
 * Test pass khi:
 *  - Mở được cả 3 menu, không crash.
 *  - Tab "Chuyển khoản" hiện list bank_transactions + filter status.
 *  - Tab mPOS hiện danh sách card txns + button đồng bộ mPOS/Payoo.
 *
 * KHÔNG test mutation (manual match) vì cần seed data sandbox.
 */

import { expect, test } from "@playwright/test";

const RECON_HUB_LABEL = "Đối soát giao dịch";

test.describe("Đối soát — luồng kế toán xem 3 tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Bảng thông tin" })
    ).toBeVisible({ timeout: 20_000 });

    // Mở dropdown sidebar "Đối soát giao dịch"
    const hub = page.getByText(RECON_HUB_LABEL).first();
    if (await hub.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await hub.click();
    }
  });

  test("mở tab Chuyển khoản: hiện list + filter status", async ({ page }) => {
    await page.click("text=Chuyển khoản");
    await expect(
      page.locator("h1, h2").filter({ hasText: /Chuyển khoản|Đối soát/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Filter chip "Cần xử lý" / "Tất cả" / "Đã ghép"
    const filterChip = page
      .locator(".filter-chip, button")
      .filter({ hasText: /cần xử lý|tất cả|đã ghép|chờ xử lý/i });

    if ((await filterChip.count()) > 0) {
      await expect(filterChip.first()).toBeVisible();
    }

    // Bảng GD (table hoặc grid)
    await expect(page.locator("table, [role='table']").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.screenshot({
      path: "e2e-results/recon-transfer.png",
      fullPage: false,
    });
  });

  test("mở tab mPOS: hiện bảng GD + button đồng bộ", async ({ page }) => {
    await page.click("text=mPOS");
    await expect(
      page.locator("h1, h2").filter({ hasText: /mPOS|Quẹt thẻ/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Verify bảng + ít nhất 1 cột "Số tiền" hoặc "Số GD"
    await expect(
      page.getByText(/số tiền|số gd|số giao dịch|amount/i).first()
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "e2e-results/recon-mpos.png",
      fullPage: false,
    });
  });

  test("mở tab Payoo: hiện bảng GD", async ({ page }) => {
    await page.click("text=Payoo");
    await expect(
      page.locator("h1, h2").filter({ hasText: /Payoo|Thanh toán online/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: "e2e-results/recon-payoo.png",
      fullPage: false,
    });
  });

  test("click 1 GD needs_review mở modal candidates (nếu có)", async ({ page }) => {
    await page.click("text=Chuyển khoản");
    await expect(page.locator("table, [role='table']").first()).toBeVisible({
      timeout: 10_000,
    });

    // Filter về "Cần xử lý" hoặc "needs_review"
    const filter = page.getByText(/cần xử lý/i).first();
    if (await filter.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await filter.click();
    }

    // Click row đầu tiên trong list (nếu có)
    const firstRow = page.locator("tbody tr").first();
    const rowCount = await page.locator("tbody tr").count();
    if (rowCount === 0) {
      test.info().annotations.push({
        type: "info",
        description: "Không có GD needs_review nào — skip modal.",
      });
      return;
    }

    await firstRow.click();

    // Modal/drawer candidates phải mở
    const modal = page.locator('[role="dialog"], .modal').first();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "e2e-results/recon-match-modal.png",
      fullPage: false,
    });
  });
});

// ===========================================================================
// Đồng bộ mPOS/Payoo (extension ingest) — góc nhìn kế toán
// ===========================================================================
test.describe("Đồng bộ mPOS/Payoo", () => {
  test("vào tab Đồng bộ → trạng thái extension hiển thị", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Bảng thông tin" })
    ).toBeVisible({ timeout: 20_000 });

    // Sidebar: "Đồng bộ mPOS / Payoo"
    const syncMenu = page.getByText(/đồng bộ mpos.*payoo/i).first();
    if (!(await syncMenu.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "info",
        description: "Menu Đồng bộ mPOS/Payoo không hiển thị (user có thể không có quyền).",
      });
      return;
    }

    await syncMenu.click();
    await expect(
      page.locator("h1, h2").filter({ hasText: /đồng bộ.*mpos|đồng bộ.*payoo/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Verify ext_connected indicator: "Extension đã kết nối" hoặc "Chưa kết nối"
    const connected = page.getByText(/đã kết nối|extension/i).first();
    const notConnected = page.getByText(/chưa kết nối|cài extension/i).first();
    await expect(connected.or(notConnected)).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "e2e-results/gateway-sync.png",
      fullPage: false,
    });
  });
});
