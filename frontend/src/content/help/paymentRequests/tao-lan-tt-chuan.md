---
title: "Tạo lần thanh toán (TT) chuẩn"
order: 1
audience: ["sale"]
---

Áp dụng khi: khách đã chốt gói học, cần tạo Payment Request (PR) mới để bắt đầu thu tiền.

![Modal Tạo Payment Request — SĐT, tên khách, tổng tiền dự kiến, nguồn KH](/docs-images/paymentRequests/tao-lan-tt-chuan-1.png)

## Các bước

1. Vào **Quản lý thanh toán** → bấm **+ Tạo Payment Request**.
2. Nhập **Số điện thoại** khách — chọn đúng quốc gia ở ô bên cạnh trước khi gõ số. Có thể dán cả cụm dạng `84-352334789`, hệ thống tự tách đầu số.
3. Nhập **Tên khách hàng** (họ và tên đầy đủ).
4. Nhập **Tổng tiền dự kiến** — số tiền khách dự kiến chuyển, không để trống.
5. Chọn **Nguồn KH** và **Kênh** (nếu nguồn yêu cầu chọn kênh).
6. (Tuỳ chọn) Nhập **Tên con (học viên)** — nếu để trống, nội dung chuyển khoản sẽ dùng tên khách hàng thay thế.
7. (Tuỳ chọn) Nhập **UID CRM** nếu đã có — có thể bổ sung sau, nhưng bắt buộc phải điền trước khi kích hoạt khoá học (B3).
8. Bấm **Tạo PR-ID & mở chi tiết**.

## Sau khi tạo

- Hệ thống tự sinh mã QR chuyển khoản cho lần thanh toán đầu tiên của PR (xem bài **Xem & gửi mã QR cho khách**).
- Gửi mã QR cho khách để khách chuyển tiền.
- Sau khi khách chuyển xong, tải ảnh bill lên PR để kế toán đối soát.

> ⚠️ Lưu ý: nếu PR phục vụ nhiều con, gõ nhiều tên vào ô **Tên con**, phân cách bằng `-`, `&`, `,`, `/`, "và" — VD: `Bảo Châu - Bảo Khánh`. Hệ thống tự tách thành từng bé riêng khi kích hoạt (xem bài "Thêm UID / thêm gói cho bé khác" ở bước Kích hoạt khóa học). Khi tạo lần thanh toán, ô **Tên trên nội dung CK** cho chọn đúng 1 bé cụ thể (hoặc cả PH, hoặc cả các bé) — không phải lúc nào cũng ghi chung 1 tên.
