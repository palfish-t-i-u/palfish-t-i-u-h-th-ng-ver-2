---
title: "Trạng thái Token & Cập nhật Credentials"
order: 1
audience: ["admin"]
---

Áp dụng khi: cần kiểm tra token Zalo OA còn hạn không, hoặc phải nhập lại credentials mới.

![Thẻ Trạng thái Token + form Cập nhật Credentials](/docs-images/zaloConfig/trang-thai-token-1.png)

## Các bước cập nhật Credentials

1. Điền **App ID**, **App Secret**.
2. Điền **Access Token**, **Refresh Token** (lấy từ Zalo API Explorer).
3. Bấm **Hiển thị Token/Secret** nếu cần xem lại giá trị vừa nhập trước khi lưu.
4. Bấm **Lưu Cấu Hình**.

## Ý nghĩa trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| Còn hạn | Token hoạt động bình thường |
| Sắp hết hạn (< 1 giờ) | Hệ thống sắp tự refresh |
| Đã hết hạn | Cần refresh hoặc nhập lại credentials mới |

> ⚠️ Lưu ý: token sống **~25 giờ**, hệ thống **tự động refresh** khi còn ≤ 6 giờ (chạy nền mỗi 1 giờ) — bình thường không cần cập nhật tay. Lưu Cấu Hình sẽ **thay thế toàn bộ** credentials cũ, chỉ dùng khi token bị thu hồi hoặc đổi sang App Zalo khác.
