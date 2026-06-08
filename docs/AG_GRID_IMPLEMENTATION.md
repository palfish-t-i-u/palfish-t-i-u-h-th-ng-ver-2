# AG Grid Integration — Doanh thu Module

**Implemented:** 2026-06-08
**Status:** FE hoàn tất, chờ BE import/export endpoints

## What was done

### 1. AG Grid Community v35 — Main grid (Doanh thu)
- Replaced `<table>` with `<AgGridReact>` in GridSubTab
- 14 columns: Ngày, UID, Khách, Sale, Team, Kênh, Gói, VNĐ, GMV, Lần TT, TT, NH, CRM, Note
- Editable columns (when canWrite): Sale (dropdown), VNĐ, Lần TT, Note
- `onCellValueChanged` → `PATCH /payments/{id}` with optimistic update + rollback
- Sale dropdown bound to master data via `agSelectCellEditor`
- Theme: `themeQuartz.withParams()` matching app design tokens
- Row click → Detail dialog

### 2. Dialog "Thêm doanh thu"
- 10-field form: UID (autocomplete), pay_time, package, sale, channel, real_pay_vnd, gmv_rmb (conditional), payment_seq, note
- Customer autocomplete via `GET /customers/search`
- GMV Final auto-preview (uses cutoff logic: before 01/06/2026 = gmv_rmb, after = vnd/3700)
- Submit → `POST /payments` → refetch + toast

### 3. Dialog "Chi tiết doanh thu"
- Read-only display of all payment fields
- Action buttons by status:
  - Active → "Hoàn tiền" (`POST /payments/{id}/refund`)
  - Refunded → "Khôi phục" (`POST /payments/{id}/restore`)
  - Always → "Gán CRM" (`POST /payments/{id}/link-crm`)
  - Always → "Xóa" (`DELETE /payments/{id}`) with confirm

### 4. AG Grid for Danh mục (4 master tables)
- Sale: full_name, short_code, team, khoi, active — all editable
- Kênh: channel_code, name, type — all editable
- Gói học: name, fixed — all editable
- Khách hàng: uid (read), full_name, phone — name/phone editable
- `onCellValueChanged` → `PATCH /master/{table}/{id}`
- "Thêm" dialog for each tab → `POST /master/{table}`

### 5. Import dialog (FE ready, BE pending)
- File upload UI (.xlsx/.csv)
- Calls `POST /payments/import` (multipart)
- Displays result: inserted/skipped/errors
- Note: BE endpoint not yet built (Đức's task)

### 6. Export button (FE ready, BE pending)
- Button calls `GET /payments/export` with current filters
- Downloads blob as .xlsx
- Note: BE endpoint not yet built (Đức's task)
- Falls back to toast warning if endpoint unavailable

### 7. Toast notification system
- `useToast()` hook with auto-dismiss (3.5s)
- Tones: ok (green), danger (red), warn (yellow)
- Fixed bottom-right positioning

### 8. E2E tests updated
- AG Grid assertions (`.ag-root-wrapper` instead of `<table>`)
- New tests: filter team, add dialog opens, import dialog opens
- fixme tests preserved for: inline edit, refund/restore, master edit (need real data)

## Dependencies added
- `ag-grid-community@35.3.1`
- `ag-grid-react@35.3.1`

## Remaining work (not FE)

| Task | Owner | Detail |
|------|-------|--------|
| `POST /payments/import` | Đức | Parse xlsx, validate, dedup, bulk insert |
| `GET /payments/export` | Đức | Same filters as list, return xlsx |
| E2E CRUD tests | Đạt | Remove fixme, write real tests |

## Architecture notes

- AG Grid Community (MIT, free) — no license needed
- Module registration: `ModuleRegistry.registerModules([AllCommunityModule])` once at top
- Theme: `themeQuartz.withParams({...})` passed as `theme` prop (no CSS imports needed for v35)
- `domLayout="autoHeight"` — grid height follows content
- `getRowId` uses `payment_id` (main grid) or `id`/`uid` (master tables)
- `stopEditingWhenCellsLoseFocus` + `singleClickEdit={false}` — double-click to edit
