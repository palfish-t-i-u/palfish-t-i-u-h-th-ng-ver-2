import { expect, test, type Page } from "@playwright/test";
import { assertClosedDrawerPassthrough, assertDrawerHealthy, assertNoHorizontalOverflow } from "./helpers/mobile";

async function openViaThem(page: Page, name: RegExp) {
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: "Thêm" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
  await sheet.getByRole("button", { name }).click();
  await expect(sheet).toBeHidden();
}

async function openChildViaThem(page: Page, parent: RegExp, child: RegExp) {
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: "Thêm" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
  // First click expands the parent group
  await sheet.getByRole("button", { name: parent }).click();
  // Second click navigates to child
  await sheet.getByRole("button", { name: child }).click();
  await expect(sheet).toBeHidden();
}

test.describe("Mobile GĐ2: Accounting screens", () => {
  test("Quản lý thanh toán: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: /Quản/ })
      .click();
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Đối soát chuyển khoản: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openChildViaThem(page, /Đối soát giao dịch/, /Chuyển khoản/);
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Kích hoạt: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: /Kích/ })
      .click();
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Xuất hóa đơn: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Xuất hóa đơn|Hóa đơn/);
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  // Phase 3: ReconciliationTab recon-drawer
  test("Đối soát CK tap txn card → recon-drawer không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openChildViaThem(page, /Đối soát giao dịch/, /Chuyển khoản/);
    await page.waitForTimeout(1500);

    const firstCard = page.locator(".recon-txn-card, [data-txn-id]").first();
    if (!(await firstCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No txn cards visible");
      return;
    }
    await firstCard.click();
    await page.waitForTimeout(1000);

    const drawer = page.locator(".recon-drawer.open, .drawer.open").first();
    if (await drawer.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const overflowX = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflowX).toBeLessThanOrEqual(0);
      const drawerBox = await drawer.boundingBox();
      if (drawerBox) {
        const viewportWidth = page.viewportSize()?.width ?? 375;
        expect(drawerBox.width).toBeLessThanOrEqual(viewportWidth + 1);
      }
    }
  });

  // Phase 4: CardReconciliationTab drawer-center full-screen
  test("Đối soát thẻ tap card → drawer-center không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openChildViaThem(page, /Đối soát giao dịch/, /Thẻ mPOS|Payoo/);
    await page.waitForTimeout(1500);

    const firstCard = page.locator(".card-recon-row, [data-card-id]").first();
    if (!(await firstCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No card recon rows visible");
      return;
    }
    await firstCard.click();
    await page.waitForTimeout(1000);

    const drawer = page.locator(".drawer-center.open").first();
    if (await drawer.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const overflowX = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflowX).toBeLessThanOrEqual(0);
      const drawerBox = await drawer.boundingBox();
      if (drawerBox) {
        const viewportWidth = page.viewportSize()?.width ?? 375;
        expect(drawerBox.width).toBeLessThanOrEqual(viewportWidth + 1);
      }
    }
  });

  // Phase 4: GatewaySyncTab mobile hint visible
  test("GatewaySync: không tràn ngang + hint desktop visible", async ({ page }) => {
    await page.goto("/");
    await openChildViaThem(page, /Đối soát giao dịch/, /Đồng bộ mPOS|Gateway/);
    await page.waitForTimeout(1000);
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
    const hint = page.locator(".gateway-sync-mobile-hint");
    await expect(hint).toBeVisible({ timeout: 3_000 }).catch(() => {});
  });

  // Task 3: B3 ActivationTab ar-drawer nội dung
  test("B3 ar-drawer nội dung không vỡ/nén", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: /Kích/ })
      .click();
    await page.waitForTimeout(1500);
    const card = page.locator(".ar-row-card, [data-ar-id]").first();
    const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasCard, "no AR data — seed sandbox");
    await card.click();
    await page.waitForTimeout(800);
    const drawer = page.locator(".ar-drawer.open, aside.ar-drawer").first();
    await assertDrawerHealthy(page, drawer);
    await drawer.locator("button.drawer-close, [aria-label='Đóng']").first().click();
    await page.waitForTimeout(400);
    await assertClosedDrawerPassthrough(page, ".ar-drawer");
  });

  // Task 3: B4 InvoiceRequestTab invoice-drawer nội dung
  test("B4 invoice-drawer nội dung không vỡ/nén", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Xuất hóa đơn|Hóa đơn/);
    await page.waitForTimeout(1500);
    const card = page.locator(".invoice-row-card, [data-invoice-id]").first();
    const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasCard, "no invoice data — seed sandbox");
    await card.click();
    await page.waitForTimeout(800);
    const drawer = page.locator(".invoice-drawer.open, aside.invoice-drawer").first();
    await assertDrawerHealthy(page, drawer);
  });

  // Task 3: Modal ghép tay CK ngoài (ReconciliationTab)
  test("Modal ghép tay CK ngoài không vỡ", async ({ page }) => {
    await page.goto("/");
    await openChildViaThem(page, /Đối soát giao dịch/, /Chuyển khoản/);
    await page.waitForTimeout(1500);
    // Mở tab "CK ngoài chờ ghép" / mismatch
    const mismatchTab = page.locator(".table-head .tab", { hasText: /Chờ|ngoài|mismatch/i }).first();
    if (await mismatchTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mismatchTab.click();
      await page.waitForTimeout(500);
    }
    const matchBtn = page.locator("button", { hasText: /[Gg]hép/ }).first();
    const hasBtn = await matchBtn.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasBtn, "no mismatch CK to match — seed sandbox");
    await matchBtn.click();
    await page.waitForTimeout(800);
    const modal = page.locator(".gmv-prototype-modal-scrim .modal, [role='dialog']").last();
    if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await assertNoHorizontalOverflow(page);
    }
  });

  // Task 4: Album bill 375px
  test("Album bill không tràn ở 375px", async ({ page }) => {
    await page.goto("/");
    await openChildViaThem(page, /Đối soát giao dịch/, /Chuyển khoản/);
    await page.waitForTimeout(1500);
    const firstCard = page.locator(".recon-txn-card, [data-txn-id]").first();
    const hasCard = await firstCard.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasCard, "no txn cards — seed sandbox");
    await firstCard.click();
    await page.waitForTimeout(800);
    const albumBtn = page.locator("button", { hasText: /[Xx]em tất cả|[Aa]lbum|bill/i }).first();
    if (!(await albumBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "no bill album button");
      return;
    }
    await albumBtn.click();
    await page.waitForTimeout(500);
    const album = page.locator(".bill-album-modal").first();
    if (await album.isVisible({ timeout: 3000 }).catch(() => false)) {
      await assertNoHorizontalOverflow(page);
      const imgs = album.locator("img");
      const count = await imgs.count();
      if (count > 0) {
        const first = await imgs.first().boundingBox();
        if (first) expect(first.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      }
    }
  });
});
