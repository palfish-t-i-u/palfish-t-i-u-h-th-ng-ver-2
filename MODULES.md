# MODULES.md — Bản đồ module ↔ file

> **Cách dùng**: Trước khi sửa một module, đọc section tương ứng ở đây để biết toàn bộ file liên quan (FE + BE + tests) thay vì quét codebase. Khi thêm/xóa/di chuyển file của module nào, **cập nhật section đó**.
>
> Module có business rules phức tạp có thêm `CLAUDE.md` riêng trong thư mục (tự load khi Claude đọc file trong đó):
> - `frontend/src/components/payment-request/CLAUDE.md` — rules thanh toán B1–B4
> - `frontend/src/components/activation/CLAUDE.md` — UID sync B1↔B3, append flow báo đơn bổ sung
> - `frontend/src/components/admin/CLAUDE.md` — rules Zalo/DingTalk notifications
>
> Unit tests nằm cạnh file nguồn (`*.test.tsx` / `*.test.ts`) — không liệt kê lại từng file test trừ khi nằm chỗ khác.

## 1. Bảng thông tin (Dashboard gamification)

- FE: `frontend/src/components/DashboardTab.tsx` + `DashboardTab.utils.ts` — BXH, today-honors, event carousel, rank card
- BE: `backend/dashboard_routes.py` — gamification metrics, KPI theo sale/team, sub-team scope enforcement
- BE shared: `backend/crm_metrics.py` — cleansing + aggregate dữ liệu CRM
- API group: `endpoints.dashboard` trong `frontend/src/lib/api.ts`
- Types: `frontend/src/types/dashboard.ts`
- E2E: `frontend/e2e/dashboard-sales.spec.ts`, `frontend/e2e/mobile-sales.spec.ts`, `frontend/e2e/journeys/crm-dashboard.spec.ts`

## 2. Dashboard Sale (M6 — hiệu suất)

- FE: `frontend/src/components/Module6Tab.tsx` (+ `SaleDetailCards.tsx` mount bên trong)
- BE: `backend/dashboard_routes.py` (chung với module 1), `backend/crm_metrics.py`
- E2E: `frontend/e2e/dashboard-sales.spec.ts`

## 3. Quản lý thanh toán (B1–B4) 💰

> Rules chi tiết: `frontend/src/components/payment-request/CLAUDE.md`. State/context xuyên suốt B1–B4: `frontend/src/contexts/PaymentFlowContext.tsx`, utils chung: `frontend/src/components/payment-flow/paymentFlowUtils.ts`.

### B1 — Payment Requests (PR)
- FE tab: `frontend/src/components/PaymentRequestsTab.tsx`
- FE chi tiết: `frontend/src/components/payment-request/` — CreatePaymentRequestModal, PaymentRequestTable, PaymentRequestDetailDrawer, QrViewModal, Toolbar, KpiCards, StatusBadge, Progress, PrRowCards (mobile), PrStaleContentWarning, BillUploadZone, CountryCombo, VietnamAddressFields, DateRangeFilter, TvtsFilterDropdown, **TransferSaleModal** (chuyển sale), **OwnershipLogSection** (nhật ký lưu chuyển), paymentRequestUtils.ts, `phoneUtils.ts` (smart-paste, format, normalize SĐT)
- BE: `backend/payment_request_routes.py` — PR CRUD, payment lines, stale content, confirm/reject, bill storage; **tạo hộ + chuyển giao PR** (`owner_sale_email` trong create, `POST /{id}/transfer`, `GET /{id}/ownership-log`, `GET /payment-requests/owner-options`)
- Migration: `backend/migrations/2026-07-23-pr-ownership-log.sql` — bảng `pr_ownership_log` + backfill; `backend/migrations/2026-07-25-payment-line-stale-dismiss.sql` — cột `content_stale_dismissed_at` (persist "Huỷ/giữ QR cũ" cảnh báo stale)
- Stale content QR: `_is_payment_line_content_stale` + `POST /payment-lines/{id}/refresh-content` (Cập nhật QR) + `POST /payment-lines/{id}/dismiss-stale` (Huỷ) → BE `payment_request_routes.py`; FE `PrStaleContentWarning.tsx`
- BE test: `backend/tests/test_pr_ownership_transfer.py` — ma trận quyền tạo hộ/chuyển giao (trục sale ↔ leader); `test_refresh_content_endpoint.py` + `test_payment_line_stale_detection.py` — stale/refresh/dismiss
- Types: `frontend/src/types/paymentRequest.ts`; API groups: `endpoints.paymentRequests`, `endpoints.bankTxns`
- Data phụ trợ: `frontend/src/data/vnProvinces.ts`, `frontend/src/constants/` (bank, coursePackages, leadSource)

