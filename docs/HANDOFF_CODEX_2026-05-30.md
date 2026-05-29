# HANDOFF — PalFish GMV Reconciliation (30/05/2026)

> **Repo:** `palfish-t-i-u/palfish-t-i-u-h-th-ng-ver-2`
> **Stack:** FastAPI + Supabase + React 19/Vite/TypeScript/Tailwind
> **Branch hiện tại:** `ui/ux` @ `73f1950`
> **Production:** `origin/main` @ `ce69d2f`
> **Codebase root:** `E:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2`

---

## TRẠNG THÁI CÁC BRANCH (chốt 30/05)

### `ui/ux` (branch chính của Minh — FE lead)
- **19 commits ahead** of `origin/main`, **6 commits behind**
- Chứa: Task 1 FE (RBAC UI), Task 3 import fix (`73f1950`), bill album, QR export, sandbox banner, plan docs
- **Cần merge `origin/main` vào trước khi tiếp tục** (6 commits: RBAC BE, sandbox bootstrap, lazy-load, env sync)
- **Cần push** (local ahead 4 commits vs `origin/ui/ux`)

### `origin/main` (production)
- `ce69d2f` — Giang: env sync. Trước đó: lazy-load `ee8011f`, sandbox `01c9dc4`, RBAC BE `e8bc2bf`, UAT cleanup `ab7aa27`/`80d881a`
- **Auto-deploy:** push main → Vercel (FE) + Render (BE)

### `origin/feature-dat` (Đạt — BE activation)
- **7 commits ahead of main**, chưa merge
- Key: `activation_routes.py` (CRM order matching), `PaymentRequestDetailDrawer`, `activated` status + `bill_images` array, UAT SQL scripts
- ⚠️ Có merge commits từ main cũ — cần rebase hoặc merge cẩn thận

### `origin/feature-duc` (Đức — BE fixes)
- **5 commits ahead of main**, chưa merge
- Key: `sale_email` schema patch, P0-3/P0-4 fixes (strict pending invoice export, concurrent batch confirm), WIP local changes
- Có `docs/HANDOFF_STATUS_2026-05-27.md` (handoff cũ)

### `origin/sandbox`
- **1 commit ahead of main**: `be2fabc` (render.yaml sandbox service)
- Chưa merge vì chờ Đức provisioning infra

### Stale branches (đã merge hết vào main, có thể xoá)
- `origin/feature-kem`, `origin/test-integration-final`, `origin/ui/ux-anh-minh`

---

## TRẠNG THÁI 9 TASK (cập nhật 30/05)

| # | Task | Trạng thái | Còn lại |
|---|---|---|---|
| 1 | Phân quyền | ✅ **DONE** | BE merged main (`e8bc2bf`). FE trên `ui/ux` (`6d123b9`) — cần merge ui/ux→main. Nhỏ: ẩn option Manager dropdown |
| 2 | PayOS HCM | ⏸️ **HOLD** | PayOS không hỗ trợ VCB → chuyển sang Casso (Task 8) |
| 3 | Xoá test + import | ✅ **Code DONE** | Cleanup SQL: on main. Import fix: `73f1950` trên ui/ux. **Pending: (a) merge→deploy, (b) nạp data thật via sync-gsheet, (c) bật cron** |
| 4 | Sandbox | 🔧 **~70%** | Code xong. **Pending: Đức provisioning** (tạo Supabase project, clone schema, Render secrets, seed `--apply`). Xem `docs/HANDOFF_DUC_sandbox_provisioning.md` |
| 5 | Redesign Kích hoạt | ⬜ **0%** | FE only. Mẫu "Pulse": progress bar, avatar, toggle, viền accent. File: `ActivationTab.tsx` + `PaymentRequestDetailDrawer.tsx` |
| 6 | Thống kê | ⬜ **0%** | Chờ wireframe từ anh Hiếu |
| 7 | Tốc độ load | ✅ **DONE** | `ee8011f` on main (~4s) |
| 8 | Casso | 🔧 **~25%** | MB Bank đã nối Casso. Cần: bảng `bank_transactions`, webhook `/webhook/casso`, backfill REST, endpoint list RBAC, FE tab. ⚠️ Ký HĐ 3 bên MB trong 7 ngày (deadline ~05/06). Xem `docs/HANDOFF_task8_casso.md` |
| 9 | Fix 2 lỗi FE | ⬜ **0%** | (A) tạo gói vượt `pr.received` tại `ActivationTab.tsx` ~dòng 596/620; (B) bỏ `disabled` order ID tại `ActivationTab.tsx:1208` |

---

## VIỆC CẦN LÀM (ưu tiên)

### P0 — Merge + deploy (chặn mọi thứ khác)
1. Merge `origin/main` vào `ui/ux` (resolve 6 commits behind)
2. Push `ui/ux` lên origin
3. Merge `ui/ux` → `main` (hoặc tạo PR)
4. Verify deploy thành công (Vercel + Render)

