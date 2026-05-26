# Payment Request frontend mapping

> **Cập nhật:** 2026-05-26 · Branch `ui/ux`  
> Source UI: prototype `PalFish CRM.html` (Hiếu). CSS: `frontend/src/styles/prototype-payments.css` (scope `.gmv-prototype`).

## Tab sidebar → component

| Sidebar label | Component | Luồng |
|---------------|-----------|--------|
| Quản lý thanh toán | `PaymentRequestsTab.tsx` | B1 + B2 (PR list, drawer, thêm lần TT) |
| Đối soát giao dịch | `ReconciliationTab.tsx` | B2 kế toán — confirm/reject |
| Kích hoạt khóa học | `ActivationTab.tsx` | B3 — 4 sub-tab AR |
| Xuất hóa đơn | `InvoiceRequestTab.tsx` | B4 — issue + ZIP 3 XLSX |

Shared: `PaymentFlowContext.tsx`, `paymentFlowUtils.ts`, `paymentRequestUtils.ts`

## Prototype → frontend detail

| Prototype area | Frontend | API | Ghi chú |
|----------------|----------|-----|---------|
| Payment Request list | `PaymentRequestsTab` + `PaymentRequestTable` | `GET /payment-requests` | KPI, filter chips, tabs tracking/created/cancelled |
| Payment Request detail | `PaymentRequestDetailDrawer` | same payload | Timeline B1→B4, sửa KH, lần TT |
| Add payment attempt | `AddPaymentAttemptModal` | `POST .../payments` | QR / cash / card / installment |
| Upload bill | `BillUploadZone` | `POST .../payments/{lineId}/bill` | Không localStorage |
| Cancel PR | `CancelPrModal` | `POST .../cancel` | |
| Reconciliation | `ReconciliationTab` | `PATCH` line status | `billImage` từ API |
| Active Request | `ActivationTab` + `ARCreateModal` | `GET/POST/PATCH /active-requests` | 4 tab: chờ tạo / Order ID / sẵn HĐ / tất cả |
| Invoice queue | `InvoiceRequestTab` | `POST .../issue-invoice` | Bulk + `downloadTaxInvoiceZip()` (FE tạm) |

## Trạng thái UI

| Domain | Code | UI label |
|--------|------|----------|
| Payment Request | `pending` | Chưa thanh toán |
| Payment Request | `short` | Thiếu |
| Payment Request | `done` | Đủ |
| Payment Request | `over` | Thừa |
| Payment Request | `cancelled` | Đã huỷ |
| Payment line | `pending` + no bill | Chờ chuyển |
| Payment line | `pending` + bill | Chờ xác nhận |
| Payment line | `paid` | Đã xác nhận |
| Payment line | `rejected` | Từ chối |
| Active Request course | `pending_order` | Chờ tạo đơn |
| Active Request course | `partial_order` | Đang điền Order ID |
| Active Request course | `ready_invoice` | Sẵn sàng xuất HĐ |
| Active Request course | `invoiced` | Đã xuất hoá đơn |

## Fallback mock

- `PaymentFlowContext` gọi API trước; mock/local chỉ khi API lỗi hoặc standalone AR không PR.
- Production: cần BE + SQL patches — **`docs/FE_HANDOFF_BE_PROMPTS.md`**.

## Encoding

Chuỗi tiếng Việt trong các file trên phải UTF-8. Sự cố mojibake 26/05 — xem `FE_HANDOFF_BE_PROMPTS.md` §9, `CHANGELOG.md`.
