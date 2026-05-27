# FE Handoff — Backend / API / Schema Prompts

> **Cập nhật:** 2026-05-27 · Branch **`main`** @ `2f93684`  
> FE + BE handoff B1–B4 đã merge và push prod. SQL patches prod **đã chạy**. Chi tiết: `docs/HANDOFF_STATUS_2026-05-27.md`.

## Trạng thái nhanh

| # | Mục | FE | BE / DB |
|---|-----|----|---------|
| 1 | Bill upload payment line | ✅ `BillUploadZone` + `POST .../payment-lines/{lineId}/bill` | ✅ Deploy + SQL + bucket `bills` |
| 2 | Tax XLSX ZIP batch (B4) | ✅ Gọi BE, fallback client | ✅ `POST /invoice-courses/export-batch` + persist M/PF |
| 3 | Standalone Active Request | ✅ Gọi API khi không PR | ✅ `POST /active-requests` + SQL nullable `pr_id` |
| 4 | Email trên PR | ✅ Create + hiển thị B4 | ✅ Column + serializer |
| 5 | Issue invoice từ B4 | ✅ Navigate B3→B4; issue tại B4 | ✅ Giữ endpoint hiện tại |
| 6 | Reject reason | ✅ Drawer B2 map field | ✅ PATCH + serializer — verify prod column |
| 7 | Cash/card pending → confirm | ✅ FE tạo `pending` | ✅ BE không auto-paid on create |

---

## 1. Payment line bill upload (persistent storage)

**FE (done):** Tab B1 upload qua `endpoints.paymentRequests.uploadPaymentLineBill()` → `POST /api/v1/payment-lines/{lineId}/bill` (multipart). B2 drawer đọc `bill_image` / `billImage` từ API — **không** dùng `localStorage`.

**BE cần:**
- Endpoint đã có trong `backend/payment_request_routes.py` (`upload_payment_line_bill`) — deploy Render + smoke test prod
- Chạy `docs/supabase_schema_patch_payment_lines_bill.sql` (`payment_lines.bill_image text`)
- Bucket Supabase **`bills`** + policy (xem `docs/supabase_storage_setup.md`)
- `GET` payment line trả `bill_image` (signed/public URL)

**Files:** `payment_request_routes.py`, storage policy, `_serialize_payment_line`

---

## 2. Tax invoice XLSX export (3 files) — B4 batch endpoint

**FE (done):** `InvoiceRequestTab` + `ActivationTab` tải ZIP 3 file Excel qua `downloadTaxInvoiceZip()` (`frontend/src/utils/taxInvoiceXlsxExport.ts`). Logic adapt từ `backend/invoice_routes.py`. FE **tạm** cấp mã `M{DDMMYY}{seq}` / `PF{seq}` khi export — **chưa persist DB**.

**BE nên làm:**
- `POST /api/v1/invoice-courses/export-batch` body: `{ items: [{ ar_id, course_code }] }` hoặc export toàn queue B4
- BE cấp + **lưu cứng** `tax_invoice_code` (M...), `tax_product_code` (PF...) — dùng `tax_sequences` như M4
- Response: ZIP 3 xlsx (`01_1don_hang_*.xlsx`, `02_khach_hang1_*.xlsx`, `03_sanpham1_*.xlsx`) — reuse `_build_excel_*` trong `invoice_routes.py`
- Map B4: PR (name, phone, email, address) + AR course (orderId, packageName, amount, customerType, taxCode)

**Không phải PDF** — prototype B4 nút "Tải PDF" là sai spec.

**Schema gợi ý:**
- `active_request_courses.tax_invoice_code`, `tax_product_code` (hoặc JSONB course)
- Extend `tax_sequences` cho luồng PR+AR

**Files:** `activation_routes.py` / `invoice_routes.py`, `fromApiActiveRequest`

---

## 3. Standalone Active Request create (no PR)

**FE (done):** `ActivationTab` — **+ Tạo Active Request** (`ARCreateModal`). Có PR → `POST /payment-requests/{prId}/active-requests`. Không PR → `createLocalActiveRequestFromForm` (**chỉ local**, mất khi refresh).

