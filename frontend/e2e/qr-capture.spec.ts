/**
 * E2E regression: QR capture stale-cache incident (2026-07-07 PR-0135/0136)
 *
 * Scenario: sale opens QR modal for PR-A, captures it, then (SAME SESSION, NO RELOAD)
 * opens QR modal for PR-B and captures again.  Before the fix, html-to-image cached
 * the VietQR PNG by path only (dropped query params) so the second capture returned
 * QR-A's bitmap.
 *
 * Tests:
 *   1. Chụp mã QR (handleCaptureQr) — clipboard must contain QR-B after second capture
 *   2. Copy mã QR (handleCopyQr)    — same assertion for the fetch-based copy path
 *   3. Guard fail-closed            — intercept always returns wrong QR → button shows error label
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import jsqr from "jsqr";
import { PNG } from "pngjs";
import { E2eApiClient } from "./helpers/api-client";
import { CleanupRegistry } from "./helpers/cleanup";

// ── Clipboard helpers ──────────────────────────────────────────────────────────

/** Read PNG bytes from the system clipboard (via the Clipboard API in-page). */
async function readClipboardPng(page: Page): Promise<number[] | null> {
  return page.evaluate(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("image/png")) {
          const blob = await item.getType("image/png");
          const buf = await blob.arrayBuffer();
          return Array.from(new Uint8Array(buf));
        }
      }
    } catch {
      // clipboard empty or permissions denied
    }
    return null;
  });
}

/** Decode a QR from raw PNG bytes using pngjs + jsqr. */
function decodeQrFromBytes(bytes: number[]): string | null {
  const buf = Buffer.from(bytes);
  const png = PNG.sync.read(buf);
  const result = jsqr(
    new Uint8ClampedArray(png.data),
    png.width,
    png.height
  );
  return result?.data ?? null;
}

// ── VietQR intercept ───────────────────────────────────────────────────────────

/**
 * Install a route intercept on img.vietqr.io/**
 * For each request, generates a real QR PNG whose payload is the `addInfo` query param
 * (i.e. the transfer code / content).  jsqr can decode this payload back.
 *
 * @param fixedPayload  When set, ALWAYS encodes this string regardless of request URL
 *                      (used for the guard fail-closed test).
 */
async function interceptVietQr(page: Page, fixedPayload?: string): Promise<void> {
  await page.route("https://img.vietqr.io/**", async (route) => {
    const url = new URL(route.request().url());
    const payload = fixedPayload ?? (url.searchParams.get("addInfo") || "TEST");
    // Dynamic import keeps Node QRCode out of the browser bundle
    const QRCode = (await import("qrcode")).default;
    const pngBuffer: Buffer = await QRCode.toBuffer(payload, {
      type: "png",
      errorCorrectionLevel: "M",
      width: 300,
    });
    await route.fulfill({ contentType: "image/png", body: pngBuffer });
  });
}

// ── UI navigation helpers ──────────────────────────────────────────────────────

/** Open the Payment Requests tab from the sidebar. */
async function gotoPaymentRequests(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bảng thông tin" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByText("Quản lý thanh toán").first().click();
  // Wait for the table / list to appear
  await expect(
    page.getByText("Payment Request").or(page.getByText("Yêu cầu thanh toán")).first()
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Open the QR modal for a PR whose name matches `prName`.
 * Flow: click PR row → drawer opens → click "Xem QR" on the QR payment line.
 */
async function openQrModal(page: Page, prName: string): Promise<void> {
  // Find and click the PR row
  await page.getByText(prName).first().click();
  // Wait for the detail drawer
  await expect(
    page.getByRole("button", { name: /Xem QR/ }).first()
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Xem QR/ }).first().click();
  // Modal heading
  await expect(page.getByText("QR thanh toán")).toBeVisible({ timeout: 10_000 });
}

/** Close the QR modal (click Đóng in the footer). */
async function closeQrModal(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByText("QR thanh toán")).not.toBeVisible({ timeout: 5_000 });
}

/** Close the detail drawer (Escape key). */
async function closeDrawer(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  // Brief pause to let the close animation settle
  await page.waitForTimeout(300);
}

// ── Test setup ─────────────────────────────────────────────────────────────────

test.use({
  // Grant clipboard permissions to the Chromium context so we can read it in-page
  permissions: ["clipboard-read", "clipboard-write"],
});

const AMOUNT = 9_850_000;

let pr1: { id: string };
let pr2: { id: string };
let line1: { id: string; code: string; transferContent: string };
let line2: { id: string; code: string; transferContent: string };
const cleanup = new CleanupRegistry();

test.beforeAll(async () => {
  // Skip the entire suite when running against a dev-mode environment (no real
  // Supabase JWT).  These tests exercise live API calls + a running Vite server
  // connected to the sandbox backend — they are designed to run in CI or against
  // the sandbox Vercel URL with real credentials.
  if (!E2eApiClient.isAvailable()) {
    test.skip();
    return;
  }

  const api = new E2eApiClient();

  pr1 = await api.createPR({
    uid: "E2E-QR-A",
    name: "[E2E-TEST] QR capture A",
    phone: "0900000001",
    country: "VN",
    address: "Test Address",
    target: AMOUNT,
  });
  cleanup.register("cancel PR A", () => api.cancelPR(pr1.id));

  line1 = await api.createPaymentLine(pr1.id, { amount: AMOUNT, method: "qr" });

  pr2 = await api.createPR({
    uid: "E2E-QR-B",
    name: "[E2E-TEST] QR capture B",
    phone: "0900000002",
    country: "VN",
    address: "Test Address",
    target: AMOUNT,
  });
  cleanup.register("cancel PR B", () => api.cancelPR(pr2.id));

  line2 = await api.createPaymentLine(pr2.id, { amount: AMOUNT, method: "qr" });

  console.log(`[QR-E2E] line1.code=${line1.code}  line2.code=${line2.code}`);
});

