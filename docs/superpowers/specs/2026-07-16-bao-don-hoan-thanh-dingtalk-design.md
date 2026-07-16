# Spec: Nút "Báo đơn hoàn thành" — thay trigger DingTalk Tin #1

**Ngày**: 16/07/2026 · **Chốt bởi**: anh Hiếu + chị Thu Hiền (kế toán) + Minh
**Trạng thái**: Design approved (họp 16/7) — chờ implement

## 1. Bối cảnh & vấn đề

Tin DingTalk #1 (`pr_fully_paid` — "ĐƠN ĐÃ ĐỦ TIỀN") hiện bắn tự động khi PR chuyển state `done`
(`Σ net các lần paid == target`). Ba tầng lỗi:

1. **Trigger vô nghĩa (circular)**: sale nhập `target` = tiền sắp thu chứ không phải giá trị cả deal.
   Guard 1B-04 (chặn thêm lần TT khi PR đủ tiền, bắt sửa target trước) ép target luôn "đuổi theo"
   tiền đã thu → lũy kế luôn 100% → "đủ tiền" tự chứng minh, bắn ngay sau lần TT đầu.
2. **Dedup 1 lần/PR**: `UNIQUE(source_table, source_id, event_type)` → khách mua thêm (upsell,
   vd PR-2026-0318 +400K) → state done lần 2 nhưng tin bị nuốt. Kế toán mù đúng chỗ cần thấy.
3. **Bug live — tin chưa từng gửi**: `dingtalk_outbox.source_id` kiểu `UUID`, `payment_requests.id`
   kiểu `TEXT` ("PR-2026-xxxx") → insert fail, bị `except: pass` nuốt.
   **Prod verify 16/7: 210 PR done, 0 dòng pr_fully_paid trong outbox.**

## 2. Quyết định đã chốt

Bỏ trigger số học. Thay bằng **nút bấm tay "Báo đơn hoàn thành"** — người quyết định "đủ tiền thật",
không phải công thức.

- **Vị trí**: block riêng trong drawer PR, giữa panel "Các lần thanh toán" và AR mini-window.
- **Quy trình 5 bước mới**: B1 Tạo PR → B2 Thu tiền → **B3 Báo đơn hoàn thành** → B4 Active Request
  → B5 Xuất hóa đơn. Gate 2 chiều:
  - Nút chỉ mở khi **mọi lần TT đã xác nhận + có bill** (đúng bộ guard của "Gửi yêu cầu kích hoạt":
    state done/over + paid lines đều có bill).
  - **Chưa báo hoàn thành thì không tạo được AR** (enforce cả FE lẫn BE).
- **Lần 1**: bấm 1 cái gửi luôn, format tin GIỮ NGUYÊN (không gắn "Lần #1").
- **Lần ≥2 (soft-block)**: modal bắt nhập lý do (free text, placeholder hướng dẫn), hiện rõ đây là
  lần báo thứ #X, preview nguyên văn tin trước khi gửi. Format thêm ` - Lần #{X}` + dòng `Lý do: …`.
- **RBAC**: theo quyền tương tác PR hiện có (`_can_access_request`): sale chính chủ, leader
  team/sub-team, manager team, ops/system all-access.
