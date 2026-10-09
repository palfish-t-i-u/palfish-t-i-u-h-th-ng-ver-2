# Schema bảng trung gian GMV (bản gửi Chung)

> Mục đích: bảng doanh thu GMV hợp nhất **1 nguồn/ngày** — quá khứ theo All File Thu Hiền, ngày hiện tại theo app GMV. Dựng **tách riêng**, tên `raw.gmv_intermediate`, chạy **song song `raw.gmv_all`** để theo dõi; khi ổn định mới thay hẳn gmv_all.
>
> Schema **y hệt `raw.gmv_all` hiện tại (15 cột) + `order_id`** → khi promote là drop-in, Eric không phải sửa query.

## Nguồn dữ liệu (mỗi ngày 1 nguồn)
- **Đơn trước hôm nay** → All File Thu Hiền (2 tab Auto, đồng bộ từ DingTalk 1×/ngày). Bắt được cả sửa đổi đơn cũ.
- **Đơn trong hôm nay** → app GMV (`so_doanh_thu`, real-time).

Ranh giới "hôm nay" tịnh tiến mỗi ngày.

## Cột bảng = 15 cột gmv_all + order_id

| Cột | Kiểu | Ý nghĩa | Khoá ghép order_id? |
|---|---|---|---|
| `source` | text | Nguồn dòng: `allfile` \| `app` (tái dùng cột source của gmv_all) | |
| `order_date` | text | Ngày đơn | ✔ |
| `uid` | text | UID học viên | ✔ (chính) |
| `phone` | text | SĐT | ✔ (phụ) |
| `customer_name` | text | Tên khách | |
| `sale_name` | text | Tên sale | |
| `sale_name_norm` | text | Tên sale chuẩn hoá | ✔ (khi thiếu UID) |
| `package` | text | Gói học | ✔ |
| `order_type` | text | New / Resell / Refer | |
| `amount_vnd` | bigint | Doanh thu thực nhận (VND) | ✔ |
| `gmv_rmb` | text | GMV quy RMB | |
| `payment_method` | text | 1st/2nd/3rd... | ✔ (phụ) |
| `team` | text | Team | |
| `is_test` | text | Đơn test hay không | |
| `loaded_at` | text | Thời điểm sync | |
| **`order_id`** | text | **Cần ghép** (xem dưới) — cột MỚI so với gmv_all | |

## Về order_id — chỗ cần Chung hướng dẫn

- **Đơn "today" (từ app)**: `so_doanh_thu` đã có sẵn `crm_order_id` + mã đơn `CC-xxxx` → tự điền, không cần ghép tay.
- **Đơn "past" (từ All File)**: All File **không có order_id** → cần ghép từ bảng mapping của Chung (`GMV_Master_order_id`).

**Cần Chung cho biết**: ghép order_id vào đơn quá khứ theo khoá nào cho chuẩn (tránh trùng khi 1 khách mua nhiều lần cùng giá)? Các cột đang có để join:
1. `uid` + `order_date` + `amount_vnd` + `package` (tổ hợp).
2. `uid` + `package` + `payment_method`.
3. Nếu Chung map được `CC-xxxx` (course code) ↔ order_id thì càng chắc.

Chung chọn khoá rồi báo lại; **mình tự viết bước join + tổng hợp + đẩy bảng lên ECS**, Chung không phải sửa tay.

## Quy trình vận hành (trên ECS)
1. Sync DingTalk → All File (2 tab Auto) — 1×/ngày.
2. Script dựng `raw.gmv_intermediate`: đọc All File (past) + `so_doanh_thu` (today) → chuẩn hoá về 15 cột gmv_all → ghép order_id theo hướng dẫn Chung.
3. Chạy song song, đối chiếu với `gmv_all` mỗi ngày. Ổn định → promote thay `gmv_all`.
