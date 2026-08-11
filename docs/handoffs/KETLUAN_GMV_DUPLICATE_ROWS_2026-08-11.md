# KẾT LUẬN — Dòng doanh thu TRÙNG trong `so_doanh_thu` (2026-08-11)

Điều tra theo HANDOFF_GMV_DUPLICATE_ROWS_2026-08-11.md.

---

## 1. Kết luận chính

### uid = mã khách hàng (student ID), KHÔNG phải mã đơn

1 uid **có thể** có nhiều đơn hàng thật sự khác nhau (VD: uid `3314034328` có 2 đơn T7 với 2 `crm_order_id` khác nhau). Do đó `uid` một mình **không dùng được làm dedup key**.

### Dedup key `(uid, so_tien_vnd)` KHÔNG ĐỦ

Chỉ bắt **6/13 dòng trùng T7** (89.9M). Bỏ sót 7 dòng nữa vì:
- **Khác số tiền**: import ghi "giá gói" (hoặc tỷ giá lúc import), app ghi "số tiền thực thu" → chênh.
- **Tách gói**: uid `3314250909` app gộp 13.9M, import tách 2 dòng (9.3M + 4.6M = 13.9M).

### Dedup key đúng: **"uid có crm_order_id → drop tay"**

Heuristic: *Nếu 1 uid trong cùng tháng có ít nhất 1 dòng mang `crm_order_id` (đơn app-native), thì mọi dòng `loai_nhap='tay'` không có `crm_order_id` của uid đó trong tháng đó là bản sao → loại.*

Lý do an toàn:
- **crm_order_id KHÔNG bao giờ trùng** nhau trong toàn bảng (0 duplicate).
- Nếu 1 KH mua 2 đơn thật, **cả 2 đều có crm_order_id** riêng → heuristic KHÔNG xóa nhầm.
- Đơn chỉ-import (619/746 uid T7) **không bị ảnh hưởng** — chúng không có crm_order_id.
- Verified qua 12 uid T7 + 6 uid T8 + 1 uid T6: mọi dòng bị xóa đều là bản import trùng (ngày cách 0–3 ngày so với dòng app).

### Nguồn ưu tiên: **app-native** (`b3-activation@auto` + crm_order_id)

Khi trùng, giữ dòng app vì:
- Có `crm_order_id`, `ma_don_hang` — truy ngược được về CRM.
- Số tiền phản ánh giao dịch thực (SePay/cổng thanh toán), không phải "giá gói" ghi tay.

### "Ca lai" (`loai_nhap='tu_dong'` + `created_by=import:gsheet:*`)

130 dòng toàn bảng, 100% có `crm_order_id` + `ma_don_hang`. **0 overlap** crm_order_id với `b3-activation@auto` → đây là đơn app **chỉ import** (chưa auto-create qua b3-activation), KHÔNG phải trùng. Phân loại: **giữ nguyên**.

---

## 2. Quy mô trùng

| Tháng | Raw GMV | Dedup GMV | Dòng trùng | Dư |
|---|---|---|---|---|
| T1–T5/2026 | — | — | 0 | 0 |
| T6/2026 | 9,005,258,400 | 8,987,308,400 | 1 | 17,950,000 |
| **T7/2026** | **8,557,654,425** | **8,378,637,905** | **13** | **179,016,520** |
| T8/2026* | 1,876,960,075 | 1,795,571,375 | 6 | 81,388,700 |
| **Tổng dư** | | | **20** | **≈ 278 triệu** |

*T8 chưa kết thúc, con số sẽ tăng.

Trùng bắt đầu từ T6 khi `b3-activation@auto` bắt đầu hoạt động (tạo đơn app tự động).

---

## 3. Tác động per-salesperson

### T7/2026

| Sale | Raw GMV | Dedup GMV | Dòng trùng | Dư |
|---|---|---|---|---|
| Vu Thuy Huong | 180,668,480 | 107,739,400 | 3 | 72,929,080 |
| Nguyen Thi Hang Nga | 235,701,000 | 207,440,000 | 3 | 28,261,000 |
| Le Thi Tuyet | 352,739,240 | 325,032,120 | 2 | 27,707,120 |
| Luu Thi Hoang Ngan | 196,149,265 | 179,184,945 | 1 | 16,964,320 |
| Hoang Thi Hong Tham | 168,622,600 | 154,722,600 | 2 | 13,900,000 |
| Nguyen Thi Thao Ngoc | 141,210,250 | 130,965,250 | 1 | 10,245,000 |
| **Nguyen Thi Trang** | **72,640,000** | **63,630,000** | **1** | **9,010,000** |

