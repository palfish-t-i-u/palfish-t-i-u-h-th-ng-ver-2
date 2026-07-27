---
title: "DingTalk — Outbox"
order: 0
audience: ["admin"]
---

Áp dụng khi: cần kiểm tra 1 thông báo DingTalk (yêu cầu kích hoạt, kích hoạt thành công, nhắc gấp) đã gửi chưa hoặc vì sao lỗi.

![Bảng Outbox DingTalk — 50 tin gần nhất](/docs-images/dingtalkOutbox/tong-quan-1.png)

## Ý nghĩa cột status

| Nhãn | Ý nghĩa |
|---|---|
| pending | Chưa tới lượt worker xử lý |
| retry N | Đã gửi lỗi N lần, đang tự thử lại |
| dead | Đã thử đủ 4 lần, gửi lỗi hết — cần bấm **Retry** tay |
| sent | Thành công |

## Thao tác

- **Refresh**: tải lại danh sách 50 tin gần nhất.
- **Retry** (chỉ hiện khi tin chưa gửi thành công): reset để worker gửi lại — dùng sau khi đã khắc phục nguyên nhân lỗi (VD: vừa sửa lại `openConversationId`).

## Lỗi thường gặp

| `last_error` liên quan | Xử lý |
|---|---|
| Nhóm / conversationId | Kiểm tra lại mapping ở tab **Nhóm thông báo** — đúng `openConversationId`, đang bật |
| Auth / token | DingTalk tự refresh token, nếu vẫn lỗi kiểm tra biến môi trường trên server (`DINGTALK_CLIENT_ID`/`SECRET`) |

> ⚠️ Lưu ý: bảng chỉ hiển thị **50 tin gần nhất**, không tìm được tin cũ hơn qua giao diện này.
