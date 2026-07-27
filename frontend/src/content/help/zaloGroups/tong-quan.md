---
title: "Nhóm thông báo Zalo — tổng quan"
order: 0
audience: ["admin"]
---

Áp dụng khi: cần thêm/sửa mapping **team → nhóm Zalo** nhận thông báo tự động (báo tiền về).

![Bảng mapping Team → Group ID Zalo, nút + Thêm mới](/docs-images/zaloGroups/tong-quan-1.png)

## Các bước thêm mới

1. Bấm **+ Thêm mới**.
2. Điền **Team code** (đúng mã team dùng trong hệ thống, VD: `IH2`).
3. Điền **Group ID (Zalo)** — lấy từ Zalo OA (ID nhóm, không phải tên nhóm).
4. Điền **Tên nhóm** (mô tả, chỉ để dễ nhận diện, không ảnh hưởng gửi tin).
5. Tick **Kích hoạt** nếu muốn bật ngay.
6. Bấm **Thêm**.

## Các thao tác trên bảng

- **Sửa**: đổi Group ID / Tên nhóm / bật-tắt Active tại chỗ, bấm **Lưu**.
- **Xoá**: gỡ mapping — team đó sẽ **không nhận được thông báo Zalo nữa** cho tới khi thêm lại.
- Cột **Active**: `ON` = đang nhận thông báo, `OFF` = tạm dừng (không xoá mapping).

> ⚠️ Lưu ý: mỗi team chỉ map được **1 nhóm Zalo**. Team chưa có mapping hoặc mapping đang OFF → thông báo của team đó bị **bỏ qua âm thầm** (không báo lỗi), xem thêm ở bài **Outbox — theo dõi tin gửi**.