**BE cần:**
- `POST /api/v1/active-requests` body: `{ customer_name, uids: [{ uid, phone, country, courses: [{ name, amount }] }] }`, optional `pr_id` nullable
- `active_requests.pr_id` NULL + RLS

**Files:** active-requests router, `docs/supabase_schema_patch_active_requests.sql`

---

## 4. Customer email on Payment Request

**FE (done):** `CreatePaymentRequestModal` gửi `email`; `InvoiceRequestTab` hiển thị `row.pr?.email`.

**BE cần:**
- Column `payment_requests.email text` — patch: `docs/supabase_schema_patch_payment_requests_email.sql`
- Create/list/detail serializers trả `email`

**Files:** `payment_request_routes.py`, Supabase migration

---

## 5. Issue-invoice flow — FE no longer inline from B3

**FE (done):** B3 **Xuất HĐ** → navigate B4 tab **Chờ xuất** (`openInvoiceTab: "pending"`). Issue chỉ gọi từ **InvoiceRequestTab**.

**BE:** Không đổi nếu `POST .../courses/{courseCode}/issue-invoice` giữ nguyên. Đảm bảo idempotent + trả `invoice_id` / `invoiced_at`.

---

## 6. Reconciliation — reject reason on payment line

**FE (done):** B2 drawer hiển thị `rejectReason` khi rejected; map `reject_reason` từ API.

**BE cần:**
- `PATCH /transactions/{lineId}` status `rejected` + optional `reject_reason`
- List/detail trả `reject_reason`

**Schema:** `payment_lines.reject_reason text`

**Files:** transactions patch handler, `PaymentLineApiRow`, `fromApiAttempt`

---

## 7. Cash/card payment lines — pending until accountant confirm

**FE (done):** Cash/card/installment tạo `status: "pending"`. Kế toán confirm B2 → `PATCH` `paid`. PR `received` chỉ tính line `paid`.

**BE:** Align PayOS webhook + manual confirm; không auto-`paid` cash/card on create (trừ khi business rule khác).

**Files:** add-payment handler, received aggregation on BE

---

## 8. Supabase patches — chạy trên prod (checklist Ops)

| File | Mục đích |
|------|----------|
| `supabase_schema_patch_payment_requests.sql` | Bảng PR cơ bản |
| `supabase_schema_patch_payment_lines_bill.sql` | `bill_image` |
| `supabase_schema_patch_payment_requests_email.sql` | `email` |
| `supabase_schema_patch_active_requests.sql` | AR + courses |
| `supabase_schema_patch_active_requests_pr_id_text.sql` | `pr_id` text |
| `supabase_schema_patch_payment_requests_cancel.sql` | Huỷ PR |
| `supabase_schema_patch_invoice_courses.sql` | Invoice queue fields |
| `supabase_schema_patch_active_requests_nullable_pr.sql` | AR không PR + `customer_name` |

Sau mỗi patch: `NOTIFY pgrst, 'reload schema';`

**Prod 27/05:** `bill`, `email`, `nullable_pr` patches đã chạy.

---

## 9. Ghi chú FE — encoding tiếng Việt

**Sự cố 26/05:** Chuỗi UI trong `PaymentRequestsTab.tsx`, `PaymentRequestDetailDrawer.tsx`, `QrViewModal.tsx` bị **mojibake** (UTF-8 lưu sai) → browser hiện `|`, `—`, `ß` thay chữ Việt. Data API vẫn đúng.

**Đã fix (local, chưa push):** Khôi phục UTF-8; load Inter (`frontend/index.html`); bỏ `font-feature-settings: cv11, ss01` trong `prototype-payments.css`.

**Quy tắc cho dev:**
- Lưu file `.tsx` **UTF-8** (không BOM nếu có thể; Cursor/VS Code: bottom bar → UTF-8)
- Không copy chuỗi Việt qua chat/email rồi paste — dễ double-encode
- Trước merge UI: grep `ΓÇ|ß║|╞░|─É|┬` trong `frontend/src` → phải 0 match
