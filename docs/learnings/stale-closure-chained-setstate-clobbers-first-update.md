# Chained setState trong 1 handler dùng closure cũ → cuộc gọi sau đè cuộc gọi trước

**Related files:** `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`, `frontend/src/components/payment-request/VietnamAddressFields.tsx`, `frontend/src/components/payment-request/CreatePaymentRequestModal.tsx`

**Problem:** Chọn Tỉnh/Thành lần đầu trong form "Sửa" (B1 - Thông tin khách hàng) của PR drawer bị mất ngay lập tức — ô vẫn hiện trống sau khi bấm chọn, dù dropdown lọc đúng và onClick chắc chắn chạy (xác nhận qua `aria-expanded` đổi false).

**Trap:** Nghi ngờ đầu tiên luôn là lỗi thao tác Playwright (click sai vị trí, dropdown bị element khác che, timing/race). Đã tốn ~6 vòng lặp debug (click thường → click qua `page.evaluate` native DOM → kiểm tra rect/visibility/ancestor scroll) trước khi nhận ra vấn đề nằm ở CODE, không phải ở cách test click.

**Insight:** `VietnamAddressFields.handleProvinceChange` gọi **2 setState liên tiếp trong cùng 1 event handler**:
```js
const handleProvinceChange = (value) => {
  onProvinceChange(value);              // setDraft({ ...draft, province: value })
  if (value !== province) onWardChange(""); // setDraft({ ...draft, ward: "" })  ← LUÔN chạy khi chọn tỉnh mới
};
```
Cả 2 lời gọi `setDraft` đều dùng dạng `setDraft({ ...draft, field: v })` — spread từ biến `draft` đóng băng tại thời điểm render (closure), KHÔNG phải dạng cập nhật hàm `setDraft(prev => ({...prev, field: v}))`. Vì `value !== province` luôn đúng khi chọn tỉnh THẬT SỰ khác giá trị cũ, lời gọi thứ 2 (reset ward) luôn chạy ngay sau, và nó ghi đè object hoàn toàn dựa trên `draft` CŨ (chưa có `province` mới) — xoá sạch kết quả của lời gọi thứ 1 trong cùng 1 lượt render/batch.

Đối chứng: `CreatePaymentRequestModal.tsx` dùng `const set = (k, v) => setForm(f => ({ ...f, [k]: v }))` (functional updater) — KHÔNG dính bug này dù dùng chung `VietnamAddressFields`. Đây là lý do tạo PR mới điền địa chỉ luôn được, chỉ SỬA PR có sẵn mới bị mất.

**Rule:** Bất cứ khi nào 1 handler gọi ≥2 lần `setState(obj)` (không phải `setState(prev => ...)`) trong cùng 1 hàm đồng bộ — kiểm tra ngay xem có bị ghi đè lẫn nhau không, đặc biệt khi 1 trong 2 lời gọi đến từ 1 callback lồng khác (như `onWardChange` gọi từ trong `onProvinceChange`). Nếu 1 component tái sử dụng (VD `VietnamAddressFields`) có sẵn callback phụ tự động (reset ward khi đổi tỉnh), MỌI nơi gọi nó phải dùng functional updater, không chỉ nơi đầu tiên viết.

**Verify:** `grep -n "setDraft({ \.\.\.draft" frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` — phải rỗng (đã chuyển hết 23 chỗ sang `setDraft((prev) => (prev ? { ...prev, ... } : prev))`).
