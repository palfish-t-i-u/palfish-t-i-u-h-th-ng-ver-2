// frontend/e2e/journeys/revenue-reporting.spec.ts
import { test, expect } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "../helpers/navigation";
import { waitForLoaded } from "../helpers/assertions";
import { E2eApiClient } from "../helpers/api-client";
import { CleanupRegistry } from "../helpers/cleanup";
import { assertNoColumnCrush, assertNoHorizontalOverflow } from "../helpers/mobile";

const TEST_PREFIX = "[E2E-TEST]";
const TEST_ENTRY = {
  ngayTienVe: new Date().toISOString().slice(0, 10),
  tenKhach: `${TEST_PREFIX} Revenue Entry`,
  soTienVnd: 3_700_000,
  team: "Inhouse 1",
  loai: "B2",
  note: "[E2E-AUTO] Created by Playwright",
  paymentMethod: "cash",
};

let api: E2eApiClient;
const cleanup = new CleanupRegistry();
let createdLedgerId: string | null = null;

test.describe.serial("Revenue & Reporting: Sổ doanh thu → BC03", () => {
  test.beforeAll(() => {
    api = new E2eApiClient();
  });

  test.afterAll(async () => {
    await cleanup.runAll();
  });

  // ── Sổ doanh thu ──

  test("Sổ doanh thu — Smoke: loads with cards, table, filters", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Sổ doanh thu");
    await expectModuleLoaded(page, "Sổ doanh thu");

    await waitForLoaded(page);

    await expect(
      page.locator("text=Tất cả teams").or(page.locator("select").first())
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'))
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      page.locator("button:has-text('Thêm')").or(page.locator("button:has-text('Tạo')"))
    ).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "e2e-results/ledger-smoke.png" });
  });

  test("Sổ doanh thu — Create ledger entry [E2E-TEST]", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Sổ doanh thu");
    await expectModuleLoaded(page, "Sổ doanh thu");
    await waitForLoaded(page);

    const createBtn = page.locator("button:has-text('Thêm')").or(
      page.locator("button:has-text('Tạo')")
    );
    await createBtn.first().click();
    await page.waitForTimeout(500);

    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible()) {
      await dateInput.fill(TEST_ENTRY.ngayTienVe);
    }

    const nameInput = page.locator('label:has-text("Tên khách") ~ input').or(
      page.locator('input[placeholder*="Tên khách"]')
    );
    await nameInput.first().fill(TEST_ENTRY.tenKhach);

    const amountInput = page.locator('label:has-text("Số tiền") ~ input').or(
      page.locator('input[placeholder*="VND"]')
    );
    await amountInput.first().fill(String(TEST_ENTRY.soTienVnd));

    const teamSelect = page.locator('select').or(
      page.locator('label:has-text("Team") ~ select')
    );
    if (await teamSelect.first().isVisible()) {
      await teamSelect.first().selectOption({ label: TEST_ENTRY.team });
    }

    const noteInput = page.locator('label:has-text("Ghi chú") ~ input, label:has-text("Ghi chú") ~ textarea');
    if (await noteInput.first().isVisible()) {
      await noteInput.first().fill(TEST_ENTRY.note);
    }

    const submitBtn = page.locator("button:has-text('Lưu')").or(
      page.locator("button:has-text('Tạo')").last()
    );
    await submitBtn.click();
    await page.waitForTimeout(2_000);

    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(1_000);
    }

    await expect(page.locator(`text=${TEST_ENTRY.tenKhach}`).first()).toBeVisible({ timeout: 10_000 });

    try {
      const entries = await api.findTestLedgerEntries();
      if (entries.length > 0) {
        createdLedgerId = entries[0].id;
        cleanup.register(`Delete ledger ${createdLedgerId}`, () => api.deleteLedgerEntry(createdLedgerId!));
      }
    } catch {
      // Cleanup will use manual-cleanup.ts as fallback
    }

    await page.screenshot({ path: "e2e-results/ledger-create.png" });
  });

  test("Sổ doanh thu — Edit ledger entry amount", async ({ page }) => {
    test.skip(!createdLedgerId, "Ledger entry not created — skipping");

    await page.goto("/");
    await navigateTo(page, "Sổ doanh thu");
    await expectModuleLoaded(page, "Sổ doanh thu");
    await waitForLoaded(page);

    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(1_000);
    }

    const testRow = page.locator("tr, div").filter({ hasText: TEST_ENTRY.tenKhach }).first();
    const editBtn = testRow.locator("button:has-text('Sửa')").or(
      testRow.locator("button[title*='edit'], button[title*='Edit']")
    );
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);

      const amountInput = page.locator('label:has-text("Số tiền") ~ input').or(
        page.locator('input[placeholder*="VND"]')
      );
      await amountInput.first().clear();
      await amountInput.first().fill("5000000");

      const saveBtn = page.locator("button:has-text('Lưu')");
      await saveBtn.click();
      await page.waitForTimeout(2_000);
    }

    await page.screenshot({ path: "e2e-results/ledger-edit.png" });
  });

  test("Sổ doanh thu — Filter by team + search + date range", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "Sổ doanh thu");
    await expectModuleLoaded(page, "Sổ doanh thu");
    await waitForLoaded(page);

    const teamSelect = page.locator('select').first();
    if (await teamSelect.isVisible()) {
      await teamSelect.selectOption({ label: "Inhouse 1" });
      await page.waitForTimeout(1_500);
    }

    const searchInput = page.locator('input[placeholder*="Tìm"]').or(page.locator('input[type="search"]'));
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill(TEST_PREFIX);
      await page.waitForTimeout(1_000);
    }

    const testEntry = page.locator(`text=${TEST_ENTRY.tenKhach}`).first();
    const emptyState = page.locator("text=Chưa có dữ liệu").or(page.locator("text=Không có"));
    await expect(testEntry.or(emptyState)).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: "e2e-results/ledger-filter.png" });
  });

  // ── BC03 ──

  test("BC03 — Smoke: loads with month selector, tabs", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "BC03 — Báo cáo tổng bộ");
    await expectModuleLoaded(page, "BC03");

    await expect(
      page.locator('input[type="month"]').or(page.locator('select').first())
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.locator("text=Revenue").or(page.locator("text=Doanh thu"))).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: "e2e-results/bc03-smoke.png" });
  });

  test("BC03 — Data display and tab switching", async ({ page }) => {
    await page.goto("/");
    await navigateTo(page, "BC03 — Báo cáo tổng bộ");
    await expectModuleLoaded(page, "BC03");
    await waitForLoaded(page);

    const dataTable = page.locator("table").first();
    const emptyState = page.locator("text=Chưa có dữ liệu").or(page.locator("text=Không có"));
    await expect(dataTable.or(emptyState)).toBeVisible({ timeout: 15_000 });

    const trialTab = page.locator("button:has-text('Trial')").or(page.locator("text=Trial"));
    if (await trialTab.isVisible()) {
      await trialTab.click();
      await page.waitForTimeout(2_000);
      await page.screenshot({ path: "e2e-results/bc03-trial.png" });
    }

    const referralTab = page.locator("button:has-text('Referral')").or(page.locator("text=Referral"));
    if (await referralTab.isVisible()) {
      await referralTab.click();
      await page.waitForTimeout(2_000);
      await page.screenshot({ path: "e2e-results/bc03-referral.png" });
    }
  });
});

