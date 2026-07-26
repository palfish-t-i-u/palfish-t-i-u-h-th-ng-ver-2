---
title: "Xử lý số tiền không khớp"
order: 30
audience: ["ke-toan"]
---

Áp dụng khi: đang ghép 1 giao dịch (CK ngoài hoặc quẹt thẻ) với 1 lần thanh toán, nhưng số tiền giữa 2 bên bị lệch.

## Các bước

1. Khi chọn lần thanh toán để ghép, nếu số tiền giao dịch và lần TT không khớp, popup **"Số tiền không khớp"** tự hiện.
2. Popup hiện rõ **Chênh lệch**:
   - Số dương, nhãn **"(thừa)"** — khách chuyển nhiều hơn lần TT ghi nhận.
   - Số âm, nhãn **"(thiếu)"** — khách chuyển ít hơn.
3. Quyết định:
   - **Vẫn tiếp tục ghép** — phần chênh lệch được lưu lại để báo cáo, không cần sửa gì thêm.
   - **Huỷ** — đóng popup, kiểm tra lại xem có đúng lần thanh toán không, hoặc đợi khách chuyển bù/hoàn tiền thừa trước khi ghép.

## Khi nào nên tiếp tục ghép, khi nào nên huỷ

- Chênh lệch nhỏ do phí ngân hàng/làm tròn → tiếp tục ghép, phần lệch tự lưu lại.
- Chênh lệch lớn, hoặc nghi ngờ nhầm giao dịch/nhầm PR → huỷ, đối chiếu lại ảnh bill và nội dung chuyển khoản trước khi ghép lại.

> ⚠️ Lưu ý: phần chênh lệch được lưu để đối soát báo cáo — không tự động sửa **Tổng tiền dự kiến** hay số tiền lần thanh toán trên PR. Nếu khách thực sự đổi số tiền, sửa PR riêng (xem bài **"PR đủ tiền & các popup nhắc việc"**).
