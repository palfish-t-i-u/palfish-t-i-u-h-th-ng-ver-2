---
title: "Cách tạo và quản lý lần TT (mọi trường hợp)"
order: 2
audience: ["sale", "ke-toan"]
---

Áp dụng khi: cần tạo một lần thanh toán (thu tiền) cho PR, hoặc thao tác trên một lần TT đã có (huỷ, đánh dấu đã TT, sửa số tiền, làm mới nội dung CK).

![Panel "Các lần thanh toán" trong chi tiết PR — danh sách lần TT, nút Tạo lần thanh toán](/docs-images/paymentRequests/quan-ly-lan-thanh-toan-1.png)

> "Lần thanh toán" (lần TT) là **một lần thu tiền bên trong 1 PR**. Một PR có thể có nhiều lần TT — khách chuyển làm nhiều đợt, mỗi đợt có thể một hình thức khác nhau. Muốn tạo **PR mới**, xem bài **Tạo Payment Request — Hướng dẫn đầy đủ**.

## Tạo lần thanh toán mới

1. Mở **chi tiết PR** (bấm vào dòng PR ở Quản lý thanh toán).
2. Ở panel **Các lần thanh toán**, bấm **Tạo lần thanh toán**. Nếu PR chưa có lần nào, nút ghi **Tạo lần thanh toán đầu tiên**.
3. Chọn **Phương thức thanh toán** — 4 lựa chọn: **Chuyển khoản / Tiền mặt / Quẹt thẻ / Trả góp**. Mỗi phương thức điền khác nhau (xem bên dưới).
4. Điền số tiền và các trường theo phương thức.
5. Bấm nút xác nhận — nhãn nút **đổi theo phương thức**:
   - Chuyển khoản → **Tạo QR & mã CK**
   - Tiền mặt / Quẹt thẻ / Trả góp → **Ghi nhận lần thanh toán**

> ⚠️ Nếu PR **đã nhận đủ tiền**, các nút Tạo lần thanh toán sẽ **không mở form** mà hiện thông báo "PR đã nhận đủ tiền". Muốn thu thêm, phải **tăng Tổng tiền dự kiến** của PR trước (bấm "Sửa thông tin PR ngay").

## Chuyển khoản (QR) — mặc định

Dùng khi: khách chuyển khoản ngân hàng. Hệ thống tự sinh **mã QR VietQR** + **nội dung chuyển khoản**; tiền về được đối soát **tự động** — không cần tải bill để khớp.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Mặc định điền sẵn = số còn thiếu của PR. |
| **Ngân hàng nhận** | — | Mặc định là ngân hàng đầu của đội. Chỉ hình thức Chuyển khoản mới có ô này. |
| **Tên trên nội dung CK** | — | Chọn tên nhúng vào nội dung CK để phân biệt **ai trả**: `KH: <tên PH>` hoặc `Con: <tên bé>`. Nếu PR chỉ có 1 tên thì ô này cố định theo tên khách. |

- Nút xác nhận: **Tạo QR & mã CK**.
- Sau khi tạo: gửi mã QR cho khách (xem bài **Xem & gửi mã QR cho khách**). Không cần tải bill để đối soát.

## Tiền mặt

Dùng khi: thu tiền mặt trực tiếp.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Mặc định = số còn thiếu. |
| **Người thu** | ✅ | Mặc định là tên bạn (người đang đăng nhập). Không được để trống. |

- Nút xác nhận: **Ghi nhận lần thanh toán**.
- Ô **Mã đối soát** ghi "Tự động tạo bởi hệ thống" — không cần nhập.

## Quẹt thẻ

Dùng khi: khách quẹt thẻ qua máy POS. Thẻ **có phí** nên số thực nhận (NET) **nhỏ hơn** số quẹt (GROSS); kế toán ghép mPOS/Payoo xác nhận sau.

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Số tiền lần này** | ✅ | Là số **GROSS** khách quẹt. Mặc định = số còn thiếu. |
| **4 số cuối thẻ** | — | Không bắt buộc. Nếu điền thì **phải đủ đúng 4 chữ số**, nếu không hệ thống báo lỗi. |

- Nút xác nhận: **Ghi nhận lần thanh toán**.
- Sau khi tạo: dòng lần TT nhắc **"Cần ảnh bill để kế toán xác nhận"** → tải bill lên (nút Up bill trên dòng đó). Khi kế toán xác nhận, dòng hiện công thức **GROSS − phí = NET**.

## Trả góp (tín dụng)

Dùng khi: khách trả góp qua app **Payoo/Mpos**. Đây là "lần TT tín dụng".

**Khác các phương thức trên: KHÔNG có ô "Số tiền lần này".** Thay vào đó:

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| **Tổng tiền trả góp** | ✅ | Số tiền khách chuyển qua app. **Đây mới là số tiền của lần TT** (không phải ô "Số tiền lần này" như các phương thức khác). |
| **Nền tảng trả góp** | ✅ | Bắt buộc chọn **Payoo** hoặc **Mpos**. |

- Nút xác nhận: **Ghi nhận lần thanh toán**.
- Có phí như quẹt thẻ → **cần tải bill** để kế toán xác nhận NET.

## Chuyển khoản vs Trả góp — khác nhau chỗ nào

Hai hình thức hay nhầm nhất khi điền:

| | Chuyển khoản (QR) | Trả góp (tín dụng) |
|---|---|---|
| Ô nhập số tiền | **Số tiền lần này** | **Tổng tiền trả góp** (không có ô "Số tiền lần này") |
| Trường riêng | Ngân hàng nhận + Tên trên nội dung CK | Nền tảng trả góp (Payoo/Mpos) — bắt buộc |
| Mã QR | Có, tự sinh | Không |
| Nút xác nhận | **Tạo QR & mã CK** | **Ghi nhận lần thanh toán** |
| Tải bill | Không cần (đối soát tự động) | Cần (có phí, kế toán xác nhận NET) |

## Thêm lần TT cho PR đã có nhiều đợt

Áp dụng khi: PR đã có ít nhất 1 lần TT, khách chuyển tiếp đợt sau. Thao tác **giống hệt** phần *Tạo lần thanh toán mới* ở trên — mở lại chi tiết PR, bấm **Tạo lần thanh toán** và chọn phương thức cho đợt này (có thể khác đợt trước).

## Thao tác trên 1 lần TT đã có

Mỗi dòng trong danh sách có các nút thao tác riêng:

- **Huỷ lần TT** — khi ghi nhầm hoặc khách đổi ý trước khi tiền thực sự về.
- **Đánh dấu đã thanh toán** — cho lần TT tiền mặt/chuyển khoản đã xác nhận thủ công ngoài hệ thống.
- **Sửa số tiền** — chỉnh lại số tiền của 1 lần TT nếu ghi sai lúc tạo.
- **Làm mới nội dung CK** — khi nội dung chuyển khoản bị đánh dấu "cũ" (PR đổi tên khách sau khi đã tạo mã QR) — bấm để sinh lại nội dung CK khớp với tên hiện tại.

> ⚠️ Lưu ý: các thao tác này ảnh hưởng trực tiếp đến số đã nhận của PR — chỉ dùng khi chắc chắn đúng lần TT cần sửa, tránh làm lệch số đối soát với kế toán.
