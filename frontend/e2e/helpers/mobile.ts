import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function assertNoHorizontalOverflow(page: Page) {
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX, "Page must not overflow horizontally").toBeLessThanOrEqual(0);
}

/** G3/G4: không có cột/ô nào bị nén thành cột-chữ-dọc.
 *  Bắt trường hợp grid 2 cột không collapse: ô chứa text >8 ký tự mà rộng < minPx. */
export async function assertNoColumnCrush(container: Locator, minPx = 96) {
  const crushed = await container.evaluate((root, min) => {
    const bad: string[] = [];
    root.querySelectorAll("*").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t.length < 8 || el.children.length > 0) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width < min && r.height > r.width * 2.2) {
        bad.push(t.slice(0, 24) + ` (${Math.round(r.width)}px)`);
      }
    });
    return bad;
  }, minPx);
  expect(crushed, `Ô bị nén cột-dọc: ${crushed.join(" | ")}`).toEqual([]);
}

/** G2: drawer khi ĐÓNG không được chặn tap ở giữa màn. */
export async function assertClosedDrawerPassthrough(page: Page, drawerSelector: string) {
  const blocks = await page.evaluate((sel) => {
    const d = document.querySelector(sel);
    if (!d) return false;
    const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return d.contains(hit) || d === hit;
  }, drawerSelector);
  expect(blocks, `Drawer ĐÓNG ${drawerSelector} chặn tap giữa màn`).toBe(false);
}

/** Gộp: drawer MỞ khoẻ mạnh — không overflow, không cột nén, width ≤ viewport. */
export async function assertDrawerHealthy(page: Page, openDrawer: Locator) {
  await expect(openDrawer).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertNoColumnCrush(openDrawer);
  const box = await openDrawer.boundingBox();
  const vw = page.viewportSize()?.width ?? 375;
  if (box) expect(box.width, "Drawer rộng hơn màn").toBeLessThanOrEqual(vw + 1);
}

export async function openViaThem(page: Page, name: RegExp | string) {
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: "Thêm" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
  await sheet.getByRole("button", { name }).click();
  await expect(sheet).toBeHidden();
}
