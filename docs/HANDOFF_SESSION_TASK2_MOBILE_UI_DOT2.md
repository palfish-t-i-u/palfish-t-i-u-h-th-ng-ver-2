# Session Handoff — Task 2: Mobile UI đợt 2 (Thanh toán + Đối soát)

## Prompt dán vào session mới

```
Triển khai Task 2: Mobile UI đợt 2 — Quản lý thanh toán (sale) + Đối soát giao dịch (kế toán).

Plan chi tiết: `docs/plans/PLAN_TASK2_MOBILE_THANH_TOAN_DOI_SOAT_2026-07-12.md` — đọc TOÀN BỘ trước khi code.

## Tóm tắt

Mobile-hóa drawer/modal cho B1-B4 (sale + kế toán). Hạ tầng list đã done (GĐ0-3). Còn lại: drawer inline-width đè mobile, modal chưa responsive, touch target < 44px.

Pattern lặp: extract inline width → class riêng (desktop giữ y hệt) + @media max-767 override.

4 phase, mỗi phase merge riêng:
- P1: QrViewModal + PaymentRequestDetailDrawer (sale B1) — 170'
- P2: ActivationTab + InvoiceRequestTab (sale B3/B4) — 130'
- P3: ReconciliationTab txn drawer (kế toán B2) — 110'
- P4: CardReconciliationTab drawer-center + GatewaySyncTab (kế toán thẻ) — 130'

## Tiên quyết

⚠️ PHẢI chạy SAU Task 1 merge main. Task 1 sửa chồng lấn 5 file: PaymentRequestDetailDrawer, ActivationTab, PrRowCards, CreatePaymentRequestModal, prototype-payments.css.

Trước khi bắt đầu: pull main mới nhất, re-baseline đọc code thật 5 file đó.

## Trạng thái hiện tại

- Branch: sandbox
- GĐ0-3 list đã ship (dab995d, 3738ebf): 7 file *RowCards, useIsMobile, MobileNavSheet
- Task 1 chưa merge (chạy Task 1 xong mới bắt đầu Task 2)

## Lưu ý quan trọng

1. TUYỆT ĐỐI không sửa rule chung CSS (.gmv-prototype-modal-scrim .modal, .field-row) — 15+ modal ăn chung
2. CSS mới append CUỐI prototype-payments.css — tránh vùng comment hỏng ~:2055
3. QrViewModal: giữ class scrim (test :529) + KHÔNG đụng qrVerify/includeQueryParams
4. 2 modal class kép (QrViewModal:207, ReconciliationTab:270) — mở tay ở 375px sau mỗi phase
5. E2E desktop PASS nguyên trạng sau MỖI phase — fail = dừng
6. Cổng mỗi phase: `npx tsc -b` + `npm run test` + `npm run e2e` + `npm run e2e:mobile`
7. Rollout từng phase: branch → sandbox → verify điện thoại thật → main

## Open questions (chốt trước code)

1. Viewport: 375×812 (worst-case) hay giữ Pixel 5 393×851?
2. GatewaySyncTab: chống tràn + hint desktop-only (đề xuất) hay mobile-hóa đầy đủ?
3. QR modal: căn giữa (đề xuất) hay bottom-sheet?
4. Phase 3-4 cần kế toán duyệt điện thoại thật — ai đầu mối?

Bắt đầu từ Phase 0 (safety net + baseline).
```
