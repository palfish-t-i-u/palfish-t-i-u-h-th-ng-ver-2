// frontend/e2e/ar-edit-lag.spec.ts
// Smoke thật (browser + BE + Supabase) cho fix 9/9 "sửa AR lag / Lưu chờ lâu":
//   A — Lưu thoát form NGAY (không chờ round-trip)
//   B — đang sửa: mọi thao tác chỉ ghi draft cục bộ, KHÔNG gọi mạng
//   C — đang sửa: refetch nền (realtime/poll) bị chặn — không GET danh sách
//   + reviewer: toggle hold rồi Lưu không 409; đổi PR giữa chừng bỏ draft, không ghi chéo
//
// Chạy trên sandbox Vercel (FE+BE thật):
//   $env:E2E_API_URL_OVERRIDE="https://palfish-gmv-api-sandbox.onrender.com"
//   npx playwright test e2e/ar-edit-lag.spec.ts --config playwright.sandbox.config.ts --project=e2e
// Tự dựng dữ liệu qua API ([E2E-TEST] prefix) và dọn ở afterAll.
import { test, expect, type Page } from "@playwright/test";
import { navigateTo, expectModuleLoaded } from "./helpers/navigation";
import { E2eApiClient } from "./helpers/api-client";
import { CleanupRegistry } from "./helpers/cleanup";

const TEST_PREFIX = "[E2E-TEST]";
const TS = Date.now();
const SEARCH_KEY = `AR-lag ${TS}`;
// Tên KHÔNG được lồng nhau (filter hasText khớp substring; PR mới hơn đứng đầu bảng —
// lần chạy 9/9 `.first()` chọn nhầm PR2 không có AR → không thấy nút Sửa).
const CUSTOMER = `${TEST_PREFIX} ${SEARCH_KEY} chinh`;
const CUSTOMER_2 = `${TEST_PREFIX} ${SEARCH_KEY} khac`;
const UID = `E2E${TS}`;
const PHONE = "0900000123";
const TARGET = 5_000_000;
const PKG = "2/W- NEW 144 PHI+15 HN";

const api = () => new E2eApiClient(process.env.E2E_API_URL_OVERRIDE);
// PNG 1×1 hợp lệ (Pillow đọc được) — BE đòi bill trước khi tạo AR cho line đã thu tiền.
const ONE_PX_PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
);
const cleanup = new CleanupRegistry();
let prId = "";
let arId = "";
let prId2 = "";

const SAVE_BTN = { name: "Lưu thông tin Active Request" };
const EDIT_BTN = { name: "Sửa thông tin gói học" };

function card(page: Page) {
  return page.locator(".ar-mini-card");
}

/** Mở tab Quản lý thanh toán, bỏ "Ẩn data test" (PR của tài khoản @dev là is_test), tìm và mở PR. */
async function openPr(page: Page, customer: string) {
  await page.goto("/");
  await navigateTo(page, "Quản lý thanh toán");
  await expectModuleLoaded(page, "Quản lý thanh toán");
  // Toolbar render SAU khi tải dữ liệu — phải chờ, không dùng isVisible() tức thời
  // (lần chạy 9/9: isVisible()=false giả → không bỏ tick → PR @dev bị ẩn → "0 kết quả").
  const hideTest = page.getByLabel("Ẩn data test");
  await hideTest.waitFor({ state: "visible", timeout: 20_000 });
  if (await hideTest.isChecked()) await hideTest.uncheck();
  await expect(hideTest).not.toBeChecked();
  const search = page.locator('input[placeholder*="Tìm"]').first();
  await search.fill(SEARCH_KEY);
  const row = page.getByTestId("pr-row").filter({ hasText: customer }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(page.getByTestId("pr-drawer-payments")).toBeVisible({ timeout: 15_000 });
}

/** Thu thập mọi request tới API kể từ lúc gọi (method + pathname). */
function captureApi(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.includes("/api/v1/")) seen.push(`${r.method()} ${u.pathname}`);
  });
  return seen;
}

