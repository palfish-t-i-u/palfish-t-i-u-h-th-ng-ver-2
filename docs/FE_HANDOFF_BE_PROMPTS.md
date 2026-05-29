# FE Handoff — Backend / API / Schema Prompts

> **Cập nhật:** 2026-05-26 · Branch **`ui/ux`** @ `2f936840` (merge từ `main`)  
> FE B1–B4 trên `ui/ux`. BE handoff Đức (`2f93684`) đã merge local — **push `origin/ui/ux`** + Promote Vercel để đồng bộ preview/prod.

## Trạng thái nhanh

| # | Mục | FE | BE / DB |
|---|-----|----|---------|
| 1 | Bill upload payment line | ✅ `BillUploadZone` + `POST .../payment-lines/{lineId}/bill` | ⚠️ Chạy SQL + bucket `bills`; verify Render |
| 2 | Tax XLSX ZIP batch (B4) | ✅ `exportTaxBatch` + `downloadApiTaxZip`; fallback `downloadTaxInvoiceZip` | ✅ `POST /invoice-courses/export-batch` — verify persist M/PF trên prod |
| 3 | Standalone Active Request | ✅ `POST /active-requests` qua `PaymentFlowContext` | ✅ Route + ⚠️ **bắt buộc** chạy `supabase_schema_patch_active_requests_nullable_pr.sql` |
| 4 | Email trên PR | ✅ Create + hiển thị B4 | ⚠️ Column + serializer (`payment_requests_email.sql`) |
| 5 | Issue invoice từ B4 | ✅ Navigate B3→B4; issue tại B4 | ✅ Giữ endpoint hiện tại |
| 6 | Reject reason | ✅ Drawer B2 map field | ✅ PATCH trả `reject_reason` — verify column DB prod |
| 7 | Cash/card pending → confirm | ✅ FE tạo `pending` | ✅ BE **không** auto-`paid` on create (`2f93684`) |

---

## 1. Payment line bill upload (persistent storage)

**FE (done):** Tab B1 upload qua `endpoints.paymentRequests.uploadPaymentLineBill()` → `POST /api/v1/payment-lines/{lineId}/bill` (multipart). B2 drawer đọc `bill_image` / `billImage` từ API — **không** dùng `localStorage`.

**BE cần:**
- Endpoint trong `backend/payment_request_routes.py` (`upload_payment_line_bill`) — deploy Render + smoke test prod
- Chạy `docs/supabase_schema_patch_payment_lines_bill.sql` (`payment_lines.bill_image text`)
- Bucket Supabase **`bills`** + policy (xem `docs/supabase_storage_setup.md`)
- `GET` payment line trả `bill_image` (signed/public URL)

**Files:** `payment_request_routes.py`, storage policy, `_serialize_payment_line`

---

## 2. Tax invoice XLSX export (3 files) — B4 batch endpoint

**FE (done):** `InvoiceRequestTab` gọi `endpoints.activeRequests.exportTaxBatch()` → ZIP từ BE; fallback client `downloadTaxInvoiceZip()` nếu API lỗi. `downloadApiTaxZip()` lưu file từ blob BE.

**BE (done trên `ui/ux` @ `2f93684`):**
- `POST /api/v1/invoice-courses/export-batch` body: `{ items: [{ ar_id, course_code }] }` hoặc `{}` (export queue)
- BE cấp + **lưu** `tax_invoice_code` (M...), `tax_product_code` (PF...) trong course JSONB
- Response: ZIP 3 xlsx — reuse logic `invoice_routes.py`

**Ops:** Smoke prod — mở ZIP, kiểm tra mã M/PF không đổi sau refresh list B4.

**Không phải PDF** — prototype B4 nút "Tải PDF" là sai spec.

---

## 3. Standalone Active Request create (no PR)

**FE (done):** `ActivationTab` — **+ Tạo Active Request** (`ARCreateModal`). Có PR → `POST /payment-requests/{prId}/active-requests`. Không PR → `POST /api/v1/active-requests` (`PaymentFlowContext.handleCreateActiveRequestFromForm`).

