# Module 5 — Sổ doanh thu & Sales Performance

> **Trạng thái:** MVP live prod (2026-05-23). UI Sổ: modal + bảng read-only + **thẻ tổng hợp Type fixx** (feedback Hiếu 2026-05-23).  
> **Người dùng:** Thu Hiền + System (`OPS_EMAILS`).  
> **Tham chiếu:** [ALL File Thu Hiền](https://docs.google.com/spreadsheets/d/1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc/edit?gid=0#gid=0), `HNxHCM GMV.xlsx` (anh Hiếu).  
> **Vận hành seed/deploy:** `docs/M5_OPERATIONS.md`.

---

## 1. Hai tab trong app

| Tab | Tên menu | Vai trò | Ai sửa |
|-----|----------|---------|--------|
| **M5-A** | **Sổ doanh thu** | Sổ cái — 1 dòng = 1 khoản thu | Hiền/System: thêm, sửa (modal), xóa dòng tay |
| **M5-B** | **Sales Performance** | Pivot team × sale × tháng (GMV RMB) | **Chỉ xem** — tính từ Sổ |

Sửa số pivot → sửa dòng tương ứng ở **Sổ**, không sửa trực tiếp ô pivot.

**Nguồn lịch sử (2026-05):** Import một lần từ Google Sheet [All File Thu Hiền](https://docs.google.com/spreadsheets/d/1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc/edit) tab `SM Hanoi` + `HCM REV` — xem `docs/M5_GSHEET_IMPORT.md`. Sau go-live dữ liệu mới ghi trực tiếp trên Sổ (M3 + tay), không sync sheet.

---

## 2. Sổ doanh thu — một bảng, hai nguồn

Một tab, một bảng `so_doanh_thu`. M3 auto + điền tay chung — **Sales Performance** đọc hết.

### 2.1 Tự động (Module 3)

- M3 approve (đơn đã tiền về) → **tự thêm 1 dòng** (`loai_nhap = tu_dong`).
- Điền: ngày tiền về, khách, UID, gói, VND, RMB (VND÷3700), sale, team, mã đơn, CRM…
- **Chỉ hook approve mới** — đơn approve trước Module 5: chạy `scripts/seed_so_doanh_thu.py --backfill-m3` (`M5_OPERATIONS.md`).

### 2.2 Điền tay (Hiền)

- Nút **+ Thêm dòng** → modal form (giống popup QR Tab 2).
- Dùng khi: tiền mặt, CK không qua QR / không có M3.
- `loai_nhap = tay`. Có nút **Xóa** (chỉ dòng tay).

### 2.3 UI bảng (feedback Hiếu — 2026-05-23)

**Không** sửa trực tiếp trên ô bảng — tránh click nhầm.

| Thành phần | Hành vi |
|------------|---------|
| Bảng chính | **Read-only** — chỉ cột chính (map cột Excel HNxHCM GMV) |
| **+ Thêm dòng** | Mở modal — điền + **Thêm dòng** |
| **Chỉnh sửa** (mỗi dòng) | Cùng modal — **Lưu** (M3 lẫn tay đều sửa được) |
| **Xóa** | Chỉ dòng **TAY** |
| Scroll | Dọc trong khung bảng (`TableScrollWrap`) |

**Cột hiển thị bảng (chính):**

| Excel / Sheet | Field app |
|---------------|-----------|
| User Name | `ten_khach` |
| Phone | `sdt` |
| UID | `uid` |
| Pay Time | `ngay_tien_ve` |
| Real Pay (VND) | `so_tien_vnd` — separator `12.875.000` |
| Nội dung CK | `info_code` (join `don_hang` hoặc suy từ `ma_don_hang`) |
| ID đơn hàng | `crm_order_id` ưu tiên, fallback `ma_don_hang` |
| Payment method | `payment_method` |
| Type | pivot sau **Type fixx** (xem §2.5) — nhãn song ngữ |
| Sales | `sale_crm_name` |
| Team | `team` |

**Cột phụ** (Package, GMV RMB, Type 2 / `loai_2`, ghi chú, …): chỉ trong **modal** — Type 2 dùng cho kênh con khi `loai` = Quảng cáo.

Component: `LedgerFormModal.tsx`, `SoDoanhThuTab.tsx`, `LedgerSummaryCards.tsx`, `frontend/src/lib/typeFixx.ts`.

### 2.4 Thẻ tổng hợp + lọc ngày (feedback Hiếu — 2026-05-23)

**Mục đích:** Hiền đối chiếu GMV / số đơn theo ngày nhanh — khớp pivot sheet Hiếu.

| Thành phần | Hành vi |
|------------|---------|
| **Mặc định** | Từ ngày = Đến ngày = **hôm nay** (giờ VN) |
| **Hôm nay** | Set lại filter 1 ngày = today |
| **Reset bộ lọc** | Về mặc định (hôm nay + Nguồn dòng Tất cả) |
| **2 thẻ trên** | Tổng GMV (VND), Số đơn — theo filter |
| **5 thẻ nguồn** | Other, Kho chung, Ads, Renew, Refer — GMV + số đơn từng nhóm |

Thẻ và bảng cùng dataset đã lọc. Thẻ `0 đơn` hiển thị mờ.

**Lưu ý API:** Supabase/PostgREST giới hạn **1000 dòng/request**. Backend `/revenue/ledger` paginate hết kết quả trong khoảng lọc (`revenue_routes._fetch_so_doanh_thu`). Không lọc ngày trên DB lớn → vẫn tải đủ sau paginate (chậm hơn).

**Lọc ngày:** Sổ + BC01/BC02 lọc theo **`pay_time`** (Pay Time sheet Hiếu), không dùng `ngay_tien_ve`. Thẻ tổng hợp gọi `/revenue/ledger/summary` — cùng logic Type fixx với bảng.

### 2.5 Type fixx → pivot Type (sheet Hiếu — Trang tính5)

Đối chiếu chi tiết từng nguồn **không** group thẳng cột `loai` — phải qua **Type fixx** (cột C → D) rồi gom **5 cột pivot**.

**Bước 1 — Type gốc**

- Thường lấy `loai`.
- Nếu sau fixx bước đầu = Quảng cáo (`广告`) **và** có `loai_2` → lấy `loai_2` làm gốc **chỉ khi** `loai_2` thuộc tập cột riêng: **KOC, Lives, Livestream, Offline, Booth, KFT, KET**.
- Subchannel khác dưới `广告` (vd. `转介绍`, `Refer`, `公海`, `GD`, `Partnership`, `FB`, `PNS`…) **giữ `loai`** → gom **Quảng cáo** (khớp pivot sheet Hiếu / tab GMV).

**Bước 2 — Map Type fixx (C → D)**

| Type gốc (C) | Type fixx (D) |
|--------------|---------------|
| 广告, PNS, Bán mới, Partnership, FB | 广告 |
| 转介绍, Refer, Khách giới thiệu | 转介绍 |
| 续费, Resell, Gia hạn | 续费 |
| 公海, GD, Kho chung | 公海 |
| KOC | KOC |
| Lives, Livestream | Lives |
| Offline, Booth | Offline |
| Other, KFT, KET, Nguồn khác | Other |

*(Bảng đầy đủ trong code: `frontend/src/lib/typeFixx.ts`.)*

**Bước 3 — Pivot 5 cột (đối chiếu ngày)**

| Type fixx | Pivot hiển thị thẻ |
|-----------|-------------------|
| KOC, Lives, Offline, 广告 | **Ads - 广告** |
| 公海 | **Kho chung - 公海** |
| 续费 | **Renew - 续费** |
| 转介绍 | **Refer - 转介绍** |
| Other | **Other** |

Nhãn tiếng Trung trên thẻ / cột Type: `English - 中文` (vd. `Kho chung - 公海`).

Code: `typeFixx.ts` → `ledgerSource.ts` → `LedgerSummaryCards.tsx`. Backend mirror: `revenue_routes._ledger_type_goc`.

**Đối chiếu đã verify (2026-05-24):** Range `22/05/2025`–`22/05/2026` — 7.522 đơn, tổng GMV + từng bucket Type fixx khớp pivot `HNxHCM GMV.xlsx` (Hiếu). Script: `scripts/audit_type_fixx_range.py`.

### 2.6 BC01 / BC02 / BC03 (Báo cáo)

Sidebar **Báo cáo** → BC01 Sales Performance, **BC02 Key Data**, BC03 (placeholder). Cùng nguồn `so_doanh_thu`, lọc `pay_time`, logic Type fixx như §2.5.

| Báo cáo | Mô tả ngắn |
|---------|------------|
| BC01 | Pivot team × sale × tháng (GMV RMB) |
| BC02 | GMV theo ngày × loại nguồn (tab GMV sheet Hiếu); cột **Kho chung** (không dùng nhãn “Biển công cộng”); bảng scroll cố định viewport |
| BC03 | Tổng bộ ngày — backlog |

Code: `BC01SalesPerformance.tsx`, `BC02KeyDataReport.tsx`, `bc02TypeMap.ts`, `revenue_routes.py` (`/revenue/pivot/*`).

### 2.7 Quyền

| Ai | Quyền |
|----|--------|
| Thu Hiền + System | Xem Sổ, thêm, sửa mọi dòng, xóa dòng tay |
| Sale / Leader / Manager | Không thấy tab |

Nhóm quyền = tick tiền về Tab 2 (`OPS_EMAILS` / role `system`).

---

## 3. Quy tắc đã chốt

### 3.1 Map tên team (Sheet / Excel ↔ app)

| Hiển thị pivot / Sheet cũ | Team trong app (`nhan_su_sale.team`) |
|---------------------------|--------------------------------------|
| HN inhouse | **Inhouse 1** |
| HN inhouse 2 | **Inhouse 2** |
| HCM team (file Hiếu) | **HCM (Online)** |

Các team khác (Offline Store, Telesales, …): giữ tên app; thêm map khi Hiền/Hiếu yêu cầu.

### 3.2 Tỷ giá VND → RMB (`gmv_rmb`)

- **Mặc định:** `gmv_rmb = round(so_tien_vnd / 3700)` (1 RMB = 3.700 VND).
- **Phase 2:** Cấu hình tỷ giá theo thời điểm (M5-07).
- Hiền/System sửa `gmv_rmb` trong modal nếu cần.

### 3.3 Tháng pivot (Sales Performance)

- Lấy từ **ngày tiền về** (`ngay_tien_ve`).
- Format **`YYYY/M`** (vd. `2025/6`) — khớp Sheet mẫu.
- Không dùng ngày tạo đơn hay ngày M3 approve.

---

## 4. Tab Sales Performance — cách tính

```
Với mỗi dòng Sổ (trong khoảng lọc):
  thang = format(ngay_tien_ve, 'YYYY/M')
  nhom  = map_team(team_sale)
  cong  += gmv_rmb vào ô [nhom, sale, thang]
```

Layout: Team | Sale | các tháng | Tổng GMV. Lọc từ/tháng. Xuất Excel → M5-05 (backlog).

---

## 5. Quyền (tóm tắt)

| Tab | Thu Hiền + System | Sale / Leader / Manager |
|-----|-------------------|-------------------------|
| **Sổ doanh thu** | Xem, thêm, sửa (modal), xóa tay | Không thấy |
| **Sales Performance** | Chỉ xem | Không thấy |

---

## 6. Giai đoạn triển khai

| ID | Việc | Trạng thái |
|----|------|------------|
| M5-01 | SQL `so_doanh_thu` + audit (v7) | done |
| M5-02 | API Sổ + hook M3 + DELETE tay | done |
| M5-03 | FE Sổ — modal + bảng read-only | done |
| M5-04 | FE Sales Performance (pivot) | done |
| M5-08 | UI Hiếu: cột chính, modal, scroll, VND sep | done |
| M5-10 | Thẻ tổng hợp + Type fixx + lọc mặc định hôm nay | done |
| M5-11 | Type fixx: `广告` + `loai_2` rollup + lọc `pay_time` + BC02 | done |
| M5-05 | Xuất Excel Sổ + pivot | pending |
| M5-06 | Import `HNxHCM GMV.xlsx` (script sẵn) | pending |
| M5-07 | Tỷ giá theo thời điểm | pending |

**MVP:** M5-01 → M5-04 + M5-08. Seed/cleanup: `scripts/seed_so_doanh_thu.py`, `scripts/cleanup_so_doanh_thu.py`.

---

## 7. Backlog

- Import Excel (M5-06) — chạy thủ công, xem `M5_OPERATIONS.md`.
- Tỷ giá động (M5-07).
- Xuất Excel (M5-05).

---

## 8. Liên kết

- Task: `docs/TODO.md`
- Vận hành: `docs/M5_OPERATIONS.md`
- File mẫu: `e:\PalFish\DA\HNxHCM GMV.xlsx`
- Hook M3: `backend/invoice_routes.py`, `backend/revenue_routes.py`
