---
title: "Tổng quan xuất hóa đơn (B4)"
order: 0
audience: ["ke-toan"]
---

Áp dụng khi: cần hiểu tổng thể bước phát hành hoá đơn sau khi khoá học đã được đăng ký ở B3.

![Màn hình Xuất hóa đơn: tab Chờ xuất / Đã xuất, danh sách Course Code](/docs-images/module4/tong-quan-1.png)

## Nguyên tắc

- Mỗi **Course Code** (1 gói học đã đăng ký ở Tạo gói học) → **1 hoá đơn (INV)**.
- Xuất hoá đơn **không phụ thuộc Order ID CRM** — vẫn xuất được kể cả khi Order ID chưa điền, chỉ cần đủ thông tin khách hàng.
- Điều kiện xuất phụ thuộc khách **có lấy hoá đơn hay không** (tick "Khách hàng cần xuất hoá đơn?" trên PR):
  - **Khách KHÔNG lấy hoá đơn**: chỉ cần tên khách + SĐT — không cần địa chỉ hay giấy tờ gì thêm.
  - **Khách VN lấy hoá đơn**: cần **Họ tên đầy đủ** + **Số CCCD** + **Email nhận hoá đơn** + địa chỉ **Tỉnh/TP + Phường/Xã** (số nhà có thì điền, không bắt buộc).
  - **Khách nước ngoài lấy hoá đơn**: cần **Họ tên đầy đủ** + **Số hộ chiếu** + **Email** — địa chỉ chỉ cần tên nước (Đức, Pháp...).

## 2 tab chính

- **Chờ xuất** — Course Code đã đủ điều kiện, chưa phát hành INV.
- **Đã xuất** — đã có INV, tải được file kê khai thuế.

## Luồng

1. Vào tab **Chờ xuất**, chọn 1 hoặc nhiều dòng đủ điều kiện.
2. Bấm **Xuất hoá đơn** (xem bài **Xuất hóa đơn theo Course Code**).
3. Dòng chuyển sang tab **Đã xuất**, tải file thuế khi cần đối soát kê khai.

> ⚠️ Lưu ý: với khách **lấy hoá đơn**, dòng thiếu thông tin (họ tên đầy đủ / CCCD / email / địa chỉ) sẽ không xuất được — nhờ sale bổ sung ở PR, hoặc kế toán điền trực tiếp trong form xuất hoá đơn.
