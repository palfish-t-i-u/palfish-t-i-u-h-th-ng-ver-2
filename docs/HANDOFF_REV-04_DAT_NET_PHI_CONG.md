# HANDOFF — REV-04 (Đạt): Ghi doanh thu NET — trừ phí cổng thẻ/trả góp

**Origin:** Bảng chốt định nghĩa doanh thu (Thu Hiền 29/7), mục 3. Master plan: `docs/superpowers/plans/2026-07-29-revenue-definition-alignment.md` (Việc 3).

**Quyết định đã chốt (Thu Hiền 29/7):** áp phí cho **quẹt thẻ + trả góp**, **CÓ trừ phí trả góp**. CK/tiền mặt phí = 0. Công thức: `net = amount − fee − installment_fee`.

**Estimated effort:** ~1.5–2 ngày. BE (migration + stamp phí + báo cáo đọc net). FE cột "Phí"/"Thực nhận" do Minh làm.

**Hạn:** không deadline cố định. Trần: xong trong **nửa đầu tháng 8 — muộn nhất 15/8**.

**⚠️ Phối hợp với REV-01 (Đức):** REV-04 sửa 1 chỗ chung với REV-01 = `report_routes.py` `_load_ledger_revenue` (dòng `select` + đọc VND). **Đức merge REV-01 trước → Đạt rebase REV-04.** Phần còn lại (migration, stamp ở `gateway_routes`, `mpos_import`) độc lập, chạy song song REV-01 được ngay — không chờ.

---

## Bối cảnh (ĐÃ verify — grep 30/7 trên nhánh `sandbox`)

**Vấn đề:** phí cổng nằm ở `gateway_transactions` (`net_amount`), **chưa từng chảy vào Sổ** → Sổ ghi **gross**, doanh thu đơn thẻ bị thổi phồng phần phí.

**Thách thức "không lỗi con" — phí về SAU:** dòng Sổ được ghi lúc đơn đủ tiền (auto-sync); nhưng phí chỉ chắc chắn khi **sao kê cổng được ghép** (`match_gateway_txn`) — có thể muộn hơn. → Phải xử lý 2 chiều thời gian (xem C).

**`backend/mpos_import.py`:**
- `computed_net = amount - fee - installment_fee` — **285** (`is_installment` 283). Đây là công thức Q2 đã chốt, **dùng lại, khỏi tính mới**. Import ghi giá trị này vào `gateway_transactions.net_amount`.

**`backend/gateway_routes.py`:**
- `match_gateway_txn(txn_id, body, ...)` — **528**: điểm ghép 1 dòng sao kê cổng vào `payment_line` → PR. `txn_row` net đọc tại **576** (`gw_net = _parse_amount(txn_row.get("net_amount"))`), amount **575**. `pr_id` lấy từ line tại **555**. Recompute PR tại **592**.
- → Đây là **điểm phí "trở nên biết được"** + có link tới PR. Chỗ back-stamp Sổ.

**`backend/revenue_routes.py`:**
- Auto-sync tạo dòng Sổ: **963** (ar_course/PR) và **1156** (M3). Ghi `so_tien_vnd` (968/1161), `gmv_rmb = vnd_to_rmb(vnd, rate)` (969/1162), `payment_method` (971), `don_hang_id`.
- `payment_method` đã có trong Sổ — lọc dòng thẻ/trả góp theo cột này (**971** auto, **1444** tay).
- Serialize Sổ ra FE: `soTienVnd`/`gmvRmb` tại **784–785**.
- BC01 fetch `.select("pay_time, ngay_tien_ve, gmv_rmb, ...")` **1579**, tổng `gmv = gmv_rmb` **1651**. BC02 fetch **1606**.

**`backend/report_routes.py`:**
- BC03 `_load_ledger_revenue` **231**: `.select("sale_crm_name, team, so_tien_vnd, gmv_rmb, don_hang_id, ngay_tien_ve")` **238**; VND đọc `parse_metric(r.get("so_tien_vnd"))` **247**; RMB `gmv_rmb` **248**.