### B2 — Đối soát chuyển khoản
- FE: `frontend/src/components/ReconciliationTab.tsx` + `frontend/src/components/reconciliation/` (ReconTxnCards, ReconBankCards — mobile)
- FE helper: `frontend/src/lib/fetchAllBankTxns.ts` — nạp toàn bộ bank txns chưa ghép (loop paging, 2026-07-17)
- FE helper test: `frontend/src/lib/fetchAllBankTxns.test.ts`
- BE: `backend/sepay_routes.py` — SePay webhook `/api/v1/sepay/*`, sync bank transactions; GET `/api/v1/bank-transactions` hỗ trợ `offset` paging + alias `unmatched`/`matched`; candidates trả thêm `pr_country` (FE format SĐT quốc tế)
- BE: `backend/payos_qr.py` — VietQR EMV parse, PayOS link (chung B1)
- BE test: `backend/tests/test_bank_txns_list_paging.py` — test paging + status alias endpoint
- Webhook cũ: `@app.post("/webhook/payos")` trong `backend/main.py`; gateway đứng riêng: `api_pipe/app_payment.py`, `api_pipe/payos_webhook.py`
- E2E: `frontend/e2e/reconciliation-flow.spec.ts`, `frontend/e2e/mobile-accounting.spec.ts`

### B3 — Kích hoạt khóa học (Active Request)

> Rules chi tiết: `frontend/src/components/activation/CLAUDE.md` (UID sync, append flow).

- FE: `frontend/src/components/ActivationTab.tsx` + `frontend/src/components/activation/ActivationRowCards.tsx` (mobile)
- Helper: `frontend/src/components/ActivationTab.uidSync.ts` — `getUidSyncState` (cảnh báo UID lệch B1↔B3)
- Hook: `frontend/src/hooks/useNoticeCardCollapse.ts` — trạng thái thu gọn/mở card cảnh báo xuất HĐ (persist localStorage)
- BE: `backend/activation_routes.py` — AR CRUD, allocation guard, match đơn CRM, enqueue Zalo, **append bé/gói** (`POST /active-requests/{ar_id}/append`, `_append_children_core`, `_max_course_seq`)
- API groups: `endpoints.activeRequests`, `endpoints.activationUrgentRemind`

### B4 — Xuất hóa đơn
- FE: `frontend/src/components/InvoiceRequestTab.tsx` + `frontend/src/components/invoice/InvoiceRowCards.tsx` (mobile)
- BE: `backend/invoice_routes.py` — duyệt đơn CRM + xuất hóa đơn (stages CHO_XAC_NHAN → CHO_XUAT_HD → DA_XUAT_HD)
- BE: `backend/invoice_email_routes.py` + `backend/invoice_email_service.py` — delivery log email/Zalo
- Export: `frontend/src/utils/taxInvoiceXlsxExport.ts`; API groups: `endpoints.invoice`, `endpoints.invoiceRemind`, `endpoints.deliveryLog`
- E2E: `frontend/e2e/referral-flow.spec.ts`

