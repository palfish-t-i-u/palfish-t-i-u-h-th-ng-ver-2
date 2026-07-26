---
title: "Điền Order ID & tạm hoãn kích hoạt"
order: 7
audience: ["sale", "admin"]
---

Áp dụng khi: đã đăng ký khoá học thật trên CRM, cần đối chiếu lại vào hệ thống; hoặc PH chưa muốn kích hoạt ngay.

## Điền Order ID CRM

1. Mở AR → tìm đúng dòng **Course Code** cần điền.
2. Nhập **Order ID** (mã đơn hàng trên CRM, dạng `ORD-XXXX-XXXXX`) vào ô tương ứng.
3. Bấm **Lưu** ở cuối dòng để ghi vào hệ thống.
4. Sau khi đủ Order ID, dùng nút **Yêu cầu xuất** (từng dòng) hoặc **Yêu cầu xuất hoá đơn (B4)** (cả AR) để báo kế toán xuất hoá đơn.

## AR đang tạm hoãn kích hoạt ("Chưa kích hoạt")

Khi báo đơn, sale có thể chọn **Chưa kích hoạt** kèm ghi chú lý do. AR đó sẽ:

- Hiện banner vàng **"PH chưa muốn kích hoạt"** kèm ghi chú lý do trong drawer chi tiết.
- Lọc được riêng bằng bộ lọc trạng thái hoãn kích hoạt trong danh sách AR.

Khi PH đồng ý kích hoạt trở lại, xử lý bình thường (điền Order ID, yêu cầu xuất hoá đơn) — banner tự ẩn khi AR chuyển trạng thái đã kích hoạt/đã xuất hoá đơn.

## Nếu popup báo "Order ID đã tồn tại — không lưu được"

Order ID vừa nhập đã được dùng ở 1 Active Request/course khác. Kiểm tra lại đúng mã trên CRM trước khi nhập lại — Order ID phải là duy nhất trong toàn hệ thống.

> ⚠️ Lưu ý: Order ID **không bắt buộc** để xuất được hoá đơn — chỉ là nhắc mềm giúp không quên đối chiếu CRM. Đừng để trống quá lâu, kế toán cần Order ID để tra soát khi có khiếu nại.
