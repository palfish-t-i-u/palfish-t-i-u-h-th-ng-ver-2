# PLAN — Tách tin DingTalk: text riêng, ảnh bill riêng (để search đối soát)

**Ngày:** 2026-08-14 · **Yêu cầu:** chị Thu Hiền — cần search lại nội dung tin báo đơn trên DingTalk để đối soát.
**Chốt:** tin text tách khỏi ảnh bill (Hiền đã đồng ý), miễn báo đơn vẫn có ảnh bill. Gate "bắt buộc ảnh bill" đã có sẵn ở app.

## Hiện trạng (điều tra 14/8)

- **Đang GỘP 1 tin**: worker `poll_and_send` ([dingtalk_outbox_worker.py:119-130](backend/dingtalk_outbox_worker.py)) ghép `text + _build_bill_markdown(ảnh)` thành **1 tin `sampleMarkdown`**, ảnh nhúng inline `![bill](url)`.
- **Toggle format = có `title` hay không**: [dingtalk_notifier.py:153-159](backend/dingtalk_notifier.py) — có title → `sampleMarkdown`; không title → `sampleText`. `EVENT_TITLES` gán title cho mọi event ⇒ **hiện mọi tin đều là markdown**.
- **`sampleText` không nhúng được ảnh** → muốn text thuần thì ảnh BẮT BUỘC đi tin riêng qua `send_group_image` (msgKey `sampleImageMsg`, [dingtalk_notifier.py:225-244](backend/dingtalk_notifier.py)) — hàm này **đã có sẵn nhưng đang là code chết** trong luồng báo đơn.
- **`<br>`**: chỉ dùng ở nhánh markdown (`_to_dingtalk_md`). Nhánh `sampleText` render `\n` thô → không cần `<br>`, không phải sửa builder.
- **Body tin không đổi** — `utils/zalo_message_builder.py` đã sinh `\n` thuần (format-agnostic). Chỉ đổi ở tầng wire (msgtype) + cách gửi ảnh.

## Độ phức tạp thật: 1 chỗ cần cẩn thận

Đổi msgtype thì đơn giản. Cái khó duy nhất: **1 tin → 2 lần gửi API** (text + ảnh). Nếu text gửi xong mà ảnh lỗi → retry KHÔNG được gửi lại text (trùng tin — đúng cái mà cơ chế `AMBIGUOUS` đang chống).
**Cách xử lý (tái dùng hạ tầng sẵn có, không thêm cột/state):** enqueue **2 dòng outbox** — mỗi dòng tự idempotent + retry độc lập theo `UNIQUE(source_table, source_id, event_type)` và policy retry hiện tại.

- Dòng TEXT: `message`=text, `image_urls`=NULL, `source_id = md5(ar_id + suffix)` (giữ nguyên → tương thích cũ).
- Dòng ẢNH: `message`='', `image_urls`=[...], `source_id = md5(ar_id + suffix + ':bill')` (khác → không đụng UNIQUE).
- Worker phân luồng theo NỘI DUNG dòng: có `image_urls` → `sampleImageMsg`; không → `sampleText`. Không cần event_type mới, không cần cột mới.
- Thứ tự hiện: chèn dòng text trước (id nhỏ hơn) → worker xử theo id → text nổi trên ảnh.

---

## Milestone 0 — KIỂM CHỨNG searchable ✅ ĐÃ QUA (14/8)

> **PASSED bằng dữ liệu thật** (a Minh test trên nhóm VN-HN IH1): tin auto báo đơn hiển thị dạng **[Card]** (do gửi `sampleMarkdown`) → search "đơn" và "UID" (keyword có trong MỌI tin báo đơn) **không trả về tin auto nào**, chỉ ra tin text gõ tay. Xác nhận: `sampleMarkdown`/Card KHÔNG được index; `sampleText` (text thuần) THÌ được. Giả thuyết đúng → build M1.
> Quan sát thêm: `course_activated` ("✅ ĐÃ TẠO GÓI HỌC THÀNH CÔNG", chứa **Order ID**) cũng là Card, cũng không search được → nên gộp scope (xem dưới).

