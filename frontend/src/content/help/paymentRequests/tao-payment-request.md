---
title: "Tạo Payment Request — Hướng dẫn đầy đủ"
order: 1
audience: ["sale", "leader"]
---

Áp dụng khi: cần tạo một Payment Request (PR) mới để bắt đầu thu tiền cho khách đã chốt gói học. Bài này hướng dẫn chi tiết từng trường hợp — từ tạo nhanh nhất đến các tình huống đặc biệt.

![Modal Tạo Payment Request mới — form điền thông tin khách hàng](/docs-images/paymentRequests/tao-payment-request-1.png)

## Mục lục

<!-- Mục lục tự sinh từ các heading "## " bên dưới → thanh mục lục bên trái (desktop) + khối inline (mobile). Giữ heading "## Mục lục" này làm cờ bật mục lục; không cần liệt kê tay. -->

---

## Tạo PR nhanh — chỉ 4 trường bắt buộc

Dùng khi: cần tạo đơn nhanh nhất có thể, các thông tin phụ bổ sung sau.

### Các bước tạo nhanh

1. Vào **Quản lý thanh toán** → bấm **+ Tạo Payment Request** (nút tím, góc phải trên).
2. Nhập **Số điện thoại** — chọn đúng quốc gia ở ô bên trái, rồi gõ số. Có thể dán cả cụm dạng `84-352334789`, hệ thống tự tách đầu số.
3. Nhập **Tên khách hàng** — họ và tên đầy đủ của phụ huynh.
4. Nhập **Tổng tiền dự kiến** — tổng số tiền khách dự kiến chuyển (VNĐ). Hệ thống tự đọc thành chữ để kiểm tra (VD: "mười hai triệu").
5. Chọn **Nguồn KH** — nếu nguồn yêu cầu chọn thêm **Kênh** thì chọn luôn.
6. Bấm **+ Tạo PR-ID & mở chi tiết**.

> Chỉ 4 trường có dấu **\*** là bắt buộc. Mọi trường khác (Tên con, UID CRM, Địa chỉ, Email, MST…) đều bổ sung được sau khi tạo xong.

---

## Tạo PR đầy đủ thông tin

Dùng khi: đã có sẵn đầy đủ thông tin khách, muốn điền 1 lần cho xong.

### Các bước tạo đầy đủ

