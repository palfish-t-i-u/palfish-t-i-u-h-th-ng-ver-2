# Cây nhân sự Sale (rút từ Metabase remaining-lesson-vn)

> File này tự sinh từ `_extract_hierarchy.cjs` để Minh giải thích cấu trúc team cho Kem.
> Nguồn: `ds gói học và tên sale.xlsx` (cột `Sale` + `depart6/7/8` lần xuất hiện thứ 2).

## Quy tắc phân team (theo PDF Thu Hiền, ngày 21/05)

1. **Tên định danh** = cột `Sale` (tên trên CRM — đảm bảo độc nhất theo quy định tổng bộ).
2. **Team chính** = `depart7_name`.
3. Nếu `depart7_name` rỗng → check `depart6_name`. Nếu là `Online/ONLINE` thì gán team = **HCM (Online)**; còn lại lấy luôn `depart6_name` (vd. "HN Inhouse", "HN Offline Store", "Group KL", "Marketing", "Sales").
4. **Sub-team** = `depart8_name`. Hiện tại chỉ team **Inhouse 1** (HN) đủ lớn để có sub-team (`Team 1..5`, `Sales`).

## Tổng quan

- Tổng số sale phân loại được: **149**
- Tổng số team cấp 1: **15**

| # | Team | Số sale | Tổng order 2 năm |
|---|------|---------|------------------|
| 1 | Inhouse 1 | 56 | 13,326 |
| 2 | Inhouse 2 | 23 | 967 |
| 3 | HCM (Online) | 15 | 668 |
| 4 | Linh Dam Store | 13 | 393 |
| 5 | Khác / Chưa phân loại | 17 | 376 |
| 6 | HN Offline Store | 1 | 119 |
| 7 | An Binh Store | 3 | 63 |
| 8 | Team 1 | 6 | 46 |
| 9 | HN Inhouse | 2 | 40 |
| 10 | Group KL | 5 | 32 |
| 11 | Marketing | 1 | 5 |
| 12 | Tele sale | 2 | 5 |
| 13 | Team 2 | 1 | 3 |
| 14 | P'AU Group | 3 | 3 |
| 15 | P'TEE Group | 1 | 1 |

## Chi tiết theo team

### Inhouse 1  _(56 sale, 13,326 order)_

- _(không có sub-team)_ — 2 sale
  - DAO THI TRANG `(1369 order)`
  - Pham Minh Thuy `(1 order)`
- **Sub-team: Sales** — 11 sale
  - Le To Hai My `(725 order)`
  - Ho Thi Thanh `(667 order)`
  - Bui Thi Thai Duong `(507 order)`
  - Kieu Thi Thu Quynh `(382 order)`
  - Nguyen Ngoc Bao Trang `(9 order)`
  - Tran Thi Thaoo `(8 order)`
  - Nguyen Ngoc Bao Tram `(7 order)`
  - Nina `(6 order)`
  - Tran Thi Thu Hang `(6 order)`
  - Nguyen Thi Ngoc Duyen `(3 order)`
  - Nguyen Linh Chi `(2 order)`
- **Sub-team: Team 1** — 16 sale
  - Le Kim Chi `(1045 order)`
  - Nguyen Kieu Trang `(860 order)`
  - Nguyen Thuy Trang `(576 order)`
  - Le Thuy Nhung `(414 order)`
  - Nguyen Thi Thao Ngoc `(336 order)`
  - Do Thi Tuyet Nhung `(219 order)`
  - Phan Thi Huong `(192 order)`
  - Vu Thi Tuyet Trinh `(186 order)`
  - Nguyen Nhat Vy `(88 order)`
  - Nguyen Thao Anh `(41 order)`
  - Team 1 admin `(23 order)`
  - Do Thi Hong Nhung `(4 order)`
  - Tran Thi Thu Huong `(1 order)`
  - Le Thi Thuy Trinh `(1 order)`
  - Nguyen Thi Hien `(1 order)`
  - Le Thi Thanh Tam `(1 order)`
- **Sub-team: Team 2** — 8 sale
  - Tran Thi Son `(1191 order)`
  - Le Thi Thu Yen `(238 order)`
  - Nguyen Nhu Ngoc `(126 order)`
  - Luu Thi Hoang Ngan `(113 order)`
  - Bui Lam Linh `(72 order)`
  - Nguyen Thi Nhung `(3 order)`
  - Le Thi Thanh Hien `(3 order)`
  - Dang Thu Trang `(1 order)`
- **Sub-team: Team 3** — 9 sale
  - Ta Thuy Van `(830 order)`
  - Pham Thi Thao `(310 order)`
  - Nguyen Phuong Thuy `(122 order)`
  - Nguyen Thi Hang Nga `(112 order)`
  - Dang Kim Thuong `(108 order)`
  - Nguyen Thi Huong `(9 order)`
  - Do Tran Phuong Anh `(2 order)`
  - Do Thi Hang `(2 order)`
  - Dang Huyen Trang `(1 order)`
- **Sub-team: Team 4** — 4 sale
  - Bui Thi Hong Van `(478 order)`
  - Le Thi Tuyet `(307 order)`
  - Le Thi Thuy Trang `(197 order)`
  - Dao Ngoc Lan Anh `(104 order)`
- **Sub-team: Team 5** — 6 sale
  - Le Thi Lan Anh `(745 order)`
  - Nguyen Thi Phuong `(312 order)`
  - Pham Thi Tam Thuy `(172 order)`
  - Nguyen Cam Tu `(40 order)`
  - Cao Thi Lua `(40 order)`
  - Nguyen Thi My Linh `(8 order)`

