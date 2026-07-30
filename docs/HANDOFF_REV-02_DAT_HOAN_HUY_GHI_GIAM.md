# HANDOFF — REV-02 (Đạt): Cơ chế hoàn/hủy ghi giảm doanh thu

**Origin:** Bảng chốt định nghĩa doanh thu (Thu Hiền 29/7). Master plan: `docs/superpowers/plans/2026-07-29-revenue-definition-alignment.md` (Việc 6).

**Quyết định đã chốt (Thu Hiền 29/7):** "Một đơn đã ghi doanh thu, sau đó bị hoàn hoặc hủy thì trừ ở đâu?" → **Truy về ngày ghi nhận doanh thu gốc và ghi giảm ở kỳ đó.** Nghĩa là dòng ghi giảm mang `ngay_tien_ve = ngày dòng gốc`; số kỳ gốc đổi hồi tố (chấp nhận). Chốt cứng, không còn nhánh "kỳ hiện tại".

**Estimated effort:** ~1 ngày. BE (endpoint + guard + RBAC + migration). FE nút "Ghi giảm" do Minh làm.

**Hạn:** không deadline cố định. Trần: xong trong **nửa đầu tháng 8 — muộn nhất 15/8**. Việc này độc lập, Đạt chạy ngay được (không chờ Đức).

**⚠️ Vị trí trong 2 tuyến (xem master plan §PHÂN CÔNG):** REV-02 là **bước 1 tuyến Đạt** — độc lập hoàn toàn, không đụng vùng Đức, làm ngay. Sau REV-02, Đạt làm tiếp **REV-04** (`docs/HANDOFF_REV-04_DAT_NET_PHI_CONG.md`, net phí) — REV-04 có 1 mắt phải rebase sau REV-01 của Đức. REV-02 thì không: chỉ thêm route mới ở cuối `revenue_routes.py`, merge lúc nào cũng được (Đức merge REV-01 trước cho gọn).

## Bối cảnh (ĐÃ verify — grep 30/7 trên nhánh `sandbox`)

App hiện **không có** đường ghi giảm doanh thu:
- Hủy PR bị chặn cứng khi đã có tiền — `backend/payment_request_routes.py` **~2056**: `if _parse_amount(pr_row.get("received")) > 0: raise HTTPException(400, "Khong the huy payment request da nhan tien")`; **~2065**: chặn nếu có `payment_lines.status = paid`.
- Hủy đơn bị chặn nếu đã ghi tiền về — `backend/main.py` **~869**: `if row.get("tien_ve"): raise HTTPException(409, "Đơn đã ghi nhận tiền về — không thể huỷ tự động...")`.
- Xóa Sổ chỉ cho `loai_nhap='tay'` — `backend/revenue_routes.py` **1555**: `if row.get("loai_nhap") != "tay": ...` (trong route DELETE **1545**).
→ Không có ghi giảm âm / truy kỳ gốc / hoàn một phần. Việc này thêm đường đó **mà không xóa/sửa dòng gốc** (an toàn audit).

**Route ledger hiện có (`revenue_routes.py`):** GET **1271** · GET summary **1343** · POST **1419** · PATCH `{row_id}` **1489** · DELETE `{row_id}` **1545** · POST backfill-b3 **1701** · POST sync-gsheet **1710**. BC01 pivot bắt đầu **1565**.

**RBAC mẫu:** `require_min_role` import ở **13**; dùng mẫu tại `revenue_routes.py` **1381** & **1397** (vùng upsert tỷ giá) — `require_min_role(actor, "manager")`.

**Cột `so_doanh_thu`:** `so_tien_vnd` (bigint, VND) · `gmv_rmb` · `ngay_tien_ve` (date) · `loai_nhap` · `is_test` (bool) · `team` · `sale_crm_name` · `ma_don_hang`. **Chưa có** cột `hoan_ref_id`.

---

## Scope

### IN scope
1. Migration: thêm cột `hoan_ref_id` + cho `loai_nhap` nhận giá trị `'hoan'`.
2. Endpoint **mới** `POST /revenue/ledger/{row_id}/refund` → tạo dòng âm ghi giảm.
3. Guard chống hoàn quá tay + RBAC.
4. Test pytest.

### OUT of scope (KHÔNG làm)
- **KHÔNG** sửa `_ledger_query` (**510**), `_row_pay_date` (**190**), BC02 fetch (**1606**) hay bất kỳ vùng nào Đức (REV-01) đang đổi. **Chỉ THÊM 1 hàm route mới ở CUỐI vùng ledger** (sau route `sync-gsheet` ~**1710**).
- **KHÔNG** xóa/sửa dòng Sổ gốc.
- **KHÔNG** đụng logic chặn hủy PR ở `payment_request_routes.py`/`main.py` — ghi giảm là thao tác trên Sổ, độc lập với hủy PR.
- **KHÔNG** tính lại lương/hoa hồng — app GMV không quản com.
- **KHÔNG** làm nút FE — Minh làm.

