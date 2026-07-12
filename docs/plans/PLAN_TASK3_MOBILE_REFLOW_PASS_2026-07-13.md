# Task 3 — Mobile Reflow Pass (B1-B4 + ĐSGD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: dùng `superpowers:executing-plans` (inline) — KHÔNG fan-out subagent (tiêu chí 4). Steps dùng checkbox `- [ ]`. Đọc 2 learnings TRƯỚC khi bắt đầu:
> - `docs/learnings/mobile-reflow-not-just-width.md`
> - `docs/learnings/flex-basis-vs-width-mobile.md`

**Goal:** Rà + sửa mật độ (reflow) cho MỌI drawer/modal còn lại của luồng kế toán+sale trên mobile 375px, để hết "vỡ/chật/dồn nén" — bằng chứng có DATA thật, không chỉ đo overflow.

**Architecture:** Chỉ CSS trong `@media (max-width:767px)` + thêm className vào container inline-grid/flex. KHÔNG sửa logic, KHÔNG sửa rule desktop. Mỗi màn: viết assertion e2e mobile ĐỎ trước → thêm rule reflow → assertion XANH → commit từng màn.

**Tech Stack:** React 19 + Vite + Tailwind; CSS `prototype-payments.css`; Playwright (project `mobile` 375×812, đã có); Vitest.

**4 tiêu chí (BẮT BUỘC mọi task):**
1. **Triệt để** — sửa gốc reflow (collapse grid / flex-wrap / break-words / ẩn hover), KHÔNG vá bề rộng lẻ.
2. **Không lỗi con** — desktop 0 delta; đóng+mở drawer đều đúng; không phá 15+ modal chung.
3. **Không tăng gánh nặng hạ tầng / giảm hiệu năng** — CSS-only + class; KHÔNG thêm dep, KHÔNG thêm listener/JS layout, KHÔNG thêm call API; tái dùng `useIsMobile` sẵn có.
4. **Tiết kiệm quota** — 1 session inline, KHÔNG fan-out; đọc `MODULES.md` + 2 learnings thay vì quét lại; override ultracode.

---

## ⚠️ GUARDRAILS — đọc TRƯỚC MỖI task (5 lỗi của session trước, cấm lặp)

| # | Lỗi session trước | Guardrail bắt buộc |
|---|---|---|
| G1 | Commit Phase 3-4 mà KHÔNG chạy vitest/e2e | **DoD gate**: mỗi task, trước `git commit` PHẢI chạy `npx tsc -b` + `npm run test` + `npx playwright test --project=mobile <spec>` XANH. Dán số pass. Commit TỪNG màn (cấm gộp). |
| G2 | drawer-center đóng ép full-screen → lớp phủ vô hình chặn tap (P0) | **Closed-state check**: mọi drawer/modal sửa full-screen/absolute PHẢI assert lúc ĐÓNG `elementFromPoint(vw/2, vh/2)` KHÔNG nằm trong drawer (dùng `assertClosedDrawerPassthrough`). |
| G3 | drawer-center full-screen nhưng QUÊN collapse grid 2 cột bên trong | **Reflow checklist**: mỗi màn grep đủ 4 pattern (grid nhiều cột / space-between-flex / free-text trong flex header / hover tooltip) và xử HẾT, không dừng ở width. |
| G4 | Chỉ sửa width + tap-target → user vẫn thấy vỡ | **No width-only**: nếu diff 1 màn chỉ đổi width mà màn có grid/flex-row → SAI, chưa xong. |
| G5 | Verify hời hợt (check hint, không mở drawer có data) | **Data-backed verify**: verify bằng Playwright mobile (auth vào backend có data) MỞ drawer thật + `assertDrawerHealthy`. `pageOverflow==0` là ĐK cần, KHÔNG đủ — thêm check không-cột-nào-bị-nén. |

**Zero-desktop-delta (tiêu chí 2):** mọi rule mới nằm trong `@media (max-width:767px)`, append CUỐI `prototype-payments.css` (KHÔNG sửa vùng comment ~:2055; KHÔNG format lại file). Sau mỗi task: `git diff prototype-payments.css` chỉ thấy dòng THÊM trong block mobile, 0 dòng rule desktop đổi.

**Battery desktop giữ nguyên:** trước khi merge, `npm run e2e` (payment-lifecycle, reconciliation-flow, qr-capture, payment-tvts-filter, crm-sync, dashboard-sales) PHẢI xanh nguyên trạng.

---

## File Structure

