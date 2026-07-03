# Cây nhân sự Sale (rút từ Metabase remaining-lesson-vn)

> File này tự sinh từ `_extract_hierarchy.cjs` để Minh giải thích cấu trúc team cho Kem.
> Nguồn: `remaining_lesson__vn__2026-07-03T20_08_45.04516+08_00.xlsx` (cột `Sale` + `depart6/7/8` lần xuất hiện thứ 2).

## Quy tắc phân team (theo PDF Thu Hiền, ngày 21/05)

1. **Tên định danh** = cột `Sale` (tên trên CRM — đảm bảo độc nhất theo quy định tổng bộ).
2. **Team chính** = `depart7_name`.
3. Nếu `depart7_name` rỗng → check `depart6_name`. Nếu là `Online/ONLINE` thì gán team = **HCM (Online)**; còn lại lấy luôn `depart6_name` (vd. "HN Inhouse", "HN Offline Store", "Group KL", "Marketing", "Sales").
4. **Sub-team** = `depart8_name`. Hiện tại chỉ team **Inhouse 1** (HN) đủ lớn để có sub-team (`Team 1..5`, `Sales`).

## Tổng quan

- Tổng số sale phân loại được: **153**
- Tổng số team cấp 1: **15**

| # | Team | Số sale | Tổng order 2 năm |
|---|------|---------|------------------|
| 1 | Inhouse 1 | 59 | 14,252 |
| 2 | Inhouse 2 | 24 | 1,172 |
| 3 | HCM (Online) | 16 | 718 |
| 4 | Linh Dam Store | 13 | 419 |
| 5 | Khác / Chưa phân loại | 17 | 346 |
| 6 | HN Offline Store | 1 | 119 |
| 7 | An Binh Store | 3 | 64 |
| 8 | Team 1 | 6 | 45 |
| 9 | HN Inhouse | 2 | 37 |
| 10 | Group KL | 5 | 32 |
| 11 | Marketing | 1 | 5 |
| 12 | Tele sale | 2 | 5 |
| 13 | Team 2 | 1 | 3 |
| 14 | P'AU Group | 2 | 3 |
| 15 | P'TEE Group | 1 | 1 |

## Chi tiết theo team

### Inhouse 1  _(59 sale, 14,252 order)_

- _(không có sub-team)_ — 2 sale
  - Dao Thi Trang `(1251 order)`
  - Pham Minh Thuy `(1 order)`
- **Sub-team: Sales** — 11 sale
  - Le To Hai My `(769 order)`
  - Ho Thi Thanh `(699 order)`
  - Bui Thi Thai Duong `(529 order)`
  - Kieu Thi Thu Quynh `(469 order)`
  - Nguyen Ngoc Bao Trang `(9 order)`
  - Tran Thi Thaoo `(8 order)`
  - Nguyen Ngoc Bao Tram `(7 order)`
  - Nina `(6 order)`
  - Tran Thi Thu Hang `(6 order)`
  - Nguyen Thi Ngoc Duyen `(3 order)`
  - Nguyen Linh Chi `(1 order)`
- **Sub-team: Team 1** — 16 sale
  - Le Kim Chi `(1186 order)`
  - Nguyen Kieu Trang `(904 order)`
  - Nguyen Thuy Trang `(590 order)`
  - Le Thuy Nhung `(436 order)`
  - Nguyen Thi Thao Ngoc `(365 order)`
  - Do Thi Tuyet Nhung `(230 order)`
  - Phan Thi Huong `(217 order)`
  - Vu Thi Tuyet Trinh `(209 order)`
  - Nguyen Thao Anh `(58 order)`
  - Team 1 admin `(23 order)`
  - Nguyen Nhat Vy `(20 order)`
  - Do Thi Hong Nhung `(4 order)`
  - Tran Thi Thu Huong `(1 order)`
  - Le Thi Thuy Trinh `(1 order)`
  - Nguyen Thi Hien `(1 order)`
  - Le Thi Thanh Tam `(1 order)`
