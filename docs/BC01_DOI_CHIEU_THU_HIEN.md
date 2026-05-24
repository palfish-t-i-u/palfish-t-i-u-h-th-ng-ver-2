# Báo cáo đối chiếu BC01 — Inhouse 1 vs All File Thu Hiền

**Khoảng ngày đối chiếu:** **01/01/2025 – 24/05/2026** 
**Phạm vi:** BC01 Sales Performance, team **Inhouse 1**

---

## 1. Tóm tắt kết luận

| Nguồn | Vai trò | Kết quả đối chiếu |
|-------|---------|-------------------|
| **Sổ doanh thu (app)** | Sổ cái — nguồn chính thức | ✅ Thẻ tổng hợp đúng |
| **BC01 (app)** | Pivot data từ Sổ doanh thu để check GMV của sale trong từng team theo tháng| ✅ Khớp Sổ doanh thu |
| **HNxHCM GMV.xlsx** | File gốc seed Sổ (anh Hiếu) | ✅ Khớp Sổ / BC01 |
| **All File Thu Hiền** — tab `HN Inhouse 1` | Pivot GMV của từng sale theo tháng từ tab SM Hanoi | ⚠️ **GMV Thấp hơn** trên Sổ ở một số tháng — thiếu dòng sale, không phải thiếu các đơn lẻ |

**Kết luận:** BC01 **không tính sai** so với Sổ và file gốc HNxHCM. Chênh lệch so với tab HN Inhouse 1 (All File Thu Hiền) do **sheet chưa có (hoặc chưa cập nhật) dòng GMV của 3 sale**.

> **Lưu ý về file xlsx tải về:** Đối chiếu bằn bản `All File Thu Hiền.xlsx` tải về local, khi mở file có thông báo *recovery data* → file có thể hỏng/thiếu. **Nên xác nhận lại bằng bản trên Google Sheet**: https://docs.google.com/spreadsheets/d/1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc/edit?gid=1446649723#gid=1446649723.

---

## 2. Nguồn dữ liệu đã dùng

