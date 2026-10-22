-- Khoá random DUY NHẤT theo từng dòng AR, dùng làm nonce cho source_id của tin
-- outbox (DingTalk + Zalo) event activation_request_created.
--
-- Bug 17/10: _next_ar_id sinh id = MAX(id)+1 → id của AR có số lớn nhất bị XOÁ
-- được TÁI DÙNG cho AR mới. source_id cũ = md5(ar_id[+suffix]) → tin TEXT của AR
-- mới trùng source_id với row outbox còn sót của AR cũ → UNIQUE(source_table,
-- source_id, event_type) nuốt im lặng → mất phần chữ, sale chỉ thấy ảnh bill.
--
-- notify_key là uuid random cho mỗi dòng (default gen_random_uuid()), KHÔNG đổi
-- sau insert → 2 AR trùng id vẫn ra source_id khác, mà vẫn giữ idempotency
-- edit/append (notify_key cố định theo AR, suffix phân biệt từng đợt).
--
-- gen_random_uuid() là VOLATILE nên khi ADD COLUMN, Postgres đánh giá LẠI cho
-- từng dòng cũ trong lúc rewrite → mỗi AR cũ cũng nhận 1 uuid riêng (backfill
-- luôn trong 1 câu, không cần UPDATE riêng). Idempotent qua IF NOT EXISTS.
ALTER TABLE active_requests
  ADD COLUMN IF NOT EXISTS notify_key uuid NOT NULL DEFAULT gen_random_uuid();
