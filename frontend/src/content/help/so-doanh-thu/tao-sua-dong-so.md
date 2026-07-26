---
title: "Tạo & sửa dòng sổ doanh thu"
order: 20
audience: ["ke-toan"]
---

Áp dụng khi: cần thêm 1 dòng ghi nhận doanh thu thủ công (đơn không tự đổ từ M3), hoặc sửa lại thông tin dòng đã có.

## Tạo dòng mới

1. Vào **Sổ doanh thu** → bấm **+ Thêm dòng**.
2. Điền các trường bắt buộc:
   - **User Name** — tên khách hàng
   - **Phone** — SĐT dạng `84-9xx xxx xxx`
   - **UID** — UID CRM
   - **Pay Time (ngày tiền về)** — ngày thực nhận tiền
   - **Real Pay (VND)** — số tiền thực nhận
   - **Lần thanh toán** — chọn hoặc gõ (VD: gõ `11` → `11th`)
   - **Loại / Type** — chọn đúng 1 nhãn
   - **Sales** — tên sale CRM
   - **Team**
   - **Package (gói học)** — gõ để tìm, dùng chung danh sách với tab QR
3. (Tuỳ chọn) **GMV (RMB)** — để trống thì hệ thống tự tính bằng VNĐ ÷ 3700.
4. (Tuỳ chọn) **Loại 2 (kênh con)**, **Ghi chú**, **Note 2**.
5. Bấm **Thêm dòng**.

## Sửa dòng đã có

1. Bấm vào dòng cần sửa trong bảng sổ doanh thu.
2. Modal **"Chỉnh sửa dòng Sổ doanh thu"** mở ra với dữ liệu hiện có.
3. Sửa các trường cần thiết → bấm **Lưu**.

> ⚠️ Lưu ý: các dòng do M3 tự động đổ về từ Active Request/Course thì không nên sửa tay số tiền hay Pay Time — đối chiếu lại nguồn gốc AR trước khi sửa, tránh lệch số với hệ thống kích hoạt.
