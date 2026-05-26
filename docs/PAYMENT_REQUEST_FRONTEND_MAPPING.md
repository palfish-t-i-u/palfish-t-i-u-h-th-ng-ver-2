# Payment Request frontend mapping

> Source of truth UI: prototype `PalFish CRM.html` by anh Hieu.  
> Scope: frontend/UI and API client only. Backend/schema/reconcile are owned by Giang/Duc.

## Prototype to frontend

| Prototype area | Frontend target | API contract | Status/data shown |
|---|---|---|---|
| Payment Request list | New `PaymentRequestsTab` view | `GET /payment-requests` | PR-ID, customer, UID/phone, target, received, delta, status |
| Payment Request detail | Same view, detail panel | `GET /payment-requests` payload | Customer info, address, payment attempt history |
| Add payment attempt | Modal in `PaymentRequestsTab` | `POST /payment-requests/{id}/payments` | Method, amount, bank/card/cash/installment metadata |
| Reconciliation | Internal tab in `PaymentRequestsTab` | `POST /payment-requests/{id}/payments/{paymentId}/confirm` | Chờ chuyển, Chờ xác nhận, Đã xác nhận |
| Cancel PR | List/detail action | `POST /payment-requests/{id}/cancel` | Đã huỷ |
| Active Request / Course Code | Internal tab in `PaymentRequestsTab` | `GET/POST/PATCH /active-requests` | Chờ tạo đơn, Đang điền Order ID, Sẵn sàng xuất HĐ, Đã xuất hoá đơn |
| Invoice queue | Internal tab in `PaymentRequestsTab` | `POST /active-requests/{id}/courses/invoice` | Course Code, Order ID, invoice status |

## Prototype statuses

| Domain | Code | UI label |
|---|---|---|
| Payment Request | `pending` | Chưa thanh toán |
| Payment Request | `short` | Thiếu |
| Payment Request | `done` | Đủ |
| Payment Request | `over` | Thừa |
| Payment Request | `cancelled` | Đã huỷ |
| Payment attempt | `pending` + no bill | Chờ chuyển |
| Payment attempt | `pending` + bill | Chờ xác nhận |
| Payment attempt | `paid` | Đã xác nhận |
| Active Request | `pending_order` | Chờ tạo đơn |
| Active Request | `partial_order` | Đang điền Order ID |
| Active Request | `ready_invoice` | Sẵn sàng xuất HĐ |
| Active Request | `invoiced` | Đã xuất hoá đơn |

## Frontend defaults before backend is ready

- UI calls the API contract above first.
- If the API is unavailable, the screen falls back to local mock data matching the same contract.
- Mock fallback is for UI review only and must not be treated as production persistence.
