# DingTalk "Tổng" phải cùng nguồn với các dòng "Tiền"

**Related files:** `backend/utils/zalo_message_builder.py`, `backend/activation_routes.py`, `frontend/src/components/payment-request/paymentRequestUtils.ts`

**Problem:** Tin báo đơn DingTalk (activation_request_created) hiện `Tổng` sai với đơn quẹt thẻ — per-course `Tiền` đúng (10.530.000 + 9.126.000) nhưng footer `Tổng: 20.160.000` (case chị Thảo Anh 14/8), phải là 19.656.000.

**Trap:** Nghĩ footer `Tổng` nên lấy `PR.received/target` (số kế toán "phải thu") — đó là quy tắc cũ 29/7 (a Minh) cố tình để `Tổng` ≠ Σ(Tiền) cho kế toán soi lệch. Nhưng các dòng `Tiền` mỗi con lại build từ `ar.uids_data[].courses[].amount` (allocation sale nhập). Đơn thẻ: `target` = giá gói GỐC (chưa trừ phí 2.5%), còn allocation = tiền THỰC NHẬN sau phí → 2 nguồn lệch nhau, footer sai dù block đúng. FE `activeRequestAllocation` (paymentRequestUtils.ts:468) đã sum allocation từ lâu → FE đúng, chỉ BE lệch.

**Insight:** Khi cùng một tin/màn hình hiển thị "tổng" và "các phần cộng lại", cả hai PHẢI derive từ MỘT nguồn. `Tổng` = Σ(Tiền) = Σ `course.amount`, KHÔNG đọc `PR.received/target` (cột đó là giá gói gốc, không phản ánh phí thẻ). Fallback về received>0?received:target CHỈ khi không gói nào có amount. `_ar_dingtalk_content_key` (guard edit-resend) cũng phải tính `total` cùng công thức, nếu không snapshot "cái hiển thị" bị lệch → false-positive/negative khi so trước/sau PATCH.

**Rule:** Đơn tín dụng (thẻ/trả góp) báo THEO tiền thực nhận trên MỌI con số (payment line, allocation, Tổng). Bất kỳ chỗ nào tính "tổng đơn AR" để hiển thị → sum `course.amount`, không lấy PR field. Sửa footer builder thì sửa luôn content-key cho khớp.

**Verify:** `cd backend && py -m pytest tests/test_zalo_builder.py -q` — case `test_card_order_total_uses_allocation_not_course_price` phải pass (target 20.160.000 ≠ Σ allocation 19.656.000).
