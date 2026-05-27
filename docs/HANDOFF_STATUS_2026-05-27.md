# Handoff — Tình hình dự án (27/05/2026)

> **Mục đích:** Báo cáo cho Gemini / dev tiếp theo nắm context sau phiên làm việc **26/05/2026**.  
> **Repo:** `palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2` · **Branch prod:** `main` @ `2f93684`

---

## 1. Stack & môi trường

| Thành phần | URL / ghi chú |
|------------|----------------|
| Frontend (Vercel) | Auto-deploy từ `main` |
| Backend (Render) | Auto-deploy từ `main` |
| Database | Supabase (prod patches **đã chạy** — xác nhận 27/05) |
| Local dev | Backend `:8000` (`backend/run.ps1`), FE `:5173` (`npm run dev`) |

---

## 2. Commits quan trọng (26/05, đã push `origin/main`)

| Commit | Nội dung |
|--------|----------|
| `dffdf2c` | Bill upload thật, B4 invoice UX, cross-tab navigation |
| `5d515aa` | Minh FE: đóng feedback loop B1–B4 |
| `c5bfdec` | Fix TS build ActivationTab (Vercel) |
| `2db4745` | Minh: encoding UTF-8, font Inter, dịch Việt |
| `2f93684` | **BE handoff:** cash/card pending, standalone AR, B4 tax export batch |

---

## 3. Luồng nghiệp vụ B1→B4 (đã confirm với Hiếu)

```
B1 Payment Request → B2 Thanh toán → B3 Activation (AR) → B4 Invoice
```

**B3 vẫn manual:** PR đủ tiền → Sale bấm **「Tạo Active Request (B3)」** trong drawer PR → điền UID/SĐT/gói/tiền → Hiền tạo order trên CRM gốc.  
**Không phải bug:** PR paid chưa hiện Activation tab cho đến khi bấm tạo AR.

---

## 4. Trạng thái handoff B1–B4 (cập nhật 27/05)

| # | Mục | FE | BE | DB prod |
|---|-----|----|----|---------|
| 1 | Bill upload payment line | ✅ `BillUploadZone`, drag & drop | ✅ `POST /api/v1/payment-lines/{lineId}/bill` | ✅ `bill_image` + bucket `bills` |
| 2 | Tax XLSX ZIP batch (B4) | ✅ Gọi BE trước, fallback client | ✅ `POST /api/v1/invoice-courses/export-batch` | ✅ M/PF lưu JSONB course |
| 3 | Standalone Active Request | ✅ Gọi API khi không PR | ✅ `POST /api/v1/active-requests` | ✅ `pr_id` nullable + `customer_name` |
| 4 | Email trên PR | ✅ Create + hiển thị B4 | ✅ Serializer create/list | ✅ column `email` |
| 5 | Issue invoice từ B4 | ✅ Navigate B3→B4; issue tại B4 | ✅ `POST .../issue-invoice` | ✅ |
| 6 | Reject reason B2 | ✅ Drawer map `rejectReason` | ✅ PATCH + serializer | ⚠️ Verify prod có column |
| 7 | Cash/card pending → confirm | ✅ FE tạo pending | ✅ BE không auto-paid | ✅ |

**Lưu ý endpoint bill:** Handoff cũ ghi sai path `.../payments/{lineId}/bill` — **đúng:** `/api/v1/payment-lines/{lineId}/bill`.

---

## 5. Chi tiết kỹ thuật đã làm

### 5.1 Bill upload (B1/B2)

- **Root cause cũ:** Cột `payment_lines.bill_image` thiếu → lỗi `42703` / `PGRST204`.
- **Backend:** Upload Supabase Storage bucket `bills`, path `payment-lines/{line_id}/bill.{ext}`; fallback đọc URL từ Storage nếu DB chưa có cột; `_serialize_payment_line` trả `bill_image` + `bill`.
- **Frontend:** `BillUploadZone.tsx` — không auto `bill: true`; chỉ true khi có ảnh. Fix axios multipart (bỏ manual `Content-Type`).
- **Files:** `backend/payment_request_routes.py`, `frontend/src/components/payment-request/BillUploadZone.tsx`, `PaymentRequestDetailDrawer.tsx`, `QrViewModal.tsx`.

