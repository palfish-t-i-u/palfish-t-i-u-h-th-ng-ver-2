---
title: "Outbox — theo dõi tin gửi"
order: 0
audience: ["admin"]
---

Áp dụng khi: cần kiểm tra 1 thông báo Zalo đã gửi chưa, vì sao gửi lỗi, hoặc muốn gửi lại/huỷ.

![Bảng Outbox Zalo — 50 tin gần nhất, cột trạng thái và thao tác](/docs-images/zaloOutbox/tong-quan-1.png)

## Ý nghĩa các cột

- **Sự kiện**: loại thông báo — *Báo tiền về* (`payment_paid`) hoặc *Ảnh bill* (`bill_uploaded`, hiện đã tắt).
- **📎**: trạng thái gửi ảnh kèm theo (nếu có) — ✅ đã gửi / ⚠ lỗi / 🕐 chờ gửi.
- **Trạng thái**:

| Nhãn | Ý nghĩa |
|---|---|
| Chờ gửi | Chưa tới lượt worker xử lý |
| Retry N/4 | Đã gửi lỗi N lần, đang tự thử lại |
| Dead | Đã thử đủ 4 lần, gửi lỗi hết — cần bấm **Retry** tay |
| Đã huỷ | Admin đã bấm **Huỷ**, hệ thống ngừng thử |
| Đã gửi | Thành công |

## Thao tác

- **Retry**: reset lại để worker gửi lại từ đầu — dùng khi tin bị **Dead** hoặc **Retry N/4** và nguyên nhân lỗi đã được khắc phục (VD: vừa cập nhật lại token, vừa thêm nhóm Zalo).
- **Huỷ**: dừng hẳn, không gửi tin này nữa.

## Lỗi thường gặp

| `last_error` hiển thị | Nguyên nhân | Xử lý |
|---|---|---|
| Liên quan token/401 | Token Zalo hết hạn | Kiểm tra **Cấu hình Zalo → Trạng thái Token** |
| Liên quan group/nhóm | Team chưa map nhóm hoặc nhóm đang OFF | Vào **Nhóm thông báo** thêm/bật lại mapping, rồi **Retry** |

> ⚠️ Lưu ý: bảng chỉ hiển thị **50 tin gần nhất** — tin cũ hơn không xem lại được qua giao diện này.