- **Lịch sử**: block hiện các lần đã báo (lần #, thời gian, người bấm, tổng net).

## 3. Thiết kế

### 3.1 DB — migration `2026-07-16-pr-completion-reports.sql`

```sql
CREATE TABLE public.pr_completion_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id       TEXT NOT NULL,          -- payment_requests.id (không FK — theo pattern schema hiện có)
  seq         INT  NOT NULL,
  reason      TEXT,                   -- NULL cho seq=1; app enforce NOT NULL khi seq>=2
  reported_by TEXT NOT NULL,          -- email actor
  total_net   NUMERIC NOT NULL,       -- received tại thời điểm báo
  target      NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pr_id, seq)
);
CREATE INDEX ON public.pr_completion_reports (pr_id);
```

- Outbox insert dùng `source_id = report.id` (UUID hợp lệ) → **fix luôn bug type**, giữ nguyên
  UNIQUE constraint outbox (1 tin/report — idempotent đúng nghĩa).
- KHÔNG đổi type cột `dingtalk_outbox.source_id` (các event khác đang dùng UUID thật).
- **Backfill** (trong cùng migration): PR nào đã có `active_requests` → insert report seq=1
  synthetic (`reported_by='system-backfill'`, reason ghi rõ backfill, KHÔNG enqueue outbox)
  → PR cũ không bị gate chặn khi tạo AR bổ sung, timeline B3 hiển thị đúng.

### 3.2 BE

- **Endpoint mới** `POST /api/v1/payment-requests/{pr_id}/report-complete`
  (payment_request_routes.py):
  - RBAC: `_can_access_request` (payment_request_routes.py:888).
  - Guards tái dùng logic của AR: state done/over (`_assert_pr_paid`, activation_routes.py:620)
    + mọi paid line có bill (`_assert_all_paid_lines_have_bill`, activation_routes.py:1215).
    Tránh circular import: tách 2 helper sang module chung `pr_guards.py`, cả 2 routes import.
  - Body `{reason?: string}`. `seq = max(seq hiện có)+1`. `seq>=2` mà reason trống → 400.
  - `is_test` PR → tạo report, skip outbox. `dingtalk_event_enabled('pr_fully_paid')` = off →
    tạo report (gate quy trình vẫn chạy), skip outbox.
  - Build message (xem 3.4), insert `dingtalk_outbox` với `source_id=report.id`.
  - Response: report vừa tạo + list đầy đủ.
- **History**: thêm field `completion_reports` vào serialize PR detail (1 query khi mở drawer).
- **Bỏ auto-trigger**: xóa call `_enqueue_pr_fully_paid_dingtalk` tại
  payment_request_routes.py:1330 + xóa function (277-322). Sửa/viết lại test cũ
  `test_pr_fully_paid_dingtalk.py`.
- **Gate AR**: trong `_save_active_request` (activation_routes.py:1317, nhánh
  `require_paid_pr=True`) thêm assert: tồn tại ≥1 completion report cho pr_id, không → 400
  "Chưa báo đơn hoàn thành". Standalone AR (không gắn PR) không gate.
- **Env flag thoát hiểm**: `REQUIRE_COMPLETION_REPORT_FOR_AR` (default bật). Đặt `0` = tắt gate
  AR tức thì qua Render env, không cần deploy — phòng chặn nhầm kế toán giờ cao điểm.

### 3.3 FE

- **Component mới** `CompletionReportBlock` — chèn vào PaymentRequestDetailDrawer.tsx giữa
  panel lần TT (đóng ở :2411) và AR mini-window (:2413).
  - Gate: `state ∈ {done, over}` && `findPaidLinesWithoutBill().length === 0` → enable;
    ngược lại disabled + dòng giải thích thiếu gì.
  - Lịch sử các lần báo. Nút lần 1 gửi thẳng; lần ≥2 mở modal.
  - Disable khi in-flight (chống double-click).
- **Modal** `CompletionReportModal` (pattern giống CancelPrModal): banner cảnh báo nhắc lần
  trước, textarea lý do bắt buộc, placeholder:
  `"Vì sao đơn đủ tiền thêm lần nữa — VD: Khách mua thêm gói cho con / Khách đóng nốt phần bổ sung"`,
  preview tin DingTalk live, nút "Xác nhận và báo đơn hoàn thành".
- **AR mini-window**: disable nút tạo AR khi chưa có report + hint "Cần báo đơn hoàn thành trước".
- **Timeline** (:2436-2465): 4 bước → 5 bước, chèn B3 "Báo đơn hoàn thành" (trạng thái từ
  completion_reports: "Đã báo N lần · lần cuối HH:MM DD/MM"), AR thành B4, hóa đơn thành B5.

### 3.4 Format tin DingTalk

Lần 1 — giữ nguyên format hiện tại:
```
✅ ĐƠN ĐÃ ĐỦ TIỀN — {pr_id}
Học viên: {child_name || tên KH}
Tổng net đã thu: {received} / {target} VND
```

Lần ≥2:
```
✅ ĐƠN ĐÃ ĐỦ TIỀN — {pr_id} - Lần #{seq}
Học viên: {child_name || tên KH}
Tổng net đã thu: {received} / {target} VND
Lý do: {reason}
```

Số format kiểu VN (`31.400.000`). Routing nhóm theo team sale (giữ nguyên pipeline outbox worker).

## 4. Guardrails

1. Env flag `REQUIRE_COMPLETION_REPORT_FOR_AR` — tắt gate AR khẩn cấp không cần deploy.
2. Backfill synthetic reports — PR cũ có AR không bị chặn, không gửi tin backfill.
3. `is_test` skip outbox; dedup outbox giữ nguyên (source_id giờ là report UUID — hết bug type).
4. Migration chạy **sandbox trước**, prod chỉ sau khi merge main + smoke OK (ghi vào checklist
   pending-migration để không quên như vụ 2026-06-18).
5. Race double-click: `UNIQUE(pr_id, seq)` + FE disable in-flight; BE conflict → retry seq 1 lần.
6. Rollback: bảng mới thuần additive; revert code + flag off là xong, không cần down-migration.
7. Test DingTalk trên sandbox: chỉ gửi tới account người test (rule 11/7), không bắn nhóm thật.

## 5. Test

**BE (pytest)**
- `test_completion_report.py`: seq 1 happy + format cũ; seq 2 thiếu reason → 400, có reason →
  format mới; chưa done → 400; paid line thiếu bill → 400; RBAC sale khác team → 403;
  is_test / event-off → report tạo, outbox skip; outbox source_id = report UUID.
- `test_ar_gate.py` (hoặc thêm vào test activation): AR khi chưa báo → 400; sau báo → OK;
  flag off → OK; standalone AR → OK; PR backfilled → OK.
- Sửa `test_pr_fully_paid_dingtalk.py` (auto-trigger đã bỏ — assert KHÔNG enqueue khi state→done).

**FE (vitest)**
- `CompletionReportBlock.test.tsx`: disabled khi thiếu bill/chưa đủ, enabled khi đủ; lịch sử render;
  lần 1 không mở modal, lần 2 mở modal.
- `CompletionReportModal.test.tsx`: nút xác nhận khóa khi reason trống; preview cập nhật theo input.
- AR button: disabled khi chưa có report.

**Smoke sandbox (manual)**: 1 PR test end-to-end: tạo → thu tiền + bill → báo lần 1 (tin tới
nhóm test) → tạo AR OK → báo lần 2 với lý do → tin có "Lần #2 + Lý do". PR không bill → nút khóa.

## 6. Đánh giá 4 tiêu chí

1. **Triệt để**: sửa cả 3 tầng (semantic trigger, dedup upsell, bug UUID silent-fail). Nguồn sự
   thật = người bấm + lý do, không phụ thuộc target không đáng tin.
2. **Không lỗi con**: backfill chống chặn PR cũ; env flag thoát hiểm; standalone AR không đụng;
   không đổi type cột cũ; dedup outbox giữ nguyên.
3. **Hạ tầng/hiệu năng**: 1 bảng nhỏ + 1 query khi mở drawer; không cron/worker mới; outbox
   worker giữ nguyên pipeline.
4. **Quota**: 1 investigator định vị code; implement chia 2 stream BE/FE độc lập, không fan-out.

## 7. Ngoài scope

- Không đổi tin Zalo "ĐÃ VÀO TK" (lũy kế 100% là hệ quả hành vi nhập target — chấp nhận, tin
  vẫn đúng chức năng báo tiền về).
- Không sửa hành vi nhập target / guard 1B-04.
- Không thêm nhắc nhở tự động khi sale quên bấm (nút chặn AR nên tự có động lực; xem lại sau
  1-2 tuần vận hành).
