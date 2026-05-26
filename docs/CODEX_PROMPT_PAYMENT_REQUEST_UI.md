# Prompt Codex — Redo UI Quản lý thanh toán (pixel-match prototype Hiếu)

> **Cách dùng:** Copy toàn bộ khối **PROMPT** bên dưới vào Codex.  
> **Branch:** `ui/ux` · **Không** commit vào `main` trừ khi đã review.  
> **Đính kèm:** screenshot prototype Hiếu (ảnh list PR đầy đủ) + mở `c:\Users\silly\Downloads\PalFish CRM.html` trong browser để so side-by-side.

---

## PROMPT (copy từ đây)

```
CONTEXT UPDATE — 3-person team. You are Minh's AI Assistant.

ROLE
- UI/UX + frontend presentation ONLY inside `frontend/src/`.
- NEVER edit `backend/`, `api_pipe/`, SQL, Render/Vercel env.
- Do NOT change `frontend/src/lib/apiBaseUrl.ts` or auth wiring without explicit approval from Duc.
- API client: extend `frontend/src/lib/api.ts` + types only if needed; match contracts in `docs/PAYMENT_REQUEST_FRONTEND_MAPPING.md`.

GOAL
Redo the Payment Request screen so it PIXEL-MATCHES anh Hiếu's prototype (`PalFish CRM.html` / screenshot "Quản lý thanh toán · PalFish GMV Reconciliation").
The current `PaymentRequestsTab.tsx` is WRONG: it crams 4 modules into internal tabs, uses English labels, missing columns/filters, and only 4 mock rows. Replace layout fidelity — keep existing design tokens (`gmv-*`, `components/ui/*`, `docs/DESIGN.md`).

SOURCE OF TRUTH (priority order)
1. Prototype HTML: `c:\Users\silly\Downloads\PalFish CRM.html` (open in browser)
2. `docs/PROTOTYPE_PAYMENT_FLOW.md` — B1–B4 logic
3. `docs/PAYMENT_REQUEST_FRONTEND_MAPPING.md` — API + status enums
4. Screenshot prototype (list view with 13 PRs, KPI cards, filter pills) — NOT the current Codex 4-tab shell

INFORMATION ARCHITECTURE — FIX THIS FIRST
- Prototype: ONE primary screen = **Payment Request list** (B1/B2). Other flows are SEPARATE sidebar entries, NOT tabs inside one mega-component.
- Do NOT use top-level internal tabs: ~~Payment Request | Đối soát | Active Request | Xuất hóa đơn~~ inside `PaymentRequestsTab`.
- For this task, implement ONLY the **Payment Request list screen** (prototype main view). Leave sidebar items as in `MainPage.tsx`:
  - Quản lý thanh toán → new list UI (this task)
  - Đối soát giao dịch → future / keep PayosHistoryTab or stub — out of scope
  - Kích hoạt khóa học → existing `Module3Tab.tsx` — do not duplicate
  - Xuất hóa đơn → existing `Module4Tab.tsx` — do not duplicate
- Detail panel: prototype uses **Drawer** on row click; current fixed 380px right panel is OK if behavior matches (select row → show detail). Prefer slide-over Drawer if easy with existing `Modal`/new thin wrapper.

SCOPE — PHASE 1 (this prompt)
Implement/refactor these files only (split if >400 lines):
- `frontend/src/components/PaymentRequestsTab.tsx` (main list + drawer/detail)
- `frontend/src/components/payment-request/` (optional subfolder: KpiCards, PrTable, CreatePrModal, PrDetailDrawer, PaymentHistoryList, AddPaymentModal)
- `frontend/src/types/paymentRequest.ts` (extend if needed)
- `frontend/src/pages/MainPage.tsx` — minimal: page title/subtitle, remove default landing on paymentRequests if prototype says Tab2-first (ask: keep paymentRequests as entry OR match prototype sidebar — default: paymentRequests stays entry)
- Reuse patterns from `Tab1Form.tsx` (UID combobox, VN address, country code), `Tab2Table.tsx` (TableWrap sticky), `PaymentModal.tsx` (QR display)

DO NOT touch: Module3Tab, Module4Tab, Tab2Table logic, backend routes.

---

SCREEN: PAYMENT REQUEST LIST (match prototype screenshot)

A) Page header (inside AppShell content area — title comes from MainPage TITLES)
- Subtitle: "Theo dõi Payment Request, tiến độ thu tiền và trạng thái gói học."
- Primary CTA top-right: **「+ Tạo Payment Request」** (purple, same as other primary buttons)

B) KPI row — 4 cards EXACT labels (Vietnamese, no English):
| Card | Content |
|------|---------|
| TỔNG PR ĐANG THEO DÕI | count + subline "X đủ · Y thiếu" (derive from mock/API) |
| ĐÃ THU | sum VND + subline "Z% / mục tiêu W VND" |
| CÒN THIẾU | **remaining amount VND** (not PR count) + subline "N PR cần theo dõi" |
| SẴN SÀNG KÍCH HOẠT | count PR with state `done` or `over` + subline "PR đủ tiền, chờ bước tiếp" |

C) Toolbar (below KPI)
- Search: placeholder "Tìm PR-ID, tên khách, UID, SĐT..."
- Status filter **pills** with counts (toggle, multi or single — match prototype):
  - Tất cả · Chưa TT · Thiếu · Đủ · Thừa
- Right side: **Khoảng thời gian** date-range control (UI only — filter mock client-side by `created_at`)
- Remove yellow "API chưa sẵn sàng" banner from default view; show subtle inline note only in dev if API fails

D) Sub-tabs (under toolbar) — NOT the 4-module tabs:
- **Đang theo dõi** (count badge)
- **Gói học đã tạo** (count badge) — PR that already have Active Request / course package created
- **Đã huỷ** (count badge)

E) Table columns — EXACT order & headers (ALL CAPS in header like prototype):
1. TẠO LÚC — `dd/MM/yyyy HH:mm`
2. PR-ID — monospace, primary color
3. TÊN KHÁCH HÀNG — name + address subline (muted)
4. UID / SĐT — merged cell: UID on line 1, phone line 2 (`84-xxxx` format)
5. SỐ LẦN TT — e.g. `2 / 3 lần`
6. TIẾN TRÌNH THANH TOÁN — progress bar + **percentage label** (red <50%, orange partial, green 100%)
7. TRẠNG THÁI — dot badge: Chưa TT | Thiếu | Đủ | Thừa | Đã huỷ
8. CHÊNH LỆCH — signed VND red/green or "Đã đủ"
9. TT GÓI HỌC — "Chưa tạo" (dash) or "Đã tạo" (green check)
10. HỦY — icon button (confirm modal before cancel)

- Horizontal scroll via `TableWrap` + `min-w-[1200px]` if needed
- Row click → open detail drawer (do not navigate away)

F) Detail drawer / panel (on row select)
- Header: PR-ID + status badge
- Customer block: name, address, UID, phone
- Mini summary: Cần thu | Đã thu | Chênh (3 boxes)
- Actions:
  - **+ Thêm thanh toán** → modal with **payment method picker** (QR / Tiền mặt / Quẹt thẻ / Trả góp) — match prototype Payment method picker
  - **Yêu cầu tạo đơn hàng** (only when 100% paid) — stub navigates or sets `courseCreated` flag on mock; full B3 is separate module
  - **Huỷ PR** — confirm modal
- **Lịch sử thanh toán** timeline:
  - Each attempt: Lần #n, amount, method, status (Chờ chuyển | Chờ xác nhận | Đã xác nhận), code, timestamp

G) Modal 「+ Tạo Payment Request」(B1)
Fields (Vietnamese labels):
- UID CRM (combobox — reuse CRM search pattern from Tab1Form if available)
- Tên khách hàng
- Country code + SĐT (reuse `useCountryCodes`, VN phone normalize)
- Địa chỉ tách cấp: Tỉnh / Quận / Phường / Chi tiết (reuse `useVietnamAddress`)
- Tổng số tiền cần thu (VND input format)
- Ghi chú
- Submit → add to local mock list with new PR-ID `PR-2026-XXXX`, state `pending`, appear in table

---

DATA & API
- Call `endpoints.paymentRequests.list()` first.
- On failure: use **realistic mock** — minimum **10–13 rows** matching prototype density (mixed Thiếu/Đủ/Thừa/Chưa TT, varied progress).
- Mock shape: snake_case in API response mapping; camelCase in TS types (existing `paymentRequest.ts`).
- Status codes: `pending`→Chưa TT, `short`→Thiếu, `done`→Đủ, `over`→Thừa, `cancelled`→Đã huỷ
- Compute: `received`, `delta`, `progressPct`, `courseCreated` (boolean for TT GÓI HỌC column)

LANGUAGE
- All user-visible strings: **Tiếng Việt**.
- Ban English in UI: no "Payment Request", "Active Request", "B3" in labels — use "Yêu cầu thanh toán", "Gói học", "Sẵn sàng kích hoạt" per prototype.

DESIGN
- Tokens: `bg-gmv-primary`, `text-gmv-muted`, `Badge`, `Button variant="primary"`, Card with soft header
- Typography: table headers uppercase muted; amounts right-aligned with `toLocaleString('vi-VN')`
- Spacing: match existing Tab2 density — not overly padded

ACCEPTANCE CHECKLIST (must pass before done)
- [ ] Side-by-side with `PalFish CRM.html`: KPI labels, filter pills, 3 sub-tabs, 10 table columns present
- [ ] 「+ Tạo Payment Request」 opens B1 modal with address split + country code
- [ ] No internal 4-module tab bar inside PaymentRequestsTab
- [ ] Mock data ≥10 rows; progress bars show %
- [ ] `cd frontend && npm run build` passes with zero TS errors
- [ ] No files changed outside `frontend/src/` except optional doc note

OUT OF SCOPE (do not implement now)
- Backend endpoints / Supabase
- Đối soát giao dịch full screen (separate sidebar item)
- Module3/4 rewrite
- Sổ doanh thu auto-row on payment

DELIVERABLE
- Refactored components + short comment at top of PaymentRequestsTab: `// UI spec: PalFish CRM.html — Payment Request list (Hiếu prototype)`
- List files changed and attach before/after description for Minh review.

Acknowledge role, confirm you read prototype HTML structure, then implement Phase 1 only.
```

---

## ACCEPTANCE CHECKLIST — Phase 1 (pixel-match prototype `PalFish CRM.html`)

**CSS strategy**: port `styles.css` của prototype vào `frontend/src/styles/prototype-payments.css`, scope tất cả selectors dưới `.gmv-prototype` (page) và `.gmv-prototype-modal-scrim` (modal portal). Token (`--primary: #6f5cf3`, `--money: #ec7211`, ...) chỉ live trong 2 scope đó — không vỡ Module3/4 hay AppShell.

**Files mới**:
- `styles/prototype-payments.css` — port từ prototype
- `payment-request/Icons.tsx` — ~25 SVG icons (Wallet, Sparkle, XCircle, Plus, Check, ...)
- `payment-request/CountryCombo.tsx` — searchable combobox 49 quốc gia (flag + dial)
- `payment-request/DateRangeFilter.tsx` — popup với 5 preset + custom date inputs
- `payment-request/CancelPrModal.tsx` — modal "gõ DELETE để xác nhận"

**Files rewrite**:
- `PaymentRequestsTab.tsx` — port `app.jsx` payments section, wrap `.gmv-prototype > .page`
- `PaymentRequestKpiCards.tsx` — `.kpi-row > .kpi` với `.kpi-icon` góc phải 30px
- `PaymentRequestToolbar.tsx` — `.toolbar` với search + chips (dot khi inactive) + DateRangeFilter
- `PaymentRequestTable.tsx` — `.table-card.has-tabs` (tabs trong header + bảng + pagination)
- `PaymentRequestDetailDrawer.tsx` — slide-over 880px với 4 panel (Summary/B1 info edit/Payments + AddPaymentForm inline/Timeline B1→B4)
- `CreatePaymentRequestModal.tsx` — `.modal-scrim > .modal` với CountryCombo + 2 input plain Tỉnh/Phường
- `mockPaymentRequests.ts` — 13 rows port từ `mock-data.jsx`
- `paymentRequestUtils.ts` — restore strings + thêm `progressFillClass`, `fmtPhone`, `relativeFrom`, `ddmmyyyy`, `nextPaymentCode`, `nowStamp`
- `PaymentRequestStatusBadge.tsx` + `PaymentRequestProgress.tsx` — class-based (`.badge.is-*`, `.prog-fill.is-*`)

**Files deleted**:
- `PaymentRequestSubTabs.tsx` — gộp tabs vào Table header
- `AddPaymentAttemptModal.tsx` — form inline trong Drawer

**Type changes**: `PaymentAttempt` bổ sung `cancelled?: boolean` và `cancelledAt?: string | null` (cho QR row "Đã huỷ").

### Checklist

- [x] CSS prototype port vào `frontend/src/styles/prototype-payments.css`, scope `.gmv-prototype` + `.gmv-prototype-modal-scrim`
- [x] Sub-tabs nằm trong header bảng (`.table-card.has-tabs > .table-head.with-tabs > .tabs`)
- [x] Drawer slide-over 880px với scrim mờ, transition transformX 260ms
- [x] Drawer body 4 panel: Summary row, B1 info (read + edit), Các lần thanh toán + AddPaymentForm inline, Timeline B1→B4
- [x] KPI: icon 30px góc phải, sub-text giữ đúng prototype ("đã đủ tiền · đang thiếu", "PR cần đôn khách", "chờ chuyển B3")
- [x] Status badge hiện "Chưa thanh toán" (không bị rút gọn)
- [x] Filter chip: dot chỉ hiện khi `status !== c.id`, active có bg `--primary-50` và count pill nền trắng
- [x] DateRangeFilter: popup với 5 preset (Hôm nay/7d/30d/Tháng này/Toàn bộ) + custom date inputs, hiển thị "dd/MM → dd/MM"
- [x] CancelPrModal: gõ "DELETE" mới enable nút Huỷ; có field lý do tuỳ chọn
- [x] CreatePrModal: CountryCombo (flag + dial searchable), 2 input plain Tỉnh/Phường + 1 input số nhà, banner info
- [x] UID/SĐT cell: flag emoji + dial + phone format `dddd ddd ddd`
- [x] PR-ID cell: mono + icon Copy hiện on hover
- [x] Progress bar dùng class `.is-low/is-mid/is-done/is-over` (gradient CSS prototype)
- [x] Mock data ≥12 rows port từ `mock-data.jsx`, đủ trạng thái done/short/over/pending/cancelled
- [x] Pagination footer 1/2/3 + chevron prev/next
- [x] `cd frontend && npm run build` pass zero TS errors
- [ ] Deploy Vercel preview match prototype (so screenshot — chờ Minh verify)

---

## Ghi chú cho Minh (không paste vào Codex)

| Mục | Gợi ý |
|-----|--------|
| Screenshot | Đính kèm ảnh prototype list 13 PR (ảnh Hiếu) + ảnh Codex hiện tại để contrast |
| Phase 2 | Prompt riêng: Đối soát giao dịch screen, Payment method QR modal chi tiết |
| Review | So browser: `npm run dev` → tab Quản lý thanh toán vs HTML prototype |
| Đức | Chỉ ping khi cần thêm field API mới ngoài mapping doc |
