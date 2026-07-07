# Fix QR capture nhúng bitmap QR cũ (html-to-image cache) + guardrail verify

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) hoặc `superpowers:executing-plans` để implement plan này task-by-task. Steps dùng checkbox (`- [ ]`) để tracking.

**Incident gốc (7/7/2026):** Sale chụp QR PR-2026-0135 (Khôi Nguyên, FHK59) rồi chụp tiếp QR PR-2026-0136 (Đức Bảo, FHK81) trong cùng phiên browser (không F5). Ảnh chụp thứ 2 có **phần chữ đúng FHK81 nhưng bitmap QR bên trong encode FHK59** → phụ huynh quét ra sai học viên. Incident 23/6 (PR-0080/0081) nhiều khả năng cùng thủ phạm.

**Root cause (đã xác minh trong `node_modules/html-to-image/es/dataurl.js`):** `html-to-image` cache resource theo key là **URL đã cắt bỏ query params** (`getCacheKey`: `url.replace(/\?.*/, '')`, chỉ giữ query khi option `includeQueryParams: true` — mặc định false). Mọi QR VietQR của mình chỉ khác nhau ở query (`amount`, `addInfo`), phần gốc `https://img.vietqr.io/image/{bin}-{acc}-compact2.png` giống hệt → cache key trùng → capture thứ 2 trở đi nhúng dataURL QR của lần capture ĐẦU TIÊN trong phiên. Cache là biến module-level, sống đến khi F5. Các guard hiện có (`key` remount, `imgReady`, `isImgFresh()`, `crossOrigin`) chỉ bảo vệ `<img>` trên DOM, không với tới fetch nội bộ của thư viện.

**Goal:**
1. Diệt root cause: `includeQueryParams: true` cho `toBlob`.
2. Guardrail độc lập thư viện: **decode + verify** mọi ảnh QR trước khi rời app (clipboard/download) — nội dung QR decode ra phải khớp `transfer_code` + `amount` của line đang mở, sai thì **chặn (fail-closed)**.
3. Tests chống regression ở cả 3 tầng: options assertion, guard behavior, E2E tái hiện đúng kịch bản incident (chụp 2 QR liên tiếp).

**Đánh giá theo 3 tiêu chí vàng** ([[feedback-3-criteria-for-solutions]]):

| Tiêu chí | Đánh giá |
|---|---|
| **Triệt để** | `includeQueryParams: true` diệt đúng cơ chế gây bug (cache key strip query). Guardrail decode-verify chặn cả CLASS bug "ảnh QR ≠ nội dung hiển thị" bất kể nguồn (lib upgrade, CDN cache, browser cache) — không còn phụ thuộc niềm tin vào internals của html-to-image. |
| **Không lỗi con** | Fail-mode của guardrail được xử lý tường minh: decode fail → chặn + label hướng dẫn, sale luôn còn 2 đường thoát an toàn ("Copy nội dung CK", mở URL QR tab mới — cả 2 không đi qua capture). Không đổi props/API component nào. `jsqr` lazy-import → 0 impact initial bundle. Verify chạy sau capture, không đổi timing UI hiện có. |
| **Không tăng gánh nặng hạ tầng** | FE-only. 0 thay đổi BE/DB/Render/Supabase. Thêm 1 runtime dep `jsqr` (~40KB, lazy) + 2 dev deps cho E2E (`qrcode`, `pngjs`). Vercel bundle chính không đổi. |

**Quyết định đã chốt:**
- Verify áp dụng cho **cả 2 nút**: "Chụp mã QR" (html-to-image blob) và "Copy mã QR" (fetch PNG trực tiếp) — mọi ảnh rời app đều qua 1 cổng kiểm.
- **Fail-closed**: decode không được / nội dung lệch → KHÔNG ghi clipboard, KHÔNG download. Phân biệt 2 trạng thái: `mismatch` (nguy hiểm — label đỏ riêng + `console.error` có prefix `[QR-GUARD]` để soi qua DevTools/Sentry sau này) vs `unreadable` (kỹ thuật — label lỗi chung).
- Verify so khớp qua **parse EMV TLV** (tag 54 = amount, tag 62 sub-tag 08 = addInfo) chứ không substring toàn payload — tránh false-positive. addInfo check `includes(transferCode)` (token base36 ổn định) thay vì so full string vì vietqr.io có thể normalize dấu/space của tên.
- Line không có `code` (không thể verify) → skip verify + `console.warn` (không xảy ra với QR line hiện tại, phòng data cũ).
- KHÔNG thêm telemetry backend (repo chưa có metrics infra phía FE — `lib/metrics.ts` là math dashboard, không phải telemetry). Chỉ `console.error`.

