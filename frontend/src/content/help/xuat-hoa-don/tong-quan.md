---
title: "Tổng quan xuất hóa đơn (B4)"
order: 10
audience: ["ke-toan"]
---

Áp dụng khi: cần hiểu tổng thể bước phát hành hoá đơn sau khi khoá học đã được đăng ký ở B3.

## Nguyên tắc

- Mỗi **Course Code** (1 gói học đã đăng ký ở Kích hoạt khóa học) → **1 hoá đơn (INV)**.
- Xuất hoá đơn **không phụ thuộc Order ID CRM** — vẫn xuất được kể cả khi Order ID chưa điền, chỉ cần đủ thông tin khách hàng.
- Điều kiện đủ để xuất: có **Tên khách**, **SĐT**, và **Địa chỉ** (hoặc Phường/Xã, hoặc Tỉnh/Thành) đầy đủ.

## 2 tab chính

- **Chờ xuất** — Course Code đã đủ điều kiện, chưa phát hành INV.
- **Đã xuất** — đã có INV, tải được file kê khai thuế.

## Luồng

1. Vào tab **Chờ xuất**, chọn 1 hoặc nhiều dòng đủ điều kiện.
2. Bấm **Xuất hoá đơn** (xem bài **Xuất hóa đơn theo Course Code**).
3. Dòng chuyển sang tab **Đã xuất**, tải file thuế khi cần đối soát kê khai.

> ⚠️ Lưu ý: dòng thiếu thông tin khách (chưa đủ tên/SĐT/địa chỉ) sẽ không xuất được — bổ sung thông tin ở PR hoặc AR liên quan trước khi quay lại xuất hoá đơn.
