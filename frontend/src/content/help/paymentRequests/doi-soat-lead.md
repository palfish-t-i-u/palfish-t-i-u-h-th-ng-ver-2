---
title: "Đối soát lead khi tạo PR — đơn New từ quảng cáo"
order: 2
audience: ["sale", "leader"]
---

Áp dụng khi: tạo Payment Request cho đơn **mới (New)** đến từ **quảng cáo / offline / KOC / khác**. Hệ thống sẽ tự dò số điện thoại khách với kho dữ liệu marketing để xác nhận đơn có đúng từ quảng cáo không. Bài này hướng dẫn tìm tính năng ở đâu, cách điền, và cách đọc kết quả.

## Mục lục

<!-- Mục lục tự sinh từ các heading "## " bên dưới. -->

---

## Tính năng nằm ở đâu

Đây **không phải màn hình riêng** — nó tự hiện ngay trong lúc bạn điền đơn, ở 2 chỗ:

1. **Khi tạo PR mới** — màn **Tạo Payment Request** (nút **+ Tạo Payment Request** ở tab Quản lý thanh toán).
2. **Khi sửa PR đã có** — mở chi tiết một PR → bấm **Sửa thông tin**.

Ở cả 2 chỗ, khối đối soát lead nằm **ngay dưới ô Nguồn KH**.

---

## Các bước điền để khối hiện ra

1. Bấm **+ Tạo Payment Request** (hoặc mở PR → Sửa thông tin).
2. Điền như bình thường: **Số điện thoại** khách · **Tên khách hàng** · **Tổng tiền dự kiến**.
3. Ở ô **Nguồn KH**, chọn **Quảng cáo** (hoặc Offline / KOC / Khác) — chọn thêm **Kênh** nếu có.
4. → Ngay khi chọn Nguồn, **khối đối soát lead tự hiện** ngay dưới ô Nguồn và tự tra số điện thoại đã nhập. Bạn **không phải bấm nút gì thêm**.

Khối chỉ hiện với các nguồn có thể đến từ marketing:

| Nguồn KH | Có hiện khối? |
|---|---|
| Quảng cáo · Offline · KOC · Khác | Có |
| Giới thiệu · Gia hạn · Kho chung | Không |

> Hệ thống tự tra khi bạn **chọn Nguồn** (nếu đã điền SĐT) hoặc khi **bấm ra khỏi ô Số điện thoại**. Nếu đổi Nguồn sang nhóm "Không hiện", khối biến mất và xoá kết quả tra trước đó.

![Modal Tạo PR — khối đối soát lead tự hiện ngay dưới ô Nguồn KH sau khi chọn Quảng cáo](/docs-images/paymentRequests/doi-soat-lead-3.png)

---

## Trường hợp 1 — Khớp lead (khối xanh)

Số điện thoại khách **có** trong kho marketing. Khối xanh hiện đủ:

- **Tên** khách trên lead
- **SĐT gốc** — số khách để lại lúc đăng ký
- **Ngày lead xuất hiện** — ngày khách để lại số
- **Kênh** + **Sale** phụ trách lead đó

![Khối khớp lead màu xanh — hiện SĐT gốc, ngày, kênh và tên sale phụ trách lead](/docs-images/paymentRequests/doi-soat-lead-1.png)

Việc cần làm: **kiểm tra đúng khách** rồi tạo PR bình thường.

- Nếu hiện **nhiều lead** (khách để lại số nhiều lần qua các năm), sẽ có danh sách chọn — **chọn đúng dòng** khớp với khách đang thu tiền (dựa vào ngày, kênh, tên sale).
- Dòng đầu được chọn sẵn; đổi lại nếu chưa đúng.

---

## Trường hợp 2 — Không khớp (khối vàng)

Số điện thoại khách **không** có trong kho. Đây là tình huống cần xử lý — vì nhiều khách lúc thanh toán dùng số khác với số đã để lại lúc đăng ký quảng cáo.

![Khối vàng không khớp — ô nhập SĐT gốc, dropdown lý do đang bị khoá xám](/docs-images/paymentRequests/doi-soat-lead-2.png)

### Các bước bắt buộc

1. Hỏi khách: **"lúc đăng ký anh/chị để lại số nào?"** — nhập số đó vào ô **"SĐT khách dùng lúc đăng ký"**.
2. **⚠️ Bấm chuột ra ngoài ô** (click sang chỗ khác) để hệ thống **tra lại số gốc** — bước này rất dễ quên. Chỉ gõ số mà không bấm ra ngoài thì hệ thống **chưa tra**.
3. Kết quả:
   - **Tra ra** → khối chuyển **xanh** "Khớp lead qua số gốc" → xong, tạo PR bình thường.
   - **Tra không ra** → khối vẫn vàng, lúc này **dropdown "Chọn lý do" mới mở khoá** → chọn 1 lý do.

> **Dropdown lý do bị khoá xám** cho tới khi bạn đã tra ít nhất 1 số gốc mà cũng không có trong kho. Đây là chủ ý — bắt buộc thử tra số gốc trước, không cho chọn thẳng lý do.

### Bảng lý do

| Chọn khi | Ý nghĩa |
|---|---|
| Khách tự tìm đến, không qua quảng cáo | Đơn không tính vào quảng cáo |
| Người quen giới thiệu | Thực chất là đơn giới thiệu |
| Khách cũ mua lại | Thực chất là đơn gia hạn |
| Khách dùng số khác nhưng không nhớ | Không xác định được (gõ tạm 1 số để mở khoá rồi chọn mục này) |
| Khác | Ghi rõ vào ô Ghi chú |

---

## Vì sao phải làm bước này

Mỗi tháng có khoảng **175 đơn New** không quy được về kênh quảng cáo, chỉ vì số thanh toán khác số lead. Việc bạn nhập số gốc / chọn lý do giúp công ty **đo đúng hiệu quả quảng cáo** — biết đơn nào thật sự từ quảng cáo, đơn nào là giới thiệu/khách cũ bị khai nhầm thành New.

> Đơn không khớp **vẫn tạo PR được** sau khi bạn nhập số gốc hoặc chọn lý do — không chặn việc thu tiền của khách.
