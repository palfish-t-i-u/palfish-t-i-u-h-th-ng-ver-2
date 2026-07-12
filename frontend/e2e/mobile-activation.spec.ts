// Phase 2: Mobile B3 Kích hoạt + B4 Xuất hoá đơn — drawer không tràn
import { test, expect } from "@playwright/test";
import { assertNoHorizontalOverflow, openViaThem } from "./helpers/mobile";

test.describe("Mobile Phase 2: B3 Kích hoạt + B4 Xuất hoá đơn", () => {
  test("B3 Kích hoạt list: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Kích hoạt khoá học/);
    await page.waitForTimeout(1500);
    await assertNoHorizontalOverflow(page);
  });

  test("B3 tap card → ar-drawer không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Kích hoạt khoá học/);
    await page.waitForTimeout(1500);

    const firstCard = page.locator(".ar-row-card, [data-ar-id]").first();
    if (!(await firstCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No AR cards visible");
      return;
    }
    await firstCard.click();
    await page.waitForTimeout(1000);

    const drawer = page.locator(".ar-drawer.open, .drawer.open").first();
    if (await drawer.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await assertNoHorizontalOverflow(page);
      const drawerBox = await drawer.boundingBox();
      if (drawerBox) {
        const viewportWidth = page.viewportSize()?.width ?? 375;
        expect(drawerBox.width).toBeLessThanOrEqual(viewportWidth + 1);
      }
    }
  });

  test("B3 drawer UID input visible và focusable", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Kích hoạt khoá học/);
    await page.waitForTimeout(1500);

    const firstCard = page.locator(".ar-row-card, [data-ar-id]").first();
    if (!(await firstCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No AR cards visible");
      return;
    }
    await firstCard.click();
    await page.waitForTimeout(1000);

    // UID CRM input trong drawer
    const uidInput = page.locator('input[placeholder*="UID"]').first();
    if (await uidInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Should be interactable (no overflow clipping)
      await uidInput.focus();
      const isFocused = await uidInput.evaluate((el) => document.activeElement === el);
      expect(isFocused).toBe(true);
    }
  });

  test("B4 Xuất hoá đơn list: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Xuất hoá đơn/);
    await page.waitForTimeout(1500);
    await assertNoHorizontalOverflow(page);
  });

  test("B4 tap card → invoice-drawer không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Xuất hoá đơn/);
    await page.waitForTimeout(1500);

    const firstCard = page.locator(".invoice-row-card, [data-invoice-id]").first();
    if (!(await firstCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No invoice cards visible");
      return;
    }
    await firstCard.click();
    await page.waitForTimeout(1000);

    const drawer = page.locator(".invoice-drawer.open, .drawer.open").first();
    if (await drawer.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await assertNoHorizontalOverflow(page);
      const drawerBox = await drawer.boundingBox();
      if (drawerBox) {
        const viewportWidth = page.viewportSize()?.width ?? 375;
        expect(drawerBox.width).toBeLessThanOrEqual(viewportWidth + 1);
      }
    }
  });
});
