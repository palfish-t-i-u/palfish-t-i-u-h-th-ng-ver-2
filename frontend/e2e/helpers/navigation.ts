// frontend/e2e/helpers/navigation.ts
import { expect, type Page } from "@playwright/test";

// AppShell render CẢ HAI: <aside><nav>...</nav></aside> (sidebar desktop,
// "hidden md:flex") VÀ <nav aria-label="Điều hướng chính"> (bottom bar mobile,
// "md:hidden") — cả hai LUÔN nằm trong DOM, chỉ ẩn/hiện bằng CSS theo viewport.
// navigateTo() giả định desktop nên scope thẳng vào "aside nav" — tránh khớp
// nhầm bản sao ẩn ở bottom bar (không dùng file này cho test mobile-*.spec.ts).
const SIDEBAR_NAV = "aside nav";

export async function navigateTo(page: Page, sidebarLabel: string): Promise<void> {
  // Sidebar render theo quyền (usePermission/can()) fetch async sau khi trang
  // load — gọi navigateTo() ngay sau goto("/") mà không đợi gì trước đó thì
  // các check isVisible() tức thời bên dưới có thể bắt trúng lúc sidebar CHƯA
  // kịp render, trả về false "giả" (không phải do thiếu quyền) rồi bỏ qua
  // luôn bước mở rộng "Báo cáo" — im lặng fail 5s sau dù trang đã load xong.
  // Đợi chính sidebar xuất hiện trước, thay vì chỉ đợi 1 nav-item đơn lẻ.
  await page.locator(SIDEBAR_NAV).waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

  // Handle nested items under "Báo cáo" parent
  const BC_CHILDREN = ["BC01: Sales performance", "BC02: Key Data", "BC03 — Báo cáo tổng bộ"];
  if (BC_CHILDREN.includes(sidebarLabel)) {
    const child = page.locator(SIDEBAR_NAV).getByText(sidebarLabel, { exact: false }).first();
    const childVisible = await child.isVisible().catch(() => false);
    if (!childVisible) {
      // Sidebar có 2 chỗ chứa "Báo cáo": tiêu đề section (text thường, không
      // click được, đứng TRƯỚC trong DOM) và nút thật "Báo cáo ›" (chevron
      // nằm trong cùng accessible name). getByText(...).first() từng chọn
      // nhầm tiêu đề section — dùng getByRole("button", ...) để chỉ khớp nút.
      const parent = page.locator(SIDEBAR_NAV).getByRole("button", { name: "Báo cáo", exact: false }).first();
      // waitFor thay vì isVisible() tức thời — "Báo cáo" tự nó cũng có thể
      // chưa render kịp ngay lúc check (cùng lý do phía trên).
      const parentReady = await parent
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (parentReady) {
        await parent.click();
        await page.waitForTimeout(300);
      }
    }
  }

  const item = page.locator(SIDEBAR_NAV).getByText(sidebarLabel, { exact: false }).first();
  await expect(item).toBeVisible({ timeout: 8_000 });
  await item.click();
  await page.waitForTimeout(500);
}

export async function expectModuleLoaded(page: Page, heading: string): Promise<void> {
  await expect(
    page.locator("h1, h2, h3").filter({ hasText: heading }).first()
  ).toBeVisible({ timeout: 15_000 });
}

export async function expectSidebarVisible(page: Page, label: string): Promise<void> {
  await expect(
    page.locator(SIDEBAR_NAV).getByText(label, { exact: false }).first()
  ).toBeVisible({ timeout: 5_000 });
}

export async function expectSidebarHidden(page: Page, label: string): Promise<void> {
  await expect(
    page.locator(SIDEBAR_NAV).getByText(label, { exact: false }).first()
  ).not.toBeVisible({ timeout: 3_000 });
}