/** Dọn PR "AR-lag" còn sót từ lần chạy hỏng trước: xoá AR gắn → reject line đã paid → cancel PR. */
async function sweepLeftovers(c: E2eApiClient) {
  const prs = (await c.listTestPaymentRequestsRaw()).filter(
    (p) => p.name.includes("AR-lag") && p.state !== "cancelled",
  );
  if (prs.length === 0) return;
  const ars = await c.listActiveRequestsRaw();
  for (const p of prs) {
    for (const a of ars.filter((a) => a.pr_id === p.id)) {
      await c.deleteActiveRequest(a.id).catch((e) => console.warn(`[sweep] delete AR ${a.id}`, e));
    }
    for (const l of p.payments.filter((l) => l.status === "paid")) {
      await c.patchLineStatus(l.id, "rejected").catch((e) => console.warn(`[sweep] reject line ${l.id}`, e));
    }
    await c.cancelPR(p.id).catch((e) => console.warn(`[sweep] cancel PR ${p.id}`, e));
  }
  console.log(`[ar-edit] sweep: đã dọn ${prs.length} PR AR-lag cũ`);
}

test.describe.serial("Sửa AR trong drawer PR — fix lag 9/9 (sandbox thật)", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    test.setTimeout(180_000); // BE sandbox Free tier có thể cold-start ~50s
    const c = api();
    await sweepLeftovers(c);
    const pr = await c.createPR({
      name: CUSTOMER,
      uid: UID,
      phone: PHONE,
      country: "VN",
      address: "E2E",
      target: TARGET,
      lead_source: "gia_han",
      note: "[E2E-AUTO] ar-edit-lag.spec",
    });
    prId = pr.id;
    // LIFO: reject line (huỷ tiền đã nhận) chạy TRƯỚC cancelPR — BE không cho huỷ PR đã nhận tiền.
    cleanup.register(`Cancel PR ${prId}`, () => c.cancelPR(prId));
    const line = await c.createPaymentLine(prId, { amount: TARGET, method: "qr" });
    await c.uploadBill(line.id, ONE_PX_PNG);
    await c.patchLineStatus(line.id, "paid");
    cleanup.register(`Reject line ${line.id}`, () => c.patchLineStatus(line.id, "rejected"));
    const ar = await c.createActiveRequest(prId, {
      uids: [{ uid: UID, phone: PHONE, country: "VN", courses: [{ name: PKG, amount: TARGET }] }],
    });
    arId = ar.id;
    cleanup.register(`Delete AR ${arId}`, () => c.deleteActiveRequest(arId));

    // PR2: có 1 line QR PENDING (chưa tiền) → FE bật poll 30s (`pendingQr`) — trigger refetch nền
    // deterministic cho case C (realtime sandbox có thể không bật). Không có AR → dùng cho case đổi PR.
    const pr2 = await c.createPR({
      name: CUSTOMER_2, uid: `${UID}B`, phone: "0900000124", country: "VN", address: "E2E",
      target: 1_000_000, lead_source: "gia_han", note: "[E2E-AUTO] pending QR → poll trigger",
    });
    prId2 = pr2.id;
    cleanup.register(`Cancel PR ${prId2}`, () => c.cancelPR(prId2));
    await c.createPaymentLine(prId2, { amount: 1_000_000, method: "qr" });
  });

  test.afterAll(async () => {
    await cleanup.runAll();
  });

  test("B+C — đang sửa: 0 request khi gõ/blur/chọn gói, và realtime/poll KHÔNG kéo refetch danh sách", async ({ page }) => {
    await openPr(page, CUSTOMER);
    const seen = captureApi(page);

    await card(page).getByRole("button", EDIT_BTN).click();
    await expect(card(page).getByRole("button", SAVE_BTN)).toBeEnabled();

    const amount = card(page).getByPlaceholder("Số tiền");
    await amount.fill("4000000");
    await amount.press("Tab");
    const uid = card(page).getByPlaceholder("UID CRM");
    await uid.fill(`${UID}X`);
    await uid.press("Tab");
    const pkg = card(page).getByPlaceholder("Chọn hoặc gõ tên gói học...");
    await pkg.click();
    await pkg.fill("NEW 144");
    await pkg.press("Enter");

    // 2 trigger refetch nền trong lúc đang sửa:
    //  - poll 30s (PR2 có QR pending → pendingQr=true, bật từ lúc tải trang) → chờ 35s ≥ 1 tick
    //  - realtime: INSERT payment_requests từ ngoài (nếu Supabase bật realtime) → debounce 5–8s
    // Bản cũ: ≥1 GET /payment-requests. Bản mới: im lặng vì editingArIdRef đang set.
    const rt = await api().createPR({
      name: `${TEST_PREFIX} ${SEARCH_KEY} rt1`, uid: `${UID}R1`, phone: "0900000126", country: "VN",
      address: "E2E", target: 1_000_000, lead_source: "gia_han", note: "[E2E-AUTO] realtime trigger",
    });
    cleanup.register(`Cancel PR ${rt.id}`, () => api().cancelPR(rt.id));
    await page.waitForTimeout(35_000);

    const listGets = seen.filter((s) => /^GET \/api\/v1\/(payment-requests|active-requests)$/.test(s));
    const writes = seen.filter((s) => /^(PATCH|POST|PUT|DELETE) /.test(s));
    console.log(`[ar-edit] requests while editing: ${seen.length} →`, seen);
    expect(writes, "B: đang sửa không được ghi server").toEqual([]);
    expect(listGets, "C: đang sửa không được refetch danh sách nền").toEqual([]);
    // Form vẫn mở, draft còn nguyên
    await expect(card(page).getByRole("button", SAVE_BTN)).toBeEnabled();
    await expect(uid).toHaveValue(`${UID}X`);
  });

  test("A — Lưu thoát form ngay (< 500ms) rồi persist đúng lên server + hiển thị sau F5", async ({ page }) => {
    await openPr(page, CUSTOMER);
    await card(page).getByRole("button", EDIT_BTN).click();
    const amount = card(page).getByPlaceholder("Số tiền");
    await amount.fill("4000000");
    await amount.press("Tab");
    const uid = card(page).getByPlaceholder("UID CRM");
    await uid.fill(`${UID}X`);
    await uid.press("Tab");

    const patchWait = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes(`/api/v1/active-requests/${arId}`),
      { timeout: 60_000 },
    );
    const t0 = Date.now();
    await card(page).getByRole("button", SAVE_BTN).click();
    await expect(card(page).getByRole("button", SAVE_BTN)).toBeDisabled({ timeout: 2_000 });
    await expect(amount).toBeHidden();
    const closeMs = Date.now() - t0;
    const resp = await patchWait;
    const rtMs = Date.now() - t0;
    console.log(`[ar-edit] form closed after ${closeMs}ms; PATCH ${resp.status()} after ${rtMs}ms`);
    expect(resp.status(), "PATCH phải 200 (không 409)").toBe(200);
    expect(closeMs, "A: form phải đóng ngay, không chờ round-trip").toBeLessThan(500);

    // Server-side: uids_data đã có amount mới + uid mới
    const raw = await api().getActiveRequest(arId);
    const dump = JSON.stringify(raw);
    expect(dump).toContain("4000000");
    expect(dump).toContain(`${UID}X`);

    // Hiển thị sau reload
    await openPr(page, CUSTOMER);
    await expect(card(page).locator(".ar-course-amount").first()).toContainText("4.000.000");
    await expect(card(page).locator(".ar-uid-name").first()).toContainText(`${UID}X`);
  });

  test("Hold — toggle 'Chưa tạo gói học' rồi Sửa+Lưu ngay: không 409, không mất draft", async ({ page }) => {
    await openPr(page, CUSTOMER);
    const holdWait = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes(`/api/v1/active-requests/${arId}`),
      { timeout: 60_000 },
    );
    // Radio controlled (`checked={!!ar.holdActivation}`) chỉ flip SAU khi PATCH về → dùng click()
    // + chờ response + expect toBeChecked (retry), không dùng check() (verify state ngay → fail).
    const hold = card(page).getByLabel("Chưa tạo gói học");
    await hold.click();
    expect((await holdWait).status()).toBe(200);
    await expect(hold).toBeChecked();

    await card(page).getByRole("button", EDIT_BTN).click();
    const amount = card(page).getByPlaceholder("Số tiền");
    await amount.fill("3500000");
    await amount.press("Tab");
    const saveWait = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes(`/api/v1/active-requests/${arId}`),
      { timeout: 60_000 },
    );
    await card(page).getByRole("button", SAVE_BTN).click();
    const resp = await saveWait;
    console.log(`[ar-edit] save after hold toggle → ${resp.status()}`);
    expect(resp.status(), "Lưu sau toggle hold phải 200 (updatedAt đã merge), không 409").toBe(200);
    await expect(card(page).locator(".ar-course-amount").first()).toContainText("3.500.000");
    await expect(card(page).getByLabel("Chưa tạo gói học")).toBeChecked();
    // trả lại trạng thái (cũng chờ PATCH về rồi mới assert)
    const unholdWait = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes(`/api/v1/active-requests/${arId}`),
      { timeout: 60_000 },
    );
    const unhold = card(page).getByLabel("Tạo gói học ngay");
    await unhold.click();
    expect((await unholdWait).status()).toBe(200);
    await expect(unhold).toBeChecked();
  });

  test("Đổi PR giữa lúc sửa → draft bị bỏ, không ghi chéo sang PR khác", async ({ page }) => {
    await openPr(page, CUSTOMER);
    const seen = captureApi(page);
    await card(page).getByRole("button", EDIT_BTN).click();
    const uid = card(page).getByPlaceholder("UID CRM");
    await uid.fill("ZZZ-DRAFT");
    await uid.press("Tab");

    // Luồng thật: drawer mở phủ bảng (scrim chặn click) → phải ĐÓNG drawer giữa lúc sửa,
    // mở PR khác (không có AR → không có card), rồi mở lại PR gốc.
    const closeDrawer = async () => {
      await page.locator("button.drawer-close").click();
      await expect(page.locator("aside.drawer.open")).toHaveCount(0);
    };
    await closeDrawer();
    await page.getByTestId("pr-row").filter({ hasText: CUSTOMER_2 }).first().click();
    await expect(page.getByTestId("pr-drawer-payments")).toBeVisible({ timeout: 15_000 });
    await expect(card(page)).toHaveCount(0); // PR2 chưa báo đơn → không có card AR
    await closeDrawer();
    await page.getByTestId("pr-row").filter({ hasText: CUSTOMER }).first().click();
    await expect(card(page)).toBeVisible({ timeout: 10_000 });

    await expect(card(page).getByRole("button", SAVE_BTN)).toBeDisabled();
    await expect(card(page).locator(".ar-uid-name").first()).not.toContainText("ZZZ-DRAFT");
    const arWrites = seen.filter((s) => /^(PATCH|POST) \/api\/v1\/active-requests/.test(s));
    expect(arWrites, "không được có PATCH AR nào từ draft bị bỏ").toEqual([]);
    const raw = await api().getActiveRequest(arId);
    expect(JSON.stringify(raw)).not.toContain("ZZZ-DRAFT");
  });

  test("control C — KHÔNG sửa: realtime từ ngoài PHẢI kéo refetch danh sách (chứng minh kênh sống)", async ({ page }) => {
    await openPr(page, CUSTOMER);
    const seen = captureApi(page);
    const pr3 = await api().createPR({
      name: `${TEST_PREFIX} ${SEARCH_KEY} rt2`, uid: `${UID}R2`, phone: "0900000125", country: "VN",
      address: "E2E", target: 1_000_000, lead_source: "gia_han", note: "[E2E-AUTO] realtime control",
    });
    cleanup.register(`Cancel PR ${pr3.id}`, () => api().cancelPR(pr3.id));
    // poll 30s (pendingQr) và/hoặc realtime → phải có GET trong ≤40s khi KHÔNG sửa
    await expect
      .poll(() => seen.filter((s) => s === "GET /api/v1/payment-requests").length, { timeout: 40_000 })
      .toBeGreaterThan(0);
    console.log(`[ar-edit] control: list refetched ${seen.filter((s) => s === "GET /api/v1/payment-requests").length}x after external insert`);
  });
});
