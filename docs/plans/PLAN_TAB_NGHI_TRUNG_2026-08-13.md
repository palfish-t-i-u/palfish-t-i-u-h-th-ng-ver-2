# Kế hoạch — Tab "Nghi trùng" cho Sổ doanh thu (2026-08-13)

**Dự án:** `gmv` · **Trạng thái:** PLAN đã chốt terms + 3 QĐ cuối (2026-08-13) — SẴN SÀNG GIAO Đức/Đạt, chưa code.

> ⚠️ **Bước 0 bắt buộc:** `git pull` — local main đang **behind origin/main 3 commit** (`adc6f88` invoice B4, `7f6d1d5`+`d8118e4` fix Nguồn). Không pull thì đọc code sai trạng thái (grep sẽ không thấy `resolve_loai_from_lead_source` + guard `loai_nhap`).

---

## 1. Bối cảnh (1 phút)

- Fix "ghi Nguồn cho đơn tự động" **đã LIVE** (origin/main): `sync_ledger_from_ar_course` giờ ghi `loai` từ `resolve_loai_from_lead_source`, và `order_match`/`loose_match` có guard **không lật tag** dòng `tay`/`hoan`.
- **NHƯNG** `loose_match` vẫn khớp **ngày CHÍNH XÁC** (`uid + ngay_tien_ve + so_tien_vnd`). Chị Hiền nhập tay lệch **1–3 ngày** so với ngày hệ thống → `loose_match` miss → app **tạo dòng mới** → **trùng**.
- Đã kiểm chứng trên prod: 8 cặp còn tồn (7 lệch 1–3 ngày cùng loai + 1 loai lệch Lives/广告). Cross-check AR/PR: **cả 8 là cùng 1 đơn**.
- ⇒ Trùng **sẽ tiếp diễn** với đơn mới. Cần **màn hình review thường trực**, không phải script dọn 1 lần.

## 2. Nguyên tắc thiết kế (đã chốt với Minh)

| # | Nguyên tắc | Vì sao |
|---|---|---|
| P1 | **Nới loose_match = CHỈ để DÒ, không tự gộp.** Cửa insert giữ nguyên (khớp ngày chính xác). Logic ±3 ngày chỉ chạy **read-side** để gắn cờ. | Tự gộp ±3 ngày sẽ **âm thầm khoá sai ngày ghi nhận doanh thu** + có thể **gộp nhầm 2 đơn khác nhau**. Người duyệt tay mới quyết. |
| P2 | **Giữ dòng app, xoá dòng sheet.** Dòng app có `crm_order_id` + link AR + ngày hệ thống + (đã) có `loai`. Dòng sheet chỉ là nhập tay, không link. | Dòng app là bản chính thức, truy vết được. |
| P3 | **Phân biệt dòng sheet bằng `created_by_email LIKE 'import:gsheet:%'`, KHÔNG chỉ `loai_nhap='tay'`.** | ⚠️ BẪY: `loai_nhap='tay'` gộp cả **nhập tay thật + gsheet + dingtalk**. Xoá theo mỗi `loai_nhap` có thể **xoá nhầm đơn nhập tay thật**. Dòng app là `tu_dong` → guard delete hiện tại đã chặn xoá nhầm bản chính. |
| P4 | **Gộp = giảm tổng GMV** đúng phần đếm 2 lần. Modal xác nhận phải nói rõ số giảm; **báo chị Hiền trước.** | Giống G0 dedup đã làm — tổng giảm là đúng, không phải mất số. |
| P5 | **Dò chạy live (on-read), không trigger/cron.** Bảng 16k dòng, self-join theo `uid+so_tien_vnd` → không đáng kể. | Không tăng gánh nặng hạ tầng. |

## 3. Terminology & nút — viết cho kế toán hiểu (✅ ĐÃ CHỐT 13/8)

> Kế toán không hiểu "Đã gộp". Chọn từ **mô tả đúng việc xảy ra**, tránh thuật ngữ.

