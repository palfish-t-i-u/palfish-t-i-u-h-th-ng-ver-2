---
title: "Đồng bộ mPOS / Payoo — tổng quan"
order: 0
audience: ["ke-toan"]
---

Áp dụng khi: cần kéo giao dịch quẹt thẻ mPOS/Payoo tự động về hệ thống để đối soát ở tab **Đối soát giao dịch · Quẹt thẻ**.

![Màn hình Đồng bộ mPOS/Payoo: KPI giao dịch mới, trạng thái tiện ích, nút Đồng bộ ngay](/docs-images/gatewaySync/tong-quan-1.png)

## Trước khi bắt đầu

- Phải cài **tiện ích trình duyệt** (xem bài **Cài tiện ích đồng bộ**) — không có tiện ích thì không đồng bộ được.

## Các bước

1. Kiểm tra badge trạng thái: **"Tiện ích đã cài & hoạt động"** (xanh) hay **"Chưa cài tiện ích"** (cần cài trước).
2. Bấm **Đồng bộ ngay** — tiện ích tự kéo dữ liệu từ mPOS và Payoo cùng lúc.
3. Không cần bấm gì thêm sau đó — tiện ích tự chạy lại định kỳ khi trình duyệt mở.

## Kết quả mong đợi

- Thông báo **"Đã đồng bộ — ghi N giao dịch mới vào hệ thống"**.
- 2 thẻ KPI **"Giao dịch mPOS mới"** / **"Giao dịch Payoo mới"** cập nhật số + giờ đồng bộ gần nhất.

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Báo *"Đồng bộ lỗi"* | Tiện ích chưa đăng nhập đúng mPOS/Payoo, hoặc lỗi kết nối | Mở mPOS/Payoo đăng nhập lại → thử **Đồng bộ ngay** lần nữa |
| Đồng bộ xong báo **0 giao dịch mới** dù thực tế có | Sai tài khoản đăng nhập, hoặc tiện ích gặp lỗi ngầm | Kiểm tra đã đăng nhập đúng tài khoản; mở Service Worker của tiện ích (`chrome://extensions`) xem log |
| Banner **"Cần cập nhật tiện ích!"** | Bản tiện ích trên máy cũ hơn bản mới nhất trên server | Tải lại `.zip` mới → giải nén **ĐÈ** vào đúng thư mục cũ → vào `chrome://extensions` bấm nút Làm mới (⟳) trên thẻ tiện ích → F5 lại trang. Mã bí mật đã lưu vẫn giữ nguyên |

> ⚠️ Lưu ý: đây là bản kết nối tiện ích trình duyệt thật — không phải giả lập demo.
