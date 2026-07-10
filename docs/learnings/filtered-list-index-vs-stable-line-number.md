# Đánh số lần TT: index mảng đã lọc ≠ số thứ tự thật

**Related files:** `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`, `frontend/src/components/payment-request/billGuardUtils.ts`, `backend/payment_request_routes.py`

**Problem:** PR-2026-0203 — popup "Thiếu ảnh bill" báo "Lần #1" trong khi Lần #1 đã huỷ; line thật sự thiếu bill là Lần #2. Team nghi hệ thống đánh sai lần TT sau khi huỷ.

**Trap:** Render danh sách con (đã filter) bằng `map((l, i) => "Lần #" + (i + 1))`. Nhìn có vẻ đúng khi không có line huỷ, nhưng hễ mảng con là kết quả filter (bỏ line huỷ, bỏ line đã có bill) thì số hiển thị lệch khỏi số thứ tự người dùng thấy ở danh sách chính. Điều tra cũng dễ đi lạc hướng "hệ thống renumber sau khi huỷ" — thực tế DB/state hoàn toàn đúng.

**Insight:** Số "Lần #" là số ổn định do BE đánh: `_serialize_payment_request_list_item` gán `idx = enumerate(sorted by created_at, start=1)` TÍNH CẢ line đã huỷ (huỷ = status `rejected` + reason "huỷ", không xoá row). Mọi UI phụ (popup, modal, toast) phải dùng `line.idx` này, không bao giờ tự đánh số lại từ mảng đã lọc.

**Rule:** Bất kỳ chỗ nào hiển thị "Lần #N" từ một mảng con của `pr.payments` phải đọc `l.idx`, không dùng tham số index của `.map()`. Check nhanh: `grep -n "Lần #{" frontend/src/components/payment-request/*.tsx` — mọi match phải là `Lần #{...idx}`, không có `i + 1`.

**Verify:** `grep -rn "Lần #{i" frontend/src/components/payment-request/` — phải trả về 0 kết quả.
