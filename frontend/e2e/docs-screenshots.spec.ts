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

// Cho các module nằm trong submenu (hub cha có children, vd "Zalo OA" →
// "Cấu hình OA"/"Nhóm thông báo"/"Outbox") — bấm hub để mở rộng submenu rồi
// bấm đúng mục con theo nhãn.
async function gotoHubChild(page: Page, hubLabel: string, childLabel: string) {
  await page.goto("/");
  const li = page.locator("nav li").filter({ hasText: hubLabel }).first();
  await li.locator("button").first().click();
  await li.getByRole("button", { name: new RegExp(`^${childLabel}`) }).click();
  await page.waitForTimeout(800);
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

test("gatewaySync — tong-quan + cai-tien-ich", async ({ page }) => {
  await gotoModule(page, "Đồng bộ mPOS / Payoo");
  await expect(page.getByText("Trạng thái tiện ích")).toBeVisible({ timeout: 15_000 });
  // Modal onboarding tự mở ở lần đầu ghé trang (localStorage flag chưa set
  // trong storageState test) — đóng nó trước khi chụp toàn màn hình.
  const gotItBtn = page.getByRole("button", { name: "Tôi đã hiểu" });
  if (await gotItBtn.isVisible().catch(() => false)) {
    await gotItBtn.click();
  }
  await page.waitForTimeout(500);

  await screenshotViewport(page, "public/docs-images/gatewaySync/tong-quan-1.png");

  await page.getByRole("button", { name: "Xem lại hướng dẫn" }).click();
  await expect(page.getByText("Hướng dẫn dùng tiện ích đồng bộ")).toBeVisible();
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/gatewaySync/cai-tien-ich-1.png");
});

test("authAccounts — tong-quan + tao/xoa/lien-ket/chi-tiet", async ({ page }) => {
  await gotoModule(page, "Tài khoản Auth");
  await expect(page.getByText("Tổng tài khoản")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);

  await screenshotViewport(page, "public/docs-images/authAccounts/tong-quan-1.png");

  // Thêm tài khoản
  await page.getByRole("button", { name: "+ Thêm tài khoản" }).click();
  await expect(page.getByText("Tạo tài khoản")).toBeVisible();
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/authAccounts/tao-tai-khoan-1.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Xóa tài khoản
  await page.getByRole("button", { name: "🗑 Xóa tài khoản" }).click();
  await expect(page.getByText("Chọn tài khoản để xóa")).toBeVisible();
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/authAccounts/xoa-tai-khoan-1.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Chi tiết tài khoản: mở drawer bằng cách bấm 1 dòng bất kỳ trong bảng
  const firstRow = page.locator("tbody tr").first();
  await firstRow.click();
  await expect(page.getByText("Liên kết Nhân sự Sale")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/authAccounts/chi-tiet-tai-khoan-1.png");

  // Liên kết CRM: chỉ khả dụng nếu tài khoản đang mở chưa liên kết — nếu đã
  // liên kết, tìm 1 tài khoản khác chưa liên kết trong bảng.
  const linkBtn = page.getByRole("button", { name: "+ Liên kết" });
  if (!(await linkBtn.isVisible().catch(() => false))) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const unlinkedRow = page.locator("tbody tr").filter({ hasText: "Chưa liên kết" }).first();
    if (await unlinkedRow.isVisible().catch(() => false)) {
      await unlinkedRow.click();
      await expect(page.getByText("Liên kết Nhân sự Sale")).toBeVisible({ timeout: 10_000 });
    }
  }
  if (await page.getByRole("button", { name: "+ Liên kết" }).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "+ Liên kết" }).click();
    await expect(page.getByText("Chọn Nhân sự Sale để liên kết")).toBeVisible();
    await page.waitForTimeout(500);
    await screenshotViewport(page, "public/docs-images/authAccounts/lien-ket-crm-1.png");
  }
});

