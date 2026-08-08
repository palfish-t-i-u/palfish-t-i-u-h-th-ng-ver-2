# C-T1 — Ghi `ngay_tien_ve` đơn thẻ theo NGÀY QUẸT (+ backfill)

**Ngày:** 2026-08-08 · **Trạng thái:** PLAN (chưa thực thi) · **Chạm data prod:** CÓ (write + backfill → cần backup + xác nhận)
**Liên quan:** họp 7/8 chị Thu Hiền (N2 đã chốt), REV-03 (luật 22h), REV-04 (net phí công), a4745e4 (báo đơn pre-mPOS)

---

## 1. Vấn đề (ngôn ngữ vận hành)

Sổ doanh thu đang **đếm sai số đơn theo ngày** cho đơn quẹt thẻ / trả góp. Đơn thẻ được ghi vào Sổ theo **ngày kế toán bấm "báo đơn"** (ngày đặt chỗ), không phải **ngày khách quẹt thẻ thật**. Vì các đơn này cố ý giữ trạng thái "chờ" tới khi khớp mPOS (để không bắn tin Zalo "đã vào TK" sớm — a4745e4), nên lúc ghi Sổ hệ thống lấy tạm ngày báo đơn.

Hệ quả: file đối soát của chị Thu Hiền lệch với Sổ ở cột **số đơn/ngày**.
Mục tiêu C-T1: **3/8 → 13 đơn, 4/8 → 21 đơn** (và cả dải 1–7/8) khớp file chị Hiền.

## 2. Nguyên nhân (đã verify trên data prod thật)

- Đường ghi Sổ đơn thẻ: `sync_ledger_from_ar_course` (`backend/revenue_routes.py:1138-1151`) lấy giờ từ dòng thanh toán "chờ" (booking) rồi áp **luật 22h** (`ky_tu_gio_thuc`) → ra ngày báo đơn, KHÔNG phải ngày quẹt.
- Ngày quẹt thật nằm ở `gateway_transactions.paid_at`. N2 chốt: dùng `(paid_at AT TIME ZONE 'UTC')::date` — **KHÔNG convert Asia/Ho_Chi_Minh, KHÔNG áp luật 22h**.

**8 dòng đã khớp gateway trong Sổ (toàn bộ, tính đến 8/8) — 100% đang sai ngày:**

| Sổ ngày (hiện) | Ngày quẹt (đúng) | PT | Mã đơn | txn_code | Ghi chú |
|---|---|---|---|---|---|
| 2026-07-10 | 2026-07-09 | Installment | — | MPL_MP13660432 | trong tháng |
| 2026-07-27 | 2026-07-26 | Card | — | MPL_MP13738005 | trong tháng |
| 2026-07-28 | 2026-07-27 | Card | CC-0597-001 | MPL_MP13743896 | **multi-con** (2 bé/1 lần quẹt) |
| 2026-07-28 | 2026-07-27 | Card | CC-0597-002 | MPL_MP13743896 | **multi-con** |
| 2026-07-30 | 2026-07-29 | Card | — | MPL_MP13749849 | trong tháng |
| 2026-08-03 | 2026-08-02 | Installment | CC-0853-001 | MPL_MP13769685 | **multi-con** |
| 2026-08-03 | 2026-08-02 | Installment | CC-0853-002 | MPL_MP13769685 | **multi-con** |
| 2026-08-04 | **2026-07-31** | Card | — | MPL_MP13757511 | ⚠ **lệch tháng** (Aug→Jul) |

**Kiểm chứng số đếm:** 08-03 hiện 15 đơn → 2 dòng CC-0853 dời sang 08-02 → **13** ✓. 08-04 hiện 22 → dòng MPL_MP13757511 dời sang 07-31 → **21** ✓. Đúng kỳ vọng chị Hiền.

**Lưu ý quan trọng:** 2 cặp "trùng" (CC-0597, CC-0853) **KHÔNG phải bản sao** — là **đơn nhiều con**: cùng 1 AR, 1 lần quẹt, nhưng khác `crm_order_id` + khác `uid` → mỗi con là 1 đơn thật. Đếm 2 dòng là ĐÚNG. Không xoá.

---

## 3. Phạm vi C-T1

**CHỈ SỬA NGÀY** (`ngay_tien_ve` + `pay_time`). KHÔNG đụng `gmv_rmb` / `so_tien_vnd` / `phi_cong` / `so_tien_net`.
Số đếm/ngày (13/21) chỉ phụ thuộc NGÀY → phần giá trị (N2 "GMV = gross") tách sang **Phần B** (§7), vì nó (a) đảo REV-04, (b) dính bug phí nhân-đôi trên đơn multi-con, (c) cần file GMV chị Hiền để đối chiếu giá trị chứ không phải số đếm.

---

## 4. Giải pháp A1 — Fix xuôi (code BE, cho đơn MỚI)