| Chỗ | Từ đề xuất (khuyến nghị) | Vì sao | Phương án khác |
|---|---|---|---|
| **Tên tab** | **Nghi trùng** + số đếm | Ngắn, đúng nội dung: các đơn *nghi* bị ghi *trùng*. | "Cần kiểm tra" / "Cảnh báo" (mơ hồ hơn) |
| **Cột thêm** | **Cảnh báo** | Đúng như anh mô tả; mỗi dòng 1 câu giải thích. | "Lý do nghi trùng" |
| **Nội dung ô Cảnh báo** | *"Có thể trùng với đơn tự động ngày 20/07 (mã 757219…) — cùng khách, cùng số tiền, lệch 1 ngày."* Nếu loai khác: *"· Nguồn ghi khác nhau: Lives ≠ 广告."* | Câu đầy đủ, không viết tắt kỹ thuật. | — |
| **Nút / dòng (inline)** | **Xoá dòng trùng** | Nói đúng việc: dòng sheet này bị xoá vì đã có đơn app. "Gộp" gây hiểu lầm là *cộng gộp*. | "Gộp (giữ đơn app)" |
| **Nút bỏ qua (inline)** | **Không trùng — bỏ cảnh báo** | Cho phép loại false-positive; dòng rời tab. | "Bỏ qua" |
| **Nút hàng loạt** | **Xoá X dòng trùng đã chọn** | Rõ số lượng + việc. | "Gộp X đơn đã chọn" |
| **Tiêu đề modal xác nhận** | **Xoá các dòng trùng?** | — | — |
| **Thân modal** | *"Các dòng này trên Sổ sẽ bị xoá vì đã có đơn tự động (bản chính thức, có mã CRM) ghi cùng nội dung. Tổng doanh thu sẽ giảm **113.700.840đ** (bỏ phần đang đếm 2 lần)."* | Giải thích + cảnh báo tổng giảm. | — |

## 4. Luồng người dùng (kế toán)

1. Mở tab **Nghi trùng** (thấy số đếm trên tên tab, ví dụ `Nghi trùng ⁸`).
2. Mỗi dòng = **dòng sheet** đang nghi trùng, hiển thị **y hệt các cột Sổ chính** (có chọn cột) + cột **Cảnh báo** giải thích đơn app cặp với nó.
3. Tick chọn nhiều dòng (hoặc dùng nút inline từng dòng). Dòng loai-lệch/ngày-lệch được **tô đậm cảnh báo** để dừng lại xem kỹ.
4. Bấm **Xoá X dòng trùng đã chọn** → modal xác nhận (nói rõ tổng giảm) → xoá → tab tự cập nhật số đếm. False-positive thì bấm **Không trùng — bỏ cảnh báo**.

## 5. Milestones & task (self-contained cho Sonnet)

### G1 — Bộ dò (backend, read-only) · owner: Đức
- **G1-T1 — Endpoint `GET /revenue/ledger/dup-candidates`** (`backend/revenue_routes.py`). ⚠️ **KHÔNG self-join được qua supabase query-builder** → SQL §7 phải là **Postgres VIEW** `v_so_doanh_thu_dup_candidates` (tạo ở migration G2-T1), endpoint query `sb.table("v_so_doanh_thu_dup_candidates").select("*")`. View trả mỗi cặp = 1 dòng: sheet_id + **toàn bộ cột dòng sheet** (để FE dựng row như `_row_to_ledger`) + `app_id, app_ngay, app_ma_don, lech_ngay, loai_mismatch, app_loai, sheet_loai`. View đã LEFT JOIN `so_doanh_thu_dup_review` loại `verdict='ignored'` + dedupe **mỗi sheet_id chỉ 1 dòng** (chọn app-twin gần ngày nhất — `DISTINCT ON (sheet_id) ... ORDER BY sheet_id, abs_diff`). Endpoint chỉ query view + `_row_to_ledger`-hoá phần cột sheet. Guard `require_module_access(sb, actor, 'revenueLedger')`. Sắp xếp `abs_diff` tăng dần.
- **G1-T2 — Count cho badge.** Endpoint nhẹ `GET /revenue/ledger/dup-candidates/count` = `sb.table("v_so_doanh_thu_dup_candidates").select("sheet_id", count="exact")` lấy `.count`. Guard như T1.
- **G1-N1 (verify)** — Chạy SQL §7 read-only trên prod, xác nhận đúng 8 cặp đã biết (7 lệch 1–3 ngày + 1 loai-lệch). Không match ca gia hạn (≥4 ngày).

