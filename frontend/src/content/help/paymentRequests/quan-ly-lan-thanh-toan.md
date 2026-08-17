---
title: "Cách tạo và quản lý lần TT (mọi trường hợp)"
order: 2
audience: ["sale", "ke-toan"]
---

Hướng dẫn tạo lần thanh toán (thu tiền) cho PR và thao tác trên lần TT đã có (huỷ, sửa số tiền, làm mới nội dung CK).

![Panel "Các lần thanh toán" trong chi tiết PR — danh sách lần TT, nút Tạo lần thanh toán](/docs-images/paymentRequests/quan-ly-lan-thanh-toan-1.png)

> **Lần thanh toán** (lần TT) = một lần thu tiền trong 1 PR. Khách có thể trả nhiều đợt, mỗi đợt là 1 lần TT — hình thức có thể khác nhau giữa các đợt. Muốn tạo PR mới, xem bài **Tạo Payment Request — Hướng dẫn đầy đủ**.

## Mục lục

<!-- Mục lục tự sinh từ heading ## và ### bên dưới — không cần viết tay. -->

## Tạo lần thanh toán mới

1. Mở **chi tiết PR** (bấm vào dòng PR trong danh sách Quản lý thanh toán).
2. Ở panel **Các lần thanh toán**, bấm **Tạo lần thanh toán**.
3. Chọn **phương thức**: Chuyển khoản / Tiền mặt / Quẹt thẻ / Trả góp.
4. Điền các ô theo phương thức đã chọn (xem chi tiết từng phương thức bên dưới).
5. Bấm nút xác nhận cuối form: **Tạo QR & mã CK** (chuyển khoản) hoặc **Ghi nhận lần thanh toán** (các phương thức còn lại).

> ⚠️ Nếu PR **đã nhận đủ tiền**, nút Tạo lần thanh toán sẽ **không mở form** mà hiện thông báo "PR đã nhận đủ tiền". Muốn thu thêm, phải **tăng Tổng tiền dự kiến** của PR trước (bấm "Sửa thông tin PR ngay").

---

### Chuyển khoản (QR) — mặc định

Dùng khi khách chuyển khoản ngân hàng. Hệ thống tự sinh **mã QR VietQR** và **nội dung chuyển khoản** để khách quét.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Tự điền sẵn = số còn thiếu của PR. Sửa nếu khách chuyển khác. |
| **Ngân hàng nhận** | — | Tài khoản MB Bank của công ty — không cần đổi. |
| **Tên trên nội dung CK** | — | Nếu PR có nhiều bé, chọn tên hiện trên nội dung chuyển khoản (để ngân hàng phân biệt ai trả). PR chỉ có 1 bé thì tự điền sẵn, không cần chỉnh. |

**Sau khi điền:**

1. Bấm **Tạo QR & mã CK** — hệ thống sinh mã QR và nội dung chuyển khoản.
2. Gửi mã QR cho khách (xem bài **Xem & gửi mã QR cho khách**).

> Khi khách chuyển **đúng nội dung CK**, hệ thống **tự đối soát** lúc tiền về — không cần tải bill.
>
> ⚠️ Nếu khách chuyển **sai nội dung** hoặc chuyển ngoài (không quét QR), tiền **không tự khớp** → bấm **Up bill** trên dòng lần TT để tải ảnh bill lên cho kế toán đối soát tay.

---

### Tiền mặt

Dùng khi thu tiền mặt trực tiếp từ khách.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Tự điền sẵn = số còn thiếu. |
| **Người thu** | ✅ | Tự điền sẵn = tên bạn (người đang đăng nhập). Sửa nếu người thu khác. |

**Sau khi điền:**

1. Bấm **Ghi nhận lần thanh toán** — lần TT được ghi nhận ngay và cộng vào số đã nhận của PR.

> Ô **Mã đối soát** ghi "Tự động tạo bởi hệ thống" — bỏ qua, không cần nhập.

---

### Quẹt thẻ (tín dụng)

Dùng khi khách quẹt thẻ qua máy POS. Hình thức tín dụng — **có phí** nên số thực nhận (NET) nhỏ hơn số quẹt (GROSS).

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Điền số tiền khách quẹt (GROSS). Tự điền sẵn = số còn thiếu. |
| **4 số cuối thẻ** | — | Không bắt buộc. Nếu điền thì phải đủ đúng 4 chữ số. |

**Sau khi điền:**

1. Bấm **Ghi nhận lần thanh toán**.
2. Bấm **Up bill** trên dòng lần TT vừa tạo để tải ảnh biên lai lên cho kế toán xác nhận.

> Khi kế toán xác nhận, dòng hiện công thức **GROSS − phí = NET** (số thực nhận).

---

### Trả góp (tín dụng)

Dùng khi khách trả góp qua app Payoo hoặc Mpos. Cũng là hình thức tín dụng — **có phí**, cần bill để kế toán xác nhận.

Khác các phương thức trên: **không có ô "Số tiền lần này"**. Thay vào đó điền **Tổng tiền trả góp**.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Tổng tiền trả góp** | ✅ | Số tiền khách chuyển qua app — đây là số tiền của lần TT. |
| **Nền tảng trả góp** | ✅ | Chọn **Payoo** hoặc **Mpos**. |

**Sau khi điền:**

1. Bấm **Ghi nhận lần thanh toán**.
2. Bấm **Up bill** trên dòng lần TT vừa tạo để tải ảnh bill lên cho kế toán xác nhận.

> Khi kế toán xác nhận, dòng hiện số thực nhận (NET = sau khi trừ phí).

**Chuyển khoản vs Trả góp — hai hình thức hay nhầm:**

| | Chuyển khoản (QR) | Trả góp |
|---|---|---|
| Ô nhập số tiền | **Số tiền lần này** | **Tổng tiền trả góp** (không có ô "Số tiền lần này") |
| Trường riêng | Ngân hàng nhận + Tên trên nội dung CK | Nền tảng trả góp (Payoo/Mpos) — bắt buộc |
| Mã QR | Có | Không |
| Nút xác nhận | **Tạo QR & mã CK** | **Ghi nhận lần thanh toán** |
| Tải bill | Chỉ khi tiền không tự khớp | Bắt buộc |

## Thêm lần TT cho PR đã có nhiều đợt

Khách trả nhiều đợt? Làm giống hệt phần *Tạo lần thanh toán mới* ở trên — mở chi tiết PR, bấm **Tạo lần thanh toán** lần nữa và chọn phương thức cho đợt mới (có thể khác đợt trước).

## Thao tác trên lần TT đã có

Mỗi dòng lần TT trong danh sách có các nút thao tác:

- **Huỷ lần TT** — dùng khi ghi nhầm hoặc khách đổi ý trước khi tiền về.
- **Sửa số tiền** — chỉnh lại số tiền nếu ghi sai lúc tạo.
- **Làm mới nội dung CK** — bấm khi nội dung chuyển khoản bị đánh dấu "cũ" (do PR đổi tên khách sau khi đã tạo mã QR). Hệ thống sinh lại nội dung CK khớp tên mới.

> ⚠️ Các thao tác này ảnh hưởng trực tiếp đến số đã nhận của PR — chỉ dùng khi chắc chắn đúng lần TT cần sửa.