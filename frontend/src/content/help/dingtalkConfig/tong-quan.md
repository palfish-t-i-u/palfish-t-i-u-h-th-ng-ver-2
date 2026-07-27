---
title: "DingTalk — Cấu hình"
order: 0
audience: ["admin"]
---

Áp dụng khi: cần kiểm tra kết nối DingTalk còn hoạt động không, hoặc gửi thử tin nhắn tới 1 nhóm.

![Màn hình DingTalk — Cấu hình, panel Kiểm tra kết nối](/docs-images/dingtalkConfig/tong-quan-1.png)

## Lưu ý về credentials

Credentials DingTalk (client_id, client_secret, robot_code) được cấu hình qua **biến môi trường trên server**, không nhập qua giao diện này — trang này chỉ dùng để **test gửi** sau khi đã có nhóm.

## Các bước test gửi

1. Chọn **nhóm** cần gửi thử (danh sách lấy từ tab **Nhóm thông báo**).
2. Nhập **nội dung tin test**.
3. Bấm **Test Gửi DingTalk**.
4. Kết quả hiện ngay bên trên: **Gửi thành công!** kèm mã tin, hoặc **Thất bại** kèm lý do.

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Ô chọn nhóm báo *"Chưa có nhóm"* | Chưa thêm nhóm DingTalk nào | Vào tab **Nhóm thông báo** thêm nhóm trước |
| Test thất bại | Sai `openConversationId`, hoặc robot chưa được thêm vào nhóm | Kiểm tra lại nhóm trong DingTalk, đảm bảo robot **GMV-Notifier** đã có trong nhóm |

> ⚠️ Lưu ý: hệ thống chỉ hỗ trợ nhóm **internal** — nhóm external (bên ngoài công ty) không dùng được enterprise robot.
