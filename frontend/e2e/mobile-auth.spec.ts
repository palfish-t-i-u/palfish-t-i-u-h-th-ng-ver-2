import { test, expect } from "@playwright/test";
import { assertNoHorizontalOverflow, assertNoColumnCrush, openViaThem } from "./helpers/mobile";

test.describe("Mobile Auth Accounts Drawer + Modals", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Tài khoản Auth: drawer + CrmLinkModal reflow & flexBasis runtime assertions", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Tài khoản Auth/);
    await page.waitForTimeout(1000);

    await assertNoHorizontalOverflow(page);

    // Locate account card (RowCard with onClick renders a role="button" with email/@)
    const card = page.getByRole("button").filter({ hasText: "@" }).first();
    if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await card.click();
      await page.waitForTimeout(500);

      const drawer = page.locator(".aa-drawer").first();
      if (await drawer.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await assertNoHorizontalOverflow(page);
        await assertNoColumnCrush(drawer);

        // Runtime flexBasis assertion for drawer footer last button (GC3)
        const lastBtnFlexBasis = await page.evaluate(() => {
          const btn = document.querySelector(".aa-drawer-footer > button:last-child");
          return btn ? getComputedStyle(btn).flexBasis : null;
        });
        if (lastBtnFlexBasis) {
          expect(lastBtnFlexBasis).toBe("100%");
        }

        // Open CrmLinkModal using exact button names: "+ Liên kết" or "Thay đổi"
        const crmBtn = page.getByRole("button", { name: /^(\+ Liên kết|Thay đổi)$/ }).first();
        if (await crmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await crmBtn.click();
          await page.waitForTimeout(500);

          const crmModal = page.locator(".aa-crm-modal, [role='dialog']").first();
          if (await crmModal.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await assertNoHorizontalOverflow(page);

            // Runtime flexBasis assertion for search filter (GC3)
            const searchFlexBasis = await page.evaluate(() => {
              const searchEl = document.querySelector(".aa-crm-modal-filters .aa-search");
              return searchEl ? getComputedStyle(searchEl).flexBasis : null;
            });
            if (searchFlexBasis) {
              expect(searchFlexBasis).toBe("100%");
            }
          }
        }
      }
    }
  });
});