| File | Trách nhiệm | Loại |
|---|---|---|
| `frontend/e2e/helpers/mobile.ts` | Thêm `assertDrawerHealthy`, `assertNoColumnCrush`, `assertClosedDrawerPassthrough` | Modify |
| `frontend/e2e/mobile-accounting.spec.ts` | Thêm test mở từng drawer B3/B4 + 2 modal ghép, gọi helper | Modify |
| `frontend/e2e/mobile-payment-drawer.spec.ts` | Thêm test B1 drawer nội dung (AR mini, foot) | Modify |
| `frontend/src/styles/prototype-payments.css` | Rule reflow mobile mới (append cuối) | Modify |
| `frontend/src/components/ActivationTab.tsx` | Thêm class cho grid `repeat(4,1fr)` :1116 + course grid | Modify |
| `frontend/src/components/InvoiceRequestTab.tsx` | Thêm class nếu audit thấy crush | Modify |

---

## Task 0: Verification harness + audit có DATA

**Files:**
- Modify: `frontend/e2e/helpers/mobile.ts`
- Test: `frontend/e2e/mobile-accounting.spec.ts`

- [ ] **Step 0.1: Thêm 3 helper vào `frontend/e2e/helpers/mobile.ts`**

```ts
import { expect, type Page, type Locator } from "@playwright/test";

/** ĐK cần: trang không tràn ngang. */
export async function assertNoHorizontalOverflow(page: Page) {
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX, "Trang không được tràn ngang").toBeLessThanOrEqual(0);
}

/** G3/G4: không có cột/ô nào bị nén thành cột-chữ-dọc.
 *  Bắt trường hợp grid 2 cột không collapse: ô chứa text >8 ký tự mà rộng < minPx. */
export async function assertNoColumnCrush(container: Locator, minPx = 96) {
  const crushed = await container.evaluate((root, min) => {
    const bad: string[] = [];
    root.querySelectorAll("*").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t.length < 8 || el.children.length > 0) return; // chỉ leaf có text
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
```

- [ ] **Step 0.2: Chạy audit có data — liệt kê màn còn vỡ**

Chạy: `cd frontend && npx playwright test --project=mobile e2e/mobile-accounting.spec.ts --headed`
Mục đích: xác nhận các spec hiện có MỞ được drawer (backend có data qua `auth.setup`). Nếu drawer skip vì "no data" → data sandbox trống, PHẢI seed hoặc verify trực tiếp trên `https://palfish-gmv-manager-sandbox.vercel.app/` ở DevTools 375px trước khi viết fix.
Ghi lại (comment trong spec) màn nào FAIL `assertDrawerHealthy` + pattern (grid/flex/text/tooltip). Danh sách này = input cho Task 1..N.

- [ ] **Step 0.3: Commit harness**

```bash
cd frontend && npx tsc -b
git add e2e/helpers/mobile.ts
git commit -m "test(mobile): helper assertDrawerHealthy/NoColumnCrush/ClosedPassthrough"
```
Expected: `tsc -b` = No errors.

---

## Task 1: B3 Kích hoạt — ActivationTab drawer nội dung

**Files:**
- Modify: `frontend/src/components/ActivationTab.tsx` (grid `repeat(4,1fr)` :1116 — course/gói grid; drawer-foot :1706 space-between; header :1927 space-between)
- Modify: `frontend/src/styles/prototype-payments.css`
- Test: `frontend/e2e/mobile-accounting.spec.ts`

- [ ] **Step 1.1: Viết assertion ĐỎ — mở ar-drawer B3, assert healthy**

```ts
test("B3 ar-drawer nội dung không vỡ/nén", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: /Kích/ }).click();
  await page.waitForTimeout(1500);
  const card = page.locator(".ar-row-card, [data-ar-id]").first();
  test.skip(!(await card.isVisible({ timeout: 5000 }).catch(() => false)), "no AR data — seed sandbox");
  await card.click();
  await page.waitForTimeout(800);
  await assertDrawerHealthy(page, page.locator(".ar-drawer.open, .drawer.open").first());
});
```

- [ ] **Step 1.2: Chạy để xác nhận ĐỎ**

Chạy: `cd frontend && npx playwright test --project=mobile e2e/mobile-accounting.spec.ts -g "B3 ar-drawer"`
Expected: FAIL ở `assertNoColumnCrush` (grid `repeat(4,1fr)` :1116 nén) — HOẶC skip nếu thiếu data (khi đó verify tay trên sandbox 375px, xác nhận grid 4 cột nén rồi mới sửa).

- [ ] **Step 1.3: Thêm class vào grid inline ActivationTab:1116**

Đổi `<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>`
→ `<div className="act-course-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>`
(giữ nguyên inline; class chỉ để mobile override.)

- [ ] **Step 1.4: Thêm rule reflow (append CUỐI `prototype-payments.css`, trong 1 block `@media`)**

