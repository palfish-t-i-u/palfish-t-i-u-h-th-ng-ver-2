---
title: "Tổng quan kích hoạt khóa học (B3)"
order: 0
audience: ["sale"]
---

Áp dụng khi: cần hiểu tổng thể bước đăng ký khoá học sau khi PR đã báo đơn.

## Khái niệm chính

- **Active Request (AR)** — 1 yêu cầu kích hoạt, chứa danh sách bé + gói học đã đăng ký cho 1 PR.
- **UID** — mã học viên trên CRM, mỗi bé 1 UID riêng.
- **Course Code** — mã do hệ thống tự sinh cho mỗi gói học, dùng để đối chiếu khi xuất hoá đơn (B4).
- **Order ID CRM** — mã đơn hàng thật trên CRM, điền sau khi kích hoạt khoá học trên CRM xong (không bắt buộc ngay, chỉ là nhắc mềm).

## Luồng thường gặp

1. Sale bấm **Báo đơn & Kích hoạt** ở PR đã đủ tiền → AR được tạo tự động (xem bài **Báo đơn & Kích hoạt khoá học** ở Quản lý thanh toán).
2. Vào **Kích hoạt khóa học**, tìm đúng AR, điền **Order ID CRM** cho từng Course Code sau khi đã đăng ký khoá thật trên CRM.
3. Nếu phát sinh thêm bé/gói cho AR đã có, dùng **Thêm UID / thêm gói cho bé khác**.
4. Order ID đã điền → Course Code sẵn sàng để xuất hoá đơn ở **Xuất hóa đơn**.

> ⚠️ Lưu ý: Order ID chỉ là nhắc mềm, **không chặn** xuất hoá đơn — hoá đơn vẫn xuất được khi thiếu Order ID, cần bổ sung sau khi kích hoạt trên CRM để không quên đối chiếu.
