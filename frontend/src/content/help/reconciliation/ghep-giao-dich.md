---
title: "Ghép giao dịch (đối soát chuyển khoản)"
order: 1
audience: ["hr", "ops"]
---
Áp dụng khi: kế toán cần xác nhận 1 giao dịch chuyển khoản (SePay) đã về đúng với 1 lần thanh toán của khách.

## Các bước

1. Vào **Đối soát giao dịch · Chuyển khoản**.
2. Tìm giao dịch cần ghép — lọc theo trạng thái **Chờ xác nhận** nếu danh sách dài.
3. Đối chiếu số tiền + nội dung chuyển khoản với lần thanh toán tương ứng của Payment Request.
4. Bấm **Xác nhận** nếu khớp — hệ thống tự cập nhật trạng thái đã thanh toán cho lần TT đó.
5. Nếu số tiền không khớp, dùng nút **Số tiền không khớp** để xử lý riêng thay vì xác nhận nhầm.

> ⚠️ Lưu ý: không xác nhận khi chưa chắc chắn khớp đúng khách/đúng lần TT — sai sẽ ảnh hưởng số liệu doanh thu.
