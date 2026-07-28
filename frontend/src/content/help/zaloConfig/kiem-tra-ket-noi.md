---
title: "Kiểm tra kết nối"
order: 2
audience: ["admin"]
---

Áp dụng khi: vừa cập nhật credentials, hoặc nghi ngờ Zalo OA không gửi được tin, cần gửi thử để xác nhận.

![Panel Kiểm tra kết nối — chọn nhóm, nhập nội dung tin test](/docs-images/zaloConfig/kiem-tra-ket-noi-1.png)

## Các bước

1. Chọn **nhóm** cần gửi thử (danh sách lấy từ tab **Nhóm thông báo**).
2. Nhập **nội dung tin nhắn test**.
3. (Tuỳ chọn) Nhập **URL ảnh** để kèm ảnh vào tin test.
4. Bấm **Test Gửi Tin Zalo**.

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Ô chọn nhóm báo *"Chưa có nhóm nào"* | Chưa thêm nhóm Zalo nào | Vào tab **Nhóm thông báo** thêm nhóm trước |
| Gửi thất bại | Token hết hạn hoặc lỗi kết nối Zalo | Kiểm tra lại **Trạng thái Token**, thử lại sau vài phút |

> ⚠️ Lưu ý: đây là gửi tin **thật** tới đúng nhóm Zalo đã chọn — dùng nội dung test rõ ràng để tránh gây nhầm lẫn cho người trong nhóm.