**Tech Stack:** React 19 + Vite + TS + Vitest + Playwright. Deps mới: `jsqr` (runtime), `qrcode` + `pngjs` (dev, chỉ E2E).

**Files đụng tới:**
- Sửa: `frontend/src/components/payment-request/QrViewModal.tsx`, `QrViewModal.test.tsx`
- Tạo: `frontend/src/components/payment-request/qrVerify.ts`, `qrVerify.test.ts`, `frontend/e2e/qr-capture.spec.ts`
- Docs: `frontend/src/components/payment-request/CLAUDE.md`, `MODULES.md`, `docs/CHANGELOG.md`

---

## Pre-flight checklist

- [ ] **Pre-1: Branch**

```bash
git checkout main && git pull origin main
git checkout -b fix/qr-capture-stale-cache
```

- [ ] **Pre-2: Baseline xanh**

```bash
cd frontend && npx vitest run --reporter=basic && npx tsc -b
```
Expected: vitest 0 fail, tsc 0 error. Không đạt → dừng, báo user.

- [ ] **Pre-3: Cài deps**

```bash
cd frontend && npm i jsqr && npm i -D qrcode pngjs @types/qrcode @types/pngjs
```

---

## Phase 1 — Fix chính: `includeQueryParams: true`

### Task 1: Sửa options `toBlob` + regression test

- [ ] **Step 1.1:** Trong `QrViewModal.tsx` → `handleCaptureQr`, thêm option vào call `toBlob`:

```ts
const blob = await toBlob(captureRef.current, {
  backgroundColor: "#ffffff",
  pixelRatio: 2,
  // Incident 7/7/2026 (PR-2026-0135/0136): html-to-image cache resource theo
  // URL ĐÃ CẮT query params (getCacheKey trong dataurl.js). Mọi QR vietqr.io
  // chỉ khác nhau ở query → capture thứ 2 trong phiên nhúng bitmap QR cũ.
  // includeQueryParams: true buộc cache key = full URL. KHÔNG ĐƯỢC BỎ.
  includeQueryParams: true,
  filter: (node) =>
    !(node instanceof HTMLElement && node.dataset.qrCaptureHide === "true"),
});
```

- [ ] **Step 1.2:** Unit test trong `QrViewModal.test.tsx`: mock `html-to-image`, click "Chụp mã QR" (sau khi `fireEvent.load` img), assert `toBlob` được gọi với `expect.objectContaining({ includeQueryParams: true, pixelRatio: 2 })`. Theo triết lý guardrail của file test này: assert exact value, ≥2 assertion (options + số lần gọi). Nếu file đã có mock `html-to-image` sẵn thì mở rộng, không mock trùng.

- [ ] **Step 1.3:** `npx vitest run QrViewModal` → xanh.

---

## Phase 2 — Guardrail: decode + verify trước khi ảnh rời app

### Task 2: Util `qrVerify.ts` + unit tests

- [ ] **Step 2.1:** Tạo `frontend/src/components/payment-request/qrVerify.ts`:

