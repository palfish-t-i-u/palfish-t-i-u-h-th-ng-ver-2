# Learning: Nâng gói học (upgrade course package) trên AR đã activated

**Date**: 2026-08-26
**Triggered by**: PR-2026-1212 (Ba Quang Vinh) — khách đóng thêm tiền, muốn nâng gói từ 35.5tr lên 49.995tr

## Problem

Khách đã thanh toán lần 1 (35.5tr), sale đã tạo gói học + activated (order_id set) trên CRM.
Khách đóng thêm lần 2 (14.495tr), muốn nâng gói (huỷ gói cũ trên CRM, tạo gói mới tổng 49.995tr).
UI khoá sửa amount khi course đã activated → không thao tác được trên app.

## Trap

- UI "Đã tạo gói học" (toggle xanh) = course có `order_id` ≠ "" → FE khoá edit trong một số view
- Nhưng thực tế: **BE PATCH không chặn** sửa amount/order_id của course đã activated (chỉ guard budget ceiling)
- Nút "Báo đơn bổ sung" chỉ dùng cho THÊM gói/bé mới, không phải nâng gói cũ

## Insight

- `activated` là FE-derived (`order_id !== ""`), không phải DB column
- Xoá AR bị chặn nếu course đã invoiced (409), nhưng reset order_id thì không
- Cách nhanh nhất: SQL trực tiếp reset `order_id` → "" + sửa `amount`, giữ nguyên course code

## Rule

Khi cần nâng gói đã activated:
1. Huỷ gói cũ bên CRM (ngoài app)
2. SQL update `active_requests.uids_data`: đổi amount + clear `order_id`, `order_id_set_by`, `order_id_set_at`
3. Reload app → toggle "Chờ tạo gói học" → sale/quản trị điền order_id mới

```sql
UPDATE active_requests
SET uids_data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(uids_data, '{0,courses,0,amount}', '<NEW_AMOUNT>'),
      '{0,courses,0,order_id}', '""'
    ),
    '{0,courses,0,order_id_set_by}', 'null'
  ),
  '{0,courses,0,order_id_set_at}', 'null'
),
updated_at = now()
WHERE id = '<AR-ID>';
```

## Schema notes (tránh lặp lỗi SQL)

- Bảng `active_requests`: PK là `id` (string, e.g. "AR-2026-0503"), FK là `pr_id` (không phải `payment_request_id`)
- Không có cột `ar_number`, `pr_number`, `display_id`, `payment_request_id`
- Bảng `payment_requests`: PK `id` (string, e.g. "PR-2026-1212") — không có cột `pr_number`

## Open question (27/8)

Thu Hiền: doanh thu ghi nhận ngày 23 (ngày báo đơn gốc), KHÔNG phải ngày 26 (ngày nâng gói). Cần hiểu rule ghi nhận doanh thu khi nâng gói — chờ giải thích từ Thu Hiền.