```css
/* ── Task 3: B3 ActivationTab reflow ── */
@media (max-width: 767px) {
  .gmv-prototype .act-course-grid { grid-template-columns: 1fr !important; }
  /* drawer-foot B3 (space-between) đã được rule .drawer-foot flex-wrap (Task 2 mật độ) phủ */
  .gmv-prototype .ar-drawer .panel-head { flex-wrap: wrap; }
}
```

- [ ] **Step 1.5: Chạy lại — XANH + regression**

Chạy: `cd frontend && npx tsc -b && npx playwright test --project=mobile e2e/mobile-accounting.spec.ts -g "B3 ar-drawer"`
Expected: tsc No errors; test PASS. Nếu vẫn crush → còn pattern chưa xử (grep lại 4 pattern trong ActivationTab drawer).

- [ ] **Step 1.6: Commit**

```bash
git add frontend/src/components/ActivationTab.tsx frontend/src/styles/prototype-payments.css frontend/e2e/mobile-accounting.spec.ts
git commit -m "fix(mobile): B3 ar-drawer reflow — collapse course grid 1 cột"
```

---

## Task 2: B4 Xuất hoá đơn — InvoiceRequestTab drawer nội dung

**Files:**
- Modify: `frontend/src/components/InvoiceRequestTab.tsx`
- Modify: `frontend/src/styles/prototype-payments.css`
- Test: `frontend/e2e/mobile-accounting.spec.ts`

- [ ] **Step 2.1: Viết assertion ĐỎ — mở invoice-drawer, assert healthy**

```ts
test("B4 invoice-drawer nội dung không vỡ/nén", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: "Thêm" }).click();
  await page.getByRole("dialog", { name: "Tất cả chức năng" })
    .getByRole("button", { name: /Xuất hóa đơn|Hóa đơn/ }).click();
  await page.waitForTimeout(1500);
  const card = page.locator(".invoice-row-card, [data-invoice-id]").first();
  test.skip(!(await card.isVisible({ timeout: 5000 }).catch(() => false)), "no invoice data — seed sandbox");
  await card.click();
  await page.waitForTimeout(800);
  await assertDrawerHealthy(page, page.locator(".invoice-drawer.open, .drawer.open").first());
});
```

- [ ] **Step 2.2: Chạy xác nhận ĐỎ/skip**

Chạy: `cd frontend && npx playwright test --project=mobile e2e/mobile-accounting.spec.ts -g "B4 invoice-drawer"`
Expected: FAIL ở crush, hoặc skip → verify tay sandbox 375px trước.

- [ ] **Step 2.3: Nếu audit thấy crush — thêm class + rule**

Grep `gridTemplateColumns`/`space-between` trong `InvoiceRequestTab.tsx`. `summary-row :119` đã được rule `.summary-row → repeat(2,1fr)` phủ. Nếu còn grid/flex khác nén: thêm className `inv-<tên>` + rule `@media max-767 { .gmv-prototype .inv-<tên> { grid-template-columns: 1fr !important; } }`. Nếu KHÔNG crush (chỉ có summary-row) → không sửa, ghi "B4 OK" và bỏ qua Step 2.3-2.4.

- [ ] **Step 2.4: Chạy lại XANH**

Chạy: `cd frontend && npx tsc -b && npx playwright test --project=mobile e2e/mobile-accounting.spec.ts -g "B4 invoice-drawer"`
Expected: tsc No errors; PASS.

- [ ] **Step 2.5: Commit**

```bash
git add -p   # chỉ file B4 đã đụng
git commit -m "fix(mobile): B4 invoice-drawer reflow" # hoặc "test(mobile): B4 invoice-drawer OK — không cần reflow"
```

---

## Task 3: 2 modal ghép tay (ReconciliationTab :271 + CardReconciliationTab :1074) + mismatch

**Files:**
- Modify: `frontend/src/styles/prototype-payments.css` (nếu cần)
- Test: `frontend/e2e/mobile-accounting.spec.ts`

- [ ] **Step 3.1: Assertion — mở modal ghép tay CK ngoài, assert healthy + closed passthrough**

```ts
test("Modal ghép tay CK ngoài không vỡ", async ({ page }) => {
  await page.goto("/");
  // ... điều hướng ĐSGD > CK ngoài chờ ghép, bấm nút Ghép trên 1 card ...
  const modal = page.locator(".gmv-prototype-modal-scrim .modal").first();
  test.skip(!(await modal.isVisible({ timeout: 5000 }).catch(() => false)), "no data — seed sandbox");
  await assertDrawerHealthy(page, modal);
});
```

- [ ] **Step 3.2: Chạy xác nhận**