### E2E toàn flow
- `frontend/e2e/journeys/payment-lifecycle.spec.ts` — B1→B2→B3→B4
- `frontend/e2e/payment-tvts-filter.spec.ts` — filter TVTS
- `frontend/e2e/pr-transfer-smoke.spec.ts` — smoke tạo hộ + chuyển giao PR (chạy `--config playwright.sandbox.config.ts` → sandbox thật)

## 4. Đối soát thẻ (mPOS / Payoo)

- FE: `frontend/src/components/CardReconciliationTab.tsx` + `frontend/src/components/card-recon/CardReconRowCards.tsx`
- FE sync: `frontend/src/components/GatewaySyncTab.tsx`
- BE: `backend/gateway_routes.py` — match card txns ↔ payment lines (`/api/v1`, tag `gateway-reconciliation`)
- BE: `backend/mpos_import.py` — parser mPOS/Payoo (detail, settlement, online, installment) + legacy routes `/api/v1/mpos`
- API group: `endpoints.cardRecon`

## 5. Sổ doanh thu (revenue ledger)

- FE: `frontend/src/components/SoDoanhThuTab.tsx`, `LedgerFormModal.tsx`, `LedgerRowCards.tsx` (mobile), `LedgerSummaryCards.tsx`
- FE lib: `frontend/src/lib/ledgerFormat.ts`, `ledgerCellStyle.ts`, `ledgerEvents.ts`, `ledgerSource.ts`, `loaiLabel.ts`
- BE: `backend/revenue_routes.py` — ledger CRUD, search, batch team lookup, pivot, sync từ AR/M3 (`sync_ledger_from_ar_course`, `sync_ledger_from_m3_order`), tỷ giá (`get_rate_for_date`)
- BE import: `backend/gsheet_ledger_import.py` (GSheet + fingerprint dedup), `backend/xlsx_ledger_import.py` (xlsx DingTalk SM INCOME / HCM REVENUE)
- Tỷ giá admin: `frontend/src/components/admin/ExchangeRatesPanel.tsx` + `endpoints.exchangeRates` + `frontend/src/types/exchangeRate.ts`
- Types: `frontend/src/types/revenue.ts`; API group: `endpoints.revenue`
- Script: `scripts/sync_so_doanh_thu_to_lark.py` — đẩy ledger sang Lark
- E2E: `frontend/e2e/journeys/revenue-reporting.spec.ts`
- Docs: `docs/MODULE_SO_DOANH_THU.md`, `docs/SPEC_DOANH_THU.md`

## 6. Đồng bộ CRM (M5)

- FE: `frontend/src/components/Module5Tab.tsx` — sync status + controls
- BE: `backend/crm_routes.py` — hybrid sync (incremental upsert `crm_sales_data`) + fetch live; `backend/crm_metrics.py` — column mapping PalFish → chuẩn
- API groups: `endpoints.crm`, `endpoints.crmData`
- E2E: `frontend/e2e/crm-sync.spec.ts`, `frontend/e2e/journeys/crm-dashboard.spec.ts`
- Docs: `docs/M5_DOI_CHIEU.md`, `docs/M5_GSHEET_IMPORT.md`, `docs/M5_OPERATIONS.md`

## 7. Báo cáo (BC01 / BC02 / BC03)

- FE hub: `frontend/src/components/ReportsHub.tsx`
- BC01: `frontend/src/components/reports/BC01SalesPerformance.tsx` — BE trong `backend/revenue_routes.py`
- BC02: `frontend/src/components/reports/BC02KeyDataReport.tsx` + `frontend/src/lib/bc02TypeMap.ts` — BE trong `backend/revenue_routes.py`
- BC03: `frontend/src/components/ReportBC03Tab.tsx` (+ `reports/BC03Placeholder.tsx`) — BE `backend/report_routes.py` (daily backfill + monthly, KPI/tỷ giá)
- API group: `endpoints.reports`
- Docs: `docs/BC01_DOI_CHIEU_THU_HIEN.md`

