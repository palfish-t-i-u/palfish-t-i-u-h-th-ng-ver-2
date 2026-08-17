# DingTalk markdown card không search được → tách tin + idempotency theo ngữ nghĩa

**Related files:** `backend/dingtalk_outbox_worker.py`, `backend/activation_routes.py`, `backend/dingtalk_notifier.py`

**Problem:** Tin báo đơn DingTalk (activation_request_created) không tìm được bằng thanh search của DingTalk — chị Hiền cần search để đối soát.

**Trap:** Tưởng chỉ cần đổi msgtype `sampleMarkdown`→`sampleText` là xong. Nhưng `sampleText` KHÔNG nhúng được ảnh (markdown mới nhúng `![](url)` được), mà báo đơn bắt buộc kèm ảnh bill → phải tách ảnh thành tin riêng (`sampleImageMsg`). Tách rồi thì **1 thông báo = nhiều lần gửi API** (text + N ảnh). Nếu vẫn để chung 1 row `dingtalk_outbox` và gửi nhiều lần trong 1 lần xử lý: text gửi xong, ảnh lỗi → retry re-gửi cả text = **trùng tin** (đúng cái AMBIGUOUS-handling đang chống, learning `dingtalk-async-send-5xx-duplicate`).

**Insight:** Đã xác minh thực nghiệm (14/8, nhóm VN-HN IH1): tin robot `sampleMarkdown` hiện dạng **[Card]** → DingTalk KHÔNG index nội dung; `sampleText` (title rỗng) thì search full-text được. Cách tách an toàn = **mỗi tin 1 outbox row**, `source_id` mã hoá "KHI NÀO tin này nên gửi lại":
- Tin TEXT: `source_id = md5(ar_id + source_suffix)` — suffix đổi theo `:edit:`/`:append:` ⇒ tin cập nhật/bổ sung RE-SEND (đúng ý).
- Tin ẢNH: `source_id = md5(ar_id + ":bill:" + md5(url))` — **KHÔNG kèm suffix** ⇒ cùng 1 bill của 1 AR chỉ gửi ĐÚNG 1 LẦN dù sửa/bổ sung bao lần (UNIQUE nuốt lần sau), không spam ảnh trùng. Hash URL (không dùng vị trí `:bill:{i}`) → bền với đổi thứ tự bill.

Mỗi row tự retry/dedup theo `UNIQUE(source_table, source_id, event_type)` + AMBIGUOUS sẵn có → KHÔNG cần thêm cột partial-state. Worker route theo NỘI DUNG row: có `image_urls` + message rỗng → `send_group_image`; chỉ message → `sampleText`; có cả hai → nhánh LEGACY (markdown nhúng, cho row cũ tồn outbox lúc deploy).

**Rule:** Khi 1 thông báo phải đi nhiều tin (text+ảnh, nhiều ảnh), tách **mỗi tin 1 outbox row** với `source_id` phản ánh đúng "khi nào tin này nên gửi lại" — đừng gộp nhiều lần gửi vào 1 row (retry sẽ gửi trùng phần đã xong). Đánh đổi: mất tính nguyên tử (text/ảnh có thể lệch nhau nếu 1 phần AMBIGUOUS-terminal) → theo dõi `last_error like 'AMBIGUOUS%'` để phát hiện tin mồ côi, re-trigger tay.

**Verify:** `cd backend && py -m pytest tests/test_dingtalk_ar_created.py::TestEnqueueActivationRequestCreatedDingtalk::test_bill_row_source_id_stable_across_suffix tests/test_dingtalk_outbox_worker.py -q` — phải pass (bill source_id ổn định qua suffix; text→sampleText; ảnh→send_group_image).
