---
title: "DingTalk — Nhóm thông báo"
order: 0
audience: ["admin"]
---

Áp dụng khi: cần thêm/sửa mapping **team → nhóm DingTalk** nhận thông báo kích hoạt khoá học.

![Form Thêm nhóm mới + bảng danh sách nhóm DingTalk](/docs-images/dingtalkGroups/tong-quan-1.png)

## Các bước thêm nhóm mới

1. Điền **team_code** (mã team, VD: `SALE_HCM`).
2. Điền **Group name** (mô tả, chỉ để dễ nhận diện).
3. Điền **openConversationId** — lấy từ DingTalk (bắt đầu bằng `cid...`), là ID kỹ thuật của nhóm chat.
4. Tick **Bật ngay** nếu muốn kích hoạt ngay.
5. Bấm **Thêm nhóm**.

## Các thao tác trên bảng

- Cột **active**: bấm nút **On/Off** để bật/tắt nhóm — không cần xoá.
- **Xoá**: gỡ hẳn mapping — team đó sẽ **không nhận được thông báo DingTalk nữa**.

> ⚠️ Lưu ý: robot **GMV-Notifier** phải đã được thêm sẵn vào nhóm DingTalk đó từ trước — thêm mapping ở đây không tự động mời robot vào nhóm. Chỉ dùng nhóm **internal**.