## 8. Thông báo — Zalo OA + DingTalk + in-app 🔔

> Rules chi tiết: `frontend/src/components/admin/CLAUDE.md` (token refresh, outbox retry, event types, signature DingTalk).

- FE admin tabs: `frontend/src/components/admin/` — ZaloConfigTab, ZaloGroupsTab, ZaloOutboxTab, DingTalkConfigTab, DingTalkGroupsTab, DingTalkOutboxTab + các `*Cards.tsx` (mobile)
- FE API: `frontend/src/lib/api/zaloAdmin.ts`, `frontend/src/lib/api/dingtalkAdmin.ts`
- BE client: `backend/zalo_notifier.py`, `backend/dingtalk_notifier.py`
- BE worker: `backend/zalo_outbox_worker.py`, `backend/dingtalk_outbox_worker.py`
- BE endpoints: `backend/admin_routes.py` — Zalo groups (~1329–1396), Zalo outbox (~1400–1427), Zalo config (~1431–1522), DingTalk groups (~1527–1601), DingTalk outbox (~1606–1636), DingTalk test (~1641–1669)
- In-app: `backend/notification_routes.py` (`/api/v1/notifications`) + `frontend/src/components/NotificationBell.tsx` + `frontend/src/hooks/useNotifications.ts` + `frontend/src/types/notification.ts`
- Cron: `backend/scripts/zalo_archive_cron.py` — dọn outbox > 30 ngày
- E2E: `frontend/e2e/journeys/admin-smoke.spec.ts`, `frontend/e2e/mobile-admin.spec.ts`
- Docs: `docs/UAT_ZALO_RUNBOOK.md`, `docs/HANDOFF_ZALO_OA_GMF_NOTIFICATION_2026-06-22.md`
- Migration (2026-07-12): `backend/migrations/2026-07-12-dingtalk-ar-created-and-drop-payment-paid.sql` — mở CHECK dingtalk_outbox + DROP trg_payment_paid_dingtalk (⚠️ chưa apply — cần chạy thủ công sandbox→prod)
- Tests DingTalk AR-created: `backend/tests/test_dingtalk_ar_created.py`

## 9. Phân quyền (RBAC) + Auth accounts

- FE permissions: `frontend/src/components/permissions/` — PermissionsTab (matrix), OverrideDrawer, StaffPickerModal, permissions.css
- FE auth accounts: `frontend/src/components/AuthAccountsTab.tsx` + `frontend/src/components/auth/` — AccountDetailDrawer, CreateAccountModal, DeleteAccountsModal, CrmLinkModal, AuthAccountCards, AuthLayout
- FE pages: `frontend/src/pages/LoginPage.tsx`, `SignUpPage.tsx`, `ForgotPasswordPage.tsx`, `PendingActivationPage.tsx`
- FE hooks: `frontend/src/hooks/useAuth.tsx`, `useMe.tsx`, `usePermission.ts`; types: `frontend/src/types/permissions.ts`, `profile.ts`; lib: `frontend/src/lib/roles.ts`
- BE: `backend/rbac.py` — `resolve_actor()`, `can_confirm_payment()`, ROLE_RANK {sale, ops, leader, manager, system}
- BE: `backend/admin_routes.py` — /me (~511), sales mgmt (~566), auth-users (~725), permissions matrix + overrides (~1073), audit logs (~1217)
- BE: `backend/vn_staff.py` — scope nhân sự VN; `backend/audit.py` — audit log
- API groups: `endpoints.me`, `endpoints.admin`, `endpoints.auditLogs`
- E2E: `frontend/e2e/rbac-visibility.spec.ts`, `frontend/e2e/auth.setup.ts`, `auth-role.setup.ts`, `frontend/e2e/mobile-auth.spec.ts`
- Docs: `docs/AUTH_SETUP.md`

## 10. Shared / Core