### Inhouse 2  _(23 sale, 967 order)_

- _(không có sub-team)_ — 23 sale
  - Le Thi Thuy Van `(146 order)`
  - Le Hung Cuong `(108 order)`
  - Vu Thi Khanh Huyen `(83 order)`
  - Vu Cam Ly `(82 order)`
  - Nguyen Thi Trang `(78 order)`
  - Kieu Lan Anh `(75 order)`
  - Vu Ho Thanh Huong `(66 order)`
  - Mai Thi Lien `(66 order)`
  - Bui Thi Nga `(60 order)`
  - To Thi Ha `(48 order)`
  - Nguyen Thi Hai Yen `(46 order)`
  - Nguyen Thi Thu Huyen `(45 order)`
  - Ta Thi Thu Phuong `(25 order)`
  - Le Thi Tram `(16 order)`
  - Pham Long Vu `(7 order)`
  - Nguyen Phuong Thao `(4 order)`
  - Le Thuy Quynh `(4 order)`
  - Hoang Thi Hong Tham 1 `(2 order)`
  - Bui Thi Hong Nhung `(2 order)`
  - Nguyen Thi Thuy Trang `(1 order)`
  - Pham Thi Ngoc Linh `(1 order)`
  - Nguyen Thi Hoai Linh `(1 order)`
  - Nguyen Ha Giang `(1 order)`

### HCM (Online)  _(15 sale, 668 order)_

- _(không có sub-team)_ — 15 sale
  - Le Minh Thanh `(242 order)`
  - Lai Ngoc Thuy Linh `(184 order)`
  - Nguyen Minh Phat `(149 order)`
  - Hau `(27 order)`
  - Vo Thu Huong `(19 order)`
  - Tran Vo Minh Thu `(14 order)`
  - Phuong Thao Nhi `(14 order)`
  - Tran Ngoc Thuy Linh `(10 order)`
  - Nguyen Duy Thinh `(2 order)`
  - Chang Thi Thanh Binh `(2 order)`
  - Nguyen Le Thanh Huyen `(1 order)`
  - Nguyen Nhung Nhu Ngoc `(1 order)`
  - Le Vo Anh Thu `(1 order)`
  - Dang Thi Kim Tuyen `(1 order)`
  - Nguyen Minh Hieu `(1 order)`

### Linh Dam Store  _(13 sale, 393 order)_

- _(không có sub-team)_ — 13 sale
  - Hoang Thi Hong Tham `(219 order)`
  - Vo Thi Thom `(59 order)`
  - Phan Viet Khanh `(35 order)`
  - Pham Minh Anh `(25 order)`
  - Tran Thi Anh Tuyet `(18 order)`
  - Cu Thi Thu Hien `(10 order)`
  - Nguyen Thi Lan `(8 order)`
  - Ngo Thi Thuy Linh `(6 order)`
  - Nguyen Thi Ngoc Anh `(5 order)`
  - Hoang To Uyen `(4 order)`
  - Vu Quynh Nga `(2 order)`
  - Le Quang Tung `(1 order)`
  - Le Thanh Phuong `(1 order)`

### Khác / Chưa phân loại  _(17 sale, 376 order)_

- _(không có sub-team)_ — 17 sale
  - Le Thi Thanh Thuy `(196 order)`
  - Nguyen Hong Nhu `(38 order)`
  - Dao Thi Hoang Yen `(32 order)`
  - Vo Tran Anh Thuy `(23 order)`
  - Nguyen Thi Kim Duyen `(22 order)`
  - Josh `(18 order)`
  - Dinh Luong Nhu Ngoc `(13 order)`
  - 彭胜君 `(9 order)`
  - Nguyen Thi Suong Mai `(9 order)`
  - Nguyen Thuy Linh 1 `(6 order)`
  - Tran `(4 order)`
  - Tran Hieu Thao `(1 order)`
  - Dang Thi Kim Ngan `(1 order)`
  - KThuyen `(1 order)`
  - 文秀莺 `(1 order)`
  - DANG THI THANH THUY `(1 order)`
  - 朱振博 `(1 order)`

### HN Offline Store  _(1 sale, 119 order)_

- _(không có sub-team)_ — 1 sale
  - Pham Thuy Linh `(119 order)`

### An Binh Store  _(3 sale, 63 order)_

- _(không có sub-team)_ — 3 sale
  - Vu Thuy Huong `(51 order)`
  - Bui Thi Anh `(9 order)`
  - Nguyen Thu Phuong `(3 order)`

### Team 1  _(6 sale, 46 order)_

- _(không có sub-team)_ — 6 sale
  - Bui Thi Men `(24 order)`
  - Ngo Thi Bich Ngoc `(8 order)`
  - Huynh Minh Giang `(8 order)`
  - Nguyen Thi Thuy Hieu `(3 order)`
  - Nguyen Thi Hong `(2 order)`
  - Nguyen Thi Thu Ha `(1 order)`

### HN Inhouse  _(2 sale, 40 order)_

- _(không có sub-team)_ — 2 sale
  - Ruby Advisor `(38 order)`
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

### P'AU Group  _(3 sale, 3 order)_

- **Sub-team: Team Aon** — 2 sale
  - Apipong.Aon `(1 order)`
  - Peerawas.Pee `(1 order)`
- **Sub-team: Team Lookkaew** — 1 sale
  - Jittralai.Puii `(1 order)`

### P'TEE Group  _(1 sale, 1 order)_

- **Sub-team: Team James** — 1 sale
  - Thanakorn.Wan `(1 order)`
