# Đối soát Sổ doanh thu (app) ⇄ All File Thu Hiền — Quy trình & Bài học

> SOP tái dùng khi đối soát doanh thu 1 tháng bất kỳ. Đúc kết từ đợt đối soát **T7+T8/2026** (12/9/2026, chênh +29,3tr → **0đ**).
> Bảng đối soát = `so_doanh_thu` (Supabase prod `jozcvbbypwvzaefteoxn`). Nguồn chuẩn = **All File Thu Hiền** (Google Sheet id `1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc`).

---

## 0. Nguyên tắc (đọc trước)

- **All File Thu Hiền = CHUẨN** (khớp bảng lương L8 chị Trang). Khi lệch, mặc định **Sổ (app) sai**, không phải file.
- **1 đơn = ĐÚNG 1 dòng** trong `so_doanh_thu`.
- Sổ có **2 nguồn ghi song song** (đây là gốc rễ mọi lệch):
  - **Auto (App báo đơn)**: `created_by_email='b3-activation@auto'`, **có `crm_order_id`**, 1 dòng / mỗi gói.
  - **Import (nhập từ All File)**: `created_by_email LIKE 'import:gsheet:%'`, **không có `crm_order_id`**, nhiều dòng **trống UID**.
  - (Ngoài ra: `manual:*` = sửa/thêm tay; `hoan` = ghi giảm/hoàn.)
- Lệch = App vừa **THỪA** (nhập trùng) vừa **THIẾU** (gói chưa vào sổ) + khác cách ghi. **Không phải file thiếu.**

---

## 1. Quy trình đối soát 1 tháng (7 bước)

1. **Kéo All File.** Ưu tiên **Google Drive MCP** (chỉ XEM, đã được cấp quyền edit nhưng KHÔNG sửa). Hoặc browser tab `docs.google.com` fetch gviz CSV:
   `location.origin + <base>/gviz/tq?tqx=out:csv&sheet=<tên tab>` với tab **`HCM REV`** và **`SM Hanoi`** (File Admin = HCM REV + SM Hanoi).
   - Cột: `bank day`(0), `Phone`(4), `UID`(5), `Package`(6), **Real Pay(VND)**. ⚠️ Cột Real Pay: **HCM REV = col 9**, **SM Hanoi = col 10** (SM Hanoi có thêm cột "Full Price"). **DÒ theo header, đừng hardcode.**
   - Tiền dùng **dấu chấm** ngăn nghìn → `replace(/\D/g,'')`. Lọc ngày theo **year + month** (đừng chỉ month, kẻo bắt tháng 8 của năm khác).
2. **Kéo Sổ.** SQL `so_doanh_thu WHERE is_test IS NOT TRUE AND ngay_tien_ve` trong tháng.
3. **So tổng theo tháng** (tổng tiền + số đơn) App vs File.
4. **Tìm nguồn chênh — so số dòng theo TỪNG mức tiền.** Group by `so_tien_vnd` đếm số dòng mỗi bên; mức nào lệch số dòng chính là nguồn chênh (nhanh & chính xác cho TỔNG tiền; xem query mục 6).
5. **Khớp hai chiều theo UID+tiền** → rồi **SĐT+tiền** → rồi **tiền** (cho dòng trống). Phần dư mỗi bên = đơn cần soát. ⚠️ Xử **non-blank UID trước**, dòng **trống (tiền-only) sau** kẻo dòng trống chiếm chỗ mức tiền → dương tính giả.
6. **Soi tay từng đơn dư** (BẮT BUỘC). Khớp máy 1-1 cho **rất nhiều dương tính giả** (dòng trống / tên con / lệch ngày / tách-gộp).
7. **Xử lý** theo mục 2, **backup trước**, đối chiếu PR trước khi xoá/sửa.

---

## 2. 5 loại lỗi — dấu hiệu · nhận diện · xử lý