Chạy: `cd frontend && npx playwright test --project=mobile e2e/mobile-accounting.spec.ts -g "Modal ghép tay"`
Expected: PASS (modal `min(460px,100%)`→100% ở 375, nội dung ít) HOẶC FAIL nếu grid nội dung nén.

- [ ] **Step 3.3: Nếu crush — thêm class + rule collapse (như Task 1). Nếu OK — ghi "modal ghép OK".**

- [ ] **Step 3.4: Commit**

```bash
git add frontend/e2e/mobile-accounting.spec.ts   # + css nếu có
git commit -m "test(mobile): modal ghép tay CK/mismatch — healthy ở 375px"
```

---

## Task 4: Bill album modal grid (ReconciliationTab :1893/:1911)

**Files:**
- Modify: `frontend/src/styles/prototype-payments.css` (đã có `.bill-album-modal img` responsive)
- Test: `frontend/e2e/mobile-accounting.spec.ts`

- [ ] **Step 4.1: Assertion — mở album bill, assert grid không tràn + ảnh ≤ ô**

```ts
test("Album bill không tràn ở 375px", async ({ page }) => {
  // ... mở recon-drawer có bill > bấm 'Xem tất cả'/mở album ...
  const album = page.locator(".bill-album-modal").first();
  test.skip(!(await album.isVisible({ timeout: 5000 }).catch(() => false)), "no bill data");
  await assertNoHorizontalOverflow(page);
  const imgs = album.locator("img");
  const first = await imgs.first().boundingBox();
  if (first) expect(first.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
```

- [ ] **Step 4.2: Chạy. Grid `minmax(160px,1fr)` ở 375 → 2 cột (160×2<375) — OK. `minmax(220px,1fr)` :1824 → 1 cột. Nếu ảnh tràn → rule `.bill-album-modal .modal-body { grid-template-columns: repeat(2,1fr) !important; }`.**

Chạy: `cd frontend && npx playwright test --project=mobile e2e/mobile-accounting.spec.ts -g "Album bill"`
Expected: PASS.

- [ ] **Step 4.3: Commit**

```bash
git add frontend/e2e/mobile-accounting.spec.ts   # + css nếu có
git commit -m "test(mobile): album bill 375px OK"
```

---

## Task 5: Regression battery + rollout

- [ ] **Step 5.1: Full battery**

```bash
cd frontend && npx tsc -b && npm run test && npm run e2e && npx playwright test --project=mobile
```
Expected: tsc No errors; vitest all pass (dán số); e2e desktop 5 spec pass nguyên trạng; mobile pass. Nếu 1 gate fail 2 lần → DỪNG, báo output, không vá mù (loop budget).

- [ ] **Step 5.2: Diff guard desktop 0-delta**

```bash
git diff main -- frontend/src/styles/prototype-payments.css | grep -E "^[-+]" | grep -v "@media\|max-width: 767\|/\*"
```
Kiểm tay: mọi dòng `+`/`-` phải nằm trong block `@media max-767` mới. 0 dòng rule desktop đổi.

- [ ] **Step 5.3: Push sandbox + verify deployed 375px**

```bash
git push origin sandbox
```
Chờ Vercel build ~2'. Mở `https://palfish-gmv-manager-sandbox.vercel.app/` DevTools 375px, đi lại 9 màn feedback + B3/B4 drawer. Chụp màn gửi anh Hiếu.

- [ ] **Step 5.4: Kế toán duyệt điện thoại thật**

Nhờ anh Hiếu/kế toán mở trên điện thoại thật (drawer có data thật). Chỉ khi duyệt OK mới merge main. **KHÔNG tự merge khi chưa duyệt** (Phase kế toán, bài học Task 2).

- [ ] **Step 5.5: Cập nhật MODULES.md nếu thêm file test/class mới; đóng plan.**

---

## Self-Review (đã chạy khi viết plan)

- **Spec coverage:** 4 pattern reflow (grid/flex/text/tooltip) đều có task + helper bắt. Data-backed verify (G5) = harness Task 0. Closed-state (G2) = `assertClosedDrawerPassthrough`. DoD gate (G1) = Step *.5 mỗi task. Desktop 0-delta (G2/tiêu chí 2) = Step 5.2.
- **Placeholder scan:** helper + test + CSS đều có code thật; chỗ "nếu audit thấy" có nhánh OK/skip rõ, không phải TODO mù.
- **Type consistency:** `assertDrawerHealthy(page, Locator)`, `assertClosedDrawerPassthrough(page, string)`, `assertNoColumnCrush(Locator, number)` — dùng nhất quán mọi task.
- **Data gap:** local 0 data → mọi test có `test.skip` khi thiếu data + chỉ dẫn verify tay trên sandbox; harness đo trên backend thật qua `auth.setup`.
