---
title: "Phát hiện ngày thiếu — tự động sync 1 lúc"
order: 1
audience: ["sale", "admin"]
---

Áp dụng khi: nghi ngờ báo cáo/Dashboard Sale thiếu số của vài ngày, muốn tìm và bù lại 1 lượt thay vì đồng bộ tay từng ngày.

![Khối Phát hiện ngày thiếu: cảnh báo số ngày thiếu, danh sách ngày, nút sync gộp](/docs-images/module5/phat-hien-ngay-thieu-1.png)

## Cơ chế

Hệ thống soi **60 ngày gần nhất** trong DB, chỉ liệt kê **những ngày chưa có dữ liệu** — ngày đã có sẽ không bị sync lại, nên bấm nhiều lần không gây trùng dữ liệu.

## Các bước

1. Bấm **Làm mới** (hoặc **Kiểm tra ngay** nếu chưa quét lần nào).
2. Đọc kết quả quét.
3. Nếu có ngày thiếu, bấm **SYNC N NGÀY THIẾU** để đồng bộ gộp toàn bộ 1 lần.

## Các trạng thái kết quả

| Trạng thái | Ý nghĩa |
|---|---|
| **Đầy đủ data** (xanh) | Không có ngày nào thiếu trong 60 ngày gần nhất |
| **Thiếu N ngày** (vàng) | Liệt kê rõ từng ngày thiếu — bấm sync để bù toàn bộ |
| **Lỗi** (đỏ) | Quét thất bại — có nút **Thử lại** |

> ⚠️ Lưu ý: chỉ quét trong phạm vi 60 ngày gần nhất — dữ liệu thiếu lâu hơn 60 ngày phải đồng bộ tay theo từng ngày ở khối **Incremental sync** bên dưới.