Đơn thẻ chỉ biết ngày quẹt khi khớp mPOS → sửa tại **thời điểm stamp** (lúc khớp), nơi có `paid_at`.

**(a) `stamp_net_fee` (`revenue_routes.py:193`)** — thêm tham số `paid_at`; nếu có, set thêm `ngay_tien_ve` + `pay_time` theo ngày quẹt UTC (bỏ 22h):

```python
from datetime import timezone  # đã có datetime ở đầu file

def stamp_net_fee(sb, *, ledger_row_id, gateway_txn_id, gross_vnd, fee_vnd,
                  rate=None, paid_at=None):
    ...
    update = {
        "phi_cong": int(fee_vnd),
        "so_tien_net": int(net_vnd),
        "gateway_txn_id": str(gateway_txn_id),
        "gmv_rmb": float(net_rmb),
    }
    if paid_at:
        dt = paid_at if isinstance(paid_at, datetime) else datetime.fromisoformat(str(paid_at))
        if dt.tzinfo:                      # gateway_transactions.paid_at là timestamptz → có offset
            dt = dt.astimezone(timezone.utc)
        update["ngay_tien_ve"] = dt.date().isoformat()   # = (paid_at AT TIME ZONE 'UTC')::date
        update["pay_time"] = dt.isoformat()
    res = sb.table("so_doanh_thu").update(update).eq("id", ledger_row_id).is_("gateway_txn_id","null").execute()
    return bool(res.data)
```
> ⚠ **Tuyệt đối KHÔNG** dùng `_parse_datetime` cho `paid_at` — hàm đó coi giờ naive là VN, sẽ lệch. Ở đây ép UTC tường minh.
> Guard `gateway_txn_id IS NULL` giữ nguyên → chỉ chạm dòng lần-đầu-khớp; 8 dòng cũ (đã có txn) KHÔNG bị đụng bởi code (→ cần backfill §5).

**(b) Truyền `paid_at` từ 2 điểm gọi:**
- `_try_auto_stamp_fee` (`revenue_routes.py:242-263`): thêm `paid_at` vào `.select("id, amount, net_amount, paid_at")` rồi `stamp_net_fee(..., paid_at=gw.get("paid_at"))`.
- `gateway_routes.py:603-631` (luồng khớp thủ công/tự động): dòng gw đã khớp có `paid_at` → truyền vào `stamp_net_fee(..., paid_at=<gw.paid_at>)` trong vòng lặp.

**(c) Chống trùng khi re-sync (không lỗi con):** dedup hiện tại (`revenue_routes.py:1185-1194`) khớp theo `uid + ngay_tien_ve + so_tien_vnd`. Sau khi ngày đổi sang ngày quẹt, nếu `sync_ledger_from_ar_course` chạy lại cho cùng AR (sửa/duyệt lại/append), nó tính lại ngày = booking → không thấy dòng cũ (đã mang ngày quẹt) → **chèn trùng**. Sửa: ưu tiên tìm theo `crm_order_id` (khoá ổn định, mọi dòng này đều có) trước khi rơi về khoá lỏng uid+ngày+tiền.

Tiêu chí 3: **triệt để** (mọi đơn thẻ mới tự đúng ngày) · **không lỗi con** (guard crm_order_id chặn trùng; ép UTC tránh lệch 22h) · **không tăng gánh hạ tầng** (0 bảng mới, 0 job, chỉ thêm 2 cột vào 1 UPDATE sẵn có).

## 5. Giải pháp A2 — Backfill 8 dòng cũ (SQL một lần)

Guard idempotent chặn code chạm dòng cũ → phải backfill tay. **Backup TRƯỚC.**

```sql
-- BƯỚC 1: backup (bắt buộc)
CREATE TABLE so_doanh_thu_backup_ct1_20260808 AS SELECT * FROM so_doanh_thu;

-- BƯỚC 2: backfill ngày quẹt (UTC, bỏ 22h). Đúng 8 dòng, idempotent (chạy lại = 0 dòng)
UPDATE so_doanh_thu sd
SET ngay_tien_ve = (gt.paid_at AT TIME ZONE 'UTC')::date,
    pay_time     = gt.paid_at,
    updated_by_email = 'ct1-backfill'
FROM gateway_transactions gt
WHERE sd.gateway_txn_id = gt.id
  AND (gt.paid_at AT TIME ZONE 'UTC')::date <> sd.ngay_tien_ve;
```

## 6. Nghiệm thu

