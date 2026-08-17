---
title: "Cách tạo và quản lý lần TT (mọi trường hợp)"
order: 2
audience: ["sale", "ke-toan"]
---

Áp dụng khi: cần tạo một lần thanh toán (thu tiền) cho PR, hoặc thao tác trên một lần TT đã có (huỷ, đánh dấu đã TT, sửa số tiền, làm mới nội dung CK).

![Panel "Các lần thanh toán" trong chi tiết PR — danh sách lần TT, nút Tạo lần thanh toán](/docs-images/paymentRequests/quan-ly-lan-thanh-toan-1.png)

> "Lần thanh toán" (lần TT) là **một lần thu tiền bên trong 1 PR**. Một PR có thể có nhiều lần TT — khách chuyển làm nhiều đợt, mỗi đợt có thể một hình thức khác nhau. Muốn tạo **PR mới**, xem bài **Tạo Payment Request — Hướng dẫn đầy đủ**.

## Mục lục

<!-- Mục lục tự sinh từ các heading "## " (mục lớn) và "### " (mục con) bên dưới → thanh mục lục bên phải (desktop) + khối inline (mobile). Giữ heading "## Mục lục" này làm cờ bật mục lục; không cần liệt kê tay. Nhãn ### phải DUY NHẤT (id trùng = anchor nhảy sai). -->

## Tạo lần thanh toán mới

1. Mở **chi tiết PR** (bấm vào dòng PR ở Quản lý thanh toán).
2. Ở panel **Các lần thanh toán**, bấm **Tạo lần thanh toán**. Nếu PR chưa có lần nào, nút ghi **Tạo lần thanh toán đầu tiên**.
3. Chọn **Phương thức thanh toán** — 4 lựa chọn: **Chuyển khoản / Tiền mặt / Quẹt thẻ / Trả góp**. Mỗi phương thức điền khác nhau (xem chi tiết bên dưới).
4. Điền số tiền và các trường theo phương thức.
5. Bấm nút xác nhận ở cuối form để **lưu lần TT**. Nhãn nút đổi theo phương thức: Chuyển khoản là **Tạo QR & mã CK**; Tiền mặt / Quẹt thẻ / Trả góp là **Ghi nhận lần thanh toán**.

> ⚠️ Nếu PR **đã nhận đủ tiền**, các nút Tạo lần thanh toán sẽ **không mở form** mà hiện thông báo "PR đã nhận đủ tiền". Muốn thu thêm, phải **tăng Tổng tiền dự kiến** của PR trước (bấm "Sửa thông tin PR ngay").

### Chuyển khoản (QR) — mặc định

Dùng khi: khách chuyển khoản ngân hàng. Hệ thống tự sinh **mã QR VietQR** + **nội dung chuyển khoản** để khách quét.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Mặc định điền sẵn = số còn thiếu của PR. |
| **Ngân hàng nhận** | — | Mặc định là ngân hàng đầu của đội. Chỉ hình thức Chuyển khoản mới có ô này. |
| **Tên trên nội dung CK** | — | Chọn tên nhúng vào nội dung CK để phân biệt **ai trả**: `KH: <tên PH>` hoặc `Con: <tên bé>`. Nếu PR chỉ có 1 tên thì ô này cố định theo tên khách. |

- Điền xong, bấm **Tạo QR & mã CK** để sinh mã, rồi gửi mã QR cho khách (xem bài **Xem & gửi mã QR cho khách**).
- Khi khách chuyển **đúng nội dung**, hệ thống **tự đối soát** lúc tiền về — thường không phải chờ kế toán ghép tay.
- ⚠️ Nếu khách chuyển **sai nội dung** hoặc **chuyển ngoài** (không quét QR), tiền **không tự khớp** → **vẫn phải tải ảnh bill** lên dòng lần TT để kế toán đối soát tay. (Chỉ chuyển khoản đúng nội dung mới không cần bill.)

### Tiền mặt

Dùng khi: thu tiền mặt trực tiếp.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Mặc định = số còn thiếu. |
| **Người thu** | ✅ | Mặc định là tên bạn (người đang đăng nhập). Không được để trống. |

