---
title: "Ghép CK ngoài → Lần thanh toán"
order: 2
audience: ["ke-toan"]
---

Áp dụng khi: có tiền vào tài khoản công ty nhưng hệ thống chưa tự khớp được với lần thanh toán nào (không có mã app, hoặc mã sai) — tiền nằm ở tab **CK ngoài chờ ghép**.

## Các bước

1. Vào **Đối soát giao dịch** → tab **CK ngoài chờ ghép**.
2. Ở dòng giao dịch cần xử lý, bấm **Ghép**.
3. Modal **"Ghép CK ngoài → Lần thanh toán"** mở ra, hiện sẵn **Số tiền**, **Thời gian**, **Nội dung CK** của giao dịch.
4. (Tuỳ chọn) Đánh dấu **Team** (HCM/HN) cho giao dịch nếu cần phân loại theo khu vực.
5. Tìm lần thanh toán cần ghép ở danh sách bên trái:
   - Gõ vào ô tìm kiếm theo **PR-ID, tên KH, UID, SĐT, hoặc mã CK**.
   - Bấm chip **Cùng số tiền** để chỉ hiện các lần TT khớp đúng số tiền giao dịch.
   - Các badge màu trên từng thẻ kết quả gợi ý mức độ khớp: **Khớp mã TT**, **Khớp SĐT**, **Khớp tên**, **Cùng số tiền**, **Có bill** / **Chưa có bill**.
6. Bấm chọn đúng lần thanh toán — ảnh bill (nếu có) sẽ hiện ở cột phải để đối chiếu.
7. Bấm **Xác nhận ghép**.

## Sau khi ghép

- Lần thanh toán chuyển sang trạng thái đã xác nhận tiền về.
- Giao dịch biến mất khỏi tab **CK ngoài chờ ghép**.

> ⚠️ Lưu ý: luôn đối chiếu **ảnh bill** trước khi ghép, đặc biệt khi có nhiều lần TT cùng số tiền (nhiều giao dịch trùng amount là nguyên nhân ghép nhầm phổ biến nhất). Nếu lần TT chưa có bill, hệ thống cảnh báo rõ — nhắc sale upload bill trước khi xác nhận.
