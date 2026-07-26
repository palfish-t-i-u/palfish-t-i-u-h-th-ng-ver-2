---
title: "Tổng quan luồng thanh toán B1→B4"
order: 10
audience: ["sale", "ke-toan"]
---

Áp dụng khi: cần hiểu tổng thể 1 đơn hàng đi qua những bước nào từ lúc chốt khách đến lúc xuất hoá đơn.

## 4 bước chính

1. **B1 — Quản lý thanh toán**: tạo Payment Request (PR), sinh mã QR, khách chuyển tiền, sale tải ảnh bill.
2. **B2 — Đối soát giao dịch**: kế toán xác nhận tiền đã về (tự động qua PayOS/SePay, hoặc ghép tay CK ngoài/quẹt thẻ).
3. **B3 — Kích hoạt khóa học**: khi PR đủ 100% tiền, sale báo đơn → tạo Active Request (AR), đăng ký khoá học, sinh Course Code.
4. **B4 — Xuất hóa đơn**: kế toán xuất hoá đơn (INV) theo từng Course Code.

## Quan hệ giữa các khái niệm

- **1 PR** có thể có **nhiều lần thanh toán** (khách chuyển nhiều đợt) và **nhiều bé/gói học** (xem bài **Tạo lần thanh toán chuẩn**, mục ghi nhiều tên con).
- **1 AR** (Active Request) chứa danh sách bé + gói học đã đăng ký, mỗi gói ra 1 **Course Code**.
- **1 Course Code** = 1 hoá đơn (INV) ở bước B4.

## Đi đâu để làm gì

| Việc cần làm | Vào module |
|---|---|
| Tạo đơn mới, xem QR, tải bill, báo đơn | **Quản lý thanh toán** |
| Xác nhận tiền CK/quẹt thẻ đã về | **Đối soát giao dịch** |
| Đăng ký khoá học, điền Order ID CRM | **Kích hoạt khóa học** |
| Xuất hoá đơn, tải file kê khai thuế | **Xuất hóa đơn** |
| Xem/sửa dòng doanh thu tổng hợp | **Sổ doanh thu** |

> ⚠️ Lưu ý: mọi thao tác đi đúng thứ tự B1→B4 — không thể kích hoạt khoá học khi PR chưa thu đủ 100% tiền, và không xuất được hoá đơn nếu khoá học chưa được đăng ký ở B3.
