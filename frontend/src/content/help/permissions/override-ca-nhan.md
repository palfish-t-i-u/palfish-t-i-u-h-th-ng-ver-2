---
title: "Override quyền cá nhân"
order: 1
audience: ["admin"]
---

Áp dụng khi: cần cấp/hạn chế quyền cho **1 người cụ thể**, khác với quyền mặc định của cả bộ phận họ đang thuộc.

![Tab Override cá nhân — nút Thêm override, danh sách nhân sự đã có override](/docs-images/permissions/override-ca-nhan-1.png)

## Các bước

1. Vào tab **Override cá nhân**.
2. Bấm **+ Thêm override**.
3. Tìm và chọn nhân sự (theo email, tên, bộ phận).
4. Trong drawer mở ra, bấm vào từng module để đổi cấp quyền riêng cho người này — mỗi lần bấm chuyển cấp (giống ma trận Theo nhóm).
5. Lưu lại.

## Kết quả mong đợi

- Người này sẽ dùng đúng cấp quyền override đã set, **thay vì** quyền mặc định của bộ phận — cho những module có override.
- Module không override vẫn theo đúng quyền bộ phận (tab **Theo nhóm**).

> ⚠️ Lưu ý: override chỉ ảnh hưởng đúng người được chọn, không ảnh hưởng người khác cùng bộ phận. Muốn gỡ override, vào lại drawer của người đó và đổi về đúng cấp quyền bộ phận.