```ts
/**
 * Guardrail incident 7/7/2026: mọi ảnh QR rời app (clipboard/download) phải
 * decode ra và khớp nội dung line đang mở. Độc lập html-to-image internals.
 */

/** Parse EMV TLV phẳng: id(2) + len(2) + value(len). Trả map tag→value. */
export function parseEmvTlv(payload: string): Map<string, string>;

/** VietQR: addInfo nằm ở tag 62 (Additional Data) → sub-tag 08. */
export function extractEmvAddInfo(payload: string): string | null;

/** Tag 54 = transaction amount (string). */
export function extractEmvAmount(payload: string): string | null;

export function verifyQrPayload(
  payload: string,
  expected: { transferCode: string; amount: number },
): boolean {
  const addInfo = extractEmvAddInfo(payload);
  const amount = extractEmvAmount(payload);
  return (
    addInfo !== null && addInfo.includes(expected.transferCode) &&
    amount === String(expected.amount)
  );
}

/**
 * Decode QR từ blob (ảnh QR thuần hoặc ảnh card chứa QR). Browser-only
 * (createImageBitmap + canvas) — unit test không cover, E2E cover.
 * Retry scale [1, 0.75, 0.5] vì jsQR nhạy kích thước với ảnh lớn (pixelRatio 2).
 */
export async function decodeQrFromBlob(blob: Blob): Promise<string | null>;
```

Implement: `parseEmvTlv` vòng lặp con trỏ, malformed (len vượt chuỗi, non-digit) → dừng trả map đã parse được; `extractEmvAddInfo` = parse top-level → tag 62 → parse tiếp value → sub-tag 08. `decodeQrFromBlob`: `createImageBitmap(blob)` → canvas → `getImageData` → `(await import("jsqr")).default(data, w, h)` → retry theo scale nếu null.

- [ ] **Step 2.2:** `qrVerify.test.ts` — dùng helper build TLV trong test (không hardcode payload dài dễ sai):

```ts
const tlv = (tag: string, v: string) => `${tag}${String(v.length).padStart(2, "0")}${v}`;
// payload chuẩn VietQR tối giản:
const payload =
  tlv("00", "01") + tlv("38", tlv("00", "A000000727")) +
  tlv("53", "704") + tlv("54", "9850000") + tlv("58", "VN") +
  tlv("62", tlv("08", "84389926401 Phan Duc Bao FHK81")) + tlv("63", "ABCD");
```

Cases bắt buộc:
1. `extractEmvAddInfo(payload)` === `"84389926401 Phan Duc Bao FHK81"` (exact).
2. `extractEmvAmount(payload)` === `"9850000"` (exact).
3. `verifyQrPayload` đúng code + đúng amount → `true`.
4. **Case incident**: payload addInfo `"84394954262 Khoi Nguyen FHK59"` + expected `{transferCode: "FHK81", amount: 9850000}` → `false`.
5. Đúng code nhưng amount lệch (9850000 vs 9840000) → `false`.
6. Payload malformed ("not-emv", "", len ảo vượt chuỗi) → không throw, verify `false`.
7. Payload thiếu tag 62 → `false`.

### Task 3: Wire guard vào 2 handler + UI state

- [ ] **Step 3.1:** `QrViewModal.tsx` — thêm helper trong component:

```ts
const verifyQrBlob = async (blob: Blob): Promise<"ok" | "mismatch" | "unreadable"> => {
  if (!qr.code) { console.warn("[QR-GUARD] line không có code — skip verify"); return "ok"; }
  try {
    const { decodeQrFromBlob, verifyQrPayload } = await import("./qrVerify");
    const payload = await decodeQrFromBlob(blob);
    if (!payload) return "unreadable";
    return verifyQrPayload(payload, { transferCode: qr.code, amount: qr.amount })
      ? "ok" : "mismatch";
  } catch { return "unreadable"; }
};
```

- [ ] **Step 3.2:** `handleCaptureQr`: sau khi có `blob`, trước clipboard/download:

```ts
const verdict = await verifyQrBlob(blob);
if (verdict !== "ok") {
  console.error(`[QR-GUARD] chặn capture: ${verdict}`, { expected: transferCode, url: qrImageUrl });
  setCaptureState(verdict === "mismatch" ? "verifyfail" : "error");
  setTimeout(() => setCaptureState("idle"), 4000);
  return;
}
```

- [ ] **Step 3.3:** `handleCopyQr`: refactor `copyImageToClipboard` — tách fetch blob ra để verify trước khi `clipboard.write` (giữ nguyên hành vi PNG-coerce). Verdict xử lý như 3.2 với `copyQrState`.

