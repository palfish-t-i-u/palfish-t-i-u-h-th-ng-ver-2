# Gate nút theo tồn-tại vs theo tài-nguyên: one-shot hay resumable

**Related files:** `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`, `paymentRequestUtils.ts` (`reportButtonState`, `activeRequestAllocation`)

**Problem:** Nút "Báo đơn & Kích hoạt" khoá vĩnh viễn sau lần bấm đầu (`disabled={!ready || hasActiveRequest}`). Khách đóng thêm tiền cho bé/gói mới trên cùng PR → không báo/kích hoạt được, phải đi đường vòng "Sửa" tay (không bắn tin, kế toán mù).

**Trap:** Gate nút theo **sự tồn tại** của một record: "đã có Active Request → khoá". Đây là gate one-shot — coi hành động là làm-một-lần. Đúng cho lần đầu, nhưng biến một quy trình vốn RESUMABLE (đóng tiền nhiều đợt, mỗi đợt 1 bé/gói) thành cụt.

**Insight:** Điều kiện mở nút phản ánh MÔ HÌNH nghiệp vụ. Có 2 kiểu:
- Gate theo **tồn-tại** (`hasX`): hành động one-shot, làm rồi là xong. Đơn giản nhưng khoá luôn các đợt sau hợp lệ.
- Gate theo **tài-nguyên còn lại** (`remaining > 0`): hành động resumable, còn nguyên liệu thì còn làm được. Ở đây "nguyên liệu" = tiền đã thu nhưng chưa phân bổ vào gói (`activeRequestAllocation().remaining`). Nút sáng khi còn tiền dư, tắt khi phân bổ hết — tự nhiên khớp việc khách đóng nhiều đợt.

Chọn sai kiểu = hoặc khoá oan (tồn-tại cho việc resumable), hoặc cho bấm lại vô nghĩa (tài-nguyên cho việc one-shot).

**Rule:** Trước khi gate nút bằng `hasX`, hỏi: việc này one-shot hay resumable? Nếu người dùng có thể làm lại hợp lệ khi có thêm "nguyên liệu" (tiền, hạn mức, slot chưa dùng), gate theo tài-nguyên-còn-lại chứ đừng theo tồn-tại. Tách logic ra helper thuần (như `reportButtonState`) để test đủ các nhánh: chưa đủ đk / đủ + chưa có / đủ + còn dư / đủ + hết dư.

**Verify:** `grep -n "reportButtonState\|remaining" frontend/src/components/payment-request/paymentRequestUtils.ts` — điều kiện `isAppend` phải dựa `unallocated > 0`, KHÔNG dựa `hasAr` đơn thuần.