### 5.2 B4 Invoice UX

- B3 **Xuất HĐ** → navigate tab B4 **Chờ xuất** (không issue inline).
- Issue invoice **không bắt buộc Order ID** (`activation_routes.py`).
- Nút **tải hóa đơn** (HTML download) + nav state `invoiceTab` / `openInvoiceKey`.
- **Files:** `ActivationTab.tsx`, `InvoiceRequestTab.tsx`, `paymentFlowUtils.ts`.

### 5.3 PayOS / B2

- Webhook reconcile payment_lines; FE poll reload.
- QR flow giữ nguyên; cash/card/installment **pending** until B2 confirm.

### 5.4 Standalone AR (B3)

- **`POST /api/v1/active-requests`** body: `{ customer_name?, pr_id?, uids: [...] }`.
- **`POST /api/v1/payment-requests/{prId}/active-requests`** — PR phải paid (refactor dùng `_save_active_request`).
- CC code token: `pr_id` hoặc `ar_id` digits.
- **FE:** `PaymentFlowContext.handleCreateActiveRequestFromForm` gọi `endpoints.activeRequests.create` khi không có PR.
- **SQL:** `docs/supabase_schema_patch_active_requests_nullable_pr.sql`.

### 5.5 B4 Tax export batch

- **`POST /api/v1/invoice-courses/export-batch`** — body `{ items: [{ ar_id, course_code }] }` hoặc `{}` (auto queue invoiced chưa có mã thuế).
- Cấp + persist `tax_invoice_code` (M...), `tax_product_code` (PF...) vào course JSONB; reuse `_alloc_sequences` + `_build_excel_*` từ `invoice_routes.py`.
- **FE:** `InvoiceRequestTab` ưu tiên `exportTaxBatch`, fallback `downloadTaxInvoiceZip`.
- **Files:** `backend/activation_routes.py`, `frontend/src/lib/api.ts`, `InvoiceRequestTab.tsx`.

### 5.6 Navigation fix

-「Mở Payment Request」từ Reconciliation tab — fix stale `onViewChange` bằng `useRef` trong `PaymentFlowContext` + `MainPage.tsx`.

### 5.7 Minh merge (`ui/ux`)

- Encoding UTF-8, Inter font, feedback B1–B4 FE, AR create modal, tax XLSX client export, reject reason UI, email field PR.

---

## 6. Supabase patches — checklist prod

**Đã chạy (xác nhận 27/05):**

- [x] `supabase_schema_patch_payment_lines_bill.sql`
- [x] `supabase_schema_patch_payment_requests_email.sql`
- [x] `supabase_schema_patch_active_requests_nullable_pr.sql`

**Nên verify đã có từ trước:**

- [ ] `supabase_schema_patch_payment_requests.sql`
- [ ] `supabase_schema_patch_active_requests.sql`
- [ ] `supabase_schema_patch_active_requests_pr_id_text.sql`
- [ ] `supabase_schema_patch_payment_requests_cancel.sql`
- [ ] `supabase_schema_patch_invoice_courses.sql`
- [ ] Bucket **`bills`** + policy (`docs/supabase_storage_setup.md`)
- [ ] Bảng **`tax_sequences`** (cho export batch M/PF)

Sau mỗi patch: `NOTIFY pgrst, 'reload schema';`

---

## 7. API endpoints chính (Payment Flow)

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/v1/payment-requests` | Tạo PR (có `email`) |
| POST | `/api/v1/payment-requests/{id}/payment-lines` | Thêm line (cash/card → `pending`) |
| POST | `/api/v1/payment-lines/{lineId}/bill` | Upload bill image |
| PATCH | `/api/v1/transactions/{id}/status` | Confirm/reject (`reject_reason`) |
| POST | `/api/v1/payment-requests/{prId}/active-requests` | Tạo AR gắn PR (paid) |
| POST | `/api/v1/active-requests` | Tạo AR standalone |
| GET | `/api/v1/active-requests` | List AR |
| PATCH | `/api/v1/active-requests/{arId}/courses/{code}` | Gắn Order ID |
| POST | `/api/v1/active-requests/{arId}/courses/{code}/issue-invoice` | Xuất INV |
| POST | `/api/v1/invoice-courses/bulk-issue` | Bulk issue |
| POST | `/api/v1/invoice-courses/export-batch` | ZIP 3 Excel + persist M/PF |
| POST | `/api/v1/payos-webhook` | PayOS webhook |

---

## 8. File map quan trọng

```
backend/
  payment_request_routes.py   # B1/B2 PR, lines, bill, transactions
  activation_routes.py        # B3 AR, B4 issue + export-batch
  invoice_routes.py           # M3/M4 legacy + _build_excel_* helpers
  main.py                     # Route registration