1. Bấm **+ Tạo Payment Request**.
2. Điền 4 trường bắt buộc giống phần [Tạo PR nhanh](#tao-pr-nhanh-chi-4-truong-bat-buoc).
3. Điền thêm các trường tuỳ chọn:

| Trường | Mô tả | Lưu ý |
|---|---|---|
| **Tên con (học viên)** | Tên bé đăng ký khoá học | Nếu để trống, nội dung chuyển khoản dùng tên PH |
| **UID CRM** | Mã khách hàng trên hệ thống CRM | Bổ sung sau được, nhưng **bắt buộc** trước khi tạo gói học (B3) |
| **Địa chỉ** | Tỉnh/TP, Phường/Xã, Số nhà (khách VN) | Chỉ cần khi khách lấy hoá đơn — khi đó điền tối thiểu Tỉnh/TP + Phường/Xã (số nhà có thì điền) |
| **Email** | Email khách | **Bắt buộc khi khách lấy hoá đơn** (hoá đơn điện tử gửi qua email) |
| **Loại khách hàng** | Cá nhân hoặc Doanh nghiệp | Xem mục [Khách doanh nghiệp](#khach-doanh-nghiep-can-xuat-hoa-don) |
| **Họ tên đầy đủ (in trên HĐ)** | Tên pháp lý trên giấy tờ của khách | Hiện khi tick "Cần xuất hoá đơn" — khác với ô Tên khách hàng (tên gọi hằng ngày như "Chị Hằng") |
| **Số CCCD / Hộ chiếu** | CCCD (khách VN) hoặc hộ chiếu (khách nước ngoài) | **Bắt buộc khi khách lấy hoá đơn** (yêu cầu của thuế); doanh nghiệp thì điền MST |
| **Ghi chú** | Ghi chú nội bộ | Chỉ sale & kế toán thấy, khách không thấy |

4. Bấm **+ Tạo PR-ID & mở chi tiết**.

---

## PR cho nhiều con (nhiều bé cùng 1 đơn)

Dùng khi: 1 phụ huynh đăng ký khoá học cho 2 bé trở lên, muốn gộp chung 1 PR.

### Cách gộp nhiều con vào 1 PR

- Ở ô **Tên con (học viên)**, gõ tên các bé cách nhau bằng dấu `-`, `&`, `,`, `/`, hoặc chữ "và".
- VD: `Bảo Châu - Bảo Khánh` hoặc `Minh Anh, Minh Khôi`.
- Hệ thống tự tách thành từng bé riêng biệt khi làm bước Tạo gói học (B3).

![Ô Tên con với 2 tên bé phân cách bằng dấu gạch ngang](/docs-images/paymentRequests/tao-payment-request-2.png)

> Khi tạo lần thanh toán sau này, ô **Tên trên nội dung CK** sẽ cho chọn tên 1 bé cụ thể (hoặc tên PH, hoặc tên tất cả các bé) — không bắt buộc ghi chung.

---

## Khách nước ngoài

Dùng khi: khách đang sống ở nước ngoài, SĐT quốc tế.

### Cách nhập khách nước ngoài

1. Ở ô **Số điện thoại**, đổi quốc gia sang nước tương ứng (VD: chọn 🇩🇪 DE +49 cho khách ở Đức).
2. Tại mục **Địa chỉ khách hàng**, bấm **Khách nước ngoài** → chọn quốc gia khách đang ở (bắt buộc).
3. Các trường khác điền bình thường.

![Mục Địa chỉ khách hàng với nút Khách nước ngoài được chọn](/docs-images/paymentRequests/tao-payment-request-3.png)

> Khách nước ngoài **vẫn lấy hoá đơn được**: tick ☑ "Khách hàng cần xuất hoá đơn?" rồi điền **Họ tên đầy đủ** + **Số hộ chiếu** + **Email** — địa chỉ chỉ cần chọn đúng quốc gia, không cần chi tiết.

---

## Khách doanh nghiệp — cần xuất hoá đơn

Dùng khi: khách là công ty, cần xuất hoá đơn GTGT.

### Cách nhập khách doanh nghiệp

1. Tại mục **Loại khách hàng**, bấm **Doanh nghiệp**.
2. Nhập **Tên công ty** (VD: Công ty TNHH ABC).
3. Nhập **Mã số thuế doanh nghiệp** (chỉ chứa số, VD: 0123456789).
4. Tick ☑ **Khách hàng cần xuất hoá đơn?** (mục Địa chỉ).
5. Nhập **Email** khách để gửi hoá đơn điện tử.
6. Điền **Địa chỉ** (Tỉnh/TP + Phường/Xã — số nhà có thì điền) — cần điền xong **trước 15h ngày hôm sau, kể từ ngày tiền vào tài khoản**, để kế toán kịp xuất hoá đơn.

![Mục Loại khách hàng — Doanh nghiệp được chọn, kèm ô Tên công ty và MST](/docs-images/paymentRequests/tao-payment-request-4.png)

> Khách cá nhân cũng có thể tick "Cần xuất hoá đơn" — khi đó điền **Họ tên đầy đủ** + **Số CCCD/Hộ chiếu** + **Email** (yêu cầu bắt buộc của thuế từ 2025).

---

## Tạo hộ PR cho sale khác (dành cho Leader)

Dùng khi: Leader/Manager tạo PR thay cho sale trong đội.

### Cách tạo hộ PR

1. Mở modal Tạo Payment Request — trường đầu tiên là **Sale sở hữu PR** (chỉ Leader/Manager thấy).
2. Chọn sale trong dropdown — có thể gõ tên để tìm.
3. Điền thông tin khách bình thường.
4. Bấm **+ Tạo PR-ID & mở chi tiết**.

### Lưu ý quan trọng

- PR sẽ **đứng tên sale được chọn**, không phải người tạo.
- **Doanh thu, KPI, BXH** tính cho sale được chọn.
- **Thông báo** Zalo/DingTalk gửi cho sale được chọn.
- Hệ thống tự ghi nhật ký "ai tạo hộ ai" — xem lại được ở mục Lịch sử chuyển giao trong chi tiết PR.

---

## Sau khi tạo PR — bước tiếp theo

Khi bấm **+ Tạo PR-ID & mở chi tiết**, hệ thống sẽ:

1. Tạo mã PR-ID (VD: PR-2026-0855).
2. Tự động mở **ngăn chi tiết PR** (drawer bên phải).
3. Tại drawer, bấm **Tạo lần thanh toán đầu tiên** để tạo mã QR (hoặc chọn phương thức Tiền mặt / Quẹt thẻ / Trả góp).
4. Gửi mã QR cho khách qua Zalo/điện thoại.
5. Sau khi khách chuyển tiền, tải ảnh bill lên PR để kế toán đối soát.

> Xem thêm bài **Xem & gửi mã QR cho khách** và **Tải ảnh bill & xử lý thiếu bill** để biết chi tiết các bước tiếp theo.
