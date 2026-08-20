---
title: "Đối soát lead khi tạo/sửa PR — đơn New từ quảng cáo"
order: 2
audience: ["sale", "leader"]
---

Áp dụng khi: tạo hoặc sửa Payment Request cho đơn **mới (New)** đến từ **quảng cáo / offline / KOC / khác**. Hệ thống tự dò số điện thoại khách với dữ liệu marketing để xác nhận đơn có đúng đến từ quảng cáo không. Bài này hướng dẫn tính năng nằm ở đâu, cách dùng, và cách đọc kết quả.

## Mục lục

<!-- Mục lục tự sinh từ các heading "## " bên dưới. -->

---

## Tính năng nằm ở đâu

Đây **không phải màn hình riêng** — **bảng check lead** tự hiện trong lúc bạn điền đơn, ở 2 chỗ. Cả 2 chỗ, bảng đều nằm **ngay dưới ô Nguồn KH**.

**1. Khi tạo PR mới** — trong màn **Tạo Payment Request**:

![Màn Tạo Payment Request — bảng check lead hiện ngay dưới ô Nguồn KH](/docs-images/paymentRequests/doi-soat-lead-1.png)

**2. Khi sửa PR đã có** — mở chi tiết một PR → bấm **Sửa** (mục Thông tin khách hàng):

![Chi tiết PR ở chế độ Sửa — bảng check lead cũng hiện dưới ô Nguồn KH](/docs-images/paymentRequests/doi-soat-lead-4.png)

---

## Cách dùng

1. Bấm **Tạo Payment Request** (hoặc mở một PR → bấm **Sửa**).
2. Điền như bình thường: **Số điện thoại** khách · **Tên khách hàng** · **Tổng tiền dự kiến**.
3. Ở ô **Nguồn KH**, chọn **Quảng cáo** (hoặc Offline / KOC / Khác) — chọn thêm **Kênh** nếu có.
4. Vừa chọn Nguồn xong, **bảng check lead tự hiện và tự dò số**. Bạn **không phải bấm nút gì thêm**.

Bảng chỉ hiện với các nguồn có thể đến từ marketing:

| Nguồn KH | Có hiện bảng check lead? |
|---|---|
| Quảng cáo · Offline · KOC · Khác | Có |
| Giới thiệu · Gia hạn · Kho chung | Không |

> Hệ thống dò khi bạn **chọn Nguồn** (nếu đã điền số điện thoại), hoặc khi **bấm ra khỏi ô Số điện thoại**. Nếu đổi Nguồn sang nhóm "Không hiện", bảng biến mất và xoá kết quả dò trước đó.

---

## Kết quả XANH — tìm thấy khách (khớp lead)

Số điện thoại khách **có** trong dữ liệu quảng cáo. Bảng màu xanh hiện đủ:

- **Tên** khách
- **SĐT gốc** — số khách để lại qua quảng cáo (có thể khác số đang dùng để thanh toán)
- **Ngày lead xuất hiện** — ngày khách để lại số
- **Kênh** và **tên sale** phụ trách lead đó

![Bảng check lead màu xanh — tên khách, SĐT gốc, ngày, kênh và tên sale phụ trách](/docs-images/paymentRequests/doi-soat-lead-1.png)

Việc cần làm: xem lại cho **đúng người** rồi tạo PR bình thường.

- Nếu hiện **nhiều dòng** (khách để lại số nhiều lần qua các năm), **chọn đúng dòng** là khách của mình — dựa vào ngày, kênh, tên sale.
- Dòng đầu được chọn sẵn; đổi lại nếu chưa đúng.

---

## Kết quả VÀNG — không tìm thấy số

Số khách đang thanh toán **khác** với số đã đăng ký quảng cáo. Đây là tình huống cần xử lý — làm theo thứ tự:

![Bảng check lead màu vàng — ô nhập SĐT gốc, ô Chọn lý do đang bị mờ khoá](/docs-images/paymentRequests/doi-soat-lead-2.png)

1. Hỏi khách **"anh/chị đã điền số nào lúc để lại thông tin qua quảng cáo?"** — nhập số đó vào ô **"SĐT khách để lại qua quảng cáo"**.
2. **Bấm nút 🔍 (kính lúp) ngay cạnh ô** để tra. Hoặc bấm chuột ra chỗ trống bên ngoài ô cũng được.
3. Kết quả:
   - **Dò ra** → bảng chuyển **xanh** ("khớp qua số gốc") → xong, tạo PR bình thường.
   - **Dò không ra** → ô **"Chọn lý do"** lúc này **mới bấm được** → chọn 1 lý do.

![Đã tra số gốc — ô Chọn lý do mở khoá, chọn lý do rồi lưu bình thường](/docs-images/paymentRequests/doi-soat-lead-3.png)

> Ô **"Chọn lý do" bị mờ, không bấm được** cho tới khi bạn đã thử dò ít nhất 1 số. Đây là cố ý — để mọi người chịu khó tìm số cũ trước, không chọn thẳng lý do.

### Bảng lý do

| Chọn khi | Ý nghĩa |
|---|---|
| Khách tự tìm đến, không qua quảng cáo | Đơn không tính vào quảng cáo |
| Người quen giới thiệu | Thực chất là đơn giới thiệu |
| Khách cũ mua lại | Thực chất là đơn gia hạn |
| Khách dùng số khác nhưng không nhớ | Không xác định được (gõ tạm 1 số để mở khoá, rồi chọn mục này) |
| Khác | Ghi rõ vào ô Ghi chú |

---

## Vì sao phải làm bước này

Mỗi tháng có khoảng **175 đơn New** không quy được về kênh quảng cáo, chỉ vì số thanh toán khác số đã để lại qua quảng cáo. Việc bạn nhập số gốc hoặc chọn lý do giúp công ty **đo đúng hiệu quả quảng cáo** — biết đơn nào thật sự từ quảng cáo, đơn nào là giới thiệu / khách cũ bị khai nhầm thành New.

> Yên tâm: kể cả khi không tìm thấy, bạn **vẫn tạo được PR và thu tiền khách bình thường** — chỉ cần làm xong 1 trong 2 việc: nhập số gốc, hoặc chọn lý do.