- **Sub-team: Team 2** — 8 sale
  - Tran Thi Son `(1341 order)`
  - Le Thi Thu Yen `(213 order)`
  - Nguyen Nhu Ngoc `(145 order)`
  - Luu Thi Hoang Ngan `(134 order)`
  - Bui Lam Linh `(92 order)`
  - Nguyen Thi Nhung `(3 order)`
  - Le Thi Thanh Hien `(3 order)`
  - Dang Thu Trang `(1 order)`
- **Sub-team: Team 3** — 10 sale
  - Ta Thuy Van `(865 order)`
  - Pham Thi Thao `(345 order)`
  - Nguyen Phuong Thuy `(162 order)`
  - Dang Kim Thuong `(142 order)`
  - Nguyen Thi Hang Nga `(124 order)`
  - Nguyen Thi Huong `(9 order)`
  - Dao Phuong Thao `(7 order)`
  - Do Tran Phuong Anh `(2 order)`
  - Do Thi Hang `(2 order)`
  - Dang Huyen Trang `(1 order)`
- **Sub-team: Team 4** — 5 sale
  - Bui Thi Hong Van `(612 order)`
  - Le Thi Tuyet `(388 order)`
  - Le Thi Thuy Trang `(217 order)`
  - Trinh Thi Hoa `(5 order)`
  - Dao Ngoc Lan Anh `(3 order)`
- **Sub-team: Team 5** — 7 sale
  - Le Thi Lan Anh `(913 order)`
  - Nguyen Thi Phuong `(311 order)`
  - Cao Thi Lua `(59 order)`
  - Nguyen Cam Tu `(59 order)`
  - Pham Thi Tam Thuy `(52 order)`
  - Dao My Nhat Huyen `(30 order)`
  - Nguyen Thi My Linh `(8 order)`

### Inhouse 2  _(24 sale, 1,172 order)_

- _(không có sub-team)_ — 24 sale
  - Le Thi Thuy Van `(176 order)`
  - Le Hung Cuong `(135 order)`
  - Vu Thi Khanh Huyen `(113 order)`
  - Nguyen Thi Trang `(107 order)`
  - Vu Cam Ly `(106 order)`
  - Kieu Lan Anh `(105 order)`
  - Vu Ho Thanh Huong `(100 order)`
  - Mai Thi Lien `(88 order)`
  - Nguyen Thi Hai Yen `(67 order)`
  - Nguyen Thi Thu Huyen `(61 order)`
  - Ta Thi Thu Phuong `(35 order)`
  - Bui Thi Nga `(30 order)`
  - Truong Thi Thu Cham `(13 order)`
  - Dinh Ngoc Hai `(10 order)`
  - Le Thi Tram `(8 order)`
  - Nguyen Phuong Thao `(4 order)`
  - Le Thuy Quynh `(4 order)`
  - Hoang Thi Hong Tham 1 `(2 order)`
  - To Thi Ha `(2 order)`
  - Bui Thi Hong Nhung `(2 order)`
  - Nguyen Thi Thuy Trang `(1 order)`
  - Pham Thi Ngoc Linh `(1 order)`
  - Nguyen Thi Hoai Linh `(1 order)`
  - Nguyen Ha Giang `(1 order)`

### HCM (Online)  _(16 sale, 718 order)_

- _(không có sub-team)_ — 16 sale
  - Lai Ngoc Thuy Linh `(261 order)`
  - Nguyen Minh Phat `(221 order)`
  - Le Minh Thanh `(146 order)`
  - Hau `(27 order)`
  - Phuong Thao Nhi `(14 order)`
  - Tran Vo Minh Thu `(13 order)`
  - Vo Thu Huong `(11 order)`
  - Tran Ngoc Thuy Linh `(10 order)`
  - Nguyen Thuy Huyen Chieu `(6 order)`
  - Nguyen Duy Thinh `(2 order)`
  - Chang Thi Thanh Binh `(2 order)`
  - Nguyen Le Thanh Huyen `(1 order)`
  - Nguyen Nhung Nhu Ngoc `(1 order)`
  - Le Vo Anh Thu `(1 order)`
  - Dang Thi Kim Tuyen `(1 order)`
  - Nguyen Minh Hieu `(1 order)`

### Linh Dam Store  _(13 sale, 419 order)_

