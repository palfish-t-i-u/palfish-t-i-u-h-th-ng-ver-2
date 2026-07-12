# PLAN Task 2 — Mobile UI đợt 2: Quản lý thanh toán (sale) → Đối soát giao dịch (kế toán)

> Ngày: 2026-07-12 · Trạng thái: **chờ duyệt, chạy SAU Task 1 merge main** · Effort: ~580 phút (~9.7h) chia 4 phase, mỗi phase ≤ 1 buổi, merge riêng.
> ⚠️ **Re-baseline bắt buộc**: plan này mô tả hiện trạng TRƯỚC Task 1. Sau khi Task 1 merge, đọc lại code thật 5 file chồng lấn (PaymentRequestDetailDrawer, ActivationTab, PrRowCards, CreatePaymentRequestModal, prototype-payments.css) trước khi viết — tiền lệ revert fac15e0.

## Bối cảnh

Hạ tầng mobile GĐ0–3 (commit dab995d + 3738ebf) đã ship phần **LIST**: 7 file *RowCards, useIsMobile, MobileNavSheet, Playwright project mobile. Mọi màn trong scope đều "done list, **partial drawer/modal**". Gốc rễ còn lại là 3 loại lỗi lặp:

1. Drawer có **inline width** `min(Xpx, Yvw)` đè lên rule mobile `100vw` (GĐ2).
2. Modal hệ `gmv-prototype-modal-scrim` chưa có media query nào (đặc biệt QrViewModal với `.qr-big` 200px cứng).
3. `.drawer-center` (CardRecon) chưa có rule mobile.

**Pattern duy nhất lặp lại**: extract inline width → class riêng giữ giá trị desktop **giống hệt từng ký tự** + override trong `@media (max-width:767px)`. Không sửa rule chung (15 modal / 7 file ăn chung `.gmv-prototype-modal-scrim`).

## Phase 0 — Safety net (gộp vào đầu Phase 1) — 40'

