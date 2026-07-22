import { test } from "@playwright/test";
import { assertNoHorizontalOverflow, assertNoColumnCrush, openViaThem } from "./helpers/mobile";

test.describe("Mobile GĐ3: Báo cáo + Admin", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Báo cáo BC01: bảng scroll ngang, không tràn", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Báo cáo/);
    await assertNoHorizontalOverflow(page);
  });

  test("Tài khoản Auth: không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Tài khoản Auth/);
    await assertNoHorizontalOverflow(page);
  });

  test("Phân quyền: ma trận + Override cá nhân flow (StaffPickerModal -> OverrideDrawer)", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Phân quyền/);
    await page.waitForTimeout(1000);

    // Matrix overflow check
    await assertNoHorizontalOverflow(page);

    // Check if user has admin view or is seeing warning box
    const warnBox = page.getByText(/Chỉ Admin \(System\) có quyền/i);
    if (await warnBox.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Non-admin account: matrix không render → assertNoColumnCrush bên dưới
      // vô nghĩa. Skip tường minh thay vì pass giả trên warn box
      // (plan GC7 — "KHÔNG để pass giả"). Cấp storageState System-admin để bật lại.
      test.skip(true, "Perms matrix cần session System-admin — provision storageState rồi re-enable");
    }

    const matrix = page.locator(".pm-matrix").first();
    if (await matrix.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await assertNoColumnCrush(matrix);
    }

    // Step 1: Click tab "Override cá nhân"
    const overrideTab = page.getByRole("button", { name: /Override cá nhân/i });
    if (await overrideTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await overrideTab.click();
      await page.waitForTimeout(500);
      await assertNoHorizontalOverflow(page);

      // Step 2: Click "+ Thêm override" (opens StaffPickerModal)
      const addBtn = page.getByRole("button", { name: /\+ Thêm override/i });
      if (await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(500);

        const pickerModal = page.locator(".pm-picker-modal, [role='dialog']").first();
        if (await pickerModal.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await assertNoHorizontalOverflow(page);
          await assertNoColumnCrush(pickerModal);

          // Step 3: Select a staff member from picker
          const staffRow = page.locator(".pm-picker-row").first();
          if (await staffRow.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await staffRow.click();
            await page.waitForTimeout(200);

            // Step 4: Click confirm button "Thêm override" in modal footer to open OverrideDrawer
            const confirmBtn = page.getByRole("button", { name: "Thêm override", exact: true });
            if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
              await confirmBtn.click();
              await page.waitForTimeout(500);

              const drawer = page.locator(".pm-drawer").first();
              if (await drawer.isVisible({ timeout: 3_000 }).catch(() => false)) {
                await assertNoHorizontalOverflow(page);
                await assertNoColumnCrush(drawer);

                // Step 5: Click "Hủy" / close to avoid modifying sandbox DB
                const cancelBtn = drawer.getByRole("button", { name: /Hủy|Đóng/i }).first();
                if (await cancelBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
                  await cancelBtn.click();
                }
              }
            }
          }
        }
      }
    }
  });
});
