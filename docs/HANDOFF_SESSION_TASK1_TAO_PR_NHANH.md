# Session Handoff — Task 1: Tạo PR cực nhanh (UID optional)

## Prompt dán vào session mới

```
Triển khai Task 1: Tạo PR cực nhanh — UID optional lúc tạo, bắt buộc lúc kích hoạt.

Plan chi tiết: `docs/plans/PLAN_TASK1_TAO_PR_NHANH_2026-07-12.md` — đọc TOÀN BỘ trước khi code.

## Tóm tắt

Dời điểm enforce UID từ B1 (tạo PR) xuống B3 (kích hoạt). Sale chỉ cần SĐT + Tên + Tiền + Nguồn để tạo PR. UID bổ sung sau, bắt buộc tại modal kích hoạt.

Kỹ thuật: sentinel uid="" (không migration), gate MISSING_UID ở BE activation_routes.py, writeback uid về PR khi tạo AR.

## Trạng thái hiện tại

- Branch: sandbox (up-to-date với main)
- Vừa merge xong: NET thừa/thiếu (12/7), DingTalk AR-created, Tên bé kích hoạt, bỏ multi-child
- Plan có 10 bước, theo thứ tự, test-first
- 4 open questions ở cuối plan — Q3 đã chốt (per-row UID khi nhiều bé). Q1, Q2, Q4 chốt trước bước 4

## Lưu ý quan trọng

1. Plan ghi rõ guardrails 1-10 — tuân thủ nghiêm
2. Deploy order: BE trước, FE sau
3. Vùng nóng drawer 2917826 (commit Tên bé) — diff tối thiểu, đọc code thật trước khi sửa
4. CSS: KHÔNG sửa rule chung .gmv-prototype-modal-scrim — scoped class modifier + @media append cuối file
5. Cổng: `npx tsc -b` (KHÔNG --noEmit) + `npm run test` + `pytest`
6. Squash commits trước merge

## Files chính

BE:
- backend/payment_request_routes.py — _payment_request_insert_row (:889), _payment_request_patch_row (:947), guard (:1025)
- backend/activation_routes.py — _save_active_request (:1234), _writeback_child_uids_to_pr

FE:
- frontend/src/components/payment-request/CreatePaymentRequestModal.tsx — form reorder + canSubmit
- frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx — modal AR UID gate
- frontend/src/types/paymentRequest.ts — CreatePaymentRequestPayload.uid optional
- frontend/src/styles/prototype-payments.css — mobile CSS append cuối

Bắt đầu từ bước 1 (pin hành vi hiện tại bằng pytest).
```
