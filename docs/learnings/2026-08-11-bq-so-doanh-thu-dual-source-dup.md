# BQ so_doanh_thu trùng dòng do 2 nguồn nạp (app + import sheet)

**Related files:** `backend/revenue_routes.py`, `docs/handoffs/KETLUAN_GMV_DUPLICATE_ROWS_2026-08-11.md`

**Problem:** `pf-salary.palfish_gmv_public.so_doanh_thu` (BQ via Fivetran) chứa dòng trùng cùng 1 đơn từ 2 nguồn: `b3-activation@auto` (app, có `crm_order_id`) + `import:gsheet:SM Hanoi` (tay, không `crm_order_id`) → GMV/sale đếm đôi → com sai trong bảng lương. T7/2026: 13 dòng / 179M dư.

**Trap:** Dedup bằng `(uid, so_tien_vnd)` — bỏ sót 54% dòng trùng. Lý do: (1) import ghi "giá gói" còn app ghi "thực thu" → amount khác; (2) import tách 1 đơn multi-gói thành nhiều dòng (VD 13.9M → 9.3M + 4.6M). Bẫy thứ 2: dedup bằng `uid` một mình → xóa nhầm đơn thật (uid là mã KHÁCH, 1 KH mua nhiều đơn).

**Insight:** `crm_order_id` là mã đơn hàng duy nhất toàn bảng (0 dup), nhưng CHỈ có ở đơn app — đơn import tay không có. Pattern đúng: nếu 1 uid có ít nhất 1 dòng mang `crm_order_id` (= đã lên app), thì mọi dòng `loai_nhap='tay'` không có `crm_order_id` của uid đó trong cùng tháng là bản import trùng. "Ca lai" (`tu_dong` + `import:gsheet`, có crm_order_id): 130 dòng, 0 overlap với `b3-activation@auto` → giữ nguyên.

**Rule:** BQ view GMV phải dedup bằng heuristic "uid has crm → drop tay without crm (per month)", KHÔNG dùng `(uid, so_tien_vnd)`. Khi import Sổ doanh thu từ GSheet, skip uid đã có đơn app (`crm_order_id` existing) trong cùng tháng.

**Verify:** `bq query --project_id=pf-salary --use_legacy_sql=false --format=csv "SELECT COUNTIF(uid IS NOT NULL AND rn>1) dup FROM (SELECT uid, ROW_NUMBER() OVER(PARTITION BY uid, FORMAT_DATE(cast('%Y-%m' as string), ngay_tien_ve) ORDER BY (crm_order_id IS NOT NULL AND crm_order_id!='') DESC, loai_nhap) rn FROM palfish_gmv_public.so_doanh_thu WHERE COALESCE(is_test,FALSE)=FALSE AND COALESCE(_fivetran_deleted,FALSE)=FALSE AND sale_crm_name IS NOT NULL AND sale_crm_name!='')"` — currently expect 0 after dedup view applied; >0 means new dups appeared.
