---
title: "Xem lịch sử thay đổi của PR"
order: 4
audience: ["sale", "leader"]
---

Áp dụng khi: cần kiểm tra PR từng qua tay ai, hoặc ai đã sửa/xác nhận gì trên PR này.

![Modal Lịch sử PR — lịch sử lưu chuyển sở hữu + lịch sử thao tác](/docs-images/paymentRequests/xem-lich-su-pr-1.png)

## Các bước

1. Mở PR cần xem → bấm **Xem lịch sử**.
2. Modal **"Lịch sử PR"** hiện 2 phần:
   - **Lịch sử lưu chuyển (sở hữu)** — ai sở hữu PR từ mốc nào (tạo / tạo hộ / chuyển giao qua từng bước).
   - **Lịch sử thao tác** — nhật ký chi tiết: xác nhận tiền, sửa số tiền, tải bill, huỷ…

## Khi nào cần dùng

- Đối chiếu khi nghi ngờ PR bị sửa nhầm số tiền/thông tin.
- Kiểm tra PR đã qua tay bao nhiêu sale trước khi về tay mình (đặc biệt sau khi chuyển giao).
- Xác minh ai đã xác nhận 1 lần thanh toán cụ thể.

> ⚠️ Lưu ý: 2 nhật ký chỉ tải khi mở modal (lazy-load) — nếu danh sách trống, đợi vài giây rồi kiểm tra lại kết nối mạng trước khi báo lỗi.