| # | Nguồn | Ghi chú |
|---|--------|---------|
| 1 | Supabase `so_doanh_thu` (Sổ doanh thu prod) | Lọc `pay_time`, đã check trùng |
| 2 | `e:\PalFish\DA\HNxHCM GMV.xlsx` — sheet `HNxHCM` | File gốc anh Hiếu |
| 3 | `e:\PalFish\DA\All File Thu Hiền.xlsx` — tab `HN Inhouse 1` | Bản tải về (có thể corrupt) |
| 4 | Google Sheet [All File Thu Hiền](https://docs.google.com/spreadsheets/d/1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc/edit) | **nên dùng bản này để xác nhận cuối** |

**Logic BC01 (app):**

- Lọc khoảng ngày: `pay_time` (Pay Time — khớp sheet HNxHCM của anh Hiếu và Sổ doanh thu)
- Gom cột tháng: `ngay_tien_ve` (ngày tiền về — MODULE_SO_DOANH_THU)
- GMV: `gmv_rmb` (= VND ÷ 3700)

---

## 3. Check Tổng GMV theo tháng — Inhouse 1

| Tháng | Sổ / BC01 / HNxHCM | All File Thu Hiền (xlsx) | Chênh (Sổ − Sheet) | Ghi chú |
|-------|-------------------:|-------------------------:|-------------------:|---------|
| 2025/1 | **714.594** | 621.339 | **+93.255** | Thiếu 2 sale trên tab HN Inhouse 1 |
| 2026/1 | **1.643.330** | 1.609.210 | **+34.120** | Thiếu 1 sale trên HN Inhouse 1 |
| 2026/4 | **1.815.778** | 1.815.778 | **0** | Khớp hoàn toàn |

Tổng GMV app (filter Inhouse 1, 01/01/2025–24/05/2026): **21.767.631 RMB** — khớp tổng Sổ.

---

## 4. Giải thích chênh lệch — 3 sale (không phải 3 đơn)

Chênh lệch đến từ **các dòng ghi chép đơn của 3 sale bị liệt kê thiếu** trên tab `HN Inhouse 1`, trong khi **toàn bộ đơn của họ có trong Sổ và HNxHCM**.

| Sale | Tháng | GMV trên Sổ | Số đơn | Có trên Sổ? | Có trên HNxHCM? | Có dòng trên All File (xlsx)? |
|------|-------|------------:|-------:|:-----------:|:---------------:|:------------------------------:|
| **Cu Thi Thu Hien** | 2025/1 | 69.551 | 18 | ✅ | ✅ | ❌ |
| **Hoang Thi Hong Tham** | 2025/1 | 23.704 | 8 | ✅ | ✅ | ❌ |
| **Nguyen Nhat Vy** | 2026/1 | 34.120 | 9 | ✅ | ✅ | ❌ |

**Giải thích số tiền chênh giữa số trên Sổ doanh thu và trên HN Inhouse 1 (All File Thu Hiền):**

- 2025/1: 69.551 + 23.704 = **93.255**
khoản chênh giữa Sổ - Sheet = 714.594 − 621.339 = 93.255
- 2026/1: **34.120**
khoản chênh giữa Sổ - Sheet = 1.643.330 − 1.609.210 = 34.120
---

## 5. Chi tiết đơn — SDT & UID (để anh Hiếu có thể tự verify)

### 5.1 Cu Thi Thu Hien — 2025/1 (18 đơn, 69.551 RMB)

| Pay time | GMV (RMB) | SDT | UID | Khách |
|----------|----------:|-----|-----|-------|
| 2025-01-01 | 1.254 | 84-835788125 | 3263592824 | Đu đủ |
| 2025-01-03 | 12.700 | 84-975600758 | 3277213042 | Hà Phương |
| 2025-01-07 | 2.386 | 84-987222521 | 3248843811 | Cindy |
| 2025-01-07 | 2.386 | 84-356991668 | 3249554706 | Candy |
| 2025-01-10 | 2.737 | 81-8042136886 | 3203962095 | Haruka |
| 2025-01-11 | 2.477 | 84-903414142 | 3270167508 | Leo |
| 2025-01-16 | 2.429 | 81-7043816321 | 3251658324 | Hiền My |
| 2025-01-17 | 2.752 | 84-937453542 | 3284365074 | Minh Khôi |
| 2025-01-18 | 4.594 | 81-8088100574 | 3271567376 | Hải Đăng |
| 2025-01-21 | 2.540 | 84-909106066 | 3277145580 | Ruby |
| 2025-01-22 | 2.737 | 81-8044478080 | 3284390852 | Phi Long |
| 2025-01-24 | 5.377 | 81-7031111701 | 3284753942 | Thành Phong |
| 2025-01-24 | 4.557 | 84-942873717 | 3277048455 | Hana |
| 2025-01-24 | 4.557 | 84-917342320 | 3277340348 | Thanh Quân |
| 2025-01-27 | 4.543 | 81-8025034496 | 3229062689 | Quang Nhật |
| 2025-01-27 | 4.400 | 84-973413908 | 3236743323 | An Nhiên |
| 2025-01-28 | 4.806 | 81-9064838686 | 3259467950 | Aoki Koichi |
| 2025-01-28 | 2.319 | 84-934561446 | 3276085489 | Uyên |

### 5.2 Hoang Thi Hong Tham — 2025/1 (8 đơn, 23.704 RMB)

| Pay time | GMV (RMB) | SDT | UID | Khách |
|----------|----------:|-----|-----|-------|
| 2025-01-13 | 2.514 | 84-982383165 | 3282170618 | Minh Nhật |
| 2025-01-20 | 4.543 | 84-357270192 | 3277643002 | An Khang |
| 2025-01-23 | 1.240 | 84-977906211 | 3283731348 | Anh Thy |
| 2025-01-24 | 2.347 | 84-947456012 | 3131938227 | Bảo Châu |
| 2025-01-25 | 4.825 | 84-903725087 | 3273916241 | Minh Khang |
| 2025-01-26 | 4.949 | 84-943358388 | 3272890138 | Hồng Đăng |
| 2025-01-31 | 2.143 | 82-1033197338 | 3279902256 | Minseo |
| 2025-01-31 | 1.143 | 82-1033197338 | 3279902256 | Minseo |

### 5.3 Nguyen Nhat Vy — 2026/1 (9 đơn, 34.120 RMB)

| Pay time | GMV (RMB) | SDT | UID | Khách |
|----------|----------:|-----|-----|-------|
| 2026-01-12 | 2.880 | 49-1727095673 | 3304325314 | Trà My |
| 2026-01-16 | 1.263 | 84-933109192 | 3303966403 | Lộc |
| 2026-01-19 | 5.091 | 81-9098191489 | 3305002816 | Nhật Minh |
| 2026-01-19 | 1.429 | 49-15906418921 | 3304344736 | Emily |
| 2026-01-22 | 2.880 | 81-7044111220 | 3305201206 | Gia Đức |
| 2026-01-23 | 2.880 | 84-938149030 | 3305224218 | Phương Anh |
| 2026-01-26 | 5.091 | 49-17656508156 | 3305295273 | Annett Trần |
| 2026-01-28 | 5.377 | 81-8097089410 | 3305458177 | Khang |
| 2026-01-31 | 7.229 | 49-15223156789 | 3305449507 | Louis |

---

## 6. Cách tự kiểm tra lại

### Trên app

1. Vào **BC01**
2. Tạo filter khớp với các đợt kiểm tra: 1/1/2025 - 31/1/2025; 1/1/2026 - 31/1/2026
3. Chọn team Inhouse 1
4. Xem tổng GMV (RMB), sẽ bằng 21.767.631

### Trên Google Sheet (All File Thu Hiền)

1. Mở tab **`HN Inhouse 1`**
2. Tìm 3 tên sale: *Cu Thi Thu Hien*, *Hoang Thi Hong Tham*, *Nguyen Nhat Vy*
3. Nếu **không có các dòng được liệt kê trên** → bảng điền thiếu dữ liệu/dữ liệu bị ẩn/tên sale bị điền sai
4. Nếu **có dòng được liệt kê** và doanh thu khớp trên Sổ (app) → chênh trước đó do file xlsx tải về bị lỗi

### Trên HNxHCM GMV

1. Tab **`HNxHCM`**, tạo bộ lọc trên các cột **Sales** + **Pay Time**
2. Lần thứ nhất: Lọc ra Pay Time là tháng 1/2025, lần lượt tìm 2 Sales là *Cu Thi Thu Hien*, *Hoang Thi Hong Tham*. Kiểm tra cột tổng GMV trên app so với cột GMV (RMB) trên tab HNxHCM. Cu Thi Thu Hien = 69,551; Hoang Thi Hong Tham = 23,704
3. Lần thứ hai: Lọc ra Pay Time là tháng 1/2026, tìm Sales Nguyen Nhat Vy. Kiểm tra cột tổng GMV trên app so với cột GMV (RMB) trên tab HNxHCM GMV. Số trên Sổ doanh thu = HNxHCM = 34,120 RMB

### Script chạy để tự check (dev)

```bash
python scripts/audit_missing_sales.py
```

---

## 7. Việc cần làm

| # | Việc |
|---|------|
| 1 | Xác nhận trên **Google Sheet live** (không dùng file excel tải về)
| 2 | Nếu thiếu 3 sale → tab `HN Inhouse 1` trên All File Thu Hiền tính thiếu, số liệu ở Sổ hoặc HNxHCM đã đúng
| 3 | Không cần sửa logic BC01 nếu Sổ đã đúng