- FE layout: `frontend/src/layouts/AppShell.tsx` (sidebar + dynamic permissions), `MobileNavSheet.tsx`; entry: `frontend/src/App.tsx`, `frontend/src/pages/MainPage.tsx` (mount toàn bộ tab, lazy load)
- FE UI kit: `frontend/src/components/ui/` — Button, Card, Table, Modal, Badge, Combobox, Tooltip, Input, MoneyInput, RowCard, PageSection, DataBar, AuditTrail, ColumnVisibilityMenu
- FE hooks chung: `useIsMobile`, `useColumnVisibility`, `useRefetchOnFocus`, `useRealtimeTable`, `useTeamScope`, `useCountryCodes`
- FE lib chung: `frontend/src/lib/api.ts` (tất cả endpoint groups), `apiBaseUrl.ts`, `apiErrors.ts`, `supabase.ts`, `cn.ts`, `vndFormat.ts`, `vnPhone.ts`, `clipboard.ts`, `imageCompress.ts`, `numberToWords.ts`, `metrics.ts`, `subTeamLabels.ts`, `textUtils.ts` (`normVi` — chuẩn hoá tiếng Việt cho search accent-insensitive), `phoneSearch.ts` (`phoneMatchesQuery` — search SĐT mọi biến thể đầu số-đuôi số)
- BE core: `backend/main.py` — FastAPI entry, CORS, webhook PayOS/bank-simulate, orders endpoints, register 12 routers (dòng ~1317–1328), startup tasks (Zalo refresh ~1335, PayOS webhook register ~1346)
- BE shared: `backend/rpc_helpers.py` (RPC atomic, sequences), `backend/env_utils.py`, `backend/analytics_limits.py`
- Design: `docs/DESIGN.md`, `frontend/src/gmv-theme.css`, `gmv-tokens.css`
- E2E helpers: `frontend/e2e/helpers/` (navigation, assertions, api-client, cleanup, env)
- FE test util: `frontend/src/test/mobileMatchMedia.ts` — `stubMobile()`/`restoreMatchMedia()`, stub `window.matchMedia` cho jsdom (dùng khi test cần `useIsMobile()===true`; PHẢI restore trong `afterEach`)

## 11. Scripts vận hành

- `backend/scripts/sync_pending_sepay.py` — cron re-sync SePay pending
- `backend/scripts/seed_sandbox_data.py` — seed sandbox (dry-run mặc định, `--apply` để ghi)
- `backend/scripts/zalo_archive_cron.py` — dọn zalo_outbox
- `backend/scripts/clean_test_data.py`, `create_test_accounts.py`, `check_auth_activation.py`, `list_unlinked_crm.py` — tiện ích test/debug
- `backend/scripts/check_gsheet_dup.py`, `dedup_gsheet_ledger.py` — audit dedup ledger
- `scripts/sync_so_doanh_thu_to_lark.py` — sync ledger → Lark

## ⚠️ Legacy — KHÔNG còn mount trong MainPage (chỉ test file tham chiếu)

Đừng sửa các file này khi làm feature mới; kiểm tra trước khi xóa:

- `frontend/src/components/Module3Tab.tsx` — duyệt đơn CRM cũ (M3) → thay bằng ActivationTab (key `module3` trong MainPage giờ trỏ ActivationTab)
- `frontend/src/components/Module4Tab.tsx` — xuất hóa đơn cũ (M4) → thay bằng InvoiceRequestTab
- `frontend/src/components/PayosHistoryTab.tsx` — lịch sử PayOS (PayOS deprecated, chuyển SePay)
- `frontend/src/components/DoanhThuSaleTab.tsx` — pivot cũ → thay bằng BC01
- `frontend/src/components/StaffCRMTab.tsx` — CRM staff view cũ
- `frontend/src/components/payment-request/mockPaymentRequests.ts`, `mockActiveRequests.ts`, `frontend/src/components/card-recon/mockGatewayTxns.ts` — mock data
