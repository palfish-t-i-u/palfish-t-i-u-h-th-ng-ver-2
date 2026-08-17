# HANDOFF — Điều tra dòng doanh thu TRÙNG trong `so_doanh_thu` (2026-08-11)

## Nhiệm vụ
`pf-salary.palfish_gmv_public.so_doanh_thu` chứa **các dòng doanh thu bị trùng** (cùng 1 đơn xuất hiện 2 lần từ 2 nguồn nạp) → GMV theo nhân viên bị **đếm đôi** → sai số com trong bảng lương.
1. Điều tra kỹ các dòng trùng → xác định **cách ra con số cuối cùng cho chuẩn** (dedup key nào an toàn, nguồn nào ưu tiên).
2. Ra **khuyến nghị dedup cụ thể cho Chung** (SQL + cách verify), non-destructive trước, dọn nguồn sau.

⚠️ Đây là việc điều tra dữ liệu, **không sửa gì vào DB/prod** cho tới khi có kết luận + Minh duyệt.

## Bối cảnh / luồng dữ liệu
- App PalFish GMV (Supabase prod) → **Fivetran** → BQ `pf-salary.palfish_gmv_public.so_doanh_thu` (bảng doanh thu thô, "Sổ doanh thu").
- Trên đó Chung dựng 2 view:
  - `v_so_doanh_thu_nhom_loai` = `SELECT so_doanh_thu.*, <CASE phân loại nhom_loai từ cột loai>` (KHÔNG lọc).
  - `v_gmv_thang_truoc_theo_nhan_vien` = gộp theo `sale_crm_name`, lọc `is_test=false` + `_fivetran_deleted=false` + tên≠rỗng + `ngay_tien_ve` thuộc **tháng trước**.
- View GMV này feed **com** trong bảng lương (`pf-salary.payroll.C_view_bang_thuong_com`).
- Chung phát hiện: GMV trong BQ **lệch** so với "thực tế" (sheet theo dõi tay của team).

## Nguồn lỗi = DB, KHÔNG phải view
View chỉ **cộng trung thực** cái đang có. **Dòng trùng nằm sẵn trong bảng `so_doanh_thu`** vì bảng trộn 2 nguồn nạp:
- **App auto:** `loai_nhap='tu_dong'`, `created_by_email='b3-activation@auto'`, CÓ `crm_order_id`/`ma_don_hang` (khách quẹt qua cổng SePay).
- **Import tay từ Google Sheet team:** `loai_nhap='tay'`, `created_by_email='import:gsheet:<tên tab>'` (VD `import:gsheet:SM Hanoi`, `import:gsheet:HCM REV`), thường KHÔNG có `crm_order_id`.
- Đơn nào **có ở cả 2 nguồn** → 2 dòng → đếm đôi.

## Bằng chứng cụ thể (anchor để verify)
**Nguyễn Thị Trang (team Inhouse 2, tháng 7/2026)** — BQ có 8 dòng = **72.640.000**, nhưng `uid=3312445983` (9.010.000) lặp 2 lần:

| ngay_tien_ve | so_tien_vnd | ma_don_hang | crm_order_id | uid | loai_nhap | created_by |
|---|---|---|---|---|---|---|
| 2026-07-03 | 9.010.000 | *(trống)* | *(trống)* | 3312445983 | tay | import:gsheet:SM Hanoi |
| 2026-07-04 | 9.010.000 | CC-0121-001 | 754432572639496 | 3312445983 | tu_dong | b3-activation@auto |
| 2026-07-06 | 8.850.000 | CC-0063-001 | 754750719660290 | 3313199152 | tu_dong | import:gsheet:SM Hanoi |
| 2026-07-10 | 9.850.000 | *(trống)* | *(trống)* | 3314355295 | tay | import:gsheet:SM Hanoi |
| 2026-07-11 | 8.850.000 | *(trống)* | *(trống)* | 3304013565 | tay | import:gsheet:SM Hanoi |
| 2026-07-24 | 8.745.000 | CC-0519-001 | R2026…201990 | 3314841980 | tu_dong | b3-activation@auto |
| 2026-07-25 | 9.580.000 | *(trống)* | *(trống)* | 3315138518 | tay | import:gsheet:SM Hanoi |
| 2026-07-30 | 8.745.000 | *(trống)* | *(trống)* | 3310555584 | tay | import:gsheet:SM Hanoi |