### G2 — Hành động (backend) · owner: Đức
- **G2-T1 — Migration `supabase/migrations/20260813_dup_candidates.sql`** (theo convention date-prefix; xem `supabase/migrations/20260602_add_is_test_column.sql`). Gồm: (a) bảng `so_doanh_thu_dup_review` (`id`, `sheet_id uuid`, `verdict text` `'merged'|'ignored'`, `by_email text`, `at timestamptz default now()`, `reason text`); (b) VIEW `v_so_doanh_thu_dup_candidates` (SQL §7 + `DISTINCT ON (sheet_id)` + LEFT JOIN loại `ignored`). **Áp dụng: sandbox trước → verify → prod**, qua Supabase MCP `apply_migration` (hoặc SQL Editor). Bật RLS cho bảng review nếu policy chuẩn yêu cầu (xem [[project_rls-hardening]] pattern).
- **G2-T2 — Endpoint `POST /revenue/ledger/dup-merge`** (bulk). Nhận `sheet_ids[]`. **Mỗi id**: refetch dòng → **guard cứng P3**: `created_by_email LIKE 'import:gsheet:%'` (hoặc `import:dingtalk:%`) AND `loai_nhap='tay'` AND có app-twin hợp lệ; **từ chối `tu_dong`** (bản chính); (tuỳ chọn) nếu app-twin `loai` trống → backfill từ dòng sheet trước khi xoá. `_write_audit(...,'delete',...)` + ghi `dup_review verdict='merged'` + hard delete. Trả partial-success `{deleted_count, deleted:[], failed_items:[{id,reason}]}`. Guard route `require_module_write(sb, actor, 'revenueLedger')`.
- **G2-T3 — Endpoint `POST /revenue/ledger/dup-dismiss`.** Nhận `sheet_ids[]` + `reason?`. Ghi `dup_review verdict='ignored'`. Detection tự loại.

### G3 — Giao diện (frontend) · owner: Đạt
- **G3-T1 — Tách `LEDGER_COLUMNS` ra `frontend/src/constants/ledgerColumns.tsx`** (⚠️ **.tsx KHÔNG .ts** — cột chứa JSX). `LEDGER_COLUMNS` hiện đã là `export const` top-level trong `SoDoanhThuTab.tsx:132-342` + mọi `renderTd(row, ctx)` **ctx-pure** (không đóng closure vào state) → cắt an toàn. Bê kèm: type `LedgerColumnDef` + `LedgerCellCtx` + các import cột dùng (`Td`, `Badge`, `Button`, `cn`, `fmtPayTime`, `orderIdDisplay`, `formatVndNumber`, `typeDisplayLabel`/`typeCellClass`/`paymentMethodCellClass`/`ledgerPillBase`, `RevenueLedgerRow`). Sửa import ở `SoDoanhThuTab`. **Refactor thuần, 0 đổi hành vi** — `npx tsc -b` + `npm run test` xác nhận Sổ chính không đổi. *(Cột `actions` là cột DUY NHẤT cần ctx — vẫn nằm trong mảng chung, NghiTrungTab chỉ dùng `LEDGER_COLUMNS.filter(c => c.key !== "actions")`.)*
- **G3-T2 — `NghiTrungTab.tsx`.** Row type = `RevenueLedgerRow & { canhBao: {...} }` (cột Cảnh báo đọc `row.canhBao`, KHÔNG có sẵn trên `RevenueLedgerRow`). Cột = `LEDGER_COLUMNS.filter(c => c.key !== "actions")` + cột `select` (checkbox) đầu + cột `canhBao` (renderTd = câu §3, tô đậm nếu `loai_mismatch` hoặc `|lech_ngay|` bất thường) + cột thao tác riêng (G3-T4). `useColumnVisibility('nghiTrung', ...)` (**tableId khác `'soDoanhThu'`** — trùng sẽ share state = bug). Multi-select **clone cơ chế `DeleteAccountsModal.tsx`**: `useState<Set<string>>`, `toggle(id)` copy bất biến, header checkbox `indeterminate` qua ref. Bulk action bar hiện khi `selected.size>0`. Fetch `endpoints.revenue.dupCandidates()`.
- **G3-T3 — Modal xác nhận** (bọc `ui/Modal.tsx`). Nội dung §3 (nói rõ tổng giảm = Σ tiền dòng chọn). Two-step confirm. Hiện `failed_items` như `DeleteAccountsModal`.
- **G3-T4 — Nút inline từng dòng** ("Xoá dòng trùng" / "Không trùng — bỏ cảnh báo") ở cột thao tác của tab.
- **G3-T5 — Wiring `MainPage.tsx`**: `ViewId` `+ 'nghiTrung'`; lazy import + `PRELOAD_MAP` + `TITLES`; nav item **ngay sau `revenueLedger`** với `badge: count>0 ? <Badge tone="warn">{count}</Badge> : null`; case trong `renderActiveView`; thêm vào `wideContent`. ⚠️ **RBAC: DÙNG LẠI quyền `revenueLedger`** (`can("revenueLedger")`), **KHÔNG tạo permission key mới** — tránh phải sửa ma trận phân quyền + Perms UI + migration role. BE endpoint cũng guard `revenueLedger` (giống `delete_ledger`). Ai thấy Sổ thì thấy Nghi trùng.
- **G3-T6 — Badge count hook** — fetch `dupCandidatesCount()` lúc load app (hook nhẹ, KHÔNG polling); refresh sau merge/dismiss. (Sổ không nằm trong `PaymentFlowContext` nên cần 1 fetch riêng, 1 query rẻ.)
- **G3-T7 — `api.ts`**: `endpoints.revenue.dupCandidates / dupCandidatesCount / dupMerge / dupDismiss`. **Type response khớp CHÍNH XÁC backend** (tránh bẫy `bulkDeleteAuthUsers` type lệch key ở `api.ts:512`).