- [ ] **Step 3.4:** UI states: thêm `"verifyfail"` vào 2 union state. Labels:
  - capture: `"QR không khớp nội dung — bấm F5 rồi thử lại"`
  - copy: `"QR không khớp — F5 thử lại"`
  Cả hai giữ nút enable để retry. Fallback an toàn đã có sẵn: "Copy nội dung CK" không đụng ảnh.

- [ ] **Step 3.5:** Unit tests behavior (mock `./qrVerify` + `html-to-image`):
1. decode → payload mismatch: `navigator.clipboard.write` KHÔNG được gọi (assert `toHaveBeenCalledTimes(0)`), button text hiện exact `"QR không khớp nội dung — bấm F5 rồi thử lại"`.
2. decode trả null (unreadable): không ghi clipboard, state error.
3. decode ok: `clipboard.write` gọi đúng 1 lần, với đúng blob từ `toBlob`.
4. Copy-path (nút "Copy mã QR") mismatch: không ghi clipboard + label riêng.
5. `verifyQrBlob` được gọi với `{ transferCode: qr.code, amount: qr.amount }` exact (chống lệch tham số).

- [ ] **Step 3.6:** `npx vitest run` toàn payment-request + `npx tsc -b` → xanh.

---

## Phase 3 — E2E regression: tái hiện đúng kịch bản incident

### Task 4: `frontend/e2e/qr-capture.spec.ts`

Kịch bản = incident thật: chụp QR line A rồi chụp QR line B cùng phiên, ảnh trong clipboard phải là B. **Nếu revert `includeQueryParams` thì test này ĐỎ** — đây là chốt chặn regression chính.

- [ ] **Step 4.1:** Setup spec:
  - `context.grantPermissions(["clipboard-read", "clipboard-write"])` (Chromium).
  - **Intercept `https://img.vietqr.io/**`** (không gọi network thật — deterministic): handler đọc `amount` + `addInfo` từ query, build payload EMV bằng cùng helper `tlv` (tag 54 + 62/08), generate PNG bằng `qrcode` (dev dep), `route.fulfill({ contentType: "image/png", body })`.
  - Tạo 2 PR test (`is_test: true`) + mỗi PR 1 line QR qua `e2e/helpers/api-client` — 2 line phải khác `transfer_code`, CÙNG amount (mô phỏng đúng incident 2 PR cùng 9.85M). Cleanup trong `afterAll` theo pattern `e2e/helpers/cleanup`.

- [ ] **Step 4.2:** Test 1 — "chụp 2 QR liên tiếp không reload → clipboard là QR thứ 2":
  1. Mở QR modal line A → chờ button "Chụp mã QR" enable → click → chờ label "Đã copy ảnh".
  2. Đóng modal, mở QR modal line B (KHÔNG reload page) → click Chụp → chờ label thành công.
  3. Đọc clipboard trong page: `navigator.clipboard.read()` → PNG → base64 → về Node.
  4. Node: decode PNG bằng `pngjs` → `jsqr` → parse payload → **assert addInfo chứa code line B và KHÔNG chứa code line A** (2 assertion).
- [ ] **Step 4.3:** Test 2 — same flow cho nút "Copy mã QR".
- [ ] **Step 4.4:** Test 3 — guard fail-closed: intercept trả QR encode addInfo của line KHÁC (giả lập cache bẩn) → click Chụp → assert label exact "QR không khớp nội dung — bấm F5 rồi thử lại" + clipboard KHÔNG đổi (vẫn giá trị seed từ trước).
- [ ] **Step 4.5:** `npx playwright test e2e/qr-capture.spec.ts` → xanh. Chạy 3 lần liên tiếp xác nhận không flaky (clipboard e2e nhạy timing).

---

## Phase 4 — Docs + build check

### Task 5

- [ ] **Step 5.1:** `frontend/src/components/payment-request/CLAUDE.md` — thêm vào cuối section QR/stale content:

