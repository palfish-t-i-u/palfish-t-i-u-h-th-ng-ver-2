# Module 5 — Sổ doanh thu & Doanh thu Sale

> **Trạng thái:** Spec đã chốt nghiệp vụ (2026-05-23). Chưa code.  
> **Người dùng chính:** Thu Hiền (+ cấp System).  
> **Tham chiếu:** Sheet [ALL File Thu Hiền](https://docs.google.com/spreadsheets/d/1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc/edit?gid=0#gid=0), file ghép `HNxHCM GMV.xlsx` (anh Hiếu).

---

## 1. Hai tab trong app

| Tab | Tên menu | Vai trò | Ai sửa |
|-----|----------|---------|--------|
| **M5-A** | **Sổ doanh thu** | Sổ cái — mỗi dòng = 1 khoản thu | Thu Hiền + System: thêm dòng, sửa ô |
| **M5-B** | **Doanh thu Sale** | Bảng tổng team × sale × tháng (pivot) | **Chỉ xem** — số tính tự động từ Sổ |

Sửa số trên pivot → sửa dòng tương ứng ở **Sổ doanh thu**, không sửa trực tiếp ô pivot.

---

## 2. Sổ doanh thu — một bảng, hai cách nhập **cùng lúc**

Chỉ **một** tab **Sổ doanh thu**, **một** bảng dữ liệu. Mọi dòng (tự động hay tay) nằm chung — tab **Doanh thu Sale** đọc hết bảng này để cộng pivot.

### Cách 1 — Tự động (Module 3)

- Khi Thu Hiền **xác nhận / xuất** ở Module 3 (đơn đã tiền về) → app **tự thêm 1 dòng** vào Sổ.
- Điền sẵn: ngày tiền về, khách, UID, gói, tiền VND, RMB (VND÷3700), sale, team, mã đơn app, mã CRM…
- Cột phân loại: `loai_nhap = tu_dong` (để biết dòng từ app, không phải Hiền gõ từ đầu).

### Cách 2 — Thu Hiền điền tay

- Nút **«Thêm dòng mới»** trên cùng tab Sổ.
- Dùng khi: tiền mặt, chuyển khoản **không** qua mã QR / không có trong Module 3.
- Hiền (hoặc System) **tự gõ từng ô** giống một dòng trên file `HNxHCM GMV.xlsx`.
- Cột phân loại: `loai_nhap = tay`.

### Quyền trên tab Sổ (quan trọng)

| Ai | Quyền |
|----|--------|
| **Thu Hiền + System** | Xem Sổ, **thêm dòng mới**, **sửa bất kỳ ô** trên **mọi dòng** (tự động lẫn tay) |
| Sale / Leader / Manager | **Không** thấy tab Sổ |

Hai cách nhập **không** tách tab, **không** tách quyền. Chỉ khác **dòng sinh ra thế nào** — app đẩy từ M3 hay Hiền bấm thêm.

Cột Sổ căn file `HNxHCM GMV.xlsx`: ngày tiền về, khách, UID, gói, VND, GMV (RMB), sale, team, ghi chú, …

---

## 3. Quy tắc đã chốt

### 3.1 Map tên team (Sheet / Excel ↔ app)

| Hiển thị pivot / Sheet cũ | Team trong app (`nhan_su_sale.team`) |
|---------------------------|--------------------------------------|
| HN inhouse | **Inhouse 1** |
| HN inhouse 2 | **Inhouse 2** |
| HCM team (file Hiếu) | **HCM (Online)** |

Các team khác (Offline Store, Telesales, …): giữ tên app; thêm dòng map khi Hiền/Hiếu yêu cầu.

### 3.2 Tỷ giá VND → RMB (`gmv_rmb`)

- **Mặc định:** `gmv_rmb = round(so_tien_vnd / 3700)` (1 RMB = 3.700 VND).
- **Phase 2:** Một ô / cấu hình «Tỷ giá» trên tab Sổ (hoặc Settings System) để đổi theo thời điểm; lưu `ty_gia_vnd_rmb` + `ty_gia_ap_dung_tu` (ngày).
- Hiền/System có thể sửa `gmv_rmb` trực tiếp trên bất kỳ dòng nào nếu cần.

### 3.3 Tháng trên bảng pivot (Doanh thu Sale)

- Lấy từ **ngày tiền về** (`ngay_tien_ve` / `bank day` / `Month of payment` trong file gốc).
- Cột tháng format **`YYYY/M`** (vd. `2025/6`, `2026/5`) — khớp Sheet mẫu.
- Không dùng ngày tạo đơn hay ngày xác nhận Module 3 cho pivot.

---

## 4. Tab Doanh thu Sale — cách tính

```
Với mỗi dòng Sổ (trong khoảng lọc):
  thang = format(ngay_tien_ve, 'YYYY/M')
  nhom  = map_team(team_sale)   // vd. Inhouse 1 → "HN inhouse"
  cong  += gmv_rmb vào ô [nhom, sale, thang]
```

**Layout (giống ảnh Sheet):**

- Hàng 1: header — Team | Sale | các tháng | Tổng GMV
- Hàng 2 (tùy team): **Tổng** cột theo tháng
- Các hàng: từng sale thuộc team
- Cột cuối: tổng ngang từng sale
- Lọc: khu vực (HN / HCM / tất cả), từ tháng → đến tháng
- Xuất Excel (layout pivot)

Phase 2: tô xanh ô theo ngưỡng (conditional format).

---

## 5. Quyền (tóm tắt)

| Tab | Thu Hiền + System | Sale / Leader / Manager |
|-----|-------------------|-------------------------|
| **Sổ doanh thu** | Xem, thêm dòng, sửa mọi ô | Không thấy |
| **Doanh thu Sale** | Chỉ xem (pivot tự tính) | Không thấy |

Nhóm quyền giống tick «tiền về» Tab quản lý đơn (`OPS_EMAILS` / role `system`).

---

## 6. Giai đoạn triển khai

| ID | Việc | Phụ thuộc |
|----|------|-----------|
| M5-01 | SQL bảng `so_doanh_thu` (+ audit sửa) | Spec §2–3 |
| M5-02 | API CRUD Sổ + hook M3 → tạo dòng tự động | M5-01 |
| M5-03 | FE tab **Sổ doanh thu** (bảng + thêm tay + lọc) | M5-02 |
| M5-04 | API + FE tab **Doanh thu Sale** (pivot) | M5-01 có data |
| M5-05 | Xuất Excel Sổ + pivot | M5-03, M5-04 |
| M5-06 | Import lịch sử `HNxHCM GMV.xlsx` | M5-01 |
| M5-07 | Cấu hình tỷ giá theo thời điểm | Sau MVP |

**MVP:** M5-01 → M5-04 (tỷ giá cố định 3700).

---

## 7. Backlog (không chặn MVP)

- Import lịch sử từ `HNxHCM GMV.xlsx` (M5-06).
- Ô điều chỉnh tỷ giá theo thời điểm (M5-07).

---

## 8. Liên kết

- Task board: `docs/TODO.md` (block Module 5)
- File mẫu ghép: `e:\PalFish\DA\HNxHCM GMV.xlsx` (ngoài repo)
- Module 3 (trigger tự động): `backend/invoice_routes.py`
