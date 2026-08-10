# Tích hợp GMV → BigQuery qua Fivetran

**Trạng thái:** LIVE từ 10/8/2026
**Mục đích:** Đẩy dữ liệu GMV từ app (Supabase prod) sang BigQuery để bộ phận dữ liệu (Chung) đấu nối, tạo view phục vụ tính lương/thưởng sale.
**Chiều dữ liệu:** một chiều Supabase → BigQuery (chỉ đọc, không ghi ngược về app).

> ⚠️ Repo public — **không** commit mật khẩu/secret vào đây. Giá trị nhạy cảm (mật khẩu `bq_readonly`) lưu trong Fivetran connection config, hỏi Anh Minh khi cần.

---

## Kiến trúc

```
Supabase prod (project_palfish)  →  Fivetran (Query-Based/XMIN)  →  BigQuery (pf-salary)
   public.so_doanh_thu                  connection: palfish_gmv        dataset: palfish_gmv_public
   public.nhan_su_sale                  sync mỗi 6 giờ                  region: asia-southeast1
```

## Cấu hình Fivetran

| Mục | Giá trị |
|---|---|
| Account | PalFish_Singapore_Vietnam |
| Connection | `palfish_gmv` (PostgreSQL source) |
| Nguồn host | Session pooler: `aws-1-ap-southeast-2.pooler.supabase.com:5432` (dùng pooler vì host trực tiếp của Supabase chỉ có IPv6) |
| Database | `postgres` · project ref `jozcvbbypwvzaefteoxn` |
| DB user | `bq_readonly.jozcvbbypwvzaefteoxn` (role chỉ-đọc; mật khẩu KHÔNG lưu ở repo) |
| TLS | Trust **Supabase Root 2021 CA** |
| Sync method | **XMIN** (Query-Based, Soft delete mode) — né logical replication + IPv4 add-on |
| Bảng sync | chỉ `so_doanh_thu` + `nhan_su_sale` |
| Tần suất | 6 giờ/lần |
| Destination | BigQuery project `pf-salary`, dataset `palfish_gmv_public`, region **asia-southeast1** (khớp dataset `payroll` để join được) |
| Auth đích | Service account Fivetran `g-threefold-rendezvous@fivetran-production.iam.gserviceaccount.com` được cấp role **BigQuery User** trên project `pf-salary` |

## User chỉ-đọc trên Supabase (`bq_readonly`)

```sql
-- Tạo role chỉ-đọc cho connector
create role bq_readonly with login password '<ĐẶT_MẬT_KHẨU_MẠNH>';
grant connect on database postgres to bq_readonly;
grant usage on schema public to bq_readonly;
grant select on all tables in schema public to bq_readonly;
alter default privileges in schema public grant select on tables to bq_readonly;
revoke select on public.crm_tokens, public.zalo_oa_credentials from bq_readonly; -- chặn bảng secret

-- BẮT BUỘC: policy RLS cho từng bảng có bật RLS (nếu không -> đọc ra 0 dòng)
create policy bq_readonly_select_all on public.so_doanh_thu for select to bq_readonly using (true);
create policy bq_readonly_select_all on public.nhan_su_sale  for select to bq_readonly using (true);
```

---

## BẪY đã gặp (đọc trước khi sửa/mở rộng)

1. **RLS chặn read-only role → sync 0 dòng.** `so_doanh_thu`/`nhan_su_sale` bật RLS. `bq_readonly` không khớp policy nào → `SELECT` chạy OK nhưng trả **0 dòng** (app đọc được vì service_role bỏ qua RLS). **Fix:** thêm policy `... for select to bq_readonly using (true)` cho từng bảng. → **Mở rộng sang bảng RLS mới nào cũng phải làm bước này.**
2. **XMIN đã sync 0 dòng thì "Sync" thường KHÔNG đọc lại** dòng cũ (vì xmin không đổi). Phải bấm **Re-sync** (link trong tab Schema, theo từng bảng).
3. **`Loaded rows: 0 / no data`** ở Fivetran = triệu chứng của bẫy (1). Kiểm chứng bằng `SELECT COUNT(*)` trên BigQuery.
4. Cấp DDL prod qua Supabase MCP bị classifier chặn → chạy tay trong Supabase SQL Editor.

---

## Hướng dẫn cho bộ phận dữ liệu (Chung)

Data đã ở BigQuery, tự cập nhật mỗi 6 giờ. Chung tự tạo view/query. Quy tắc BẮT BUỘC để ra số đúng:

