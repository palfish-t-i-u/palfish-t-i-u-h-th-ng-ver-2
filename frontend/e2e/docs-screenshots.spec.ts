// Không phải test — script tái tạo được để sinh ảnh minh họa cho docs HDSD.
// Chạy trên sandbox thật (dữ liệu thật, đăng nhập thật) để ảnh phản ánh đúng
// UI hiện tại thay vì chụp tay (không đồng nhất, không tái tạo được khi UI đổi).
//
//   npx playwright test e2e/docs-screenshots.spec.ts --config playwright.sandbox.config.ts
//
// Viewport cố định 1280×800 cho mọi ảnh — bộ ảnh đồng nhất kích thước khi xem
// cạnh nhau trong docs. Sau khi chạy xong, nhớ xoá đúng slug khỏi
// NO_SCREENSHOT_YET trong content/help/screenshots.test.ts (xem
// docs/HDSD_HUONG_DAN_VIET_BAI.md mục 4).
import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

async function gotoModule(page: Page, navLabel: string) {
  await page.goto("/");
  await page
    .locator("nav button, aside button")
    .filter({ hasText: new RegExp(`^${navLabel}`) })
    .first()
    .click();
  await page.waitForTimeout(800);
}

// Ảnh "toàn màn hình" dùng chung: clip đúng khung nhìn 1280×800 thay vì
// locator.screenshot() trên cả element — 1 số module (vd module6) có nội
// dung phía dưới chưa render hết, locator.screenshot() kéo theo khoảng
// trắng rất lớn không nhìn thấy gì. Clip viewport luôn ra ảnh gọn, nhất
// quán, và còn thấy được sidebar + header (kèm nút HDSD) cho ngữ cảnh.
async function screenshotViewport(page: Page, path: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, clip: { x: 0, y: 0, width: 1280, height: 800 } });
}

test("dashboard — tong-quan", async ({ page }) => {
  await gotoModule(page, "Bảng thông tin");
  await expect(page.getByText("Vinh danh hôm nay")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1000); // để leaderboard load xong, tránh chụp skeleton

  await screenshotViewport(page, "public/docs-images/dashboard/tong-quan-1.png");

  const ranking = page
    .getByText(/Bảng xếp hạng tháng/)
    .locator("xpath=ancestor::section[1]");
  await ranking.screenshot({ path: "public/docs-images/dashboard/tong-quan-2.png" });
});

test("module5 — tong-quan + phat-hien-ngay-thieu", async ({ page }) => {
  await gotoModule(page, "Đồng bộ CRM");
  await expect(page.getByText("Trạng thái kết nối CRM")).toBeVisible({ timeout: 15_000 });
  // "Phát hiện ngày thiếu" tự quét khi mount — đợi qua trạng thái "Đang kiểm
  // tra…" để chụp đúng kết quả thật (Đầy đủ data / Thiếu N ngày), không chụp
  // skeleton spinner.
  await page.waitForTimeout(3000);

  await screenshotViewport(page, "public/docs-images/module5/tong-quan-1.png");

  const tokenBox = page
    .getByText("Trạng thái kết nối CRM")
    .locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]");
  await tokenBox.screenshot({ path: "public/docs-images/module5/tong-quan-2.png" });

  const missingBox = page
    .getByText("Phát hiện ngày thiếu")
    .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await missingBox.screenshot({ path: "public/docs-images/module5/phat-hien-ngay-thieu-1.png" });
});

test("module6 — tong-quan", async ({ page }) => {
  await gotoModule(page, "Dashboard Sale");
  await expect(page.getByText("Sale Leader / System")).toBeVisible({ timeout: 15_000 });
  // KPI "PalFish live" fetch riêng, chậm hơn phần khung — đợi spinner "Đang
  // lấy KPI từ PalFish…" biến mất thay vì đợi cố định, tránh chụp lúc số vẫn
  // đang là 0 do fetch chưa xong.
  await expect(page.getByText("Đang lấy KPI từ PalFish…")).toBeHidden({ timeout: 20_000 });
  await page.waitForTimeout(500);

  await screenshotViewport(page, "public/docs-images/module6/tong-quan-1.png");

  const kpiGrid = page.locator('[class*="minmax(148px"]').first();
  await kpiGrid.screenshot({ path: "public/docs-images/module6/tong-quan-2.png" });

  const chartBox = page
    .getByText(/GMV CRM \(daily\)/)
    .locator("xpath=ancestor::div[contains(@class,'ring-gmv-border')][1]");
  await chartBox.screenshot({ path: "public/docs-images/module6/tong-quan-3.png" });
});