Anchor: Trang T7 = 63,630,000 → **KHỚP sheet tay SM Hanoi**.

### T8/2026 (đang chạy)

| Sale | Raw GMV | Dedup GMV | Dòng trùng | Dư |
|---|---|---|---|---|
| Hoang Thi Hong Tham | 119,558,000 | 84,578,000 | 2 | 34,980,000 |
| Vu Thuy Huong | 39,228,400 | 19,614,200 | 1 | 19,614,200 |
| Le Thi Thuy Trang | 88,700,000 | 71,210,000 | 1 | 17,490,000 |
| Nguyen Thi Thuy Hang | 36,429,000 | 27,124,500 | 2 | 9,304,500 |

---

## 4. SQL dedup cho Chung

### Option A — View mới (non-destructive, khuyến nghị)

Tạo view `v_so_doanh_thu_dedup` thay cho truy vấn trực tiếp `so_doanh_thu`:

```sql
CREATE OR REPLACE VIEW `pf-salary.palfish_gmv_public.v_so_doanh_thu_dedup` AS
WITH uid_has_crm AS (
  -- UIDs đã có đơn trên app (có crm_order_id) theo từng tháng
  SELECT uid, FORMAT_DATE('%Y-%m', ngay_tien_ve) AS ym
  FROM `pf-salary.palfish_gmv_public.so_doanh_thu`
  WHERE COALESCE(is_test, FALSE) = FALSE
    AND COALESCE(_fivetran_deleted, FALSE) = FALSE
    AND uid IS NOT NULL
    AND crm_order_id IS NOT NULL AND crm_order_id != ''
  GROUP BY uid, ym
)
SELECT s.*
FROM `pf-salary.palfish_gmv_public.so_doanh_thu` s
LEFT JOIN uid_has_crm u
  ON s.uid = u.uid
  AND FORMAT_DATE('%Y-%m', s.ngay_tien_ve) = u.ym
WHERE NOT (
  -- Loại: dòng tay, không có crm_order_id, mà uid cùng tháng đã có đơn app
  u.uid IS NOT NULL
  AND s.loai_nhap = 'tay'
  AND (s.crm_order_id IS NULL OR s.crm_order_id = '')
)
```

Sau đó sửa `v_so_doanh_thu_nhom_loai` trỏ vào `v_so_doanh_thu_dedup` thay vì `so_doanh_thu`. Downstream views (`v_gmv_thang_truoc_theo_nhan_vien`, `C_view_bang_thuong_com`) tự động hưởng dedup.

### Option B — QUALIFY inline (nếu không muốn thêm view)

Thêm vào query GMV hiện tại:

```sql
-- Trong v_gmv_thang_truoc_theo_nhan_vien, thay FROM so_doanh_thu bằng:
FROM `pf-salary.palfish_gmv_public.so_doanh_thu` s
WHERE ...
  -- Loại dòng trùng
  AND NOT EXISTS (
    SELECT 1 FROM `pf-salary.palfish_gmv_public.so_doanh_thu` app
    WHERE app.uid = s.uid
      AND FORMAT_DATE('%Y-%m', app.ngay_tien_ve) = FORMAT_DATE('%Y-%m', s.ngay_tien_ve)
      AND app.crm_order_id IS NOT NULL AND app.crm_order_id != ''
      AND COALESCE(app.is_test, FALSE) = FALSE
      AND COALESCE(app._fivetran_deleted, FALSE) = FALSE
      AND s.loai_nhap = 'tay'
      AND (s.crm_order_id IS NULL OR s.crm_order_id = '')
  )
```

---

## 5. Cách verify

### Bước 1 — So anchor Nguyễn Thị Trang T7

