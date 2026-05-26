# Đối chiếu Sổ doanh thu — GMV tab, All File, file gốc DingTalk

**Cập nhật:** 25/05/2026  
**Liên quan:** `docs/M5_GSHEET_IMPORT.md`, `docs/BC01_DOI_CHIEU_THU_HIEN.md`, `docs/M5_OPERATIONS.md`

---

## 1. Tóm tắt — so cái gì với cái gì?

| Nguồn A | Nguồn B | Tin được? | Điều kiện |
|---------|---------|:---------:|-----------|
| Thẻ **Sổ doanh thu** (Số đơn) | Tab **GMV** (cột B — tổng đơn/ngày) | ✅ | Cùng **Pay Time**, cùng **team** (GMV tab ≈ **Inhouse 1** — ô B1) |
| Thẻ Sổ (Tất cả teams) | Tab GMV | ❌ | GMV **không** gồm Inhouse 2 / HCM |
| Thẻ Sổ | Tab **SM Hanoi** (đếm dòng) | ✅ | Cùng `pay_time`, fingerprint khớp |
| Thẻ Sổ | Tab **HN Inhouse 1** (pivot tháng) | ⚠️ | Pivot có thể **thiếu sale** — xem BC01 |
| Sổ / BC01 / BC02 | **HNxHCM GMV.xlsx** | ✅ | Cùng `pay_time`, đã verify range 22/05/2025–22/05/2026 |
| Sổ (import All File) | **SM HANOI daily report.xlsx** (INCOME) | ⚠️ | All File **mất phần lẻ GMV** (~460 RMB trên 13,9k dòng) |
| Sổ (import All File) | **HCM Revenue statement.xlsx** (REVENUE) | ⚠️ | Lệch nhỏ (+21 RMB trên 797 dòng) |

**Quy tắc vàng:** Đối chiếu thẻ tổng hợp → luôn khớp **3 thứ:** (1) cột ngày = **`pay_time`**, (2) **team** giống pivot sheet, (3) loại trừ **`tu_dong` test** nếu không phải production.

---

## 2. Case study — 25/05/2026 (chênh 21 vs 24)

Ảnh chụp Sổ: filter **25/05/2026**, Nguồn **Tất cả** → **26 đơn** (24 import + 2 M3 test).

| Nguồn | Số đơn | Ghi chú |
|-------|-------:|---------|
| Tab **GMV** (All File) | **21** | COUNTIFS Inhouse 1 + Pay Time |
| Tab **SM Hanoi** (`pay_time` = 25/05) | **24** | Cả team |
| Trong đó **Inhouse 1** | **21** | Khớp GMV tab |
| **Sổ app** (`pay_time`, `loai_nhap=tay`) | **24** | Khớp SM Hanoi từng dòng (fingerprint 0 lệch) |
| **Sổ app** + 2 M3 test | **26** | `tu_dong`, 2.000 ₫, tag M3 |

**3 đơn “thừa” so với GMV tab** — team **Inhouse 2** (vẫn đúng trên SM Hanoi + Sổ):

| Khách | VND | Sale |
|-------|----:|------|
| Hiều Lam | 18.550.000 | Vu Thi Khanh Hien |
| Linh Đan | 4.680.000 | Vu Ho Thanh Huong |
| Tuấn | 9.010.000 | Vu Thi Khanh Hien |

**Kết luận:** Không thiếu sync. So GMV tab (21) với Sổ filter **Tất cả teams** (24) → **sai phạm vi**. Filter Sổ **Team = Inhouse 1** → **21 đơn**, khớp GMV.

**2 đơn M3 test** (loại khỏi đối chiếu production):

| Khách | VND | `ma_don_hang` | `loai_nhap` |
|-------|----:|---------------|-------------|
| abc | 2.000 | KH037 | `tu_dong` |
| dfafasfa | 2.000 | KH040 | `tu_dong` |

Xóa khỏi Sổ: xem `docs/M5_OPERATIONS.md` §3.1 (SQL — UI chưa hỗ trợ xóa `tu_dong`).

---

## 3. Cách đối chiếu thẻ tổng hợp (Thu Hiền / Ops)

### Trên app

