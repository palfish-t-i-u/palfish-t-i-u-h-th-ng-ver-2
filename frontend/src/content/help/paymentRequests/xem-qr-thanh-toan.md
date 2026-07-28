---
title: "Xem & gửi mã QR cho khách"
order: 5
audience: ["sale"]
---

Áp dụng khi: cần lấy mã QR chuyển khoản của 1 lần thanh toán để gửi cho khách.

![Modal QR thanh toán — mã QR, ngân hàng, số tài khoản, nội dung CK](/docs-images/paymentRequests/xem-qr-thanh-toan-1.png)

## Các bước

1. Mở PR → chọn đúng lần thanh toán cần lấy QR.
2. Modal **"QR thanh toán · Lần #..."** hiện đầy đủ: **Ngân hàng**, **Chủ tài khoản**, **Số tài khoản**, **Số tiền**, **Nội dung chuyển khoản**.
3. Chờ mã QR tải xong (nút hiện **"Đang tải QR…"** trong lúc chờ — không thao tác được cho tới khi ảnh sẵn sàng).
4. Chọn cách gửi cho khách:
   - **Chụp mã QR** — tải ảnh QR kèm thông tin CK về máy để gửi qua Zalo/tin nhắn.
   - **Copy mã QR** — copy ảnh QR vào clipboard, dán trực tiếp vào khung chat.
   - **Copy nội dung CK** — copy toàn bộ text (ngân hàng, số tài khoản, số tiền, nội dung CK) dạng chữ.

## Sau khi gửi

- Khách chuyển khoản xong, hệ thống tự xác nhận (PayOS/SePay) hoặc kế toán ghép tay ở tab **Đối soát giao dịch**.
- Tải ảnh bill khách gửi lên PR (xem bài **Tải ảnh bill & xử lý thiếu bill**).

> ⚠️ Lưu ý: nếu nút **Chụp mã QR**/**Copy mã QR** hiện "Đang tải QR…", đợi ảnh tải xong hẳn rồi mới bấm — bấm sớm có thể chụp nhầm ảnh QR cũ từ lần xem trước.
