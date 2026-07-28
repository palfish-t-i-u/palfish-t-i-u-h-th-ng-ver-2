---
title: "Dashboard Sale — tổng quan"
order: 0
audience: ["sale", "leader"]
---

Áp dụng khi: cần xem hiệu suất bán hàng theo team/cá nhân trong 1 khoảng thời gian.

![Màn hình Dashboard Sale: bộ lọc, dải KPI, biểu đồ](/docs-images/module6/tong-quan-1.png)

## Các khu vực trên màn hình

- **Bộ lọc** — khoảng ngày (tab nhanh hoặc tùy chọn) + lọc theo team/sale.
- **Dải KPI** — 2 hàng thẻ số liệu (8 thẻ chính + 8 thẻ phụ).
- **Biểu đồ GMV & thực thu theo ngày**, **tỷ lệ chuyển đổi từng giai đoạn**, **Top Sale**, **chi tiết theo Sale**.

## Ý nghĩa các chỉ số

Mỗi thẻ KPI đều ghi rõ **Nguồn** ngay dưới số — quan trọng vì nhiều chỉ số trông giống nhau nhưng lấy từ 2 nguồn khác nhau, số không khớp nhau là chuyện bình thường:

![Dải thẻ KPI — mỗi thẻ ghi rõ nguồn dữ liệu](/docs-images/module6/tong-quan-2.png)

| Chỉ số | Ý nghĩa | Nguồn |
|---|---|---|
| Tổng số L1 / L3 / L4 | Số lead theo từng giai đoạn phễu bán hàng | CRM |
| Tổng số L8 | Số đơn đã thu tiền | Sổ doanh thu |
| GMV CRM | Tổng giá trị đơn ghi nhận trên CRM (RMB) | CRM |
| Doanh thu thực thu | Tiền thật đã về tài khoản | Sổ doanh thu (`ngay_tien_ve`) |
| Doanh thu tạo mã QR | Giá trị các QR đã tạo — **chưa chắc đã thu được** | Quản lý thanh toán (`created_at`) |
| AOV (thực thu) | Giá trị trung bình mỗi đơn | Sổ doanh thu |
| C1/C2/C4/C5 | Thời lượng gọi, số cuộc gọi, tỷ lệ kết nối, tỷ lệ gọi > 3 phút | CRM |
| L1.0 / L1.1 / L1.2 | Kho chung / Lead đã phân / Giới thiệu | CRM |

## Bộ lọc & cách dùng

- Tab nhanh: **Hôm nay / Tuần này / Tháng này / Tháng trước**, hoặc **Tùy chọn** để chọn khoảng ngày bất kỳ.
- Lọc thêm theo **team** và **sale** cụ thể.
- Bấm **Làm mới** để tải lại số liệu theo bộ lọc hiện tại.

![Biểu đồ GMV CRM (daily) và thực thu Sổ theo ngày](/docs-images/module6/tong-quan-3.png)

> ⚠️ Lưu ý: kiến trúc **Hybrid** — KPI và Top Sale lấy **PalFish live** (số mới nhất, có thể mất 1-2 giây để tải), còn biểu đồ lấy từ **DB daily** (dữ liệu đã đồng bộ qua tab **Đồng bộ CRM**). Nếu KPI có số nhưng biểu đồ trống, hoặc màn hình báo *"Có dữ liệu CRM trong database nhưng không có dòng daily trong kỳ"* — vào tab **Đồng bộ CRM** và sync từng ngày còn thiếu trong kỳ đang xem (xem bài **Phát hiện ngày thiếu**).
