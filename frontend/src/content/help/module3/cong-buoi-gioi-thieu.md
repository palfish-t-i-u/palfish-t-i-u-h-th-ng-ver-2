---
title: "Cộng buổi giới thiệu (referral)"
order: 8
audience: ["sale", "admin"]
---

Áp dụng khi: gói học có nguồn khách "Giới thiệu" (gioi_thieu) và có buổi thưởng cho người giới thiệu và/hoặc người được giới thiệu.

![Panel "Khoá này có thưởng giới thiệu" — tick Đã cộng buổi cho người được giới thiệu và người giới thiệu](/docs-images/module3/cong-buoi-gioi-thieu-1.png)

## Điều kiện để tick

- Course Code phải **đã tạo gói học** (đã điền Order ID CRM) — chưa điền Order ID thì ô tick bị khoá, có tooltip nhắc "Cần điền Order ID (tạo gói học) trước khi tick cộng buổi".
- Panel cộng buổi chỉ hiện khi gói có `bonusSessionsReferee` (buổi thưởng người được giới thiệu) hoặc `bonusSessionsReferrer` (buổi thưởng người giới thiệu) > 0.

## Cách dùng

1. Tick **Đã cộng buổi** ở dòng tương ứng (người được giới thiệu / người giới thiệu) sau khi đã cộng buổi thật trên CRM.
2. Hệ thống ghi lại thời điểm cộng và người thao tác, hiện ngay dưới dòng: "Đã cộng lúc ... · tên người thao tác".

## Bỏ tick (huỷ cộng buổi)

- Bỏ tick **bắt buộc nhập lý do** vào audit log (VD: "Bù sai số buổi, cộng nhầm khoá học…") — không nhập lý do thì nút "Xác nhận bỏ tick" bị khoá.
- Lý do này được lưu lại để tra soát sau, không hiển thị lại trên giao diện chính.

> ⚠️ Lưu ý: quyền tick/bỏ tick cộng buổi được kiểm tra cả ở backend (`require_referral_credit`) — Sale không có quyền vào tab Tạo gói học vẫn không tự cộng buổi được kể cả khi biết API.