**BE (done trên `ui/ux` @ `2f93684`):**
- `POST /api/v1/active-requests` body: `{ customer_name?, pr_id?, uids: [...] }`
- `pr_id` null khi không gắn PR

**DB (bắt buộc trước khi test standalone):**
- Chạy `docs/supabase_schema_patch_active_requests_nullable_pr.sql` trên **từng** project Supabase (dev/staging/prod)
- Thiếu patch → HTTP 503: *"Chưa cho phép AR không gắn PR..."*

**Files:** `activation_routes.py`, `supabase_schema_patch_active_requests.sql` (base) + `_nullable_pr.sql`

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

**BE:** `PATCH /api/v1/transactions/{lineId}` status `rejected` + optional `reject_reason` — code có trong `payment_request_routes.py`; verify column prod.

**Schema:** `payment_lines.reject_reason text` (nếu thiếu — thêm patch hoặc chạy patch payment_requests bundle)

**Files:** transactions patch handler, `PaymentLineApiRow`, `fromApiAttempt`

---

## 7. Cash/card payment lines — pending until accountant confirm

**FE (done):** Cash/card/installment tạo `status: "pending"`. Kế toán confirm B2 → `PATCH` `paid`. PR `received` chỉ tính line `paid`.

**BE (done @ `2f93684`):** Handler `create_payment_line` **không** set `paid` + `paid_at` cho `cash`/`card` on insert. PayOS QR vẫn `pending` đến webhook / sync / confirm tay.

**Files:** `payment_request_routes.py` (~dòng insert `payment_lines`)

---

## 8. Supabase patches — chạy trên prod (checklist Ops)

| File | Mục đích |
|------|----------|
| `supabase_schema_patch_payment_requests.sql` | Bảng PR cơ bản |
| `supabase_schema_patch_payment_lines_bill.sql` | `bill_image` |
| `supabase_schema_patch_payment_requests_email.sql` | `email` |
| `supabase_schema_patch_active_requests.sql` | AR + courses |
| `supabase_schema_patch_active_requests_pr_id_text.sql` | `pr_id` text |
| **`supabase_schema_patch_active_requests_nullable_pr.sql`** | **`pr_id` NULL + `customer_name`** — standalone AR |
| `supabase_schema_patch_payment_requests_cancel.sql` | Huỷ PR |
| `supabase_schema_patch_invoice_courses.sql` | Invoice queue fields |

Sau mỗi patch: `NOTIFY pgrst, 'reload schema';`

---

## 9. Ghi chú FE — encoding tiếng Việt

**Sự cố 26/05:** Chuỗi UI trong `PaymentRequestsTab.tsx`, `PaymentRequestDetailDrawer.tsx`, `QrViewModal.tsx` bị **mojibake** (UTF-8 lưu sai) → browser hiện `|`, `—`, `ß` thay chữ Việt. Data API vẫn đúng.

**Đã fix:** Khôi phục UTF-8; load Inter (`frontend/index.html`); bỏ `font-feature-settings: cv11, ss01` trong `prototype-payments.css`.

**Quy tắc cho dev:**
- Lưu file `.tsx` **UTF-8** (không BOM nếu có thể; Cursor/VS Code: bottom bar → UTF-8)
- Không copy chuỗi Việt qua chat/email rồi paste — dễ double-encode
- Trước merge UI: grep `ΓÇ|ß║|╞░|─É|┬` trong `frontend/src` → phải 0 match

---

## 10. Tạo Payment Request (B1) — không thuộc `2f93684`

Nút **「Tạo PR-ID & mở chi tiết」** → `POST /api/v1/payment-requests` — **không** đổi trong commit handoff Đức.

Nếu prod hết lỗi sau deploy `2f93684`: có thể do redeploy Render / env / DB đã patch — **không** suy luận từ diff cash-card hoặc AR standalone.

Debug B1: Network tab → status + body `POST /api/v1/payment-requests`.