## Milestone 1 — Tách row + worker phân luồng ✅ DONE (14/8)

- **G1-T1** ✅ **Enqueue tách row**: 1 dòng TEXT (`source_id`=md5(ar_id+suffix), không ảnh) + **mỗi ảnh 1 dòng** (`source_id`=md5(ar_id+URL) → gửi 1 lần/bill, KHÔNG spam khi edit-resend). Guard từng bill (1 insert lỗi không rớt bill sau).
- **G1-T2** ✅ **Worker route theo nội dung** ([dingtalk_outbox_worker.py](backend/dingtalk_outbox_worker.py)): có `image_urls`+text rỗng → `send_group_image` (`sampleImageMsg`); chỉ text → `send_group_message` title rỗng (`sampleText`); có cả hai → LEGACY markdown (row cũ tồn lúc deploy). Import `send_group_image`.
- **G1-T3** ✅ **Retry/AMBIGUOUS/dead-letter** giữ per-row; `send_group_image` cùng cơ chế `processQueryKey`. Fix: row ảnh gửi 0 ảnh → raise thay vì false-success.

## Milestone 2 — Test, docs, review ✅ DONE (14/8)

- **G2-T1** ✅ **Test**: cập nhật [test_dingtalk_ar_created.py](backend/tests/test_dingtalk_ar_created.py) (split), thêm path mới + legacy ở [test_dingtalk_outbox_worker.py](backend/tests/test_dingtalk_outbox_worker.py) (text→sampleText, ảnh→send_group_image, course_activated→text, bill idempotent qua suffix, false-success guard). **98 pass**. (test_zalo_integration:347 đỏ sẵn từ trước — đã flag chip.)
- **G2-T2** ✅ **Docs**: learnings [dingtalk-markdown-not-searchable-split-idempotency.md](docs/learnings/dingtalk-markdown-not-searchable-split-idempotency.md) + admin CLAUDE.md (format rule + br-tag legacy-only).
- **G2-T3** ⬜ **Deploy + smoke**: chờ push + Manual Deploy → bắn 1 đơn thật, xác nhận tin text search được + ảnh riêng.

## Ghi chú từ review đối kháng (14/8)

- **Không blocker.** Dedup đúng; nhánh legacy an toàn cho row cũ.
- **Đã fix**: (a) spam ảnh khi edit → `source_id` ảnh theo URL-hash (gửi 1 lần/bill); (b) row ảnh gửi 0 ảnh → raise, không mark sent; (c) lỗi DB giữa loop → guard từng bill.
- **Trade-off cố hữu (không fix code)**: tách row = mất tính nguyên tử → nếu tin text vào AMBIGUOUS-terminal mà ảnh đã gửi → ảnh "mồ côi" / lệch thứ tự. **Sau deploy monitor** `dingtalk_outbox` where `last_error like 'AMBIGUOUS%'` để re-trigger tay (hiếm — chỉ khi DingTalk 5xx-no-key).

## Phạm vi & quyết định mặc định

- **Scope = `activation_request_created`** (báo đơn — cái Hiền cần đối soát), gồm biến thể `:edit:`/`:append:`. `course_activated`/`urgent_reminder` **không có bill**, muốn search thì chỉ cần bỏ title → text (1 dòng), làm sau nếu cần.
- **Nhiều ảnh (hiếm, thường 1 bill)**: mặc định 1 dòng ảnh loop N `sampleImageMsg` (đơn giản; rủi ro trùng khi retry giữa chừng rất thấp). Nếu muốn tuyệt đối an toàn: 1 dòng/ảnh (`:bill:{i}`) — chọn khi review.

## Deadline (nhỏ, ~1.5–2 ngày công)

| Milestone | Nội dung | Ước lượng |
|---|---|---|
| M0 | Kiểm chứng search (gate) | 0.5 ngày (phần lớn chờ người search thử) |
| M1 | Tách 2 dòng + worker | 1 ngày |
| M2 | Test + docs + deploy | 0.5 ngày |