---

## Việc cụ thể

### A. Migration (`docs/migrations/2026-07-30-ledger-refund.sql`)
> **Backup `so_doanh_thu` TRƯỚC** (doctrine so-doanh-thu-revenue).

1. `ALTER TABLE so_doanh_thu ADD COLUMN IF NOT EXISTS hoan_ref_id uuid NULL;`
2. `loai_nhap` nhận thêm `'hoan'`: **kiểm tra trước** có CHECK constraint trên `loai_nhap` không (schema v7 `docs/supabase_schema_patch_v7_so_doanh_thu.sql`). Nếu **có** → `ALTER ... DROP CONSTRAINT` rồi `ADD CONSTRAINT ... CHECK (loai_nhap IN (..., 'hoan'))`. Nếu **free-text** (không constraint) → chỉ cần dùng giá trị mới, không cần alter.

### B. Endpoint `POST /revenue/ledger/{row_id}/refund` — THÊM sau route `sync-gsheet` (~1710)
Body: `amount` (bigint > 0, ≤ số gốc còn lại), `reason` (str).

Luồng:
1. Đọc dòng gốc theo `row_id`. Không thấy → 404.
2. **Guard chống hoàn quá tay:** `sum(so_tien_vnd của các dòng hoan_ref_id = row_id)` là số âm đã hoàn; nếu `đã_hoàn + (-amount) < -so_tien_vnd_gốc` → tức tổng hoàn vượt gốc → **400** "Hoàn vượt số gốc". (Cho hoàn một phần, nhiều lần.)
3. **Insert dòng mới** (KHÔNG đụng dòng gốc):
   - `so_tien_vnd = -amount`
   - `gmv_rmb = -(amount * gmv_rmb_gốc / so_tien_vnd_gốc)` (quy tỉ lệ; nếu gốc thiếu 1 trong 2 → `gmv_rmb = 0`, an toàn)
   - `loai_nhap = 'hoan'`
   - `hoan_ref_id = row_id`
   - `ngay_tien_ve = ngay_tien_ve của dòng gốc` **(kỳ gốc — Thu Hiền chốt)**
   - **kế thừa từ gốc:** `is_test`, `team`, `sale_crm_name`, `ma_don_hang`, `don_hang_id`, `pay_time`
   - `note`/`reason` = lý do hoàn
4. RBAC: `require_min_role(actor, "manager")` (mẫu 1397) — chỉ kế toán/leader. Role Sale → 403.

Báo cáo tổng dùng `SUM(so_tien_vnd)` đọc Sổ live → dòng âm tự cộng vào kỳ gốc, không cần tính lại thủ công.

---

## Acceptance criteria
1. Hoàn full → tổng kỳ gốc của đơn đó = 0; **dòng gốc còn nguyên**; Sổ có thêm đúng 1 dòng âm.
2. Hoàn một phần nhiều lần, tổng ≤ gốc; lần vượt gốc → **400**.
3. Dòng hoàn kế thừa `team` / `sale_crm_name` / `is_test` từ gốc (để lọc test + quy sale nhất quán với REV-01).
4. Role Sale gọi endpoint → **403**.
5. `python -m pytest backend/tests/test_ledger_refund.py -v` PASS (từ repo root).
6. Khi merge (Minh chạy): `cd frontend && npx tsc -b` PASS; `npm run test` PASS.

## Test plan (`backend/tests/test_ledger_refund.py`)
1. Hoàn full: dòng gốc 5.000.000 → sau hoàn tổng đơn = 0, gốc còn, 2 dòng trong Sổ.
2. Hoàn 1 phần 2 lần (2tr + 2tr trên gốc 5tr) OK; lần 3 (2tr nữa, tổng 6tr > 5tr) → 400.
3. Dòng `hoan` mang đúng `team`/`sale`/`is_test` của gốc.
4. RBAC: actor role Sale → 403; manager → 200.

---

## Anti-patterns (đừng làm)
1. Đừng xóa/sửa dòng Sổ khi hoàn — phải là **dòng âm mới** (audit).
2. Đừng ghi `ngay_tien_ve = hôm nay` — Thu Hiền chốt **kỳ gốc**.
3. Đừng sửa `_ledger_query`/`_row_pay_date`/BC fetch — vùng của Đức (REV-01). Chỉ thêm route mới ở cuối. **Đức merge trước → Đạt rebase.**
4. Đừng double-trừ: guard theo tổng `hoan_ref_id` phải cộng dồn mọi lần hoàn trước.
5. Đừng chạy migration khi chưa backup `so_doanh_thu`.