1. Tab **Sổ doanh thu** → chọn **Từ ngày / Đến ngày** (cùng một ngày nếu so theo ngày).
2. **Team:** chọn **Inhouse 1** nếu so với tab **GMV**; **Tất cả teams** nếu so với toàn bộ SM Hanoi + HCM REV đã import.
3. **Nguồn dòng:** **Tất cả** (hoặc loại **Tự động (M3)** nếu muốn bỏ đơn app test).
4. Đọc **SỐ ĐƠN** + **TỔNG GMV** trên thẻ — cùng logic với bảng bên dưới (`/revenue/ledger/summary`, lọc `pay_time`).

### Trên All File Thu Hiền

1. Tab **GMV** — cột **A** = ngày, **B** = số đơn, **C** = GMV (RMB). Ô **B1** = filter team (thường **In-house** / Inhouse 1).
2. **Không** dùng tab **HN Inhouse 1** để đếm đơn theo ngày — đó là pivot tháng × sale.
3. Đếm chi tiết: tab **SM Hanoi**, lọc cột **Pay Time (I)** + cột team **AH**.

### Script dev (một ngày)

```bash
# Sửa biến DAY trong file nếu cần ngày khác
python scripts/audit_day_20260525.py
```

Script in: GMV tab B, SM Hanoi all/inhouse1, Sổ tay/tu_dong, fingerprint diff, liệt kê non-Inhouse 1.

---

## 4. Đối chiếu file gốc DingTalk vs All File (re-seed)

Audit 25/05/2026 — khuyến nghị seed lịch sử từ **file DingTalk gốc**, không từ All File (mất phần lẻ GMV).

### SM Hanoi

| | Gốc | All File |
|---|-----|----------|
| File | `SM HANOI daily report.xlsx` → **INCOME** | Sheet **SM Hanoi** |
| Phạm vi neo | Dòng 2 → **13.943** | Cùng thứ tự dòng |
| Dòng VND > 0 | **13.908** | **13.908** |
| SUM GMV | **41.072.760,57** RMB | **41.072.299,60** RMB (−460,97) |
| Mapper seed mới | `map_sm_income_row` (`xlsx_ledger_import.py`) | `map_sm_hanoi_row` (cũ) |

Báo cáo đầy đủ: `E:\PalFish\DA\Report\ket-luan-doi-chieu-sm-hanoi-so-doanh-thu.md`  
Script: `scripts/audit_sm_hanoi_source_vs_allfile.py`

### HCM REV

| | Gốc | All File |
|---|-----|----------|
| File | `HCM Revenue statement.xlsx` → **REVENUE** | Sheet **HCM REV** |
| Phạm vi neo | Dòng 2 → **798** | **797** dòng tiền |
| SUM GMV | **1.674.951,13** RMB | **1.674.972,00** RMB (+20,87) |
| Layout cột | Trùng HCM REV | OK — không lệch +2 như SM |

Báo cáo: `E:\PalFish\DA\Report\ket-luan-doi-chieu-hcm-rev-so-doanh-thu.md`  
Script: `scripts/audit_hcm_rev_source_vs_allfile.py`

### Re-seed (chưa chạy prod)

Quy trình: `E:\PalFish\DA\Report\quy-trinh-seed-so-dingtalk.md` — tóm tắt trong `docs/M5_OPERATIONS.md` §2.3.

```bash
python scripts/seed_dingtalk_ledger.py --dry-run --confirm
# Sau backup Supabase:
python scripts/seed_dingtalk_ledger.py --purge-gsheet --confirm
```

Dry-run mẫu: **14.644** dòng, SUM GMV ≈ **42,46M** RMB.

---

## 5. Script đối chiếu khác

| Script | Mục đích |
|--------|----------|
| `audit_type_fixx_range.py` | Bucket Type fixx vs HNxHCM (range ngày) |
| `audit_gmv_tab_orders.py` | GMV tab daily vs SM Hanoi (Inhouse 1, tháng) |
| `audit_gmv_countifs.py` | Replica COUNTIFS ô B1 tab GMV |
| `audit_ledger_vs_gmv_tab.py` | Sổ vs GMV tab theo tháng |
| `audit_missing_sales.py` | 3 sale thiếu trên HN Inhouse 1 (BC01) |

---

## 6. Việc cần làm

| # | Việc | Trạng thái |
|---|------|------------|
| 1 | Xóa 2 dòng M3 test khỏi Sổ (SQL) | Chờ Ops |
| 2 | Re-seed DingTalk sau backup | Chờ approve |
| 3 | So thẻ Sổ vs GMV tab: **cùng team Inhouse 1** | Quy trình §3 |
| 4 | Backlog: API/UI xóa dòng `tu_dong` test | `TODO.md` M5-14 |
