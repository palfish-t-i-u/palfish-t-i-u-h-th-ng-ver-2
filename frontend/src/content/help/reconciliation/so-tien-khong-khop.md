---
title: "Xử lý khi số tiền không khớp"
order: 3
audience: ["hr", "ops"]
---
Xuất hiện khi số tiền thực nhận trên sao kê khác với số tiền lần thanh toán yêu cầu (thường lệch nhỏ do phí ngân hàng, hoặc khách chuyển dư/thiếu).

## Các bước

1. Đọc kỹ chênh lệch hệ thống hiển thị (thừa/thiếu bao nhiêu).
2. Nếu lệch hợp lý (phí NH, làm tròn) → xác nhận ghép, hệ thống ghi nhận đúng số tiền thực tế.
3. Nếu lệch lớn/bất thường → **không xác nhận**, liên hệ sale/khách xác minh trước.
