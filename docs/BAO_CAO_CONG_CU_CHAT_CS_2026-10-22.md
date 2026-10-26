# Công cụ gom tin nhắn chat cho đội CS — Khảo sát và đề xuất

**Người chuẩn bị:** Phạm Anh Minh
**Ngày:** 22/10/2026
**Mục đích:** đề xuất công cụ gom tin nhắn giữa CS và khách về một nơi để quản lý giám sát chất lượng chăm sóc; trình cấp trên duyệt.

## Tóm tắt

**Vấn đề.** Đội CS chăm khách qua nhiều kênh: **Zalo** (khách trong nước) và **Kakao/WhatsApp/Viber/Line** (khách nước ngoài). Cần gom hội thoại CS ↔ khách về một màn hình để quản lý đọc, theo dõi và chấm điểm chất lượng. Cần 2 công cụ riêng — hai nhóm kênh đi theo cơ chế khác nhau, không công cụ nào xử lý được cả hai.

**Hiện trạng (số thật, 04–22/10, từ dữ liệu Salework — kênh Zalo):** 8 CS full-time, ~**1.079 hội thoại/ngày** toàn đội (~2.307 lượt trả lời/ngày), thời gian phản hồi trung vị **~3,8 phút**. Kênh quốc tế hiện dùng tài khoản cá nhân, chưa gom/giám sát được.

**Giải pháp.**
- Zalo → **Pancake** (rẻ nhất trong nhóm phù hợp, lấy được tin nhắn cũ, xuất dữ liệu miễn phí qua API).
- Quốc tế → còn vướng: đang dùng tài khoản cá nhân nên không gom được; muốn gom phải **chuyển sang tài khoản doanh nghiệp**, và chỉ **Infobip** đủ 4 kênh; riêng **Kakao** cần công ty có pháp nhân/đối tác tại Hàn Quốc.

**Việc cần làm.** Chốt: (1) chọn công cụ Zalo (đề xuất Pancake) + phạm vi + duyệt chi phí; (2) có chuyển kênh quốc tế sang tài khoản doanh nghiệp không; (3) công ty có pháp nhân/đối tác Hàn cho Kakao không.

## 1. Khách trên Zalo (trong nước)

Gom Zalo cá nhân của CS về một màn hình cho quản lý xem. So sánh các công cụ:

| Công cụ | Mô tả | Ưu điểm | Nhược điểm | Xuất dữ liệu | Chi phí (1 năm) |
|---|---|---|---|---|---|
| **Pancake** (đề xuất) | Gom Zalo cá nhân + nhiều kênh | Lấy được tin nhắn cũ; API xuất **miễn phí**; kèm được Facebook/WhatsApp/Line; giá ổn định, gia hạn không tăng | Rủi ro Zalo khóa tài khoản (chung mọi công cụ loại này) | **API chính thức, miễn phí** | **12,09 triệu** (30 tài khoản) |
| Salework (đang dùng) | Gom Zalo cá nhân + sàn TMĐT | Đội CS đã quen dùng | Không có API xuất chính thức — phải "lách" để lấy dữ liệu (dễ gãy, tốn công bảo trì) | Không có API (phải tự trích xuất) | *cần xác nhận giá đang trả* |
| WorkGPT | Gom Zalo cá nhân + báo cáo theo nhân viên | Báo cáo theo từng nhân viên chi tiết | Đắt; mỗi nhân viên một "portal" riêng (cài đặt phức tạp); xuất dữ liệu tính phí theo lần | Excel, tính phí | ~cao (báo giá 60 tài khoản = 45,26 triệu) |
| Vpage | Gom Zalo cá nhân + đa kênh | Rẻ theo số kênh | **Không lấy được tin nhắn cũ**; không có API, chỉ tải tay | Tải tay | ~rẻ (từ ~100k/tháng/kênh) |

→ **Pancake** tối ưu: rẻ nhất trong nhóm "đủ dùng" và là công cụ duy nhất có **API xuất dữ liệu miễn phí** — then chốt để sau này tự động hóa báo cáo chất lượng CS.

### Giá trị & tiết kiệm