```sql
SELECT ROUND(SUM(so_tien_vnd)) gmv
FROM `pf-salary.palfish_gmv_public.v_so_doanh_thu_dedup`
WHERE LOWER(TRIM(sale_crm_name)) = 'nguyen thi trang'
  AND COALESCE(is_test, FALSE) = FALSE
  AND COALESCE(_fivetran_deleted, FALSE) = FALSE
  AND ngay_tien_ve >= '2026-07-01' AND ngay_tien_ve < '2026-08-01'
-- Kỳ vọng: 63,630,000 (khớp sheet SM Hanoi)
```

### Bước 2 — So GMV tổng T7

```sql
SELECT
  ROUND(SUM(so_tien_vnd)) gmv_dedup,
  8557654425 AS gmv_raw,
  8557654425 - ROUND(SUM(so_tien_vnd)) AS chenh_lech
FROM `pf-salary.palfish_gmv_public.v_so_doanh_thu_dedup`
WHERE COALESCE(is_test, FALSE) = FALSE
  AND COALESCE(_fivetran_deleted, FALSE) = FALSE
  AND sale_crm_name IS NOT NULL AND sale_crm_name != ''
  AND ngay_tien_ve >= '2026-07-01' AND ngay_tien_ve < '2026-08-01'
-- Kỳ vọng: gmv_dedup ≈ 8,378,637,905 / chenh_lech ≈ 179,016,520
```

### Bước 3 — Cho team đối chiếu 3–5 người

Lấy GMV dedup per-salesperson (bảng Section 3 ở trên), gửi leader SM Hanoi đối chiếu với sheet tay. Đặc biệt:
- **Vu Thuy Huong** (chênh 73M, 40%)
- **Nguyen Thi Hang Nga** (chênh 28M)

---

## 6. Phân bổ đơn theo nguồn (T7)

| Nhóm | Số uid | Ghi chú |
|---|---|---|
| **Chỉ import** (tay, không crm_order_id) | 619 | Đa số đơn — KHÔNG thể bỏ nguồn import |
| **Chỉ app** (b3-activation@auto) | 114 | |
| **Cả 2 nguồn** (= trùng) | 13 uid → 13 dòng import thừa | Heuristic v2 loại |

Toàn bảng 2026: 4,398 uid chỉ-import / 141 uid chỉ-app / 51 uid cả-2.

---

## 7. Nguyên nhân gốc + khuyến nghị dài hạn

**Vì sao trùng?** Sheet SM Hanoi (Google Sheet team) ghi TẤT CẢ đơn bao gồm đơn đã có trên app. Khi import sheet → cùng 1 đơn xuất hiện 2 lần.

**Khuyến nghị dọn nguồn:**
1. **Ngắn hạn (bây giờ)**: Tạo view dedup (SQL ở Section 4), apply vào pipeline com. Không sửa data gốc.
2. **Trung hạn**: Sửa quy trình import Sổ doanh thu trong app — khi import sheet, **skip dòng mà uid đã có đơn app** (kiểm crm_order_id existing). Hoặc hiển thị warning "uid này đã có đơn trên app".
3. **Dài hạn**: Khi đủ nhiều đơn qua app (SePay/mPOS), dần bỏ import tay cho các đơn app-covered. Import chỉ dùng cho đơn không qua cổng (chuyển khoản trực tiếp, tiền mặt).

---

## 8. Trả lời 6 câu hỏi handoff

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Dedup key nào an toàn? | **uid + has_crm_order_id + loai_nhap='tay'** (per month). Không dùng (uid, so_tien_vnd) — bỏ sót 54%. |
| 2 | Nguồn ưu tiên? | **App-native** (b3-activation@auto, có crm_order_id). |
| 3 | Chỉ app / chỉ import / cả 2? | T7: 114 / 619 / 13 uid. Bắt buộc union + dedup. |
| 4 | Ca lai (tu_dong + import:gsheet)? | 130 dòng, TẤT CẢ có crm_order_id, 0 trùng với b3-activation. Giữ nguyên. |
| 5 | Quy mô qua tháng/team? | T6→T8: 20 dòng / 278M dư. T1–T5: sạch (chưa có b3-activation). |
| 6 | Vì sao import đè app? | Sheet SM Hanoi ghi tất cả đơn; import không check existing uid trên app. |