Files: `frontend/package.json`, `playwright.config.ts`, `e2e/helpers/mobile.ts` (MỚI).
1. Thêm script `e2e:mobile` = `playwright test --project=mobile` (hiện phải gõ tay --project).
2. Override viewport project mobile Pixel 5 393×851 → **375×812** (worst-case iPhone SE/13 mini; giữ chromium). Chạy 4 spec mobile hiện có làm canary — fail do overflow có sẵn ở 375 = bug trong scope, ghi vào phase tương ứng. Nếu fail ở màn NGOÀI scope (mobile-sales, mobile-admin) → giữ 393, chỉ `test.use({viewport})` trong spec mới (quyết định trong 15').
3. `helpers/mobile.ts`: `assertNoHorizontalOverflow(page)` + re-export `openViaThem` từ mobile-nav.
4. Baseline full: `npx tsc -b` + `npm run test` + `npm run e2e` + e2e:mobile — chốt mốc xanh.

## Phase 1 — SALE B1: QrViewModal + PaymentRequestDetailDrawer audit 375px — 170'

Files: `QrViewModal.tsx`, `PaymentRequestDetailDrawer.tsx`, `PrRowCards.tsx`, `prototype-payments.css`, `e2e/mobile-payment-drawer.spec.ts` (MỚI).
- SKIP: B1 list + PrRowCards đã done. ~~Fallback UID "—"~~ → **đã ship trong Task 1 bước 7, verify-only**.
- (a) **QrViewModal**: thêm class modifier `qr-view-modal` vào div .modal (GIỮ class scrim — QrViewModal.test.tsx:529 query selector đó). CSS mới append CUỐI prototype-payments.css (tránh comment hỏng ~2055): `@media max-767` → `.qr-detail-card` flex-column; `.qr-big` width 100% max-width 280px căn giữa; nút hành động ≥44px. **KHÔNG đụng qrVerify/includeQueryParams** (QR incident GROUP 1-12).
- (b) **PaymentRequestDetailDrawer**: drawer chính đã ăn rule 100vw GĐ2 (không inline width). Việc còn lại: audit nội dung 375px — payment-lines wrap, 6 modal con (~2554–2824, width min(420–600px,100%)) verify từng cái; form edit dùng .field-row 2-cột → bọc wrapper `pr-drawer-edit` + media rule 1 cột scoped; touch target Sửa/Lưu/Upload bill ≥44px. Verify `grep 'Lần #{i'` = 0.
- (c) **CreatePaymentRequestModal**: đã mobile-hóa trong Task 1 bước 6 → **verify-only** ở 375px.
- (d) E2E `mobile-payment-drawer.spec.ts`: B1 → tap card → drawer mở không tràn; Sửa → form 1 cột; mở QR modal → ảnh visible + không tràn — spec functional đầu tiên (4 spec cũ chỉ check overflow list).
- Verify: tsc -b, vitest (QrViewModal.test.tsx NGUYÊN TRẠNG), e2e desktop payment-lifecycle + qr-capture, e2e:mobile. Sandbox → điện thoại thật → main.

## Phase 2 — SALE B3 ActivationTab + B4 InvoiceRequestTab — 130'

Files: `ActivationTab.tsx`, `InvoiceRequestTab.tsx`, `prototype-payments.css`, `e2e/mobile-activation.spec.ts` (MỚI).
- SKIP: list B3/B4 + ActivationRowCards/InvoiceRowCards đã done.
- (a) **ActivationTab AR drawer** (:963): inline `min(1020px,96vw)` đè rule mobile → extract class `ar-drawer` (desktop giữ nguyên giá trị) + `@media max-767` width 100vw. Grid ar-mini-* đã collapse @720px → verify. Audit 4 modal scrim (:188 AR-create 720px, :1590 add-UID, :1749, :2276): input "Nhập UID học viên…" + Order ID + Lưu ≥44px, datalist Tên bé (commit 2917826) dùng được trên touch. **Đây là đường "bổ sung UID trước kích hoạt" của Task 1 — sale sẽ thao tác trên điện thoại, phải mượt.** Re-baseline: Task 1 có thể đã thêm gate/message ở vùng này.
- (b) **InvoiceRequestTab drawer** (:94): inline `min(720px,96vw)` → extract `invoice-drawer` + mobile override; sale chỉ read → ~15'.
- (c) E2E `mobile-activation.spec.ts`: B3 → tap card → drawer không tràn; ô UID visible + focusable; dialog Thêm UID không tràn. +1 test drawer B4 vào mobile-accounting.
- Verify: tsc -b + vitest + e2e desktop (journeys chạy tay) + e2e:mobile. Sandbox → điện thoại thật → main.

## Phase 3 — KẾ TOÁN B2: ReconciliationTab txn drawer + modal bill album — 110'

Files: `ReconciliationTab.tsx`, `prototype-payments.css`, `e2e/mobile-accounting.spec.ts` (mở rộng).
- SKIP: list B2 + ReconTxnCards/ReconBankCards + bulk-bar mobile CSS đã done.
- (a) Txn drawer (:1193): inline `min(720px,92vw)` → extract `recon-drawer` + mobile 100vw; txn-drawer-body đã collapse @820 → verify candidate list + nút gán PR ở 375.
- (b) Modal confirm (:270) mang **class kép** `gmv-prototype gmv-prototype-modal-scrim` (giống QrViewModal:207) — kiểm tra rule .gmv-prototype mobile hiện có không vỡ nó ở 375; modal album bill (:1890): ảnh max-width 100%.
- (c) Flow kế toán tick "tiền đã vào" (canConfirmPayment): test tay sandbox bằng account ops — checkbox/nút ≥44px.
- (d) Mở rộng mobile-accounting.spec.ts: Đối soát CK → tap txn card → drawer không tràn + nút hành động visible.
- Verify: full battery. Sandbox → **kế toán duyệt điện thoại thật** → main.

## Phase 4 — KẾ TOÁN Đối soát thẻ: drawer-center + GatewaySyncTab chống tràn — 130'

Files: `CardReconciliationTab.tsx`, `GatewaySyncTab.tsx`, `prototype-payments.css`, `e2e/mobile-accounting.spec.ts`.
- SKIP: list CardRecon + CardReconRowCards đã done.
- (a) **Drawer-center** (:728, inline `min(1040px,95vw)`, max-height 90vh): grep xác nhận CardReconciliationTab là consumer DUY NHẤT của `.drawer-center` → viết rule scoped `.gmv-prototype .drawer.drawer-center` trực tiếp: extract inline width + `@media max-767` width 100vw height 100dvh (**full-screen** — nội dung đối soát 2 cột dài, full-screen dễ dùng hơn bottom-sheet), 2 cột → 1 cột. Modal mismatch confirm (:1072, 440px) verify.
- (b) **GatewaySyncTab**: CHỦ ĐÍCH không mobile-hóa đầy đủ — workflow là Chrome extension desktop. Chỉ chống tràn ngang (kpi-row đã collapse @1024) + 1 dòng hint mobile "Đồng bộ giao dịch cần Chrome trên máy tính" (Tailwind max-md:).
- (c) Mở rộng mobile-accounting.spec.ts: Quẹt thẻ → card list → tap mở drawer-center không tràn; GatewaySync assert overflow. ⚠️ Verify account e2e (user.json) thấy tab reconCard trước khi viết — nếu thiếu, dùng auth-role.setup pattern.
- Verify: full battery. Sandbox → điện thoại thật → main. **KẾT THÚC Task 2.**

## Guardrails

1. **Zero-desktop-delta**: TUYỆT ĐỐI không sửa rule chung `.gmv-prototype-modal-scrim .modal`, `.field-row`, `.addr-row` — 15+ modal / 7 file ăn chung. Mọi thay đổi qua class modifier mới + block @media append CUỐI file. Review diff CSS mỗi phase: ngoài block mới + class extract, **0 dòng rule cũ bị đổi**.
2. **Pattern extract inline-width**: giá trị desktop trong class mới GIỐNG HỆT từng ký tự inline cũ → desktop ≥768px không đổi pixel (nguyên tắc §4.3 spec mobile đã approve). Nếu drawer có inline style khác đè lẫn nhau → fallback override mobile `!important` thay vì extract.
3. **E2E desktop pass NGUYÊN TRẠNG sau MỖI phase** (payment-lifecycle, qr-capture, payment-tvts-filter, crm-sync, dashboard-sales) — fail bất kỳ = dừng, không merge.
4. **QrViewModal**: giữ class scrim (test :529) + không đụng qrVerify/includeQueryParams.
5. **2 modal class kép** (QrViewModal:207, ReconciliationTab:270) ăn CẢ rule mobile .gmv-prototype hiện có → không thêm rule mới vào block .gmv-prototype chung; sau mỗi phase mở tay 2 modal này ở 375 trên sandbox.
6. **Comment CSS hỏng ~:2055**: mọi CSS mới append cuối file, không format/reorder vùng 2048-2085, không chạy formatter toàn file.
7. **Rollout từng phase**: branch → squash merge sandbox (Vercel auto) → duyệt ĐIỆN THOẠI THẬT (Phase 3-4 nhờ kế toán) → merge main. Không gộp 4 phase 1 lần merge.
8. **Definition-of-done mỗi phase**: `npx tsc -b` + `npm run test` + `npm run e2e` + `npm run e2e:mobile` xanh; git add từng file (cấm -A).
9. **Tuần tự sau Task 1** + re-baseline 5 file chồng lấn; useIsMobile là DEFAULT export; Badge/Button chỉ dùng variant có thật (bài học fac15e0).
10. Đụng PaymentRequestDetailDrawer: `grep 'Lần #{i'` = 0 trước commit.

## Tests

- MỚI `e2e/mobile-payment-drawer.spec.ts` (P1), `e2e/mobile-activation.spec.ts` (P2), `e2e/helpers/mobile.ts` (P0).
- MỞ RỘNG `e2e/mobile-accounting.spec.ts` (P2-P4): drawer B4, txn drawer B2, drawer-center thẻ, GatewaySync overflow.
- `package.json`: script `e2e:mobile`. `playwright.config.ts`: viewport 375×812 (fallback per-spec nếu canary lộ overflow ngoài scope).
- GIỮ PASS nguyên trạng: QrViewModal.test.tsx, PaymentRequestTable.test.tsx, billguard, splitChildNames.

## Risks + Mitigation (tóm tắt)

| Risk | Mitigation |
|---|---|
| CSS lan qua 2 modal class kép | Rule mới scoped riêng từng modal; mở tay 2 modal ở 375 sau mỗi phase |
| Extract inline→class đổi cascade desktop | Giá trị y hệt + e2e desktop + duyệt mắt sandbox; fallback !important |
| Viewport 375 làm spec cũ fail ngoài scope | Canary P0; nếu fail → giữ 393 + test.use per-spec |
| Conflict file Task 1 sửa | Chạy sau Task 1 merge; re-baseline; diff chỉ class/layout |
| Comment CSS hỏng :2055 | Append cuối file, không format vùng đó |
| Account e2e thiếu quyền reconCard | Verify đầu P3; auth-role.setup pattern |
| Drawer-center full-screen lạ với kế toán | Consumer duy nhất; kế toán duyệt điện thoại thật P4 trước merge |

## Open questions

1. Viewport chuẩn: **375×812** (đề xuất, worst-case) hay giữ Pixel 5 393×851?
2. GatewaySyncTab: chấp nhận scope "chống tràn + hint desktop-only" (đề xuất — workflow là Chrome extension) hay mobile-hóa đầy đủ (+60')?
3. QR modal mobile: giữ căn giữa (đề xuất, ít rủi ro với ảnh QR + copy nội dung CK) hay bottom-sheet-hóa?
4. Phase 3-4 cần kế toán duyệt điện thoại thật — ai là đầu mối, SLA duyệt bao lâu (ảnh hưởng lịch merge, không ảnh hưởng effort)?