### P1 — Nạp data Sổ doanh thu (sau deploy)
1. Bấm "Sync Data" trên UI **SAU KHI** import fix đã deploy — hoặc chạy:
   ```bash
   cd backend
   python -c "
   from dotenv import load_dotenv; load_dotenv('.env')
   from supabase import create_client; import os
   sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))
   from gsheet_ledger_import import sync_gsheet_to_ledger
   r = sync_gsheet_to_ledger(sb, dry_run=False)
   print(r)
   "
   ```
2. Kỳ vọng: ~96 dòng mới inserted (88 delta 26-28/05 + 4 HCM + 4 edge case)
3. Bật cron: Render Cron Job gọi `POST /revenue/ledger/sync-gsheet` hàng ngày

### P2 — Task 9: Fix 2 lỗi FE (~2-3h)
**Lỗi A** — `ActivationTab.tsx`: tạo gói dùng `pr.target` thay vì `pr.received`, không chặn vượt. Fix:
- Chặn `total > pr.received` khi lưu
- Progress bar "đã dùng / đã nhận / còn lại"
- Default gói mới = `max(0, pr.received - total)`
- Sửa khoảng dòng 596/620

**Lỗi B** — `ActivationTab.tsx:1208`: bỏ `disabled={!course.orderId?.trim()}` để xuất HĐ không cần Order ID. BE `invoice_routes.py` không check Order ID (đã confirm).

### P3 — Task 8: Casso tab "Biến động số dư" (BE+FE, ~1-2 ngày)
5 phase chi tiết trong `docs/HANDOFF_task8_casso.md`:
1. Bảng `bank_transactions` + module `casso_webhook.py` + endpoint `POST /webhook/casso`
2. Backfill REST API `POST /bank-flow/sync-casso`
3. Endpoint list `GET /bank-flow/transactions` (RBAC system)
4. FE tab `BankFlowTab.tsx` + filters
5. (Sau) Đối soát tự động

**Cần chuẩn bị:** `CASSO_API_KEY`, `CASSO_SECURE_TOKEN` trong `.env`

### P4 — Task 5: Redesign Kích hoạt (FE only)
Mẫu "Pulse": progress bar, avatar tròn, toggle switch, viền accent. Không đổi logic/nút bấm.

---

## GHI CHÚ KỸ THUẬT

### Import Sổ doanh thu (Task 3)
- Fingerprint dedup: `sha256(uid | pay_time[:10] | so_tien_vnd | sale_crm_name | sdt)`
- `_fp_clean()` normalize pandas `NaN` → empty (tránh phantom duplicates giữa gsheet và dingtalk)
- `_load_existing_import_fingerprints()` dùng `import:%` (mọi nguồn)
- Google Sheet API: `UNFORMATTED_VALUE` + `SERIAL_NUMBER` → ngày = serial number, tiền = float thuần
- `_serial_to_date()`: epoch 1899-12-30 + serial days
- DB hiện tại: 14.644 dòng `import:dingtalk:%` (SM 13.847 + HCM 797)
- Sheet: SM 13.932 + HCM 801 = 14.733 unique → ~96 delta mới

### Casso (Task 8)
- Casso Webhook V2: POST payload `{data: [{id, tid, amount, cusum_balance, when, bank_sub_acc_id, ...}]}`
- Response phải có `{error: 0}` để Casso coi thành công
- MB Bank HN: `1680011668899` · VCB HCM: chưa kết nối Casso
- Gói Standard: hạn chế 100 giao dịch backfill

### RBAC
- 3 cấp: Sale → Leader → System (Manager ẩn)
- `visible_creator_emails()` + `require_min_role()` trong `backend/rbac.py`
- FE: cờ `showStaffCrm`/`showReconciliation`/`showBankFlow` dựa vào `profile.canManageStaff`

### Env quan trọng
- `APP_ENV=sandbox` (BE) / `VITE_APP_ENV=sandbox` (FE) → kích hoạt sandbox mode
- `GOOGLE_SERVICE_ACCOUNT_JSON` — path tới credentials file cho Google Sheets API
- `CASSO_API_KEY`, `CASSO_SECURE_TOKEN` — cần cho Task 8

---

## FILE THAM KHẢO

| File | Nội dung |
|---|---|
| `docs/HANDOFF_DUC_sandbox_provisioning.md` | Hướng dẫn provisioning sandbox (Đức) |
| `docs/HANDOFF_task8_casso.md` | Chi tiết 5 phase Casso |
| `docs/ke-hoach-28-5.md` | Master plan v5 (trạng thái 9 task) |
| `docs/task1234-BE.md` | BE handoff chi tiết |
| `docs/HANDOVER_CODEX.md` | Handoff tổng quan dự án (cũ, 26/05) |
| `backend/gsheet_ledger_import.py` | Import engine Google Sheet |
| `backend/xlsx_ledger_import.py` | Import engine Excel/DingTalk |
| `backend/rbac.py` | RBAC logic |
| `backend/main.py` | FastAPI app + tất cả endpoints |
| `frontend/src/pages/MainPage.tsx` | Nav + RBAC FE |
| `frontend/src/components/ActivationTab.tsx` | Task 5 + Task 9 target |