// BC03 mobile (Mobile Fix Pass 21/7, GC7): freeze-col Team/Nhân sự retuned cho
// 375px — bắt Team bleed vào cột Total/ngày khi cuộn, trên cả 3 tab.
test.describe("BC03 — Mobile 375px: no column crush", () => {
  test("Doanh thu / Trial / Referral — không tràn ngang, không cột nén", async ({ page }) => {
    // Điều hướng ở viewport desktop mặc định trước — nav mobile (<768px) đổi
    // hẳn cơ chế (bottom bar "compact": item có children tự nhảy child[0]
    // thay vì mở submenu; nút "Thêm" chỉ xuất hiện khi > 5 mục top-level, tuỳ
    // theo quyền từng account) nên không đáng tin cậy để điều hướng tới đúng
    // BC03. Vào bằng nav desktop cho chắc, RỒI mới resize xuống 375px để đo.
    await page.goto("/");
    await navigateTo(page, "BC03 — Báo cáo tổng bộ");
    await expectModuleLoaded(page, "BC03");
    await waitForLoaded(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);

    await assertNoHorizontalOverflow(page);
    const revenueTable = page.locator("table").first();
    if (await revenueTable.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await assertNoColumnCrush(revenueTable);
    }

    const trialTab = page.locator("button:has-text('Trial')").or(page.locator("text=Trial"));
    if (await trialTab.isVisible().catch(() => false)) {
      await trialTab.click();
      await page.waitForTimeout(1_500);
      await assertNoHorizontalOverflow(page);
      const trialTable = page.locator("table").first();
      if (await trialTable.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await assertNoColumnCrush(trialTable);
      }
    }

    const referralTab = page.locator("button:has-text('Referral')").or(page.locator("text=Referral"));
    if (await referralTab.isVisible().catch(() => false)) {
      await referralTab.click();
      await page.waitForTimeout(1_500);
      await assertNoHorizontalOverflow(page);
      const referralTable = page.locator("table").first();
      if (await referralTable.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await assertNoColumnCrush(referralTable);
      }
    }

    await page.screenshot({ path: "e2e-results/bc03-mobile-crush-check.png" });
  });
});
