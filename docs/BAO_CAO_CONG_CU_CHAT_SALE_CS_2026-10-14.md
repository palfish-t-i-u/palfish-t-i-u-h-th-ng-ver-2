# Công cụ gom tin nhắn chat cho Sale và CS — Khảo sát và đề xuất

**Người chuẩn bị:** Phạm Anh Minh
**Ngày:** 14/10/2026
**Mục đích:** đề xuất công cụ gom tin nhắn sale/CS ↔ khách về một nơi để quản lý giám sát chất lượng chăm sóc; trình cấp trên duyệt.

## Tóm tắt

**Vấn đề.** Sale và CS chat với khách rải rác nhiều kênh (Zalo; riêng CS còn Kakao/WhatsApp/Viber/Line), quản lý không đọc được ở một nơi để theo dõi chất lượng. Cần 2 công cụ riêng — hai nhóm kênh đi theo cơ chế khác nhau, không công cụ nào xử lý được cả hai.

**Giải pháp.**
- Zalo → **Pancake** (đã chạy thử thật). Chi phí 12,09–33,55 triệu/năm tùy phạm vi.
- Quốc tế → còn vướng: đang dùng tài khoản cá nhân nên không gom được; muốn gom phải chuyển sang tài khoản doanh nghiệp, và chỉ **Infobip** đủ 4 kênh; riêng **Kakao** cần pháp nhân/đối tác tại Hàn Quốc.

**Việc cần làm.** Chốt: (1) mua Pancake theo phương án nào + duyệt chi phí; (2) có chuyển kênh quốc tế sang tài khoản doanh nghiệp không; (3) công ty có pháp nhân/đối tác Hàn cho Kakao không.

## 1. Khách trên Zalo — Pancake

Đã chạy thử thật: kết nối được Zalo cá nhân của nhân viên, gom về một màn hình cho quản lý xem. Hơn các công cụ cùng loại: **lấy lại được tin nhắn cũ** và **xuất dữ liệu miễn phí** (sau này tự chấm điểm chất lượng được). Giá ổn định nhiều năm, gia hạn không tăng giá.

**Chi phí** (lấy từ công cụ tính giá của Pancake; mỗi tài khoản = 1 nick Zalo + 1 ghế):

| Phương án | Số tài khoản | 3 tháng | 6 tháng | 1 năm | Chi phí/người/tháng |
|---|---|---|---|---|---|
| 1 — chỉ đội CS | 30 | 3.440.000 | 6.320.000 | 12.090.000 | ~34.000 |
| 2 — CS + toàn bộ sale | 88 | 9.530.000 | 17.450.000 | 33.550.000 | ~32.000 |

*Phương án 2 = 30 CS + 58 sale đang làm việc (HN-Inhouse 36, HN-Team 2 13, HCM 5, HN-Linh Đàm 2, Offline 2). Thêm toàn bộ 58 sale chỉ tốn thêm ~21,5 triệu/năm.*

**Khuyến nghị:** chọn **Phương án 2** để phủ cả sale lẫn CS (chi phí tăng thêm rất nhỏ); hoặc bắt đầu **Phương án 1** nếu muốn làm từng bước.

**Lưu ý** (bản chất chung của công cụ gom Zalo cá nhân): chi phí tính theo số tài khoản; mỗi sale phải tự kết nối rồi thêm quản lý làm admin; vẫn có rủi ro Zalo khóa tài khoản (nhà cung cấp không cam kết).

## 2. Khách trên kênh quốc tế (Kakao/WhatsApp/Viber/Line)

Đang dùng tài khoản cá nhân → gần như không gom được để giám sát (Viber/Line/Kakao chặn bên thứ ba đọc tài khoản cá nhân). Muốn gom phải chuyển sang **tài khoản doanh nghiệp**; khi đó chỉ Infobip đủ cả 4 kênh:

| Công cụ | WhatsApp | Viber | Line | Kakao | Đủ 4 kênh? |
|---|---|---|---|---|---|
| Infobip | ✓ | ✓ | ✓ | ✓ | Đủ |
| Sobot | ✓ | ✗ | ✓ | ✓ | Thiếu Viber |
| respond.io | ✓ | ✓ | ✓ | ✗ | Thiếu Kakao |

Riêng **Kakao** cần công ty có **giấy phép kinh doanh/đối tác tại Hàn Quốc** — không có thì gần như không mở được. Nhóm Zalo triển khai ngay sau khi duyệt; nhóm quốc tế cần thời gian đăng ký tài khoản doanh nghiệp từng kênh (Kakao phụ thuộc pháp nhân Hàn).

## 3. Những điều cần chốt

| # | Quyết định | Ghi chú |
|---|---|---|
| 1 | Mua Pancake theo phương án nào (CS / CS + sales) + duyệt chi phí | Đề xuất Phương án 2. Đề xuất → duyệt: anh Hiếu/Minh trình, Josh duyệt |
| 2 | Có chuyển kênh quốc tế sang tài khoản doanh nghiệp không | Có mới gom/giám sát được; không thì chỉ gom được WhatsApp (rủi ro) |
| 3 | Công ty có pháp nhân/đối tác tại Hàn cho Kakao không | Không có → phải tìm đối tác Hàn trước (mất thời gian) |

## Kế hoạch

| Giai đoạn | Việc cần làm | Phụ trách | Phối hợp |
|---|---|---|---|
| Khảo sát & so sánh | Khảo sát, chạy thử Pancake, lấy giá, đối chiếu 3 công cụ quốc tế | Minh | — |
| Trình & duyệt | Trình đề xuất + chi phí để duyệt | anh Hiếu/Minh trình, Josh duyệt | Kate |
| Triển khai nhóm Zalo | Mua Pancake, hướng dẫn sale kết nối, phân quyền quản lý | Minh | Kate |
| Triển khai nhóm quốc tế | Nếu chuyển TK doanh nghiệp: đăng ký WhatsApp/Line/Viber + Infobip; Kakao theo pháp nhân Hàn | Minh | — |
| Chạy thử & bàn giao | Chạy thử, kiểm tra số liệu, bàn giao cách dùng | Minh | Kate |
