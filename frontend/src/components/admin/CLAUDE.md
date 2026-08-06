# Admin — Zalo OA + DingTalk Notifications

Context riêng cho module admin notifications. Đọc kèm `MODULES.md` (root) để biết danh sách file đầy đủ FE + BE.

## Kiến trúc chung

Hai kênh song song, cùng pattern **outbox + worker retry**:

| | Zalo OA | DingTalk |
|---|---|---|
| Config | `zalo_oa_credentials` (1 row: app_id, secret, tokens) | Env vars: `DINGTALK_CLIENT_ID`, `DINGTALK_CLIENT_SECRET`, `DINGTALK_ROBOT_CODE` |
| Groups | `zalo_team_groups` (team_code → group_id) | `dingtalk_team_groups` (team_code → open_conversation_id) |
| Outbox | `zalo_outbox` | `dingtalk_outbox` |
| BE notifier | `backend/zalo_notifier.py` | `backend/dingtalk_notifier.py` |
| BE worker | `backend/zalo_outbox_worker.py` | `backend/dingtalk_outbox_worker.py` |
| FE API | `frontend/src/lib/api/zaloAdmin.ts` | `frontend/src/lib/api/dingtalkAdmin.ts` |
| Message ID | Zalo trả về `zalo_message_id` | DingTalk trả về `processQueryKey` |

Endpoints admin đều nằm trong `backend/admin_routes.py` (Zalo từ ~dòng 1329, DingTalk từ ~dòng 1543) — KHÔNG có file `zalo_routes.py`/`dingtalk_routes.py` riêng.

## DingTalk Enterprise Robot API

- **Auth**: OAuth2 via `POST https://api.dingtalk.com/v1.0/oauth2/accessToken` (appKey/appSecret). Token cached thread-safe, refreshes 300s before expiry.
- **Send**: `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` with `x-acs-dingtalk-access-token` header.
- **Message formats**: `sampleText` (plain `{"content": "..."}`) hoặc `sampleMarkdown` (`{"title": "...", "text": "..."}`). Có title → Markdown, không → Text.
- **Per-team routing**: `dingtalk_team_groups.open_conversation_id` — mỗi team map tới 1 group conversation.

## Zalo token auto-refresh

- Token lưu DB (`zalo_oa_credentials`), ưu tiên DB hơn env vars (rotation được). Token sống ~25h.
- `ensure_token_fresh()`: refresh khi `expires_at ≤ now + 6h`. Background loop chạy mỗi 1h (`start_zalo_token_refresh_task()`).
- Send gặp auth error (401, codes -201/-216/201/40101/40102) → auto-refresh + retry **1 lần duy nhất**; vẫn fail → ZaloAPIError, worker schedule retry.
- Token không có `expires_at` → skip refresh (không crash).

## Outbox retry (cả 2 kênh giống nhau)

- Retry delays: `[30s, 2m, 5m, 15m]`, MAX_RETRIES=4. Worker poll mỗi 30s, batch 20 rows.
- Hết retry → dead-letter: `next_retry_at=NULL` (FE Outbox tab có nút retry tay).
- **Fatal errors không retry** — Zalo codes {-213, -214, -215} → set retries=MAX ngay.
- **Idempotent enqueue**: UNIQUE (source_table, source_id, event_type) — enqueue trùng không tạo row mới, đừng "fix" constraint này.
- Zalo gửi ảnh fail → fallback gửi text `📎 Bill: {url}`, lưu `image_error`.

## Event types tự động

### Zalo (payment flow)
- `payment_paid` — payment line confirm "paid" (enqueue best-effort, KHÔNG được fail PR confirm nếu Zalo lỗi).
- `bill_uploaded` — bill ảnh đính kèm.

### DingTalk (activation flow)
- `activation_request_created` — Yêu cầu tạo gói học (🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-xxx).
- `course_activated` — Thông báo tạo gói học thành công (✅ ĐÃ TẠO GÓI HỌC THÀNH CÔNG).
- `activation_urgent_reminder` — Nhắc tạo gói học gấp (⚡ Cần tạo gói học GẤP).

### Chung
- Routing: sale_email → `nhan_su_sale.team` → `get_canonical_team()` → group. Sale không team / team không group / group inactive → **silent skip, không error**.
- `is_test=true` (PR/AR) → skip enqueue.
- Message builders: `utils/zalo_message_builder.py` — dùng chung cho cả Zalo lẫn DingTalk.

## DingTalk nhóm + robot (trạng thái 2026-07-11)

| Nhóm DingTalk | Team mapping | openConversationId | Robot |
|---|---|---|---|
| VN - HN IH1 | inhouse_1 | `cidUr6KB4Nh7vsrOfVmmtBFGw==` | GMV-Notifier ✓ |
| VN - HN IH2 + Offline | inhouse_2, offline | `cid5++0sv26KzD+4ztFSHKBCA==` | GMV-Notifier ✓ |

Chỉ dùng nhóm **internal** — nhóm external không hỗ trợ enterprise robot.

### Trạng thái go-live (cập nhật 2026-07-20)

1. [x] Migration applied (sandbox + prod)
2. [x] `dingtalk_team_groups` populated (2 nhóm: IH1, IH2+Offline)
3. [x] Env vars set trên Render: `DINGTALK_CLIENT_ID`, `DINGTALK_CLIENT_SECRET`, `DINGTALK_ROBOT_CODE`
4. [x] `DINGTALK_DISABLED_EVENTS` gỡ block — cả 3 event đều LIVE
5. [ ] Feature @mention sale: cần mapping sale_email → DingTalk userId (chưa làm)

## Gotchas

- DingTalk OAuth token sống ~7200s (2h), notifier cache và tự refresh — không cần refresh thủ công.
- **DingTalk markdown line break**: dùng `<br>`, KHÔNG trailing-space convention (DingTalk render thừa space đầu dòng — fix `918e012`).
- DingTalk tin bổ sung (append bé/gói): dùng `source_suffix` deterministic né outbox UNIQUE constraint.
- Zalo `bill_uploaded` đã tắt 17/07 (sale feedback gây nhầm lẫn). Chỉ còn `payment_paid`.
- Test send (`/admin/zalo/test-send`, `/admin/dingtalk/test-send`) yêu cầu `require_module_write(actor, "zalo"/"dingtalk")`.
- FE tabs có cặp Table/Cards (desktop/mobile): `*Tab.tsx` + `*Cards.tsx` — sửa cột/field phải sửa cả hai.
- HTTP timeout gọi API ngoài: 15s.
- Alert khi Zalo token refresh fail → gửi DingTalk qua `DINGTALK_ALERT_CONVERSATION_ID` env var.