- _(không có sub-team)_ — 13 sale
  - Hoang Thi Hong Tham `(238 order)`
  - Vo Thi Thom `(59 order)`
  - Phan Viet Khanh `(33 order)`
  - Pham Minh Anh `(25 order)`
  - Nguyen Thi Lan `(16 order)`
  - Tran Thi Anh Tuyet `(16 order)`
  - Cu Thi Thu Hien `(10 order)`
  - Ngo Thi Thuy Linh `(9 order)`
  - Nguyen Thi Ngoc Anh `(5 order)`
  - Hoang To Uyen `(4 order)`
  - Vu Quynh Nga `(2 order)`
  - Le Quang Tung `(1 order)`
  - Le Thanh Phuong `(1 order)`

### Khác / Chưa phân loại  _(17 sale, 346 order)_

- _(không có sub-team)_ — 17 sale
  - Le Thi Thanh Thuy `(193 order)`
  - Nguyen Hong Nhu `(37 order)`
  - Dao Thi Hoang Yen `(22 order)`
  - Nguyen Thi Kim Duyen `(17 order)`
  - Vo Tran Anh Thuy `(17 order)`
  - Josh `(13 order)`
  - Dinh Luong Nhu Ngoc `(13 order)`
  - 彭胜君 `(9 order)`
  - Nguyen Thi Suong Mai `(9 order)`
  - Nguyen Thuy Linh 1 `(6 order)`
  - Tran `(4 order)`
  - Tran Hieu Thao `(1 order)`
  - Dang Thi Kim Ngan `(1 order)`
  - KThuyen `(1 order)`
  - 文秀莺 `(1 order)`
  - Dang Thi Thanh Thuy `(1 order)`
  - 朱振博 `(1 order)`

### HN Offline Store  _(1 sale, 119 order)_

- _(không có sub-team)_ — 1 sale
  - Pham Thuy Linh `(119 order)`

### An Binh Store  _(3 sale, 64 order)_

- _(không có sub-team)_ — 3 sale
  - Vu Thuy Huong `(56 order)`
  - Bui Thi Anh `(6 order)`
  - Nguyen Thu Phuong `(2 order)`

### Team 1  _(6 sale, 45 order)_

- _(không có sub-team)_ — 6 sale
  - Bui Thi Men `(24 order)`
  - Ngo Thi Bich Ngoc `(8 order)`
  - Huynh Minh Giang `(8 order)`
  - Nguyen Thi Thuy Hieu `(3 order)`
  - Nguyen Thi Hong `(1 order)`
  - Nguyen Thi Thu Ha `(1 order)`

### HN Inhouse  _(2 sale, 37 order)_

- _(không có sub-team)_ — 2 sale
  - Ruby Advisor `(35 order)`
  - Ellie Advisor `(2 order)`

### Group KL  _(5 sale, 32 order)_

- _(không có sub-team)_ — 5 sale
  - Nguyen Thi Minh Phuong `(10 order)`
  - Nguyen Thi Phuong Linh `(9 order)`
  - Vu Thi Thu Thuy `(7 order)`
  - Tran Thi Thanh Van `(4 order)`
  - Tran Thi Thuy Trang `(2 order)`

### Marketing  _(1 sale, 5 order)_

- _(không có sub-team)_ — 1 sale
  - Vuong Phuong Anh `(5 order)`

### Tele sale  _(2 sale, 5 order)_

- **Sub-team: Area 2** — 1 sale
  - Sirirak.Grace `(3 order)`
- **Sub-team: Team Au** — 1 sale
  - Saowaluk.Smile `(2 order)`

### Team 2  _(1 sale, 3 order)_

- _(không có sub-team)_ — 1 sale
  - Huynh Thi Nhu Hang `(3 order)`

### P'AU Group  _(2 sale, 3 order)_

- **Sub-team: Team Aon** — 1 sale
  - Peerawas.P `(1 order)`
- **Sub-team: Team Lookkaew** — 1 sale
  - Jittralai.Puii `(2 order)`

### P'TEE Group  _(1 sale, 1 order)_

- **Sub-team: Team James** — 1 sale
  - Thanakorn.Wan `(1 order)`
