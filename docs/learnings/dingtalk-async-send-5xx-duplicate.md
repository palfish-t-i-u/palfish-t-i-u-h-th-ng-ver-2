# DingTalk async send: 5xx sau khi đã gửi → retry gây tin trùng

**Related files:** `backend/dingtalk_notifier.py` (send_group_message / send_group_image), `backend/dingtalk_outbox_worker.py`

**Problem:** Tin báo đơn DingTalk bị gửi 2 lần vào nhóm (test id 63, 18/07). `dingtalk_outbox.retries=2`, mỗi lần `last_error="DingTalk HTTP 503"` nhưng tin VẪN tới nhóm. Worker tưởng fail → retry → gửi lại tin đã gửi.

**Trap:** Coi HTTP 5xx = "chưa gửi, retry an toàn". Sai với API bất đồng bộ. DingTalk `robot/groupMessages/send` là async: nhận request → enqueue → trả `processQueryKey` = "đã nhận để gửi". Việc gửi thực tế xảy ra phía DingTalk. Một 5xx ở tầng HTTP wrapper KHÔNG có nghĩa message chưa vào queue — nếu body vẫn kèm `processQueryKey` thì tin ĐÃ được nhận và sẽ gửi. Blind-retry một request đã enqueue = tin trùng. DingTalk KHÔNG có idempotency-key param để tự dedupe phía server (đã research docs + Go SDK — chỉ có processQueryKey trả về, không nhận vào).

**Insight:** Với downstream async + non-idempotent, tín hiệu "đã nhận" là **response body (processQueryKey), không phải HTTP status**. Phải parse key từ body BẤT KỂ status code: có key → thành công (đừng retry); không key + 4xx/5xx → mới là fail thật (retry không gây trùng vì chưa enqueue). Đây là biến thể của at-least-once: chỉ retry khi CÓ BẰNG CHỨNG chưa gửi, không retry khi ambiguous-nhưng-có-key.

**Rule:** Khi worker gọi một send API bất đồng bộ trả correlation key (processQueryKey / messageId / receipt), coi key-trong-body là nguồn sự thật cho "đã gửi", không phải HTTP 2xx. Parse key trước khi raise lỗi. Chỉ retry khi không có key. Kèm body snippet vào last_error để chẩn đoán status-vs-body mismatch.

**Residual — GIẢI 18/7 (đổi at-least-once → at-most-once-có-cờ cho nhánh 5xx):** 5xx CÓ body nhưng KHÔNG processQueryKey (vd `503 ServiceUnavailable` từ Aliyun gateway) vẫn deliver thật → nhánh at-least-once cũ retry gây trùng (test #4: 2 tin, 1 ảnh gốc + 1 thumb, do attempt sớm fallback ảnh gốc lúc thumb chưa upload xong, attempt sau dùng thumb đã cache — big-vs-small là TRIỆU CHỨNG của retry). Fix: `DingTalkAmbiguousDeliveryError` (subclass) cho 5xx-no-key + read/write-timeout → worker mark TERMINAL (retries=MAX, next_retry_at None), KHÔNG set sent_at (không claim đã gửi), last_error prefix `AMBIGUOUS` để verify tay. Connect-error (chưa tới) + 4xx (reject trước enqueue) VẪN retryable. Đánh đổi: 5xx-thật-chưa-gửi giờ không auto-retry → không mất ngầm (row hiện dạng dead-unsent, `where last_error like 'AMBIGUOUS%'`), người verify trên nhóm rồi mới re-trigger tay. Ưu tiên chống-trùng > chống-mất vì team phàn nàn tin trùng + quan sát 5xx LUÔN deliver.

**Verify:** `grep -c "processQueryKey" backend/dingtalk_notifier.py` — expect ≥4 (parse trong cả send_group_message + send_group_image, mỗi hàm: gán + check `if process_key`). Zero/giảm = fix bị revert, bug tin-trùng quay lại.
