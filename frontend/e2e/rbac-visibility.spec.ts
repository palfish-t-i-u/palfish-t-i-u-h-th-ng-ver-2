// frontend/e2e/rbac-visibility.spec.ts
import { test, expect } from "@playwright/test";
import { expectSidebarVisible, expectSidebarHidden, navigateTo } from "./helpers/navigation";

const ROLE_EXPECTATIONS: Record<
  string,
  { visible: string[]; hidden: string[]; readOnly: string[] }
> = {
  sale: {
    visible: [
      "Bảng thông tin",
      "Quản lý thanh toán",
      "Đối soát giao dịch",
      "Kích hoạt khóa học",
      "Dashboard Sale",
      "Thông tin cá nhân",
    ],
    hidden: [
      "Tài khoản Auth",
      "Đồng bộ CRM",
      "Quản lý Doanh thu",
    ],
    readOnly: ["Sổ doanh thu"],
  },
  marketing: {
    visible: [
      "Bảng thông tin",
      "Sổ doanh thu",
      "Thông tin cá nhân",
    ],
    hidden: [
      "Quản lý thanh toán",
      "Đối soát giao dịch",
      "Kích hoạt khóa học",
      "Xuất hóa đơn",
      "Tài khoản Auth",
      "Đồng bộ CRM",
      "Dashboard Sale",
      "Quản lý Doanh thu",
    ],
    readOnly: ["Bảng thông tin"],
  },
  cs: {
    visible: [
      "Bảng thông tin",
      "Kích hoạt khóa học",
      "Thông tin cá nhân",
    ],
    hidden: [
      "Quản lý thanh toán",
      "Đối soát giao dịch",
      "Xuất hóa đơn",
      "Sổ doanh thu",
      "Tài khoản Auth",
      "Đồng bộ CRM",
      "Dashboard Sale",
      "Quản lý Doanh thu",
    ],
    readOnly: ["Bảng thông tin"],
  },
};

function getRoleFromProject(): string {
  const role = (test.info().project.metadata as { role?: string })?.role
    ?? process.env.E2E_ROLE;
  if (!role) throw new Error("E2E_ROLE not set — run via rbac-* project");
  return role;
}

test.describe("RBAC Sidebar Visibility", () => {
  test("correct sidebar items are visible for this role", async ({ page }) => {
    const role = getRoleFromProject();
    const expectations = ROLE_EXPECTATIONS[role];
    if (!expectations) {
      test.skip(true, `No expectations defined for role: ${role}`);
      return;
    }

    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_000);

    for (const label of expectations.visible) {
      await expectSidebarVisible(page, label);
    }

    await page.screenshot({ path: `e2e-results/rbac-${role}-visible.png` });
  });

  test("restricted sidebar items are hidden for this role", async ({ page }) => {
    const role = getRoleFromProject();
    const expectations = ROLE_EXPECTATIONS[role];
    if (!expectations) {
      test.skip(true, `No expectations defined for role: ${role}`);
      return;
    }

    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_000);

    for (const label of expectations.hidden) {
      await expectSidebarHidden(page, label);
    }

    await page.screenshot({ path: `e2e-results/rbac-${role}-hidden.png` });
  });

  test("read-only modules have no create/edit buttons", async ({ page }) => {
    const role = getRoleFromProject();
    const expectations = ROLE_EXPECTATIONS[role];
    if (!expectations || expectations.readOnly.length === 0) {
      test.skip(true, `No read-only modules for role: ${role}`);
      return;
    }

    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 15_000 });

    for (const label of expectations.readOnly) {
      await navigateTo(page, label);
      await page.waitForTimeout(2_000);

      const createBtn = page.locator("button:has-text('Tạo')");
      const addBtn = page.locator("button:has-text('Thêm')");
      const editBtn = page.locator("button:has-text('Sửa')");
      const deleteBtn = page.locator("button:has-text('Xóa')");

      for (const btn of [createBtn, addBtn, editBtn, deleteBtn]) {
        const count = await btn.count();
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            const visible = await btn.nth(i).isVisible();
            if (visible) {
              const disabled = await btn.nth(i).isDisabled();
              expect(disabled).toBe(true);
            }
          }
        }
      }
    }

    await page.screenshot({ path: `e2e-results/rbac-${role}-readonly.png` });
  });
});