### G4 — Test & nghiệm thu
- **G4-T1 (Đức)** — BE test: detection loại renewal ≥4 ngày; cặp disjoint không nhân đôi; `dup-merge` từ chối `tu_dong` + từ chối `tay` không phải gsheet; dismiss loại khỏi detection.
- **G4-T2 (Đạt)** — FE test: tab render đủ cột + Cảnh báo; toggle select; bulk disabled tới khi chọn; badge đếm đúng.
- **G4-T3 (Minh)** — UAT sandbox máy thật: badge = số cặp thật; 1 merge giảm tổng đúng bằng tiền dòng; dismiss rời tab; báo chị Hiền tổng sẽ giảm.

## 6. Owner & timeline (3 dev, ≤3 ngày full-time)

| Ngày | Đức (BE) | Đạt (FE) | Minh |
|---|---|---|---|
| D1 | G1-T1/T2 + G2-T1 migration | G3-T1 tách cột + G3-T7 api stub | G1-N1 verify prod |
| D2 | G2-T2/T3 + G4-T1 | G3-T2/T3/T4 | báo Hiền + chuẩn bị UAT |
| D3 | fix review | G3-T5/T6 + G4-T2 | G4-T3 UAT + merge thật 8 cặp |

## 7. SQL bộ dò (read-only, an toàn chạy thẳng SQL Editor)

```sql
WITH app_auto AS (
  SELECT id, uid, so_tien_vnd, ngay_tien_ve::date AS d, loai, ten_khach, crm_order_id, ma_don_hang
  FROM so_doanh_thu
  WHERE (created_by_email = 'b3-activation@auto' OR loai_nhap = 'tu_dong')
    AND COALESCE(uid,'') <> '' AND so_tien_vnd > 0
    AND ngay_tien_ve IS NOT NULL AND COALESCE(is_test,false) = false
),
sheet AS (
  SELECT id, uid, so_tien_vnd, ngay_tien_ve::date AS d, loai, ten_khach, created_by_email
  FROM so_doanh_thu
  WHERE created_by_email LIKE 'import:gsheet:%'   -- P3: KHÔNG dùng loai_nhap='tay' đơn thuần
    AND COALESCE(uid,'') <> '' AND so_tien_vnd > 0
    AND ngay_tien_ve IS NOT NULL AND COALESCE(is_test,false) = false
)
SELECT s.id AS sheet_id, s.uid, s.so_tien_vnd,
       s.d AS sheet_date, a.d AS app_date, (s.d - a.d) AS lech_ngay,
       a.id AS app_id, a.crm_order_id, a.ma_don_hang,
       (a.loai IS DISTINCT FROM s.loai) AS loai_mismatch, a.loai AS app_loai, s.loai AS sheet_loai
FROM app_auto a
JOIN sheet s ON s.uid = a.uid AND s.so_tien_vnd = a.so_tien_vnd
           AND ABS(s.d - a.d) <= 3          -- >=4 ngày = gia hạn, KHÔNG gắn cờ
-- LEFT JOIN so_doanh_thu_dup_review r ON r.sheet_id = s.id AND r.verdict='ignored' (loại dismissed)
ORDER BY ABS(s.d - a.d), s.uid;
```

