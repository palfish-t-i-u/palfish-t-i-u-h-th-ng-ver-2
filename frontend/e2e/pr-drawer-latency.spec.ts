import { expect, test } from "@playwright/test";

// Tiêu chí 5: bấm PR → chi tiết ĐẦY ĐỦ (hết skeleton) dưới 2.5s.
// Header phải hiện ngay (slim row có sẵn data) — đo riêng < 500ms.
// Chạy BASELINE trước GĐ2 slim: cả hai budget pass trivially (full payload, không skeleton).
// Chạy SAU GĐ2 slim: vẫn phải pass — nếu fail thì endpoint detail chậm hoặc animation blocking.
const FULL_DETAIL_BUDGET_MS = 2_500;
const HEADER_BUDGET_MS = 500;

test("drawer PR: header tức thời, chi tiết đầy đủ trong ngân sách", async ({ page }) => {
  await page.goto("/");

  // Điều hướng vào Quản lý thanh toán
  await page.click("text=Quản lý thanh toán");

  // Chờ ít nhất 1 PR row tải xong
  const firstRow = page.getByTestId("pr-row").first();
  await firstRow.waitFor({ state: "visible", timeout: 10_000 });

  const t0 = Date.now();
  await firstRow.click();

  // Header: drawer mở + payments section (hoặc loading skeleton nếu GĐ2 bật) hiện ngay
  const paymentsOrLoading = page
    .getByTestId("pr-drawer-payments")
    .or(page.getByTestId("pr-drawer-detail-loading"));
  await expect(paymentsOrLoading).toBeVisible({ timeout: HEADER_BUDGET_MS });
  const tHeader = Date.now() - t0;

  // Chi tiết đầy đủ: skeleton biến mất (nếu có), payments section hiện
  await expect(page.getByTestId("pr-drawer-detail-loading")).toHaveCount(0, {
    timeout: FULL_DETAIL_BUDGET_MS,
  });
  await expect(page.getByTestId("pr-drawer-payments")).toBeVisible();
  const tFull = Date.now() - t0;

  console.log(`[latency] drawer header=${tHeader}ms, full=${tFull}ms`);
  expect(tHeader, `Header phải hiện trong ${HEADER_BUDGET_MS}ms`).toBeLessThan(HEADER_BUDGET_MS);
  expect(tFull, `Chi tiết đầy đủ phải xong trong ${FULL_DETAIL_BUDGET_MS}ms`).toBeLessThan(
    FULL_DETAIL_BUDGET_MS,
  );
});