**Cột `so_doanh_thu`:** có `so_tien_vnd` (gross VND), `gmv_rmb`, `payment_method`, `don_hang_id`. **CHƯA có** `phi_cong`, `so_tien_net`, `gateway_txn_id`.

---

## Scope

### IN scope
1. Migration: thêm `phi_cong`, `so_tien_net`, `gateway_txn_id` vào `so_doanh_thu`.
2. Stamp phí lên dòng Sổ tại 2 thời điểm (ghép sao kê + auto-sync), idempotent.
3. Báo cáo đọc net (BC03 VND; RMB tự net qua `gmv_rmb`); Sổ serialize lộ `phi_cong`/`so_tien_net`.
4. Test pytest.

### OUT of scope (KHÔNG làm)
- **KHÔNG** đổi `so_tien_vnd` gốc — giữ **gross** cho đối soát ngân hàng + link PR. Net để ở cột riêng.
- **KHÔNG** đụng `_ledger_query` / `ky_doanh_thu` / bộ lọc thời gian — vùng Đức (REV-01/03). Chỉ chạm `report_routes` `_load_ledger_revenue` (rebase sau Đức) + serialize Sổ.
- **KHÔNG** stamp dòng CK/tiền mặt (phí=0, net=gross mặc định).
- **KHÔNG** tính lại lương/hoa hồng.
- **KHÔNG** làm cột FE — Minh làm.

---

## Việc cụ thể

### A. Migration (`docs/migrations/2026-07-30-ledger-net-fee.sql`)
> **Backup `so_doanh_thu` TRƯỚC.**
```sql
ALTER TABLE so_doanh_thu ADD COLUMN IF NOT EXISTS phi_cong bigint NOT NULL DEFAULT 0;
ALTER TABLE so_doanh_thu ADD COLUMN IF NOT EXISTS so_tien_net bigint NULL;
ALTER TABLE so_doanh_thu ADD COLUMN IF NOT EXISTS gateway_txn_id uuid NULL;
```
`so_tien_net` null = "chưa ghép phí" (fallback gross khi đọc).

### B. Hàm stamp dùng chung (`revenue_routes.py`, gần helper Sổ)
```python
def stamp_net_fee(sb, *, ledger_row_id, gateway_txn_id, gross_vnd, fee_vnd, rate):
    """Ghi phí + net lên 1 dòng Sổ. Idempotent theo gateway_txn_id."""
    net = max(0, int(gross_vnd) - int(fee_vnd))
    sb.table("so_doanh_thu").update({
        "phi_cong": int(fee_vnd),
        "so_tien_net": net,
        "gateway_txn_id": str(gateway_txn_id),
        "gmv_rmb": vnd_to_rmb(net, rate),   # GMV theo NET (Q2 chốt) → BC01/BC02 tự net
    }).eq("id", ledger_row_id).is_("gateway_txn_id", "null").execute()
    # .is_(... null) = chỉ stamp khi CHƯA stamp → không trừ chồng
```
- `fee_vnd = amount − net_amount` của dòng gateway (hoặc lấy thẳng `fee`+`installment_fee`). Dùng `net_amount` sẵn: `fee = amount − net_amount`.
- **Chỉ stamp** dòng Sổ có `payment_method ∈ {thẻ, trả góp}` (map nhãn từ `_PAYMENT_LINE_METHOD_LABELS`; xác nhận nhãn thực bằng grep giá trị `payment_method` đang ghi ở 971).

### C. Gọi stamp ở 2 thời điểm (xử lý "phí về sau")
1. **Ghép sao kê muộn** — `gateway_routes.py` `match_gateway_txn` sau recompute (~**592**): từ `pr_id` → tìm dòng Sổ của đơn (qua `payment_requests.don_hang_id` hoặc link đơn) → gọi `stamp_net_fee(...)` với `gw_net`/`gw_amount` (575–576). Nếu dòng Sổ **chưa tồn tại** (PR chưa đủ tiền) → bỏ qua, để bước 2 lo.
2. **Auto-sync tạo Sổ** — `revenue_routes.py` **963/1156**: sau khi insert dòng Sổ, nếu đơn **đã có** gateway txn matched (`net_amount>0`) → gọi `stamp_net_fee(...)` ngay. (Phí đã về trước khi đủ tiền.)
- 2 đường đều idempotent qua `is_("gateway_txn_id","null")` → không double-trừ dù chạy cả hai.