Bỏ trùng theo `uid` → 7 đơn = **63.630.000** = **ĐÚNG bằng sheet tay** ("SM Hanoi" tab, Tổng 63.630.000).
⚠️ **Chú ý quan trọng:** 6/8 đơn của chị này CHỈ có ở nguồn import (không có `crm_order_id`) → **KHÔNG thể bỏ hẳn nguồn import** (sẽ mất đơn), **bắt buộc phải dedup** (giữ union, bỏ bản trùng).

**Quy mô toàn tháng 7 (đã test, dedup key `(uid, so_tien_vnd)`):**
- Raw: **8.557.654.425** → Dedup: **8.467.793.585** → **6 dòng trùng / dư 89.860.840**.

## Môi trường + cách chạy query (self-contained)
- BQ project `pf-salary`; dataset `palfish_gmv_public` (GMV) + `payroll` (lương). Location **asia-southeast1** (bq auto-detect no-flag chạy đúng; ĐỪNG ép `--location=US`). Auth = `anhminhcv0512@gmail.com` (đã sẵn, `bq` chạy được).
- **Chạy bq trên Windows PowerShell (bẫy đã gặp):** query nhiều dòng truyền qua arg chỉ lọt dòng đầu; pipe stdin chèn BOM lỗi. Cách chạy được:
```powershell
$sql = @'
<SQL nhiều dòng, dùng nháy đơn thoải mái>
'@
$o = $sql -replace "\r?\n"," "
bq query --project_id=pf-salary --use_legacy_sql=false --format=csv $o
```
- Bảng ref có dấu `-` (`pf-salary`) phải backtick trong SQL; hoặc dùng `--project_id` + `dataset.table` (không cần backtick).

### Query tái hiện (chi tiết 1 nhân viên)
```sql
SELECT ngay_tien_ve, so_tien_vnd, ma_don_hang, crm_order_id, uid, loai_nhap, created_by_email, team
FROM palfish_gmv_public.so_doanh_thu
WHERE LOWER(TRIM(sale_crm_name)) = 'nguyen thi trang'
  AND COALESCE(is_test,FALSE)=FALSE AND COALESCE(_fivetran_deleted,FALSE)=FALSE
  AND ngay_tien_ve >= '2026-07-01' AND ngay_tien_ve < '2026-08-01'
ORDER BY ngay_tien_ve
```

### Query đo quy mô + test dedup (đã dùng)
```sql
WITH base AS (
  SELECT uid, so_tien_vnd, sale_crm_name, crm_order_id, loai_nhap,
    ROW_NUMBER() OVER (PARTITION BY uid, so_tien_vnd
      ORDER BY (crm_order_id IS NOT NULL AND crm_order_id!='') DESC) AS rn
  FROM palfish_gmv_public.so_doanh_thu
  WHERE COALESCE(is_test,FALSE)=FALSE AND COALESCE(_fivetran_deleted,FALSE)=FALSE
    AND ngay_tien_ve >= '2026-07-01' AND ngay_tien_ve < '2026-08-01'
    AND sale_crm_name IS NOT NULL AND sale_crm_name != ''
)
SELECT ROUND(SUM(so_tien_vnd)) tong_raw,
  ROUND(SUM(IF(uid IS NULL OR rn=1, so_tien_vnd,0))) tong_dedup,
  COUNTIF(uid IS NOT NULL AND rn>1) so_dong_trung
FROM base
```