- **Tiền:** Pancake (30 tài khoản) = **12,09 triệu/năm** — rẻ hơn WorkGPT ~**33 triệu/năm** và không mất phí xuất dữ liệu. *(So với Salework đang dùng: cần giá đang trả để tính chênh lệch.)*
- **Khối lượng CS hiện tại (số thật từ Salework, 30 ngày):** 8 CS full-time, mỗi người hoạt động ~**9–11 giờ/ngày**; toàn đội ~**1.079 hội thoại/ngày**, thời gian phản hồi trung vị **~3,8 phút**.
- **Thời gian:** đổi công cụ không giảm giờ CS trực chat (cùng lượng khách). Giá trị thời gian nằm ở **tự động hóa báo cáo/chấm điểm chất lượng** nhờ API xuất miễn phí — thay cho việc quản lý đọc và chấm thủ công. *(Số giờ quản lý tiết kiệm = thời gian theo dõi thủ công hiện tại; cần chị Huyền cho con số để quy ra tiền.)*

## 2. Khách trên kênh quốc tế (Kakao/WhatsApp/Viber/Line)

Đang dùng tài khoản cá nhân → gần như không gom được để giám sát (Viber/Line/Kakao chặn bên thứ ba đọc tài khoản cá nhân). Muốn gom phải chuyển sang **tài khoản doanh nghiệp**; khi đó so sánh 3 nền tảng (giá niêm yết, chưa báo giá chính thức):

| Công cụ | WhatsApp | Viber | Line | Kakao | Đủ 4 kênh? | Chi phí niêm yết | Ước tính 8 ghế CS/năm |
|---|:---:|:---:|:---:|:---:|:---:|---|---|
| **Infobip** | ✓ | ✓ | ✓ | ✓ | **Đủ** | ~€83/ghế/tháng (~2,3tr) + phí tin | **~220 triệu** |
| Sobot | ✓ | ✗ | ✓ | ✓ | Thiếu Viber | ~$83/agent/tháng (~2,1tr) | ~200 triệu |
| respond.io | ✓ | ✓ | ✓ | ✗ | Thiếu Kakao | $79–279/tháng/gói (gồm 1.000 khách) + user thêm | ~24–84 triệu |

*Infobip/Sobot tính theo ghế; respond.io tính theo gói + số khách. Phí tin nhắn (WhatsApp/Meta…) tính riêng. Ước tính giả định 8 ghế, tỷ giá ~27.500đ/EUR, ~25.000đ/USD.*

**Kết luận nhóm quốc tế:**
- Chỉ **Infobip** đủ cả 4 kênh, nhưng **đắt** (~220 triệu/năm cho 8 ghế — gấp ~18 lần nhóm Zalo) và phải chuyển sang tài khoản doanh nghiệp trước.
- Riêng **Kakao** cần công ty có **pháp nhân/đối tác tại Hàn Quốc** — không có thì gần như không mở được.
- **Đề xuất làm nhóm Zalo trước, nhóm quốc tế tính riêng và triển khai sau** khi đủ điều kiện.

## 3. Những điều cần chốt

| # | Quyết định | Ghi chú |
|---|---|---|
| 1 | Chọn công cụ Zalo + phạm vi + duyệt chi phí | Đề xuất **Pancake**; phạm vi 8 CS full-time hay ~30 gồm part-time; 30 tài khoản = 12,09 triệu/năm. Kate trình, Josh duyệt |
| 2 | Có chuyển kênh quốc tế sang tài khoản doanh nghiệp không | Có mới gom/giám sát được; không thì chỉ gom được WhatsApp (rủi ro), còn lại theo dõi thủ công |
| 3 | Công ty có pháp nhân/đối tác tại Hàn cho Kakao không | Không có → phải tìm đối tác Hàn trước (mất thời gian) |

## Kế hoạch

Đã xong: khảo sát thị trường, chạy thử Pancake, lấy giá thật, lấy số liệu CS hiện tại, đối chiếu 3 công cụ quốc tế. Timeline từ lúc trình (mốc tính theo ngày làm việc, dời theo ngày duyệt thực tế):

| Thời gian | Việc cần làm | Phụ trách |
|---|---|---|
| 23/10 | Trình đề xuất lên sếp; chốt công cụ + phạm vi + duyệt chi phí | Kate trình, Josh duyệt |
| 24–25/10 | Mua gói Pancake (sau khi duyệt chi phí) | Minh |
| 27–31/10 | Hướng dẫn CS kết nối Zalo vào Pancake + phân quyền quản lý | Minh, Kate |
| 03–05/11 | Chạy thử, kiểm tra số liệu; bàn giao + hướng dẫn CS cách dùng | Minh, Kate |
| Sau, làm riêng | Nhóm quốc tế: lấy báo giá chính thức Infobip + đánh giá điều kiện (chuyển tài khoản doanh nghiệp, pháp nhân Hàn) → trình quyết định riêng | Minh |