### ① App THỪA — auto + import trùng (phổ biến nhất)
- **Dấu hiệu:** cùng 1 đơn có 1 dòng `b3-activation@auto` (có crm, có uid) **+** 1 dòng `import:gsheet` (trống uid, không crm). File chỉ có 1.
- **Nhận diện:** dòng import trống-uid trùng `so_tien_vnd`+ngày với 1 dòng báo đơn cùng UID; hoặc query uid có cả auto lẫn import.
- **Xử lý:** **XOÁ dòng import dư**, giữ dòng báo đơn (auto).
- **BẪY quan trọng:** dòng import trống UID **KHÔNG hiện ở màn "Báo đơn"/PR** → user check PR thấy 1 dòng là ĐÚNG, nhưng bảng `so_doanh_thu` vẫn dư. **Phải kiểm trong bảng, không kiểm qua màn báo đơn.**

### ② App THỪA — double import (cùng 1 đơn file nhập 2 lần)
- **Dấu hiệu:** 2 dòng import cùng uid/amt; 1 trống 1 có uid; hoặc **lệch ngày** (import lại ghi sai ngày, vd Trang Nhi Sổ có 31/7 + 15/8 nhưng file chỉ 31/7).
- **Xử lý:** XOÁ 1 dòng import dư.

### ③ UID rác phá khớp
- **Dấu hiệu:** uid có chữ / nhét SĐT / thiếu 1 số (không đúng `^3\d{9}$`). Vd: Nhật Băng uid="C Trang-Nhật Băng 5t 3316451938"; chị Liên uid=SĐT `348627764`; `330338570`(thiếu số).
- **Query:** `uid !~ '^3[0-9]{9}$'` → rồi group theo SĐT+tiền xem có bản uid sạch cùng đơn.
- **Xử lý:** XOÁ dòng uid rác, giữ dòng uid sạch.

### ④ App THIẾU — đơn nhiều gói, Sổ ghi 1
- **Dấu hiệu:** PR/AR có 2 gói (2 bé) nhưng Sổ chỉ 1 dòng; File có đủ 2. Vd: Lopez Weyers (KH trả 89.890.000 = 2×44.945.000, Sổ có 1); Đô Đô (63.600.000 = 2×31.800.000, Sổ có 1).
- **Nhận diện:** mở PR (bảng `payment_requests`), xem AR "x/y gói đã tạo" + tổng tiền; đếm số dòng Sổ.
- **Xử lý:** **BỔ SUNG dòng gói còn thiếu** (nhân bản dòng có sẵn, `id=gen_random_uuid()`, `crm_order_id=NULL`, `created_by_email='manual:reconcile-add-<ngày>'`).
- **BẪY:** "file có 2 dòng GIỐNG HỆT" **KHÔNG** mặc nhiên là file trùng — thường là **đơn 2 gói/2 bé thật**. Luôn mở PR đếm số gói trước khi kết luận trùng.

### ⑤ Số stale / lấy nhầm lần TT đã huỷ
- **Dấu hiệu:** dòng Sổ (thường import) có số ≠ PR ≠ File; nhưng **PR + File bằng nhau (đúng)**, chỉ Sổ sai.
- **Nhận diện:** đối chiếu **3 nơi**: PR (`payment_requests.target/received`) — All File — dòng Sổ.
- **Ví dụ:** Giang: Sổ 4.680.750 = **lần TT #1 ĐÃ HUỶ**; số thật 4.681.750 (lần #2 quẹt thẻ net 4.611.750 + lần #3 70.000). Đức Dương: Sổ 8.745.000 số cũ, thật 8.765.000.
- **Xử lý:** **SỬA `so_tien_vnd`** dòng Sổ lên đúng (khớp PR+File).

---

## 3. Bài học / bẫy then chốt (đọc để KHÔNG lặp lỗi)