frontend/src/
  contexts/PaymentFlowContext.tsx
  components/PaymentRequestsTab.tsx
  components/ReconciliationTab.tsx
  components/ActivationTab.tsx
  components/InvoiceRequestTab.tsx
  components/payment-request/BillUploadZone.tsx
  components/payment-flow/paymentFlowUtils.ts
  lib/api.ts
  utils/taxInvoiceXlsxExport.ts   # Client fallback export

docs/
  FE_HANDOFF_BE_PROMPTS.md        # Spec gốc từ Minh (cần sync status)
  HANDOFF_STATUS_2026-05-27.md    # File này
```

---

## 9. UAT checklist (cho Hiếu / QA hôm nay)

1. **B1:** Tạo PR + email; upload bill kéo thả → reload còn ảnh.
2. **B2:** Cash/card → pending; confirm → paid + PR received đúng; reject có lý do.
3. **B2 QR:** PayOS webhook / sync → paid.
4. **B3:** Tạo AR từ PR paid; tạo AR không PR → refresh vẫn còn.
5. **B3:** Gắn Order ID → status AR cập nhật.
6. **B4:** Issue INV từ Chờ xuất; tải ZIP Excel → mã M/PF giữ sau reload.
7. **Cross-tab:** Reconciliation → Mở PR drawer hoạt động.

---

## 10. Việc còn lại / gợi ý task hôm nay

### P0 — UAT & bugfix prod
- Chạy checklist §9 trên web prod; ghi lỗi kèm endpoint + status code.
- Verify bucket `bills` public/signed URL hiển thị ảnh B2.

### P1 — Doc & cleanup
- Sync `docs/FE_HANDOFF_BE_PROMPTS.md` (bảng status §3 ở trên).
- Xóa hoặc gitignore script test local: `backend/test_bill_http.py`, `test_bill_upload.py`.
- Review `docs/supabase_schema_patch_activate_codes.sql` (untracked) — merge hoặc bỏ.

### P2 — Cải thiện (nếu UAT pass)
- **ActivationTab** single-row tax download: chuyển sang `exportTaxBatch` (hiện vẫn client `downloadTaxInvoiceZip` ở một số nút).
- **Installment** line: confirm BE cũng `pending` (giống cash/card).
- **Reject reason:** smoke test column `payment_lines.reject_reason` trên prod.
- **E2E script:** `scripts/e2e_m1_m4_flow.py` — mở rộng cover B1–B4 payment flow mới.

### P3 — Chưa làm / backlog
- CRM integration đầy đủ (activate từ AR).
- Module 5 reconciliation nâng cao.
- `jszip` types — local build FE có thể fail `Cannot find module 'jszip'` nếu thiếu dependency (Vercel có thể OK nếu đã cài).

---

## 11. Git state (27/05)

- **Branch:** `main` = `origin/main` @ `2f93684`
- **Untracked (chưa commit):**
  - `CRM Palfish (1).local-backup/` — backup local, không push
  - `backend/test_bill_http.py`, `backend/test_bill_upload.py` — diagnostic
  - `docs/supabase_schema_patch_activate_codes.sql`

---

## 12. Quy tắc dev (encoding)

- File `.tsx` **UTF-8**; không copy-paste tiếng Việt qua chat/email.
- Trước merge UI: grep `ΓÇ|ß║|╞░|─É|┬` trong `frontend/src` → 0 match.

---

*Cập nhật bởi phiên Cursor 26–27/05/2026. Tham chiếu transcript: agent `dd3559cb-0b3f-42f3-862c-2cc9d046b587`.*
