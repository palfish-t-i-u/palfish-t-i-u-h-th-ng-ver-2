---
title: "Đối soát lead khi tạo PR — đơn New từ quảng cáo"
order: 2
audience: ["sale", "leader"]
---

Áp dụng khi: tạo Payment Request cho đơn **mới (New)** đến từ **quảng cáo / offline / KOC / khác**. Hệ thống sẽ tự dò số điện thoại khách với kho dữ liệu marketing để xác nhận đơn có đúng từ quảng cáo không. Bài này hướng dẫn đọc & xử lý khối đối soát lead.

![Khối khớp lead màu xanh — hiện SĐT gốc, ngày, kênh và tên sale phụ trách lead](/docs-images/paymentRequests/doi-soat-lead-1.png)

## Mục lục

<!-- Mục lục tự sinh từ các heading "## " bên dưới. -->

---

## Khi nào khối đối soát lead hiện ra

Khối này **chỉ hiện** khi bạn chọn **Nguồn KH** thuộc nhóm có thể đến từ marketing:

| Nguồn KH | Có hiện khối? |
|---|---|
| Quảng cáo | Có |
| Offline | Có |
| KOC | Có |
| Khác | Có |
| Giới thiệu / Gia hạn / Kho chung | Không |

Hệ thống **tự tra** ngay khi bạn chọn Nguồn (nếu đã điền số điện thoại), hoặc khi bạn **bấm ra khỏi ô Số điện thoại**. Bạn không phải bấm nút gì thêm.

> Nếu đổi Nguồn sang nhóm "Không hiện" (VD: Giới thiệu), khối sẽ biến mất và xoá kết quả tra trước đó.

---

## Trường hợp 1 — Khớp lead (khối xanh)

Số điện thoại khách **có** trong kho marketing. Khối xanh hiện đủ:

- **Tên** khách trên lead
- **SĐT gốc** — số khách để lại lúc đăng ký
- **Ngày lead xuất hiện** — ngày khách để lại số
- **Kênh** + **Sale** phụ trách lead đó

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