- **Đơn nhiều bé ≠ dup.** 2 dòng cùng tiền có thể là 2 bé thật. LUÔN mở PR/AR xem **mấy gói** trước khi gọi "trùng". (anh Minh đã bác nhiều lần: Lopez, Đô Đô, Bùi Tuệ Nhung, Chị Hằng, Phước Hưng+Phước Quang, Chị Hòa+2 bé...)
- **UID app vs file có thể KHÁC cho cùng 1 bé** (vd bé Khánh Linh: app `3317112365` vs file `3317054741`). → khớp theo **tiền+ngày+SĐT**, đừng chỉ uid.
- **Mã PR = cột `id` của bảng `payment_requests`** (dạng `PR-2026-XXXX`). **ĐỪNG tự tính bằng row_number** — app đánh số có khoảng trống do PR bị xoá.
- **Đối chiếu 3 nơi:** PR (báo đơn) — All File — dòng Sổ. Lệch có thể **chỉ ở dòng Sổ** (import số cũ) trong khi PR=File đúng.
- **Net vs gross:** đơn thẻ chuẩn = **NET** (thực thu). Dòng auto có thể ghi gross giá gói → lệch. Số đúng theo All File/PR.
- **Rà tự động 1-1 = dương tính giả cao** (đã chứng minh 8/10 "app dôi" thực ra có trên file). → phải soi tay từng đơn.
- **Giới hạn kéo dữ liệu RA browser ~vài KB:** không extract blob lớn ra được → tính TRONG browser rồi trả kết quả gọn; hoặc dùng Drive MCP; hoặc nhét dữ liệu app vào SQL parse (kiểm tổng để chắc không sai khi dán tay).
- **File Thu Hiền CŨNG có thể có dòng "giống hệt" nhưng KHÔNG phải trùng** (đơn 2 gói). Kiểm PR để phân biệt.

---

## 4. Kết quả T7+T8/2026 (ĐÃ XONG 12/9/2026)

| Tháng | Sổ doanh thu | All File | Chênh |
|---|---|---|---|
| 07/2026 | 8.391.574.585 | 8.391.574.585 | **0đ** |
| 08/2026 | 7.854.939.875 | 7.854.939.875 | **0đ** |
| **Tổng** | **16.246.514.460** | **16.246.514.460** | **0đ** |

Chênh **+29.323.500đ → 0đ**. Xử lý **15 dòng**: 11 xoá (import dư) + 2 bổ sung (gói thiếu) + 2 sửa số.
**Backup (hoàn tác `INSERT..SELECT`):** `so_doanh_thu_final_bak_20260912` (13 dòng gồm cả 2 dòng sửa), cùng các bảng trước: `so_doanh_thu_bo40_bak_20260911`, `_bo_sep_bak_20260911`, `_fix_bak_20260911b/c/d/e`.
**File bằng chứng:** `Bang_chung_doi_soat_SoDoanhThu_vs_AllFile_T7_T8.xlsx` (Sheet1 kết quả 0đ, Sheet2 15 thao tác kèm ID).

---

## 5. Chi tiết case đã xử lý (T7-8, để tham chiếu — KHÔNG làm lại)

**XOÁ 11 dòng import dư** (giữ dòng báo đơn / dòng đúng):

| Đơn | Ngày | Số tiền | id (đã xoá) |
|---|---|---|---|
| (đơn NEW 96) | 22/7 | 17.194.000 | `4aa248f5` |
| Chị Oanh / Quốc Anh | 27/8 | 16.520.000 | `06cefc4e` |
| Hải Yến | 11/7 | 15.900.000 | `cb44fadf` |
| Phương (nhà Chị Hằng, Both AB) | 12/8 | 9.380.000 | `04bca06a` |
| (bé nhà Bùi Tuệ Nhung) | 25/7 | 9.080.000 | `d3d949d5` |
| Phước Hưng (nhà Chị Lan) | 30/7 | 8.620.000 | `dfdfae36` |
| Trang Nhi | 15/8 | 7.950.000 | `d16043a7` |
| Thiên Ân (nhà chị Thanh) | 10/8 | 7.685.000 | `dae15bb6` |
| Khánh Linh (nhà Chị Hòa) | 28/8 | 4.790.500 | `b07a4462` |
| Chị Hằng / Phương | 14/8 | 4.550.000 | `df3055f2` |
| Tom (nhà Chị Hà) | 29/7 | 4.420.000 | `82fb1456` |