- Điền xong, bấm **Ghi nhận lần thanh toán** để lưu. Lần thu tiền mặt được **ghi nhận ngay** và cộng vào số đã nhận của PR — không phải chờ đối soát.
- Ô **Mã đối soát** ghi "Tự động tạo bởi hệ thống" — bỏ qua, không cần nhập.

### Quẹt thẻ

Dùng khi: khách quẹt thẻ qua máy POS. Quẹt thẻ là hình thức **tín dụng** — **có phí** nên số thực nhận (NET) **nhỏ hơn** số quẹt (GROSS); kế toán ghép mPOS/Payoo xác nhận sau.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Là số **GROSS** khách quẹt. Mặc định = số còn thiếu. |
| **4 số cuối thẻ** | — | Không bắt buộc. Nếu điền thì **phải đủ đúng 4 chữ số**, nếu không hệ thống báo lỗi. |

- Điền xong, bấm **Ghi nhận lần thanh toán** để lưu.
- Sau khi lưu, dòng lần TT nhắc **"Cần ảnh bill để kế toán xác nhận"** → bấm **Up bill** trên dòng đó để tải ảnh biên lai. Khi kế toán xác nhận, dòng hiện công thức **GROSS − phí = NET**.

### Trả góp

Dùng khi: khách trả góp qua app **Payoo/Mpos**. Trả góp cũng là hình thức **tín dụng** (giống quẹt thẻ) — **có phí**, cần bill để kế toán xác nhận NET.

**Khác các phương thức trên: KHÔNG có ô "Số tiền lần này".** Thay vào đó:

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Tổng tiền trả góp** | ✅ | Số tiền khách chuyển qua app. **Đây mới là số tiền của lần TT** (không phải ô "Số tiền lần này" như các phương thức khác). |
| **Nền tảng trả góp** | ✅ | Bắt buộc chọn **Payoo** hoặc **Mpos**. |

- Điền xong, bấm **Ghi nhận lần thanh toán** để lưu.
- Sau khi lưu, bấm **Up bill** trên dòng lần TT để tải ảnh bill cho kế toán xác nhận NET.

**Chuyển khoản vs Trả góp — hai hình thức hay nhầm khi điền:**

| | Chuyển khoản (QR) | Trả góp |
|---|---|---|
| Ô nhập số tiền | **Số tiền lần này** | **Tổng tiền trả góp** (không có ô "Số tiền lần này") |
| Trường riêng | Ngân hàng nhận + Tên trên nội dung CK | Nền tảng trả góp (Payoo/Mpos) — bắt buộc |
| Mã QR | Có, tự sinh | Không |
| Nút xác nhận | **Tạo QR & mã CK** | **Ghi nhận lần thanh toán** |
| Tải bill | Chỉ khi tiền không tự khớp | Bắt buộc (có phí, kế toán xác nhận NET) |

## Thêm lần TT cho PR đã có nhiều đợt

Áp dụng khi: PR đã có ít nhất 1 lần TT, khách chuyển tiếp đợt sau. Thao tác **giống hệt** phần *Tạo lần thanh toán mới* ở trên — mở lại chi tiết PR, bấm **Tạo lần thanh toán** và chọn phương thức cho đợt này (có thể khác đợt trước).

## Thao tác trên 1 lần TT đã có

Mỗi dòng trong danh sách có các nút thao tác riêng:

- **Huỷ lần TT** — khi ghi nhầm hoặc khách đổi ý trước khi tiền thực sự về.
- **Đánh dấu đã thanh toán** — cho lần TT tiền mặt/chuyển khoản đã xác nhận thủ công ngoài hệ thống.
- **Sửa số tiền** — chỉnh lại số tiền của 1 lần TT nếu ghi sai lúc tạo.
- **Làm mới nội dung CK** — khi nội dung chuyển khoản bị đánh dấu "cũ" (PR đổi tên khách sau khi đã tạo mã QR) — bấm để sinh lại nội dung CK khớp với tên hiện tại.

> ⚠️ Lưu ý: các thao tác này ảnh hưởng trực tiếp đến số đã nhận của PR — chỉ dùng khi chắc chắn đúng lần TT cần sửa, tránh làm lệch số đối soát với kế toán.