```md
## QR capture guard (incident 23/6 + 7/7/2026)
- `toBlob` (html-to-image) BẮT BUỘC `includeQueryParams: true` — lib cache resource theo URL đã cắt query; mọi QR vietqr.io chỉ khác nhau ở query → thiếu option này là ảnh chụp thứ 2 trong phiên nhúng bitmap QR cũ.
- Mọi ảnh QR rời app (Chụp mã QR / Copy mã QR) phải qua `qrVerify.ts`: decode (jsqr) + parse EMV (tag 54 amount, 62-08 addInfo) khớp `code` + `amount` của line. Fail-closed: mismatch/unreadable → chặn clipboard/download.
- `<img>` QR giữ `crossOrigin="anonymous"` + `key={url}` + `imgReady` guard (fix 26/6) — các lớp này bảo vệ DOM, qrVerify bảo vệ ảnh output; không thay thế nhau.
```

- [ ] **Step 5.2:** `MODULES.md` section B1: thêm `qrVerify.ts` vào list FE chi tiết + `frontend/e2e/qr-capture.spec.ts` vào E2E của module 3.
- [ ] **Step 5.3:** `docs/CHANGELOG.md`: entry fix theo format hiện có của file.
- [ ] **Step 5.4:** Full check cuối:

```bash
cd frontend && npx tsc -b && npm run test && npm run e2e
```
Expected: tất cả xanh. `npm run build` pass (Vercel-identical).

---

## Phase 5 — Deploy + verify prod + vận hành

- [ ] **Step 6.1:** Commit + push branch, tạo PR, merge main sau khi review → Vercel auto-deploy.
- [ ] **Step 6.2:** **Smoke test tái hiện incident trên prod** (bắt buộc, vì E2E dùng QR tự sinh, chưa chứng minh jsqr decode được PNG compact2 thật của vietqr.io — có logo giữa QR):
  1. Tạo 2 PR test (`is_test`) khác nội dung, cùng amount.
  2. Cùng phiên không F5: chụp QR A → chụp QR B → paste ảnh B ra chat test.
  3. Quét ảnh B bằng app ngân hàng thật trên điện thoại → nội dung CK phải là B.
  4. Nút "Chụp mã QR"/"Copy mã QR" hoạt động bình thường (không bị guard chặn nhầm — nếu bị chặn `unreadable` đều đặn nghĩa là jsqr không decode được compact2 → xem Risks).
  5. Xóa PR test.
- [ ] **Step 6.3:** Báo sales (nhóm Zalo vận hành): bug QR nhảy nội dung đã fix, bỏ workaround F5; nếu gặp nút báo "QR không khớp nội dung" thì F5 và báo lại ngay (đó là guard đang chặn ảnh sai).
- [ ] **Step 6.4:** Đối chiếu tồn đọng incident: line FHK59 (PR-2026-0135, Chị Tuyết) đang `pending` hợp lệ — chờ chị Tuyết chuyển thật, KHÔNG liên quan fix; không cần xử lý data.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| jsqr không decode được PNG compact2 thật của vietqr.io (logo "V" giữa QR) → guard chặn nhầm `unreadable` | Retry scale [1, 0.75, 0.5] trong `decodeQrFromBlob`. Smoke test Step 6.2 là cổng chốt trước khi báo sales. Nếu vẫn fail: crop riêng vùng `<img>` QR (bounding box từ `imgRef`) trước khi decode — ảnh QR thuần decode dễ hơn ảnh card. |
| `createImageBitmap` thiếu trên browser cũ | Sales dùng Chrome/Edge desktop (đều có). Wrap try/catch → verdict `unreadable` (fail-closed, không crash). |
| E2E clipboard flaky trên CI/headless | `grantPermissions` Chromium + retry 1 lần trong spec; nếu vẫn flaky, assert qua download-fallback path thay clipboard (blob giống nhau). |
| Guard làm chậm thao tác chụp | Decode ~50–150ms trên ảnh 1400px — không đáng kể so với toBlob (vài trăm ms). Không thêm spinner mới, dùng state "capturing" sẵn có. |