**BỔ SUNG 2 gói thiếu** (đơn 2 gói, Sổ mới ghi 1):

| Đơn | Mã PR | Ngày | Số tiền thêm |
|---|---|---|---|
| Lopez Weyers (chị Nhung) | PR-2026-0845 | 31/7 | +44.945.000 |
| Đô Đô / Phan Thị Chu Quyên | PR-2026-0146 | 15/7 | +31.800.000 |

**SỬA số (dòng Sổ ghi số cũ/thấp)**:

| Đơn | Mã PR | id | Sửa |
|---|---|---|---|
| Đức Dương | PR-2026-0832 | `7d0ac900` | 8.745.000 → 8.765.000 |
| Giang | PR-2026-0551 | `797570a3` | 4.680.750 → 4.681.750 (Sổ lấy nhầm lần TT #1 đã huỷ) |

> Trước đó (11/9): đã xoá 40 dòng trùng cùng-tiền (`_bo40_bak`) + 2 dòng T9 (`_bo_sep_bak`) + Bảo Trúc/Phong Anh/Nhật Băng/chị Liên/2 dòng uid gõ thiếu số (`_fix_bak_..b→e`). Xem `so_doanh_thu_final_bak_20260912` và các bảng backup.

---

## 6. Query / công cụ mẫu (copy để dùng tháng khác)

**a) Tổng theo nguồn:**
```sql
SELECT CASE WHEN created_by_email='b3-activation@auto' THEN 'auto'
            WHEN created_by_email LIKE 'import:gsheet%' THEN 'import'
            WHEN created_by_email LIKE 'manual%' THEN 'manual' ELSE 'khac' END nguon,
       count(*) n, sum(so_tien_vnd) tong
FROM so_doanh_thu WHERE is_test IS NOT TRUE AND ngay_tien_ve>='<M-01>' AND ngay_tien_ve<'<M+1-01>'
GROUP BY 1;
```

**b) So số dòng theo mức tiền (tìm nguồn chênh tổng):**
```sql
SELECT so_tien_vnd, count(*) n FROM so_doanh_thu
WHERE is_test IS NOT TRUE AND ngay_tien_ve>='<M-01>' AND ngay_tien_ve<'<M+1-01>'
GROUP BY so_tien_vnd ORDER BY so_tien_vnd;
```
→ đối chiếu với đếm mức tiền bên All File (browser). Mức nào lệch số dòng = nguồn chênh.

**c) UID rác:**
```sql
SELECT id, ngay_tien_ve, ten_khach, sdt, uid, so_tien_vnd, created_by_email
FROM so_doanh_thu WHERE is_test IS NOT TRUE AND ngay_tien_ve>='<M-01>' AND ngay_tien_ve<'<M+1-01>'
  AND uid IS NOT NULL AND btrim(uid)<>'' AND uid !~ '^3[0-9]{9}$';
```

**d) Nghi trùng auto+import theo SĐT+tiền+tháng:**
```sql
WITH src AS (
  SELECT id, right(regexp_replace(coalesce(sdt,''),'\D','','g'),9) ph9, so_tien_vnd,
         CASE WHEN created_by_email='b3-activation@auto' THEN 'auto'
              WHEN created_by_email LIKE 'import:gsheet%' THEN 'import' ELSE 'khac' END ng
  FROM so_doanh_thu WHERE is_test IS NOT TRUE AND ngay_tien_ve>='<M-01>' AND ngay_tien_ve<'<M+1-01>')
SELECT ph9, so_tien_vnd, count(*) FILTER (WHERE ng='auto') na, count(*) FILTER (WHERE ng='import') ni
FROM src WHERE ph9<>'' GROUP BY ph9, so_tien_vnd
HAVING count(*) FILTER (WHERE ng='auto')>0 AND count(*) FILTER (WHERE ng='import')>0;
```

