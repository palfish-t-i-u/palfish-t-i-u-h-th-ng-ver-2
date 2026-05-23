# Module 5 — Sổ doanh thu & Sales Performance

> **Trạng thái:** MVP live prod (2026-05-23). UI Sổ refactor theo feedback Hiếu (modal + bảng read-only).  
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
| Payment method | `payment_method` |
| Type | `loai` |
| Sales | `sale_crm_name` |
| Team | `team` |

**Cột phụ** (Package, GMV RMB, Type 2, ghi chú, …): chỉ trong **modal** — không hiện bảng chính.

Component: `LedgerFormModal.tsx`, `SoDoanhThuTab.tsx`.

### 2.4 Quyền

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