## 8. Con trỏ code (đã pull main; line xác nhận)

- BE `revenue_routes.py`: `sync_ledger_from_ar_course` (insert payload ~`:1200`, `order_match` ~`:1228`, `loose_match` ~`:1247`), `delete_ledger` (`DELETE /revenue/ledger/{row_id}`, `require_module_write` `:1854`, guard `loai_nhap != 'tay'`), `create_ledger` `:1728`, `patch_ledger` `:1802`, read guard `require_module_access(...,'revenueLedger')` `:1586/:1658`. `resolve_loai_from_lead_source` ở `backend/utils/lead_source_map.py` (đã có). Helper: `_write_audit`; `require_module_write`/`require_module_access` import từ `admin_routes`; `resolve_actor`/`require_min_role` từ `rbac`.
- BE RPC/SQL: complex SQL chạy qua **view/RPC** rồi `sb.table(view).select()` hoặc `sb.rpc(fn, params)` — mẫu `rpc_helpers.py`, `dashboard_routes.py:767`, `payment_request_routes.py:605`. Migration: `supabase/migrations/*.sql` (date-prefix).
- FE reuse: `SoDoanhThuTab.tsx:132-342` (`LEDGER_COLUMNS`, **đã export**), `hooks/useColumnVisibility.ts`, `ui/ColumnVisibilityMenu.tsx`, **`auth/DeleteAccountsModal.tsx`** (multi-select mẫu chuẩn), `ui/Modal.tsx`, `CardReconciliationTab.tsx` (mẫu tab "Cần đối soát"), `MainPage.tsx:~305` (nav + badge), `PaymentFlowContext.tsx` (mẫu badgeCounts), `ui/Badge.tsx`, `api.ts:328-359` (`endpoints.revenue`).

**DoD mỗi task (giống chuẩn dự án):** `cd frontend && npx tsc -b` + `npm run test` xanh (FE); `pytest` liên quan xanh (BE); migration verify sandbox trước prod; dán số pass rồi commit từng phần. Deploy: BE `bash scripts/deploy.sh sandbox` → UAT → `prod`; FE Vercel auto.

## 9. Quyết định đã chốt (13/8) + rủi ro

- ✅ **Terms & nút** — theo §3: tab **"Nghi trùng"**; nút **"Xoá dòng trùng"** (KHÔNG dùng "Gộp"); bỏ qua = **"Không trùng — bỏ cảnh báo"**; hàng loạt **"Xoá X dòng trùng đã chọn"**; modal nói rõ tổng giảm.
- ✅ **Hiển thị** — chỉ hiện **dòng sheet** (mỗi cặp = 1 dòng, đếm tab = số cặp), đơn app tóm tắt trong cột Cảnh báo. KHÔNG hiện cả 2 dòng.
- ✅ **Phạm vi v1** — merge chỉ **giữ app / xoá sheet**. Ca hiếm ngày-app-sai (dòng app lệch 3 ngày so với ngày PR done) hoặc loai-lệch (app tính từ nguồn ≠ loai Hiền nhập): cột Cảnh báo **tô đậm**, kế toán sửa ngày/loai **tay ở Sổ chính** sau merge. KHÔNG xây phần chọn-giữ-dòng-nào trong v1.
- **Quyền** — kế toán có `revenueLedger` write được merge (giống quyền xoá dòng hiện tại); KHÔNG giới hạn manager-only (kế toán làm hằng ngày). *(mặc định, đổi nếu muốn)*
- **Bổ trợ, không thay thế** — BQ dedup view (Chung) vẫn dedup ở tầng báo cáo; tab này dọn **Sổ gốc** để nguồn sự thật sạch, giảm dần phụ thuộc view. Không xung đột.
- **Upstream (ngoài phạm vi code)** — gốc rễ là chị Hiền vẫn nhập tay đơn đã qua B3. Nếu chuyển hẳn sang Sổ app cho nhóm đơn này thì hết sinh trùng — nhưng là đổi quy trình, để riêng.
