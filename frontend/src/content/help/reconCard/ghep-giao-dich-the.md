---
title: "Đối soát giao dịch quẹt thẻ (mPOS/Payoo)"
order: 1
audience: ["hr", "ops"]
---
Áp dụng khi: khách thanh toán bằng quẹt thẻ (POS), cần ghép giao dịch từ mPOS/Payoo với đúng lần thanh toán của PR.

## Các bước

1. Đồng bộ giao dịch mới nhất từ mPOS/Payoo (xem hướng dẫn ở module **Đồng bộ mPOS/Payoo**).
2. Tìm giao dịch cần ghép trong danh sách chờ xử lý.
3. Đối chiếu số tiền với lần thanh toán tương ứng của PR.
4. Nếu số tiền không khớp, xử lý qua popup **Số tiền không khớp** thay vì xác nhận nhầm.
