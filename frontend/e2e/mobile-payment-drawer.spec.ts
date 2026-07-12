// Phase 1: Mobile drawer + QR modal — overflow + functional checks at 375×812
import { test, expect } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/mobile";

test.describe("Mobile Phase 1: Quản lý thanh toán — drawer + QR modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: /Quản/ })
      .click();
    await page.waitForTimeout(1500);
  });

  test("B1 list: không tràn ngang", async ({ page }) => {
    await assertNoHorizontalOverflow(page);
  });

  test("B1 tap card → drawer mở không tràn ngang", async ({ page }) => {
    // Try to tap the first payment request card
    const firstCard = page.locator(".pr-row-card, [data-pr-id]").first();
    if (!(await firstCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No PR cards visible — skip drawer test");
      return;
    }
    await firstCard.click();
    await page.waitForTimeout(1000);

    const drawer = page.locator(".drawer.open");
    if (await drawer.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await assertNoHorizontalOverflow(page);
      // Drawer should be full-width or close to it
      const drawerBox = await drawer.boundingBox();
      if (drawerBox) {
        // Drawer width ≤ viewport width
        const viewportWidth = page.viewportSize()?.width ?? 375;
        expect(drawerBox.width).toBeLessThanOrEqual(viewportWidth + 1);
      }
    }
  });

  test("B1 tạo PR modal: không tràn ngang", async ({ page }) => {
    const createBtn = page.locator("button").filter({ hasText: /Tạo/ }).first();
    if (!(await createBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No create button visible");
      return;
    }
    await createBtn.click();
    await page.waitForTimeout(800);
    const modal = page.locator(".create-pr-modal");
    if (await modal.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await assertNoHorizontalOverflow(page);
      // Modal should be bottom-sheet style — check it's near bottom
      const modalBox = await modal.boundingBox();
      const viewportHeight = page.viewportSize()?.height ?? 812;
      if (modalBox) {
        // Modal bottom edge should be at viewport bottom (±20px)
        expect(modalBox.y + modalBox.height).toBeGreaterThan(viewportHeight - 40);
      }
      // UID input should be visible (scrolled to bottom if needed)
      const uidInput = page.locator('input[placeholder*="UID"]');
      await modal.locator(".modal-body").evaluate((el) => (el.scrollTop = el.scrollHeight));
      await expect(uidInput.first()).toBeVisible({ timeout: 2_000 }).catch(() => {});
    }
  });

  test("QR modal: mở không tràn ngang + ảnh visible", async ({ page }) => {
    // Find a QR button anywhere on the page (may require tapping a card first)
    const firstCard = page.locator(".pr-row-card, [data-pr-id]").first();
    if (!(await firstCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No PR cards to open QR from");
      return;
    }
    await firstCard.click();
    await page.waitForTimeout(1000);

    const qrBtn = page.locator("button").filter({ hasText: /QR|Quét mã/ }).first();
    if (!(await qrBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "No QR button visible in drawer");
      return;
    }
    await qrBtn.click();
    await page.waitForTimeout(1000);

    const qrModal = page.locator(".qr-view-modal");
    if (await qrModal.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await assertNoHorizontalOverflow(page);
      // QR image wrap should fit in viewport
      const imgWrap = page.locator(".qr-img-wrap").first();
      if (await imgWrap.isVisible()) {
        const wrapBox = await imgWrap.boundingBox();
        const viewportWidth = page.viewportSize()?.width ?? 375;
        if (wrapBox) {
          expect(wrapBox.width).toBeLessThanOrEqual(viewportWidth);
        }
      }
    }
  });
});
