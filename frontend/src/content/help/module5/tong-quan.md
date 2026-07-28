---
title: "Đồng bộ CRM — tổng quan"
order: 0
audience: ["sale", "admin"]
---

Áp dụng khi: cần kéo dữ liệu CRM PalFish về hệ thống để Dashboard Sale/báo cáo có số liệu.

![Màn hình Đồng bộ CRM: trạng thái token, khối phát hiện ngày thiếu, và incremental sync](/docs-images/module5/tong-quan-1.png)

## Trước khi bắt đầu

- Cài **Chrome Extension** lấy token CRM (xem hướng dẫn ngay trong trang, cuối màn hình).
- Mở trang CRM (`sea.pri.ibanyu.com`) và đăng nhập ít nhất 1 lần — extension tự lấy token, **không cần thao tác Export** trên CRM.

## Các bước

1. Kiểm tra khối **Trạng thái kết nối CRM** — badge xanh **"Token CRM đang hoạt động"** kèm giờ cập nhật lần cuối là đủ điều kiện đồng bộ.
2. Chọn **Ngày cần đồng bộ**, hoặc bấm nhanh **Hôm qua** / **Hôm nay**.
3. Bấm **LẤY DỮ LIỆU**.

![Khối Trạng thái kết nối CRM — badge xanh khi token còn hoạt động](/docs-images/module5/tong-quan-2.png)

## Kết quả mong đợi

- Thanh tiến trình "Đang cào dữ liệu từng ngày, vui lòng chờ…" hiện trong lúc đồng bộ, xong thì có toast báo hoàn tất.
- Dữ liệu vào DB có thể mất thêm ~5 phút mới lên số — nếu vừa sync xong mà báo cáo chưa thấy số, đợi rồi bấm **Làm mới**.

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Badge đỏ **"Chưa có token CRM"** | Chưa cài extension, hoặc chưa mở CRM lần nào | Cài extension → mở CRM đăng nhập → quay lại bấm **Làm mới** |
| Nút **LẤY DỮ LIỆU** bị mờ, không bấm được | Chưa có token hợp lệ | Như trên |
| Đã sync nhưng Dashboard Sale vẫn báo thiếu dữ liệu | Dữ liệu cần thời gian vào DB, hoặc đúng ngày đó chưa được sync | Xem bài **Phát hiện ngày thiếu — tự động sync 1 lúc** |

> ⚠️ Lưu ý: đây là nguồn dữ liệu **nền** cho Dashboard Sale và các báo cáo — nếu không đồng bộ đều đặn, các màn hình đó sẽ báo thiếu dữ liệu dù CRM vẫn có đủ.
