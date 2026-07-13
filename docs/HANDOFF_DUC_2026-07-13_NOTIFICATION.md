# HANDOFF — Đức · Feedback 13/7: Notification re-architecture (T5)

**Origin:** Spec anh Hiếu 13/07/2026 (sơ đồ 3 tin: Zalo "tiền vào TK" mỗi lần TT · DingTalk Tin #1 "đơn đủ tiền" · DingTalk Tin #2 "kích hoạt thành công"). Chị Thu Hiền yêu cầu đổi cơ chế trigger tin kích hoạt.

**Quyết định đã chốt (Minh xác nhận với anh Hiếu 13/7):**
1. Zalo `payment_paid` — **giữ bố cục cũ** (emoji/🔸), **đổi nội dung** theo spec: `mã PR · lần #k · net vào TK · lũy kế/tổng dự kiến`.
2. DingTalk Tin #1 "đơn đủ tiền" — bắn khi PR sang **state `done`** (dùng định nghĩa done sẵn có, không thêm ngưỡng riêng), **1 lần/PR**.
3. 2 tin cũ (`activation_request_created` + `activation_urgent_reminder`) — **tắt tạm qua flag** (giữ code, không xóa).
4. Giữ `course_activated` (Tin #2) nguyên.

**Estimated effort:** ~1.5–2 ngày (BE + SQL). **Migration: CÓ (1 file, migration DUY NHẤT trong đợt 9 task).**

**Chi tiết code + TDD từng bước:** `docs/superpowers/plans/2026-07-13-feedback-9-tasks-recon-ar.md` — **Task 2** (Part A/B/C). Handoff này = assignment + guardrail + line-ref.

---

## Bối cảnh (ĐÃ verify — grep 13/7, source chưa đổi)

### Hiện trạng notification
- Zalo `payment_paid` ("💰 ĐÃ VÀO") **đang bật** — live path = **SQL trigger** `build_payment_paid_message` (`backend/migrations/2026-07-10-zalo-payment-paid-net-amount.sql`) + `trg_payment_paid_zalo` trên `payment_lines`. Python mirror: `backend/utils/zalo_message_builder.py:137`.
- `ZALO_ENABLED_EVENTS = {"payment_paid","bill_uploaded"}` (`zalo_message_builder.py:32`) — chỉ gate Python path, KHÔNG gate DB trigger.
- DingTalk producers (Python): `_enqueue_activation_request_created_dingtalk` (`backend/activation_routes.py:1091`, insert `:1183`) + urgent-reminder (`:2457`/`:2485`). Gọi lúc tạo AR (`:1367–1368`).
- DingTalk `course_activated` (Tin #2) = **DB trigger** (không phải Python) — worker title `backend/dingtalk_outbox_worker.py:21`.
- DingTalk KHÔNG có gate per-type (Zalo có `ZALO_ENABLED_EVENTS`; DingTalk chỉ có `DINGTALK_CLIENT_ID/SECRET` + `DINGTALK_WORKER_ENABLED`).
- `dingtalk_outbox` CHECK constraint hiện: `payment_paid, course_activated, activation_urgent_reminder, activation_request_created` (`backend/migrations/2026-07-12-dingtalk-ar-created-and-drop-payment-paid.sql:11–15`).
- PR "done": `recompute_payment_request_totals` (`backend/payment_request_routes.py:1242`) tính `state = _compute_state(received, target)`; dòng **1279** = sau update PR (nơi hook Tin #1); `received = _sum_paid_amount` dùng `_line_net` (`:261`, đọc `verified_received`).

---

## Scope

### IN scope
- **Part A** — env flag `DINGTALK_DISABLED_EVENTS` (denylist, `env_utils.py`) + guard 2 site enqueue để tắt `activation_request_created` + `activation_urgent_reminder`. Default trống = mọi event bật (không đổi behavior).
- **Part B** — đổi nội dung `payment_paid`: SQL trigger `build_payment_paid_message` (CREATE OR REPLACE) + Python mirror `zalo_message_builder.py` → `mã PR · lần #k · net · lũy kế/tổng`, giữ bố cục emoji/🔸.
- **Part C** — MỚI DingTalk `pr_fully_paid`: producer `_enqueue_pr_fully_paid_dingtalk` trong `payment_request_routes.py` + hook `recompute...:1279` (state→done, guard transition + UNIQUE) + worker EVENT_TITLES + CHECK constraint.
- **Migration** `backend/migrations/2026-07-13-notification-rearchitecture.sql` (SQL trigger + CHECK + dedup index).

### OUT of scope (KHÔNG làm)
- **KHÔNG XÓA** code 2 producer cũ — chỉ tắt qua flag (chốt: tắt tạm, có thể bật lại).
- **KHÔNG** đụng `course_activated` (Tin #2, DB trigger) — giữ nguyên.
- **KHÔNG** đụng `sepay_routes.py` / `gateway_routes.py` / referral (Đạt lo T1/T2/T3/T7).
- **KHÔNG** set `dingtalk_team_groups.is_active=false` để tắt tin (giết nhầm tin thành công + nhắc gấp — plan G4).
- **KHÔNG** đổi `ZALO_ENABLED_EVENTS` (payment_paid vẫn bật; ta chỉ đổi *nội dung*).

---

## Files (chi tiết code trong plan Task 2)

| File | Việc |
|------|------|
| `backend/env_utils.py` | +`dingtalk_event_enabled(event_type)` (denylist) |
| `backend/activation_routes.py` | Part A: guard 2 site (`:1100`, `:2485`) bằng `dingtalk_event_enabled` |
| `backend/migrations/2026-07-13-notification-rearchitecture.sql` | MỚI: SQL trigger reshape + CHECK +`pr_fully_paid` + dedup UNIQUE index |
| `backend/utils/zalo_message_builder.py` | Part B: `build_payment_paid_message` mirror nội dung mới |
| `backend/payment_request_routes.py` | Part C: `_enqueue_pr_fully_paid_dingtalk` + hook trong `recompute...:1279` |
| `backend/dingtalk_outbox_worker.py` | Part C: EVENT_TITLES +`"pr_fully_paid": "Đơn đã đủ tiền"` |
| `backend/tests/test_dingtalk_ar_created.py` | +test gate cờ |
| `backend/tests/test_zalo_builder.py` | +test nội dung payment_paid mới |
| `backend/tests/test_pr_fully_paid_dingtalk.py` | MỚI: recompute→done enqueue 1 lần, idempotent |

**Mẫu tin Zalo mới (bố cục cũ, ND spec — chữ chỉnh được):**
```
💰 ĐÃ VÀO TK · PR-2026-0221 · Lần #2
🔸 KH Nguyễn Văn A · Bé Bin · Sale Hoa · Team Inhouse 1
🔸 Net vào TK: 24,785,680 VND · Thẻ · 09:12 12/07/2026
🔸 Lũy kế: 27,785,680 / 35,000,000 VND (79%)
```

---

## Acceptance criteria
1. `dingtalk_event_enabled` test (default on + denylist) PASS; `course_activated` **không** bị denylist ảnh hưởng.
2. `test_zalo_builder.py` test mới PASS: tin có `mã PR`, `Lần #k`, `net`, `lũy kế / tổng`.
3. `test_pr_fully_paid_dingtalk.py` PASS: recompute→done enqueue **đúng 1** `pr_fully_paid`; gọi lần 2 **không** nhân đôi.
4. Migration apply sandbox OK (không lỗi); trigger `build_payment_paid_message` render đúng mẫu mới.
5. `cd backend && python -m pytest tests/ -q` PASS.

## Test plan
```bash
cd backend && python -m pytest tests/test_dingtalk_ar_created.py tests/test_zalo_builder.py tests/test_pr_fully_paid_dingtalk.py -v
```
**Migration + smoke (sandbox TRƯỚC, route test về nhóm của Đức, KHÔNG nhóm team live):**
1. Apply `backend/migrations/2026-07-13-notification-rearchitecture.sql` vào **sandbox** (pxgybyfiwywksesyogti).
2. Gửi 1 lần TT test trên PR sandbox → verify tin Zalo "ĐÃ VÀO TK · PR · Lần #k · Lũy kế/tổng".
3. Đưa 1 PR sandbox đủ tiền → verify **đúng 1** tin DingTalk "Đơn đã đủ tiền".
4. Set `DINGTALK_DISABLED_EVENTS=activation_request_created,activation_urgent_reminder` (sandbox) → tạo AR → xác nhận **không** có tin yêu-cầu-kích-hoạt/nhắc-gấp; `course_activated` vẫn bắn khi kích hoạt.
5. Chỉ khi sandbox OK → apply migration prod (jozcvbbypwvzaefteoxn) + set env prod.

## Anti-patterns (đừng làm)
1. **Đừng để SQL trigger raise.** Nó chạy khi ghi `payment_lines` — trigger lỗi = **chặn xác nhận tiền = chặn đối soát**. Mọi field `COALESCE` default, giữ `SECURITY DEFINER` (plan G14).
2. **Đừng để Python mirror lệch format SQL** — 2 đường phải in ra chữ giống nhau (test khoá).
3. **Đừng bắn Tin #1 mỗi lần recompute.** Guard `state=="done" AND old_state!="done"` + UNIQUE(source_table,source_id,event_type). "1 lần duy nhất/PR" (plan G13).
4. **Đừng để producer Tin #1 raise** — `recompute_payment_request_totals` gate PR state + ledger sync; notification hỏng không được làm hỏng nó (best-effort try/except, plan G15).
5. **Đừng apply migration thẳng prod.** Sandbox → smoke → prod (bài học [[sandbox-missing-top1-02-migrations]]).
6. **Đừng đổi CHECK constraint kiểu DROP mọi type** — giữ 4 type cũ, chỉ THÊM `pr_fully_paid`.

## Điều phối
- **Nhánh riêng từ `sandbox`** (vd `duc/notification-rearch-13-7`).
- **Đụng nhẹ `activation_routes.py` với Đạt (T7)**: bạn sửa 2 guard enqueue (~1100, ~2485); Đạt sửa `_assign_course_codes` (~234). Cách xa → merge sạch; ai merge sau `git rebase sandbox`.
- **Part A** (flag) tách commit riêng, có thể merge/deploy sớm để tắt tin gấp; **Part B+C** chung 1 commit (chung migration).
- T5 domain gốc chạm Zalo BE của Giang — nếu cần context Zalo trigger, hỏi Giang.