```sql
-- Kỳ vọng: 2026-08-03 → 13, 2026-08-04 → 21 (đối chiếu cả dải với file chị Hiền)
SELECT ngay_tien_ve, count(*) FROM so_doanh_thu
WHERE is_test = false AND ngay_tien_ve BETWEEN '2026-08-01' AND '2026-08-07'
GROUP BY 1 ORDER BY 1;
```
- [ ] 03/8 = 13, 04/8 = 21.
- [ ] 08-02 nhận thêm 2 đơn multi-con CC-0853 (đúng) — đối chiếu số 08-02 với file chị Hiền.
- [ ] Tháng 7: 07-31 +1 đơn + doanh thu (từ 08-04 dời về) — xem §Rủi ro R1.
- [ ] Sau khi deploy fix xuôi: quẹt 1 đơn thẻ test trên sandbox → Sổ ra đúng ngày quẹt, không sinh dòng trùng.

## Guardrails
- **G1 — one-way door:** chạm data prod. Backup `so_doanh_thu_backup_ct1_20260808` PHẢI tồn tại trước UPDATE. Xác nhận của Minh trước khi chạy.
- **G2 — sandbox trước:** deploy BE fix xuôi lên sandbox, test 1 ca khớp mPOS, rồi mới prod (`bash scripts/deploy.sh prod`). BE-only, KHÔNG migration.
- **G3 — idempotent:** cả code (guard `gateway_txn_id IS NULL`) lẫn SQL (`<>` ngày) chạy lại đều an toàn.
- **G4 — không đụng giá trị:** C-T1 tuyệt đối không sửa `gmv_rmb/so_tien_vnd/phi_cong/so_tien_net`.

## Rủi ro
- **R1 — lệch tháng:** MPL_MP13757511 dời 08-04 → **07-31** = chuyển ~8,27tr VND + GMV tương ứng từ **tháng 8 sang tháng 7**. BC01 (tháng) đổi theo. Xác nhận T7 chưa "chốt sổ" / chị Hiền chấp nhận đây là số ĐÚNG (ngày quẹt thật).
- **R2 — trùng re-sync:** đã chặn bằng guard `crm_order_id` (§4c). Nếu không làm §4c → nguy cơ chèn trùng khi AR được sync lại.
- **R3 — 08-02:** nhận 2 đơn multi-con → verify khớp file chị Hiền (đơn thật, không phải bug).

## Triển khai (thứ tự)
1. Code §4 (a,b,c) → `cd backend` chạy test liên quan → deploy sandbox → test ca khớp.
2. Deploy prod BE: `bash scripts/deploy.sh prod` → smoke `/healthz`.
3. Backup + backfill §5 trên Supabase prod (`jozcvbbypwvzaefteoxn`).
4. Nghiệm thu §6 + đối chiếu file chị Hiền.
> KHÔNG có thay đổi FE. KHÔNG migration schema (cột `ngay_tien_ve`, `pay_time` đã có).

---

## 7. PHẦN B — NGOÀI phạm vi C-T1: N2 "GMV = gross" + bug phí REV-04 (cần quyết định riêng → C-T2)

N2 còn chốt **GMV RMB = gross** (không trừ phí thẻ). Đây KHÔNG phải một cú lật đơn giản — điều tra data lộ 3 vướng:

1. **Đảo REV-04 (đang chạy prod):** BC01 (`_build_sales_performance_pivot`) + BC02 (`_build_key_data_pivot`) cộng theo `gmv_rmb`, mà REV-04 (`stamp_net_fee`) đang ghi `gmv_rmb = NET`. "GMV = gross" = lật `gmv_rmb` về gross → **đảo tính năng net-phí Đạt đã ship** → GMV thẻ trên BC01/BC02 tăng đúng bằng phí. Cần Minh xác nhận đây là ý cho BÁO CÁO, không chỉ cho file đếm của chị Hiền.

2. **Bug phí nhân-đôi trên đơn multi-con:** stamp áp **NGUYÊN phí gateway lên TỪNG dòng** con. VD AR-2026-0243 (CC-0853): phí thật 830.000đ nhưng mỗi dòng bị ghi `phi_cong = 2.158.000đ` (×2 dòng). `so_tien_net` do đó sai. Đây là lỗi giá trị thực sự cần sửa cùng lúc.

3. **`so_tien_vnd` đang = NET, không tách gross theo dòng:** đơn multi-con lưu net đã chia đôi (9.340.500 mỗi dòng = ½ net). Gross theo từng con KHÔNG lưu → muốn ra gross phải có quy tắc chia (net_dòng + phí chia theo tỷ lệ). `stamp_net_fee` KHÔNG ghi `so_tien_vnd` → gross gốc theo dòng đã mất.

→ **Đề xuất:** làm **C-T1 (ngày) trước** — sạch, khớp 13/21 ngay, mở khoá đối soát số-đơn/ngày cho chị Hiền. **C-T2 (gross + fix phí multi-con)** làm sau, cần: (i) file GMV chị Hiền để đối chiếu giá trị, (ii) quyết định đảo REV-04 cho BC01/BC02, (iii) quy tắc chia gross cho đơn multi-con. Vì C-T1 và C-T2 đụng cùng 8 dòng, C-T2 nên gộp 1 lần backup + 1 lần backfill giá trị (tránh chạm 2 lần).
