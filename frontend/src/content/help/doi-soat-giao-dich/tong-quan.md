---
title: "Tổng quan đối soát giao dịch"
order: 10
audience: ["ke-toan"]
---

Áp dụng khi: cần hiểu tổng thể việc xác nhận tiền khách chuyển đã thực sự về tài khoản công ty.

## Các loại đối soát

| Loại | Tab | Khi nào dùng |
|---|---|---|
| Chuyển khoản có mã QR (PayOS/SePay) | **Chờ xác nhận** | Hệ thống thường tự khớp qua mã app trong nội dung CK |
| Chuyển khoản ngoài (không mã, hoặc mã sai) | **CK ngoài chờ ghép** | Ghép tay theo số tiền/tên/SĐT (xem bài **Ghép chuyển khoản ngoài**) |
| Quẹt thẻ / trả góp | **Đối soát quẹt thẻ** | Đối chiếu với sao kê mPOS/Payoo (module riêng) |

## Luồng chung

1. Giao dịch tiền về xuất hiện ở tab tương ứng.
2. Kế toán đối chiếu với lần thanh toán (payment line) của đúng PR.
3. Nếu số tiền lệch, hệ thống hỏi xác nhận trước khi ghép (xem bài **Xử lý số tiền không khớp**).
4. Xác nhận xong, lần thanh toán chuyển sang trạng thái đã nhận tiền, PR tiến tới bước Kích hoạt khóa học khi đủ 100%.

> ⚠️ Lưu ý: luôn đối chiếu ảnh bill sales gửi trước khi xác nhận — đặc biệt khi có nhiều giao dịch trùng số tiền, đây là nguyên nhân ghép nhầm phổ biến nhất.