## Cột chính của `so_doanh_thu`
`uid` (mã KH/đơn?), `so_tien_vnd`, `so_tien_net`, `phi_cong`, `ma_don_hang`, `crm_order_id`, `don_hang_id`, `sale_crm_name`, `team`, `ngay_tien_ve` (DATE), `pay_time` (TS), **`loai_nhap`** ('tu_dong'/'tay'), **`created_by_email`** (b3-activation@auto / import:gsheet:<tab>), `gateway`, `payment_method`, `loai`, `nhom_loai`, `goi_hoc`, `is_test`, `_fivetran_deleted`, `id`, `ctid_fivetran_id`.

## Câu hỏi cần trả lời (mục tiêu điều tra)
1. **Dedup key nào an toàn?** `uid` một mình có rủi ro gộp nhầm đơn thật khác nhau (1 KH mua nhiều lần cùng uid?). Thử & so sánh: `(uid, so_tien_vnd)` · `crm_order_id` (chỉ có ở đơn app) · `don_hang_id`/`ma_don_hang` · `(uid, ngay_tien_ve ± vài ngày)`. Kiểm: `uid` có thật sự unique/đơn không, hay là mã khách (1 khách nhiều đơn)?
2. **Nguồn nào ưu tiên khi trùng?** (đề xuất: giữ app-native có `crm_order_id`, bỏ bản import). Xác nhận app-native luôn đáng tin hơn.
3. **Có bao nhiêu đơn CHỈ ở app / CHỈ ở import / ở cả 2?** (quyết định có bỏ được nguồn nào không — hiện tại KHÔNG, phải union+dedup).
4. **Ca lai:** dòng `tu_dong` nhưng `created_by=import:gsheet` mà vẫn có `crm_order_id` (VD 7/6 ở trên) — phân loại thế nào?
5. **Trùng trải rộng cỡ nào** qua các tháng/team khác (không chỉ T7)? Chạy dedup toàn bảng.
6. **Vì sao import đè app?** Sheet team ("SM Hanoi", "HCM REV"…) được import cả đơn đã có trên app. Tìm Google Sheet nguồn (lần theo `created_by='import:gsheet:SM Hanoi'`; hỏi Minh link nếu cần) — quy trình import có nên loại đơn app-covered ngay từ đầu không?

## Đề xuất khởi điểm (để test, chưa chốt)
- **Tức thời (view-level, non-destructive):** thêm lớp dedup trong `v_so_doanh_thu_nhom_loai` (hoặc view gộp): giữ 1 dòng/nhóm, ưu tiên dòng app-native.
```sql
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY uid, so_tien_vnd
  ORDER BY (crm_order_id IS NOT NULL AND crm_order_id != '') DESC, ngay_tien_ve
) = 1
-- (giữ nguyên dòng uid NULL)
```
- **Verify:** sau dedup, GMV/nhân viên phải khớp sheet tay. **Anchor: Nguyễn Thị Trang T7 = 63.630.000.** Lấy thêm 3–5 người đối chiếu.
- **Dài hạn (dọn nguồn):** sửa quy trình import (Sổ doanh thu) để KHÔNG nạp lại đơn đã có trên app — dedup tại tầng ingest hoặc tag+loại. → sạch từ gốc, view khỏi phải dedup.

## Kết quả cần ra
- Kết luận **dedup key + nguồn ưu tiên** đã kiểm chứng trên nhiều mẫu.
- **1 đoạn SQL dedup + cách verify** đưa Chung (bỏ vào view hoặc sửa nguồn).
- Ước lượng **tác động lên com** (GMV/người trước-sau dedup) để chốt lại bảng lương.

## Lưu ý / bẫy
- ĐỪNG chỉ "lọc bỏ nguồn import" → mất đơn import-only (đa số đơn không có trên app).
- HCM ngoài phạm vi bảng lương, nhưng lỗi trùng là chung (mọi team có sheet import).
- Con số này ảnh hưởng **lương thật của sale** (com) → cần chính xác.
- Không đổi tên/xoá bảng `C_view_*` của Chung; không sửa prod khi chưa duyệt.