1. Lọc `is_test = FALSE` — bỏ đơn test.
2. Lọc `_fivetran_deleted = FALSE` — đơn xoá/huỷ ở nguồn được đánh dấu xoá mềm.
3. Quy kỳ doanh thu theo **`ngay_tien_ve`** (KHÔNG dùng `pay_time`) — khớp báo cáo trong app.
4. GMV = cột **`gmv_rmb`** (đơn vị RMB); tiền VND thực thu = `so_tien_vnd`.

### Từ điển cột — `so_doanh_thu`
| Cột | Ý nghĩa |
|---|---|
| `ngay_tien_ve` (DATE) | Ngày tiền về — quy kỳ doanh thu |
| `gmv_rmb` (NUMERIC) | GMV (RMB) |
| `so_tien_vnd` (INT) | Thực thu VND |
| `so_tien_net`, `phi_cong` | Net & phí |
| `sale_crm_name` | Tên sale — định danh (không có mã nhân viên) |
| `team` | Team (text tự do, xem lưu ý) |
| `loai`, `loai_2` | Loại đơn → suy Mới/Refer/Gia hạn |
| `goi_hoc` | Gói học |
| `ten_khach`, `sdt`, `uid` | Thông tin khách |
| `payment_method`, `gateway` | Kênh thanh toán |
| `loai_nhap` | `tu_dong` / `tay` / `hoan` |
| `is_test`, `_fivetran_deleted` | Cờ để lọc |

### Từ điển cột — `nhan_su_sale`
| Cột | Ý nghĩa |
|---|---|
| `crm_name` | Tên — khớp `so_doanh_thu.sale_crm_name` |
| `team` | Nhánh (Inhouse 1/2, HN Offline Store...) |
| `sub_team` | Team con (Team 5, An Binh Store, Linh Dam Store...) |
| `role` | sale / leader / manager / ops / system |
| `email`, `manager_email`, `leader_email`, `is_active` | Khác |

### 3 lưu ý bản chất dữ liệu
1. **Không có mã nhân viên** — sale định danh bằng tên (`sale_crm_name`). Đã kiểm tra không ai trùng tên.
2. **Phân loại đơn**: `loai` (+ `loai_2`) gom 5 nhóm: `广告`=Bán mới/Ads (gồm Lives, KOC, Offline...), `转介绍`=Refer, `续费`=Gia hạn, `公海`=Kho chung, `Other`. → "Bán mới" là cả cụm Ads, không phải 1 tag.
3. **Team trong sổ là text tự do, lộn xộn** (VD "Linh Dam (Store)" vs "Linh Dam Store"; nhánh Offline đôi khi ghi chung "HN Offline Store"). Phân cấp chuẩn (nhánh → store) chỉ có ở `nhan_su_sale.team`/`sub_team`. Cần team chuẩn thì join `sale_crm_name = crm_name` lấy từ roster. Vài sale store chạy 2 store trong tháng (VD Vu Thuy Huong, Hoang Thi Hong Tham) — tính lương thì gộp theo người.

### Query mẫu — GMV theo sale tháng trước
```sql
SELECT sd.sale_crm_name AS ten_nhan_vien,
  STRING_AGG(DISTINCT sd.team, ' | ') AS team,
  ROUND(SUM(sd.gmv_rmb),2) AS gmv_rmb, COUNT(*) AS so_don
FROM `pf-salary.palfish_gmv_public.so_doanh_thu` sd
WHERE COALESCE(sd.is_test,FALSE)=FALSE
  AND COALESCE(sd._fivetran_deleted,FALSE)=FALSE
  AND sd.ngay_tien_ve >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(),MONTH),INTERVAL 1 MONTH)
  AND sd.ngay_tien_ve <  DATE_TRUNC(CURRENT_DATE(),MONTH)
  AND sd.sale_crm_name IS NOT NULL AND sd.sale_crm_name != ''
GROUP BY sd.sale_crm_name ORDER BY gmv_rmb DESC;
```

---

## Vận hành (trách nhiệm phía app team)

- **Thêm bảng RLS mới vào Fivetran** → phải thêm policy `bq_readonly` cho bảng đó (bẫy #1), không thì sync 0 dòng.
- **Trial Fivetran 14 ngày** cho connection — hết trial tính phí theo MAR (data nhỏ nên rẻ).
- **Đổi mật khẩu `bq_readonly`**: `alter role bq_readonly with password '...';` rồi cập nhật lại trong Fivetran connection.
- Không cần cấp thêm quyền BigQuery cho Chung — Chung đã có quyền trên project `pf-salary`.
