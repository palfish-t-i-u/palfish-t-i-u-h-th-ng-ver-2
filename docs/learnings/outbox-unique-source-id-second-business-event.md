# Outbox UNIQUE(source_id): tin nghiệp vụ lần 2 phải đổi source_id

**Related files:** `backend/activation_routes.py` (`_enqueue_activation_request_created_dingtalk`), `dingtalk_outbox` table

**Problem:** Cùng 1 Active Request cần bắn tin DingTalk `activation_request_created` HAI lần — lần đầu khi tạo AR, lần sau khi khách đóng thêm tiền cho bé/gói mới (báo đơn bổ sung). Tin lần 2 bị drop im lặng.

**Trap:** Giữ nguyên `source_id = md5(ar_id)` cho cả 2 lần (vì cùng AR). Bảng `dingtalk_outbox` có `UNIQUE(source_table, source_id, event_type)` — dùng để idempotent, chống enqueue trùng khi retry. Lần 2 cùng (source_table, source_id, event_type) → insert bị nuốt bởi ON CONFLICT DO NOTHING, KHÔNG có lỗi, KHÔNG có tin. Debug tưởng worker/DingTalk hỏng, thực ra tin chưa từng vào outbox.

**Insight:** UNIQUE constraint idempotent này là dao 2 lưỡi: nó bảo vệ khỏi enqueue trùng (tốt) nhưng cũng chặn 2 tin nghiệp vụ HỢP LỆ khác nhau nếu chúng chia sẻ cùng source_id. Đổi `event_type` là SAI (tin cùng loại, cùng format, cùng builder — chỉ khác nội dung). Lời giải đúng: cho source_id một **suffix xác định** (deterministic) phân biệt từng đợt: `md5(f"{ar_id}{source_suffix}")` với suffix = `:append:{first_new_course_code}`. Vẫn idempotent trong 1 đợt (retry cùng đợt = cùng suffix = cùng source_id, không trùng), nhưng đợt bổ sung khác = source_id khác = tin mới lọt qua.

**Rule:** Khi 1 thực thể cần phát NHIỀU tin cùng event_type qua outbox có UNIQUE(source_id): source_id phải nhúng thứ phân biệt từng lần phát (đợt/version/code mới), KHÔNG đổi event_type và KHÔNG dùng nguyên khóa thực thể. Suffix phải deterministic để retry trong cùng lần vẫn idempotent.

**Verify:** `grep -n "source_suffix\|source_uuid" backend/activation_routes.py` — source_uuid phải tính từ `f"{ar_id}{source_suffix}"`, mặc định suffix="" giữ backward-compat cho tin lần đầu.
