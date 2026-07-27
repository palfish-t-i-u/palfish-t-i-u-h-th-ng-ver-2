---
title: "Đối soát quẹt thẻ mPOS / Payoo"
order: 1
audience: ["ke-toan"]
---

Áp dụng khi: khách thanh toán bằng quẹt thẻ hoặc trả góp qua máy mPOS / Payoo, cần ghép giao dịch với lần thanh toán trên PR.

![Drawer đối soát quẹt thẻ — thông tin giao dịch (khách, thẻ, số tiền, thực nhận) + panel ghép với lần thanh toán](/docs-images/reconCard/ghep-giao-dich-the-1.png)

## Các bước

1. Vào **Đối soát giao dịch · Quẹt thẻ** → chọn tab **mPOS** hoặc **Payoo**.
2. Với mỗi giao dịch, hệ thống phân loại **Quẹt thẻ** hoặc **Trả góp** (kèm platform trả góp nếu có).
3. Bật tick **Khớp tiền** (mặc định bật) để chỉ hiện các lần thanh toán trùng đúng số tiền giao dịch — giúp tìm nhanh hơn.
4. Chọn đúng lần thanh toán cần ghép.
5. Nếu số tiền lệch, popup **"Số tiền không khớp"** hiện ra — xem bài **Xử lý số tiền không khớp** để quyết định tiếp tục hay huỷ.
6. Bấm **Ghép giao dịch này**.

## Sau khi ghép

- Lần thanh toán chuyển sang trạng thái đã xác nhận tiền về, với số tiền thực nhận đã trừ phí MDR/phí trả góp (nếu có).

> ⚠️ Lưu ý: với giao dịch **trả góp**, số tiền thực nhận trên hệ thống đã trừ đủ phí MDR + phí trả góp — không dùng số tiền gộp trên sao kê gốc để đối chiếu "Cùng số tiền".