test.afterAll(async () => {
  await cleanup.runAll();
});

// ── Test 1: Chụp mã QR (capture flow) ─────────────────────────────────────────

test("2 QR captures no reload → clipboard has QR-B (Chụp mã QR)", async ({ page }) => {
  await interceptVietQr(page);
  await gotoPaymentRequests(page);

  // ── Capture QR-A ──
  await openQrModal(page, "[E2E-TEST] QR capture A");

  const captureBtn = page.getByRole("button", { name: /Chụp mã QR/ });
  await expect(captureBtn).toBeEnabled({ timeout: 15_000 });
  await captureBtn.click();
  // Wait for success label
  await expect(
    page.getByRole("button", { name: /Đã copy ảnh — paste vào chat!/ })
  ).toBeVisible({ timeout: 15_000 });

  await closeQrModal(page);
  await closeDrawer(page);

  // ── Capture QR-B — SAME PAGE, NO RELOAD ──
  await openQrModal(page, "[E2E-TEST] QR capture B");

  const captureBtn2 = page.getByRole("button", { name: /Chụp mã QR/ });
  await expect(captureBtn2).toBeEnabled({ timeout: 15_000 });
  await captureBtn2.click();
  await expect(
    page.getByRole("button", { name: /Đã copy ảnh — paste vào chat!/ })
  ).toBeVisible({ timeout: 15_000 });

  // ── Verify clipboard contains QR-B ──
  const clipBytes = await readClipboardPng(page);
  expect(clipBytes, "Clipboard must contain a PNG after second capture").not.toBeNull();

  const decoded = decodeQrFromBytes(clipBytes!);
  console.log(`[QR-E2E] decoded QR text: ${decoded}`);

  expect(decoded, "Decoded QR must contain line2.code (QR-B)").toContain(line2.code);
  expect(decoded, "Decoded QR must NOT contain line1.code (QR-A)").not.toContain(line1.code);
});

// ── Test 2: Copy mã QR (fetch-based copy flow) ────────────────────────────────

test("2 QR copies no reload → clipboard has QR-B (Copy mã QR)", async ({ page }) => {
  await interceptVietQr(page);
  await gotoPaymentRequests(page);

  // ── Copy QR-A ──
  await openQrModal(page, "[E2E-TEST] QR capture A");

  const copyBtn = page.getByRole("button", { name: /Copy mã QR/ });
  await expect(copyBtn).toBeEnabled({ timeout: 15_000 });
  await copyBtn.click();
  await expect(
    page.getByRole("button", { name: /Đã copy ảnh QR!/ })
  ).toBeVisible({ timeout: 15_000 });

  await closeQrModal(page);
  await closeDrawer(page);

  // ── Copy QR-B — SAME PAGE, NO RELOAD ──
  await openQrModal(page, "[E2E-TEST] QR capture B");

  const copyBtn2 = page.getByRole("button", { name: /Copy mã QR/ });
  await expect(copyBtn2).toBeEnabled({ timeout: 15_000 });
  await copyBtn2.click();
  await expect(
    page.getByRole("button", { name: /Đã copy ảnh QR!/ })
  ).toBeVisible({ timeout: 15_000 });

  // ── Verify clipboard contains QR-B ──
  const clipBytes = await readClipboardPng(page);
  expect(clipBytes, "Clipboard must contain a PNG after second copy").not.toBeNull();

  const decoded = decodeQrFromBytes(clipBytes!);
  console.log(`[QR-E2E] decoded QR text (copy path): ${decoded}`);

  expect(decoded, "Decoded QR must contain line2.code (QR-B)").toContain(line2.code);
  expect(decoded, "Decoded QR must NOT contain line1.code (QR-A)").not.toContain(line1.code);
});

// ── Test 3: Guard fail-closed ─────────────────────────────────────────────────

test("guard fail-closed: intercept returns wrong QR → Chụp mã QR shows error label", async ({
  page,
}) => {
  // Seed clipboard with a known string so we can verify it didn't change
  await page.evaluate(() => {
    // Write a throwaway text to clipboard as a "before" sentinel
    return navigator.clipboard.writeText("__SEED__").catch(() => {});
  });

  // Intercept: ALWAYS returns QR encoding line1.code, even when PR-B is open
  await interceptVietQr(page, line1.code);

  await gotoPaymentRequests(page);
  await openQrModal(page, "[E2E-TEST] QR capture B");

  const captureBtn = page.getByRole("button", { name: /Chụp mã QR/ });
  await expect(captureBtn).toBeEnabled({ timeout: 15_000 });
  await captureBtn.click();

  // Guard must trigger and show the mismatch label
  await expect(
    page.getByRole("button", {
      name: /QR không khớp nội dung — bấm F5 rồi thử lại/,
    })
  ).toBeVisible({ timeout: 15_000 });

  // Clipboard must NOT have been written (image/png absent; seed text still there or null)
  const clipBytes = await readClipboardPng(page);
  expect(
    clipBytes,
    "Guard must not write PNG to clipboard when QR content mismatches"
  ).toBeNull();
});