**e) Tra mã PR + số tiền thật (đối chiếu loại ⑤):** `SELECT id, name, child_name, uid, phone, target, received, state FROM payment_requests WHERE uid IN (...) OR regexp_replace(phone,'\D','','g') LIKE '%<sđt>%';` — cột `id` chính là mã PR.

**f) Browser (gviz) — đếm mức tiền All File 1 tháng** (dò cột Real Pay theo header, lọc year+month, group amt→count). Blob lớn KHÔNG kéo ra được → tính diff trong browser, trả về danh sách mức lệch.

**g) Bổ sung gói thiếu (nhân bản dòng có sẵn, hoàn tác được):**
```sql
CREATE TEMP TABLE tmp ON COMMIT DROP AS SELECT * FROM so_doanh_thu WHERE id='<dòng gốc>';
UPDATE tmp SET id=gen_random_uuid(), crm_order_id=NULL, created_by_email='manual:reconcile-add-<ngày>';
INSERT INTO so_doanh_thu SELECT * FROM tmp;
```

**Luôn backup trước khi xoá/sửa:** `CREATE TABLE so_doanh_thu_bak_<ngày> AS SELECT * FROM so_doanh_thu WHERE id IN (...)`.

---

## 7. Gốc rễ & hướng fix code (để chặn tái phát, chưa làm)

**Gốc rễ:** 2 đường ghi song song, dedup **không có tier theo `crm_order_id`** (import không mang order_id) → chỉ dựa uid/ngày/tiền/tháng → vỡ khi số tiền lệch (gross/net, số cũ/huỷ), ngày lệch (`stamp_net_fee` đổi ngày dòng auto), UID trống/rác, hoặc thứ tự chạy (import trước khi báo đơn).

- Path A (auto): `sync_ledger_from_ar_course` — `backend/revenue_routes.py:1111` (1 dòng/gói; `so_tien_vnd` = giá gói `:1173`; insert-once, không sửa số).
- Path B (import): `sync_gsheet_to_ledger` — `backend/gsheet_ledger_import.py:618` + `reconcile` — `backend/ledger_recon.py:187` (6 tier uid/ngày/tiền/tháng; INSERT-only; không crm).
- Dedup offline: `backend/scripts/dedup_gsheet_ledger.py:214` (block theo `(ngày, tiền)` chính xác + chỉ xoá `import:%` → sót dup chéo nguồn).
- Learning liên quan: `docs/learnings/2026-08-11-bq-so-doanh-thu-dual-source-dup.md` (đã khuyến nghị "import bỏ qua uid đã có đơn app trong tháng" — **CHƯA cài vào code**).

**Giải pháp toàn diện (GĐ):**
- **GĐ0** Chốt nguyên tắc: 1 đơn = 1 dòng; đơn qua App → auto chuẩn, All File không import lại; số tiền = NET cả 2 nguồn.
- **GĐ1 (code chặn):** G1-T1 import bỏ qua đơn đã có auto (crm/uid+tháng+tiền±ngưỡng); G1-T2 Path A ghi NET; G1-T3 chuẩn hoá/chặn UID rác; G1-T4 đồng bộ khi đơn đổi (huỷ/sửa/upsale); G1-T5 số dòng Sổ = số gói thu.
- **GĐ2 (data):** rà toàn bộ Sổ mọi tháng theo 5 loại lỗi, backup + duyệt + xoá/sửa.
- **GĐ3 (giám sát):** job tuần đối chiếu tổng + dò 5 loại lỗi → cảnh báo; tab "nghi trùng" cho chị Hiền.
- Đòn bẩy lớn nhất & rẻ nhất: **G1-T1 + G1-T2** (chặn ~90% dup tại nguồn).