### D. Báo cáo đọc net
- **BC03** `report_routes.py`: `select` (**238**) thêm `so_tien_net, phi_cong`; VND (**247**) đọc `coalesce(so_tien_net, so_tien_vnd)` → `r.get("so_tien_net") if r.get("so_tien_net") is not None else r.get("so_tien_vnd")`. **(Rebase sau REV-01 — Đức cũng sửa dòng 238 thêm `is_test` filter.)**
- **BC01/BC02** (`revenue_routes.py` 1579/1606/1651): tổng theo `gmv_rmb` — **không cần đổi** (stamp đã ghi `gmv_rmb` = net). Xác minh: dòng thẻ đã ghép phí → `gmv_rmb` là net.
- **Sổ serialize** (**784–785**): thêm `phiCong`/`soTienNet` vào payload để Minh dựng cột "Phí"/"Thực nhận". `select` của Sổ (`_ledger_query`) thêm `phi_cong, so_tien_net` — **báo Đức thêm hộ trong REV-01 để tránh cùng sửa `_ledger_query`**, hoặc Đạt thêm sau khi REV-01 merge.

---

## Acceptance criteria
1. Dòng thẻ gross 10.000.000, sao kê fee 200.000 → sau stamp `so_tien_net=9.800.000`, `phi_cong=200.000`, `so_tien_vnd` **giữ 10.000.000**, `gmv_rmb` = net RMB.
2. Dòng CK → `so_tien_net` null → báo cáo fallback gross; không stamp.
3. Stamp 2 lần cùng `gateway_txn_id` → chỉ trừ 1 lần (idempotent).
4. Ghép sao kê **sau** khi Sổ đã tạo → back-stamp đúng dòng; ghép **trước** khi đủ tiền → auto-sync stamp lúc tạo.
5. BC01/BC02 tổng RMB = net; BC03 VND = net (fallback gross cho dòng chưa ghép phí).
6. `python -m pytest backend/tests/test_ledger_net_fee.py -v` PASS (từ repo root).
7. Khi merge (Minh chạy): `cd frontend && npx tsc -b` PASS; `npm run test` PASS.

## Test plan (`backend/tests/test_ledger_net_fee.py`)
1. Stamp thẻ: gross 10tr, fee 200k → net 9.8tr, gross giữ nguyên, gmv_rmb net.
2. CK: không stamp, net null, báo cáo dùng gross.
3. Idempotent: stamp 2 lần cùng gateway_txn_id → 1 lần.
4. Thứ tự: (a) Sổ trước, ghép sau → back-stamp; (b) ghép trước, Sổ sau → auto-sync stamp.
5. BC03 tổng VND dùng net; dòng chưa ghép fallback gross.

---

## Anti-patterns (đừng làm)
1. Đừng ghi net đè `so_tien_vnd` — mất gross, vỡ đối soát ngân hàng + link PR. Net ở cột riêng.
2. Đừng stamp mà không guard `gateway_txn_id` null → trừ chồng khi phí về nhiều đường.
3. Đừng stamp dòng CK/tiền mặt.
4. Đừng sửa `_ledger_query`/`ky_doanh_thu`/bộ lọc thời gian — vùng Đức. REV-04 chỉ chạm `_load_ledger_revenue` (rebase sau) + stamp (`gateway_routes`/auto-sync) + serialize.
5. Đừng chạy migration khi chưa backup `so_doanh_thu`.
6. Đừng để BC01/BC02 đọc `so_tien_vnd` cho RMB — RMB đi qua `gmv_rmb` (đã net sau stamp); chỉ BC03 VND cần đổi.
