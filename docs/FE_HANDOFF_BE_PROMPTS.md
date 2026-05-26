# FE Handoff — Backend / API / Schema Prompts

Frontend-only fixes for B2–B4 tabs. Items below need Giang & Đức on backend/API/schema.

---

## 1. Payment line bill upload (persistent storage)

**Context:** Tab 1 (Payment Management) stores bill images in `localStorage` via `mergeBillUrlsIntoRequests` (`frontend/src/lib/paymentBillStorage.ts`). Reconciliation drawer reads `billUrl` from merged data.

**FE expects:**
- `POST /api/v1/payment-requests/{prId}/payments/{lineId}/bill` (multipart) or Supabase Storage signed URL flow
- `GET` payment line includes `bill_url` (public or signed)
- Bill persists across devices/sessions (not localStorage)

**Suggested API/schema:**
- Add `bill_url text`, `bill_uploaded_at timestamptz` on `payment_lines`
- Or `payment_line_attachments` table (line_id, url, uploaded_by)

**Files to touch:** payment line routes, Supabase storage bucket policy, `fromApiAttempt` already maps `bill_url`

---

## 2. Tax invoice XLSX export (3 files) — B4 batch endpoint

**Context:** Tab B4 (InvoiceRequestTab) + ActivationTab tải **ZIP 3 file Excel** kê khai thuế qua `downloadTaxInvoiceZip()` (`frontend/src/utils/taxInvoiceXlsxExport.ts`). Logic adapt từ `backend/invoice_routes.py` (`_build_excel_orders/customers/products`). FE tạm cấp mã `M{DDMMYY}{seq}` / `PF{seq}` khi export — chưa persist DB.

**FE expects (BE nên làm):**
- `POST /api/v1/invoice-courses/export-batch` body: `{ items: [{ ar_id, course_code }] }` hoặc export toàn queue B4
- BE cấp + **lưu cứng** `tax_invoice_code` (M...), `tax_product_code` (PF...) trên course — dùng `tax_sequences` như M4 cũ
- Response: ZIP 3 xlsx (`01_1don_hang_*.xlsx`, `02_khach_hang1_*.xlsx`, `03_sanpham1_*.xlsx`) — reuse `_build_excel_*` trong `invoice_routes.py`
- Map dữ liệu B4: PR (name, phone, email, address) + AR course (orderId, packageName, amount, customerType, taxCode)

**Không phải PDF** — prototype B4 nút "Tải PDF" là sai spec.

**Suggested schema:**
- `active_request_courses.tax_invoice_code text`, `tax_product_code text` (hoặc JSONB course fields)
- Bảng `export_batches` / `tax_sequences` đã có từ M4 — extend cho luồng PR+AR

**Files to touch:** `backend/activation_routes.py` hoặc `invoice_routes.py`, adapt `_row_to_invoice_order` cho Payment Request flow, `fromApiActiveRequest` mapper

---

## 3. Standalone Active Request create (no PR)

**Context:** ActivationTab header **+ Tạo Active Request** modal allows PR selector or “Không liên kết PR”. With PR → `POST /api/v1/payment-requests/{prId}/active-requests`. Without PR → FE uses `createLocalActiveRequestFromForm` only (not persisted on server).

**FE expects:**
- `POST /api/v1/active-requests` body: `{ customer_name, uids: [{ uid, phone, country, courses: [{ name, amount }] }] }`
- Optional `pr_id` nullable

**Suggested API/schema:**
- Allow `active_requests.pr_id` NULL (may exist)
- Standalone create endpoint + RLS

**Files to touch:** `backend` active-requests router, `docs/supabase_schema_patch_active_requests.sql`

---

## 4. Customer email on Payment Request

**Context:** InvoiceRequestTab shows email from `row.pr?.email` (fallback chain: course → PR).

**FE expects:** `email` on payment_request in list/detail APIs.

**Suggested API/schema:**
- Column `payment_requests.email text` — see prior patch if applied: `docs/supabase_schema_patch_payment_requests.sql`

**Files to touch:** PR create/update serializers, Supabase migration

---

## 5. Issue-invoice flow — FE no longer inline from B3

**Context:** ActivationTab **Xuất HĐ** per course now navigates to B4 tab **Chờ xuất** (`openInvoiceTab: "pending"`, optional `openInvoiceCourseCode`) instead of calling `issueInvoiceForCourse` inline.

**FE still calls:** `POST .../active-requests/{arId}/courses/{courseCode}/issue-invoice` from **InvoiceRequestTab** only.

**BE action:** No change required if issue endpoint unchanged. Ensure B4 issue is idempotent and returns updated AR + `invoice_id` / `invoiced_at`.

---

## 6. Reconciliation — reject reason on payment line

**Context:** Reconciliation drawer shows `rejectReason` when status rejected. FE maps `reject_reason` from API if present.

**FE expects:**
- `PATCH /transactions/{lineId}` with status `rejected` accepts optional `reject_reason`
- List/detail payment lines return `reject_reason`

**Suggested API/schema:**
- `payment_lines.reject_reason text`

**Files to touch:** transactions patch handler, `PaymentLineApiRow`, `fromApiAttempt`

---

## 7. Cash/card payment lines — pending until accountant confirm

**Context:** FE now creates cash/card/installment lines as `status: "pending"` (not auto-`paid`). Accountant confirms via B2 → `PATCH` to `paid`. PR `received` should count only accountant-confirmed (`paid`) lines.

**BE action:** Align PayOS QR webhook + manual confirm semantics; do not auto-mark cash/card as `paid` on create unless business rules say otherwise.

**Files to touch:** add-payment handler, `normalizeRequest` / received aggregation on BE if duplicated