test("permissions — tong-quan + override-ca-nhan", async ({ page }) => {
  await gotoModule(page, "Phân quyền sử dụng");
  await expect(page.getByText("Tổng module")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);

  await screenshotViewport(page, "public/docs-images/permissions/tong-quan-1.png");

  await page.getByRole("button", { name: /^Override cá nhân/ }).click();
  await expect(page.getByText("Ghi đè quyền nhóm cho từng người cụ thể")).toBeVisible();
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/permissions/override-ca-nhan-1.png");
});

test("zaloConfig — tong-quan + trang-thai-token + kiem-tra-ket-noi", async ({ page }) => {
  await gotoHubChild(page, "Zalo OA", "Cấu hình OA");
  await expect(page.getByText("Cấu Hình Zalo OA")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);

  await screenshotViewport(page, "public/docs-images/zaloConfig/tong-quan-1.png");

  const tokenCard = page
    .getByText("Trạng thái Token")
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await tokenCard.screenshot({ path: "public/docs-images/zaloConfig/trang-thai-token-1.png" });

  const testPanel = page
    .getByText("Kiểm tra kết nối")
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await testPanel.screenshot({ path: "public/docs-images/zaloConfig/kiem-tra-ket-noi-1.png" });
});

test("zaloGroups — tong-quan", async ({ page }) => {
  await gotoHubChild(page, "Zalo OA", "Nhóm thông báo");
  await expect(page.getByRole("button", { name: "+ Thêm mới" })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/zaloGroups/tong-quan-1.png");
});

test("zaloOutbox — tong-quan", async ({ page }) => {
  await gotoHubChild(page, "Zalo OA", "Outbox");
  await expect(page.getByText("50 tin gần nhất")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/zaloOutbox/tong-quan-1.png");
});

test("dingtalkConfig — tong-quan", async ({ page }) => {
  await gotoHubChild(page, "DingTalk", "Cấu hình");
  await expect(page.locator("h2").filter({ hasText: "DingTalk — Cấu hình" })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/dingtalkConfig/tong-quan-1.png");
});

test("dingtalkGroups — tong-quan", async ({ page }) => {
  await gotoHubChild(page, "DingTalk", "Nhóm thông báo");
  await expect(page.getByText("Thêm nhóm mới")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/dingtalkGroups/tong-quan-1.png");
});

test("dingtalkOutbox — tong-quan", async ({ page }) => {
  await gotoHubChild(page, "DingTalk", "Outbox");
  await expect(page.locator("h2").filter({ hasText: "DingTalk — Outbox" })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/dingtalkOutbox/tong-quan-1.png");
});

// ── Nợ ảnh cũ (legacy) — chỉ phần đọc, không mutate dữ liệu thật ──
// Xem docs/plans/HDSD_CHECKLIST_CON_LAI_2026-07-27.md: các thao tác mutate
// (huỷ PR, chuyển giao PR, ghép giao dịch, tick cộng buổi, sửa dòng sổ doanh
// thu, sửa tỷ giá...) cố tình KHÔNG chụp ở đây — cần quyết định riêng vì đụng
// dữ liệu sandbox dùng chung cả team.

test("module3 — tong-quan", async ({ page }) => {
  await gotoModule(page, "Tạo gói học");
  await expect(page.getByText(/Active Request|AR-/).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/module3/tong-quan-1.png");
});

test("module4 — tong-quan", async ({ page }) => {
  await gotoModule(page, "Xuất hóa đơn");
  await expect(page.getByText("Chờ xuất", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/module4/tong-quan-1.png");
});

test("paymentRequests — tong-quan + tao-lan-tt-chuan + xem-lich-su-pr + xem-qr-thanh-toan + thieu-anh-bill", async ({ page }) => {
  await gotoModule(page, "Quản lý thanh toán");
  await expect(page.getByRole("button", { name: "Tạo Payment Request" })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);

  await screenshotViewport(page, "public/docs-images/paymentRequests/tong-quan-1.png");

  // Tạo Payment Request — chỉ mở modal xem giao diện, KHÔNG bấm submit.
  await page.getByRole("button", { name: "Tạo Payment Request" }).click();
  await expect(page.getByText("Tổng tiền dự kiến").first()).toBeVisible();
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/paymentRequests/tao-lan-tt-chuan-1.png");
  await page.getByRole("button", { name: "Huỷ" }).click();
  await page.waitForTimeout(300);

  // Mở PR bất kỳ (đọc, không sửa) để chụp Lịch sử PR / QR / khu vực tải bill.
  const firstRow = page.locator('[data-testid="pr-row"]').first();
  await firstRow.click();
  await page.waitForTimeout(1000);
  await expect(page.getByText("Xem lịch sử")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);

  await page.getByText("Xem lịch sử").click();
  await expect(page.getByText("Lịch sử PR")).toBeVisible();
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/paymentRequests/xem-lich-su-pr-1.png");
  await page.getByRole("button", { name: "Đóng" }).click();
  await page.waitForTimeout(300);

  const qrBtn = page.getByText("Xem QR").first();
  if (await qrBtn.isVisible().catch(() => false)) {
    await qrBtn.click();
    await expect(page.getByText(/QR thanh toán/)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800); // đợi ảnh QR tải xong, tránh chụp "Đang tải QR…"
    await screenshotViewport(page, "public/docs-images/paymentRequests/xem-qr-thanh-toan-1.png");
    await page.getByRole("button", { name: "Đóng" }).click();
    await page.waitForTimeout(300);
  }

  const billTrigger = page.getByRole("button", { name: /^Up bill/ }).first();
  if (await billTrigger.isVisible().catch(() => false)) {
    await billTrigger.click();
    const zoneBox = page.getByRole("dialog", { name: "Tải ảnh bill" });
    if (await zoneBox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await page.waitForTimeout(300);
      await zoneBox.screenshot({ path: "public/docs-images/paymentRequests/thieu-anh-bill-1.png" });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  }
});

test("paymentRequests — tao-payment-request (4 ảnh, chỉ mở modal, KHÔNG submit)", async ({ page }) => {
  await gotoModule(page, "Quản lý thanh toán");
  await expect(page.getByRole("button", { name: "Tạo Payment Request" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Tạo Payment Request" }).click();
  await expect(page.getByText("Tổng tiền dự kiến").first()).toBeVisible();
  await page.waitForTimeout(300);

  const modal = page.locator(".create-pr-modal");

  // Ảnh 1 — tạo nhanh: 4 trường bắt buộc đã điền
  await modal.locator(".phone-input").fill("987654321");
  await page.getByPlaceholder("Họ và tên").fill("Nguyễn Thị Mai");
  await page.getByPlaceholder("VD: 12.000.000").fill("12000000");
  await modal.locator("select").first().selectOption({ index: 1 });
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/paymentRequests/tao-payment-request-1.png");

  // Ảnh 2 — nhiều con: gõ 2 tên phân cách bằng "-"
  const childInput = page.getByPlaceholder("VD: Nguyễn Minh Anh");
  await childInput.fill("Bảo Châu - Bảo Khánh");
  await childInput.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/paymentRequests/tao-payment-request-2.png");

  // Ảnh 3 — khách nước ngoài: toggle + combobox quốc gia
  await page.getByRole("button", { name: "Khách nước ngoài" }).click();
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/paymentRequests/tao-payment-request-3.png");

  // Ảnh 4 — doanh nghiệp + cần xuất hoá đơn
  await page.getByRole("button", { name: "Khách VN" }).click();
  await page.getByText("Khách hàng cần xuất hoá đơn?").click();
  await page.getByRole("button", { name: "Doanh nghiệp" }).click();
  await page.getByPlaceholder("VD: Công ty TNHH ABC").fill("Công ty TNHH ABC");
  await page.getByRole("button", { name: "Doanh nghiệp" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/paymentRequests/tao-payment-request-4.png");

  // Đóng modal — tuyệt đối không submit
  await page.getByRole("button", { name: "Huỷ", exact: true }).click();
});

// chuyen-giao-pr — 4 ảnh từng bước. AN TOÀN: thao tác THUẦN ĐỌC — mở PR, mở
// modal, focus combobox, chọn 1 người nhận (chỉ đổi state client), mở Lịch sử.
// TUYỆT ĐỐI không bấm "Xác nhận chuyển" (endpoint transfer chỉ chạy khi bấm nút
// đó) nên không mutate quyền sở hữu PR trên sandbox dùng chung.
test("paymentRequests — chuyen-giao-pr (4 ảnh, KHÔNG bấm Xác nhận)", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoModule(page, "Quản lý thanh toán");
  await expect(page.getByRole("button", { name: "Tạo Payment Request" })).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  // Sandbox chủ yếu là data test — bỏ tick "Ẩn data test" để có PR hiện ra.
  const hideTest = page.getByLabel("Ẩn data test");
  if (await hideTest.isChecked({ timeout: 5_000 }).catch(() => false)) {
    await hideTest.uncheck();
    await page.waitForTimeout(800);
  }
  // Sandbox thưa PR trong cửa sổ ngày mặc định — mở rộng về "Toàn bộ".
  await page.getByRole("button", { name: /→/ }).first().click();
  await page.getByText("Toàn bộ", { exact: true }).click();
  await page.waitForTimeout(1500);

  const firstRow = page.locator('[data-testid="pr-row"]').first();
  await firstRow.waitFor({ state: "visible", timeout: 45_000 });
  await firstRow.click();
  await page.waitForTimeout(1000);
  const transferBtn = page.getByRole("button", { name: "Chuyển giao PR", exact: true });
  await expect(transferBtn).toBeVisible({ timeout: 15_000 });

  // Ảnh 1 — drawer PR: nút "Chuyển giao PR" ở thanh dưới
  await screenshotViewport(page, "public/docs-images/paymentRequests/chuyen-giao-pr-1.png");

  // Ảnh 4 — Lịch sử PR (chụp trước, thao tác đọc): nhật ký lưu chuyển sở hữu
  await page.getByRole("button", { name: "Xem lịch sử", exact: true }).click();
  await expect(page.getByText(/Lịch sử PR —/)).toBeVisible({ timeout: 15_000 });
  // Đợi nhật ký load xong (fetch ownership-log) — tránh chụp skeleton "Đang tải…"
  await expect(page.getByText("Đang tải nhật ký…")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/Tạo PR|Tạo hộ|Chuyển giao/).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await screenshotViewport(page, "public/docs-images/paymentRequests/chuyen-giao-pr-4.png");
  await page.locator(".modal").getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page.getByText(/Lịch sử PR —/)).not.toBeVisible();

  // Mở modal chuyển giao
  await transferBtn.click();
  await expect(page.getByText(/Chuyển giao PR —/)).toBeVisible();
  const modal = page.locator(".modal");

  // Ảnh 2 — combobox "Chuyển cho" mở, danh sách người nhận
  const combo = modal.getByRole("combobox");
  await combo.click();
  await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/paymentRequests/chuyen-giao-pr-2.png");

  // Ảnh 3 — đã chọn người nhận: nút "Xác nhận chuyển cho …" bật sáng (KHÔNG bấm)
  await page.getByRole("option").first().click();
  await page.waitForTimeout(300);
  await screenshotViewport(page, "public/docs-images/paymentRequests/chuyen-giao-pr-3.png");

  // Đóng — không chuyển thật
  await modal.getByRole("button", { name: "Huỷ", exact: true }).click();
});

test("reconciliation — tong-quan", async ({ page }) => {
  await gotoModule(page, "Đối soát giao dịch");
  await page.waitForTimeout(500);
  const chuyenKhoanTab = page.getByRole("button", { name: /^Chuyển khoản/ });
  if (await chuyenKhoanTab.isVisible().catch(() => false)) {
    await chuyenKhoanTab.click();
    await page.waitForTimeout(500);
  }
  await screenshotViewport(page, "public/docs-images/reconciliation/tong-quan-1.png");
});

test("revenueLedger — tong-quan", async ({ page }) => {
  await gotoModule(page, "Sổ doanh thu");
  await expect(page.getByRole("button", { name: "+ Thêm dòng" })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await screenshotViewport(page, "public/docs-images/revenueLedger/tong-quan-1.png");
});
