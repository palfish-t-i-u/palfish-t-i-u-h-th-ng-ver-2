# Đặc tả Kỹ thuật Tích hợp SePay & Đối soát mPOS (V1)

Tài liệu này mô tả chi tiết các yêu cầu kỹ thuật, luồng xử lý và các ràng buộc bảo mật (Risk Mitigation) khi tích hợp SePay và xử lý đối soát file mPOS theo chuẩn hệ thống tài chính (Financial Data Integrity).

## 1. Lưu ý quan trọng về Môi trường (Environment)
- **Sandbox Limitation:** Môi trường Sandbox của SePay **chỉ áp dụng cho API Cổng thanh toán (Gateway)**. Sandbox **KHÔNG** hỗ trợ giả lập trigger webhook biến động số dư (Bank transactions). Để test webhook nhận tiền thật, bắt buộc phải chờ ngân hàng liên kết xong (MB/VCB) hoặc sử dụng tính năng "Gửi Test Webhook" có sẵn trên Dashboard của SePay.

## 2. Đặc tả API Webhook (`POST /webhook/sepay`)

### 2.1. Yêu cầu Phản hồi (Response Requirement)
- Webhook endpoint phải trả về response body chính xác là `{"success": true}` với HTTP Status `200 OK`.
- Thời gian xử lý: **Dưới 30 giây**. Quá thời gian này, SePay sẽ coi là lỗi và tiến hành retry. (Do đó, việc đẩy Job chạy ngầm / Background Task cho các matching phức tạp là điều khuyên dùng).

### 2.2. Lớp Bảo mật & Chống tấn công (Security & DDoS Prevention)
Nhằm bảo vệ hệ thống tài chính, Webhook phải đi qua 2 lớp bảo vệ song song trước khi chạm đến logic database:
1. **IP Whitelisting:** Bổ sung middleware hoặc logic chặn mọi request không xuất phát từ dải IP chính thức của hệ thống SePay.
2. **HMAC-SHA256 Verification:** Bắt buộc trích xuất **raw body bytes** (ví dụ `await request.body()` trong FastAPI) để băm SHA256 và so khớp với Header chữ ký của SePay. Điều này chặn đứng các HTTP Fake Request giả mạo.

## 3. Quy tắc xử lý Giao dịch (Transaction Rules)

### 3.1. Settle mPOS Ignore Rule (Chống Double-counting)
- **Vấn đề:** Khi cổng thanh toán mPOS thực hiện kết toán (settlement) đổ tiền về tài khoản MB của công ty, SePay cũng sẽ "bắt" được biến động số dư này.
- **Giải pháp:** Xây dựng một logic phân loại trên nhánh xử lý Webhook MB: Nhận diện nội dung kết toán đặc thù của mPOS/Payoo (dựa trên keyword/pattern). Lập tức gán trạng thái của các bản ghi này thành `IGNORED` (loại trừ tự động), ngăn ngừa việc hệ thống ngộ nhận đây là một khoản thanh toán doanh thu bán hàng mới.

### 3.2. Database-Level Constraint (Chống Race Condition)
- **Vấn đề:** Khi Webhook bị delay (hoặc retry) xảy ra cùng thời điểm tính bằng mili-giây với Cronjob `sync-pending-sepay`, code-level `SELECT check_exists` sẽ bị xuyên thủng (Race Condition), dẫn tới việc lưu 2 bản ghi cho 1 giao dịch.
- **Giải pháp:** Sử dụng Native Constraint của CSDL. Trên PostgreSQL, câu lệnh bắt buộc phải là `INSERT INTO ... ON CONFLICT (sepay_id) DO NOTHING`. Khóa (Lock) ở tầng DB đảm bảo tính độc nhất 100% của dòng tiền.

## 4. Đặc tả luồng Import Đối soát mPOS

### 4.1. Tinh chỉnh Heuristic Matching
- Khi đối soát file `transaction.xls` của mPOS, do không có `ORDER_ID`, logic khớp lệnh dùng tổ hợp: `Số tiền` + `Thời gian` + `Chi tiết GD (chứa MPL_...)`.
- **Ràng buộc Concurrent Transactions:** Nếu hàm heuristic trả về `n >= 2` kết quả khớp (ví dụ: 2 giao dịch có mệnh giá giống hệt nhau, phát sinh trong cùng 1 phút), hệ thống **TUYỆT ĐỐI KHÔNG TỰ ĐỘNG MAP**.
- **Giải pháp:** Đánh cờ trạng thái giao dịch này là `NEEDS_REVIEW` (hoặc `AMBIGUOUS`). Thông tin sẽ được đưa lên màn hình Quản trị (UI) để kế toán hoặc người vận hành đối soát thủ công bằng mắt (Manual Mapping).

### 4.2. Xử lý Trạng thái "Đảo" (Refund/Reversal) - Audit Trail
- Tuyệt đối **KHÔNG** thực hiện lệnh xóa vật lý (Hard Delete) đối với các giao dịch có trạng thái "Đảo" (Hoàn tiền/Hủy) trong file kết xuất mPOS.
- **Quy trình xử lý chuẩn mực kế toán:**
  1. Cập nhật trạng thái (`status`) của giao dịch gốc từ `SUCCESS` thành `REVERSED` hoặc `REFUNDED`.
  2. Tạo ra một **Bản ghi đối ứng (Contra-entry)** mới tinh mang số tiền có giá trị âm (Negative Amount).
  3. Gắn khóa ngoại tự tham chiếu `parent_transaction_id` của bản ghi đối ứng này trỏ thẳng về ID của bản ghi gốc. Nhờ vậy, vết kiểm toán (Audit Trail) luôn được bảo toàn cho mọi luồng sao kê.
