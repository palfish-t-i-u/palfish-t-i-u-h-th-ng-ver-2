# ĐIỀU TRA — Tin "YÊU CẦU KÍCH HOẠT KHOÁ HỌC" (AR-created) hiện có được gửi không?

> Brief cho 1 session điều tra riêng. Lập 2026-07-12 trong lúc làm task "Tên bé ở kích hoạt".

## Nghịch lý cần giải
Có **screenshot tin thật** `🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-2026-0060` trong group chat (SĐT/UID/tên+gói/Nguồn/Tổng/Sale·Team) — đúng format `build_activation_request_created_message`. **NHƯNG** đọc code thì tin này **không tới kênh nào**. → Cần xác định: screenshot là **live** (đang gửi thật) hay **cũ** (trước khi pause 9/7)? Và nếu cần bật lại thì bật ở đâu.

## Bằng chứng từ code (đọc ngày 2026-07-12)
- **Builder** (dùng chung Zalo + DingTalk): `build_activation_request_created_message` — `backend/utils/zalo_message_builder.py:385-503`. Chỉ có **1 caller**.
- **Caller duy nhất**: `_enqueue_activation_request_created_zalo` — `backend/activation_routes.py:974-1088`, gọi tại `_save_active_request` (`:1180`).
- **Zalo GATE OFF**: `ZALO_ENABLED_EVENTS = frozenset({"payment_paid", "bill_uploaded"})` — `zalo_message_builder.py:32`, comment *"activation_request_created + activation_urgent_reminder are paused (9/7)"*. Enqueue **early-return** tại `activation_routes.py:983-984`. Có **test khoá**: `backend/tests/test_activation_bill_guard.py:9` assert event này KHÔNG nằm trong `ZALO_ENABLED_EVENTS`.
- **DingTalk KHÔNG có producer**: `dingtalk_outbox` CHECK constraint (`backend/migrations/2026-06-26-dingtalk-tables.sql:36-42`) chỉ cho `payment_paid | course_activated | activation_urgent_reminder` — **không** có `activation_request_created`. Worker `backend/dingtalk_outbox_worker.py:20` có sẵn title "Yêu cầu kích hoạt khoá học" nhưng **không có Python/trigger nào insert** event đó vào `dingtalk_outbox`.
- **DingTalk enterprise robot** (`send_group_message`, `backend/dingtalk_notifier.py:112`, endpoint `api.dingtalk.com/v1.0/robot/groupMessages/send`): caller = `admin_routes.py:1677` (test send thủ công), `dingtalk_outbox_worker.py:80` (chỉ gửi event trong outbox), `zalo_notifier.py:480/487`. **Không thấy** path AR-created → enterprise robot.

→ Theo code hiện tại: AR-created **không enqueue Zalo** (paused), **không enqueue DingTalk** (không producer + CHECK chặn). Vậy tin trong screenshot **có thể chụp trước 9/7** khi Zalo còn bật.

## Cần trả lời
1. Screenshot AR-2026-0060 là **trước hay sau 9/7/2026**? (Nếu sau → có path delivery mình chưa thấy.)
2. Có kênh gửi nào **ngoài** `zalo_outbox`/`dingtalk_outbox` không? Kiểm: DB trigger trên `active_requests`, cron/worker khác, hoặc enterprise robot gọi trực tiếp trong `_save_active_request`/`_enqueue_*`. **Chú ý commit `01c5d1f` "refactor enterprise robot + fix message format"** — kiểm path đó có chở AR-created không.
3. Nếu **muốn bật lại** delivery AR-created:
   - **Zalo**: thêm `"activation_request_created"` vào `ZALO_ENABLED_EVENTS` (`zalo_message_builder.py:32`) + sửa `test_activation_bill_guard.py:9`. (Kiểm nhóm/team routing ở `activation_routes.py:1007-1019` còn đúng.)
   - **DingTalk**: (a) migration mở CHECK constraint `dingtalk_outbox_event_type_check` thêm `activation_request_created`; (b) producer enqueue vào `dingtalk_outbox` khi tạo AR (song song hoặc thay `_enqueue_activation_request_created_zalo`); (c) worker `dingtalk_outbox_worker.py` đã sẵn sàng render.

## Liên quan
- Task đang làm: `docs/plans/PLAN_TEN_BE_KICH_HOAT_2026-07-12.md`. Task đó thêm "Tên bé" vào `active_requests.uids_data[].name` → tin AR-created sẽ hiện `"<Tên bé>, <Gói>"` **khi delivery được bật**. Data lưu ngay bất kể delivery on/off.
- Test tham chiếu message: `backend/tests/test_zalo_builder.py`, `test_zalo_integration.py` (`_enqueue_activation_request_created_zalo`), `test_dingtalk_outbox_worker.py` (feed synthetic AR-created rows).
- Bối cảnh DingTalk enterprise: memory `project_dingtalk-setup-approach` (robot GMV-Notifier, credentials ready).
