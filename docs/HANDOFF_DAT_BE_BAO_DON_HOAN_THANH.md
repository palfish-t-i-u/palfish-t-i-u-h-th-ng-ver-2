# Handoff cho Đạt — BE: Nút "Báo đơn hoàn thành" (Task 1-4)

**Ngày**: 16/07/2026 · **Người giao**: Minh · **Branch làm việc**: `sandbox`
**Đọc trước**: spec `docs/superpowers/specs/2026-07-16-bao-don-hoan-thanh-dingtalk-design.md`
+ plan `docs/superpowers/plans/2026-07-16-bao-don-hoan-thanh-plan.md` (Task 1-4, checkbox từng bước).
Line numbers dưới đây đúng tại commit `efe9677` — nếu file đã drift, grep tên function.

## Bối cảnh 30 giây

Tin DingTalk "✅ ĐƠN ĐÃ ĐỦ TIỀN" (`pr_fully_paid`) hiện bắn tự động khi PR đủ target — hỏng 3 tầng:
1. Target do sale nhập luôn "đuổi theo" tiền đã thu → lũy kế luôn 100%, trigger vô nghĩa.
2. Dedup 1 tin/PR đời đời → khách mua thêm không báo lại được.
3. **Bug live**: `dingtalk_outbox.source_id` là `UUID`, `payment_requests.id` là `TEXT`
   ("PR-2026-xxxx") → insert lỗi, bị `except: pass` nuốt. **Prod: 210 PR done, 0 tin đã gửi**
   (đã verify SQL 16/7). Kế toán chưa từng nhận tin nào.

Họp 16/7 (anh Hiếu + chị Thu Hiền) chốt: bỏ trigger số học, thay **nút bấm tay** trong drawer PR.
Đức làm FE song song (block + modal) — hai stream độc lập, gặp nhau ở API contract dưới đây.

## Việc của Đạt (chi tiết từng bước trong plan Task 1-4)

1. **Task 1**: tách `_assert_pr_paid` (activation_routes.py:620) + `_assert_all_paid_lines_have_bill`
   (:1215) sang module mới `backend/pr_guards.py` (move nguyên văn, không sửa logic).
2. **Task 2**: migration `backend/migrations/2026-07-16-pr-completion-reports.sql` — SQL đầy đủ
   trong plan. Gồm backfill: PR đã có AR → report seq=1 synthetic, **KHÔNG enqueue outbox**.
   ⚠️ **KHÔNG gửi bù tin cho 210 PR cũ** — Minh đã chốt: tin chỉ bắt đầu từ lần bấm sau khi live.
   Viết SQL + apply **sandbox only** (project `pxgybyfiwywksesyogti`); prod Minh apply ở Task 8.
3. **Task 3**: endpoint mới + xóa auto-trigger:
   - `POST /api/v1/payment-requests/{pr_id}/report-complete`, body `{reason?: string}`.
   - RBAC: `_can_access_request` (payment_request_routes.py:888).
   - Guards: `assert_pr_paid` + `assert_all_paid_lines_have_bill` (từ pr_guards).
   - `seq = max(seq)+1`; seq ≥ 2 mà reason trống → 400.
   - `is_test` PR hoặc `dingtalk_event_enabled('pr_fully_paid')` off → **vẫn tạo report**
     (gate quy trình phải chạy), chỉ skip outbox.
   - Outbox insert: `source_table='pr_completion_reports'`, **`source_id=report.id`** (UUID
     hợp lệ — đây chính là chỗ fix bug type). Copy đoạn lookup team (`nhan_su_sale` +
     `dingtalk_group_config`) từ `_enqueue_pr_fully_paid_dingtalk` (:277-322) TRƯỚC khi xóa nó.
   - Xóa function cũ + call site :1329-1330. Sửa `tests/test_pr_fully_paid_dingtalk.py`.
   - GET PR detail: attach field `completion_reports` (order by seq) — FE Đức cần để render lịch sử.
4. **Task 4**: gate AR — trong `_save_active_request` (activation_routes.py:1317, nhánh
   `require_paid_pr=True`): chưa có report nào cho pr_id → 400
   `"Chưa báo đơn hoàn thành. Bấm 'Báo đơn hoàn thành' trong phiếu trước khi tạo Active Request."`
   Env flag thoát hiểm `REQUIRE_COMPLETION_REPORT_FOR_AR` (default bật, `0` = tắt) trong env_utils.py.
   Standalone AR (không gắn PR) KHÔNG gate.

## Format tin (đã chốt, không tự chế)

Lần 1 — giữ nguyên format cũ, KHÔNG có "Lần #1":
```
✅ ĐƠN ĐÃ ĐỦ TIỀN — {pr_id}
Học viên: {child_name || tên KH}
Tổng net đã thu: {received} / {target} VND
```
Lần ≥2 — thêm ` - Lần #{seq}` vào header + dòng cuối `Lý do: {reason}`. Số kiểu VN `31.400.000`.

## API contract với FE (Đức) — ĐÓNG BĂNG

- `POST .../report-complete` body `{reason?: string}` → 200 `{report, reports[]}`;
  400 khi (chưa done/over | thiếu bill | seq≥2 thiếu reason); 403 RBAC.
- PR detail thêm `completion_reports: [{id, seq, reason, reported_by, total_net, target, created_at}]`.
- Contract này là nguồn sự thật để Đức mock — **không tự đổi tên field/route**. Bắt buộc phải
  đổi → nhắn Đức + Minh TRƯỚC khi code tiếp, sửa cả 2 handoff.

## Làm song song — không chặn nhau

- Đạt và Đức **không chung file nào** (Đạt chỉ backend/, Đức chỉ frontend/) — không cần chờ nhau.
- Làm trên nhánh riêng `feat/bdht-be` (tách từ `sandbox` mới nhất), xong tests thì merge vào
  `sandbox` ngay — KHÔNG chờ Đức. Trước khi push: `git pull --rebase origin sandbox`.
- Review chéo (Đức review BE) làm SAU khi đã merge sandbox — không phải điều kiện merge,
  chỉ là điều kiện trước khi Minh đưa lên main.
- Điểm nối duy nhất: smoke end-to-end trên sandbox = việc của Minh (Task 8), sau khi cả 2 merge.

## Definition of done

- [ ] `cd backend && python -m pytest tests/ -q` PASS (test mới `test_completion_report.py`
      đủ 8 case trong plan Task 3 Step 1 + case AR gate Task 4)
- [ ] Migration applied sandbox, count backfill ≈ số PR có AR
- [ ] Không đụng file FE; không đổi type cột `dingtalk_outbox.source_id`
- [ ] Commit lên `sandbox`, báo Đức review chéo, xong ping Minh smoke (Task 8)

## Bẫy đã biết (đọc kỹ)

- `docs/learnings/` có bài về outbox snapshot staleness + event_type gate — grep trước khi sửa worker.
- Test DingTalk sandbox: **chỉ gửi account người test**, không bắn nhóm thật (rule 11/7).
- Insert outbox lỗi thì ĐỪNG `except: pass` trần — log `print(f"[dingtalk] ...")` như pattern
  quanh đó. Chính `except: pass` đã giấu bug UUID 3 ngày.
- `activation_routes.py` từng vỡ vì merge indent (sự cố 19/6, fix 462557e) — diff kỹ phần register routes.
