# Handoff cho Đức — FE: Block "Báo đơn hoàn thành" (Task 5-6)

**Ngày**: 16/07/2026 · **Người giao**: Minh · **Branch làm việc**: `sandbox`
**Đọc trước**: spec `docs/superpowers/specs/2026-07-16-bao-don-hoan-thanh-dingtalk-design.md`
+ plan `docs/superpowers/plans/2026-07-16-bao-don-hoan-thanh-plan.md` (Task 5-6).
Line numbers đúng tại commit `efe9677` — drift thì grep.

## Bối cảnh 30 giây

Tin DingTalk "đơn đủ tiền" đổi từ trigger tự động sang **nút bấm tay** trong drawer PR (chốt họp
16/7 anh Hiếu + chị Thu Hiền). Quy trình thành 5 bước: B1 Tạo PR → B2 Thu tiền →
**B3 Báo đơn hoàn thành** (mới) → B4 Active Request → B5 Xuất hóa đơn.
Đạt làm BE song song (endpoint + gate) — contract dưới đây; BE chưa xong thì mock theo contract.

## Việc của Đức

### 1. `CompletionReportBlock.tsx` (component mới, thư mục payment-request/)

Chèn vào `PaymentRequestDetailDrawer.tsx` **giữa** panel "Các lần thanh toán" (đóng ở :2411)
và AR mini-window (comment `{/* AR mini-window */}` :2413). Style theo class `panel` hiện có.

- **Gate mở nút**: `(pr.state === 'done' || pr.state === 'over') && paidLinesWithoutBill.length === 0`
  — tái dùng helper `findPaidLinesWithoutBill` (:2541). Chưa đủ điều kiện → nút disabled + dòng
  giải thích thiếu gì (chưa thu đủ / lần TT nào thiếu bill).
- Header block: badge số lần đã báo ("Đã báo N lần" — xanh success khi N≥1) + subtitle
  `"Nhắn DingTalk cho kế toán — bắt buộc trước khi tạo Active Request"`.
- **Lịch sử**: render `completion_reports` từ PR detail — mỗi dòng
  `Lần #{seq} · {HH:MM DD/MM/YYYY} · {total_net} đ · {reported_by}`. Dòng backfill
  (`reported_by === 'system-backfill'`) hiện nhãn "hệ thống (backfill)".
- **Hành vi nút**: chưa có report → click gọi API luôn (1 click, không modal). Đã có ≥1 report →
  click mở modal soft-block. Disable khi in-flight (chống double-click).

### 2. `CompletionReportModal.tsx` (pattern theo `CancelPrModal.tsx`)

- Title: `Báo đơn hoàn thành — lần #{seq}`; subtitle `{pr.id} · {học viên}`.
- Banner warning, copy CHÍNH XÁC (feedback Minh 16/7 — chữ "kế toán", không phải "mọi người"):
  `"Đơn này đã báo hoàn thành ở lần #{n} ({DD/MM} · {tổng} đ). Nhập lý do báo lại để kế toán theo dõi."`
- Textarea lý do **bắt buộc**, placeholder:
  `"Vì sao đơn đủ tiền thêm lần nữa — VD: Khách mua thêm gói cho con / Khách đóng nốt phần bổ sung"`
- Caption dưới textarea: `"Lý do sẽ hiện nguyên văn trong tin DingTalk gửi kế toán."`
- **Preview tin live** (khối mono, cập nhật theo textarea):
  ```
  ✅ ĐƠN ĐÃ ĐỦ TIỀN — {pr.id} - Lần #{seq}
  Học viên: {child_name || tên KH}
  Tổng net đã thu: {received} / {target} VND
  Lý do: {nội dung đang gõ}
  ```
- Nút `Hủy` + `Xác nhận và báo đơn hoàn thành` (disabled khi reason trống/toàn khoảng trắng).

### 3. Gate nút Kích hoạt + timeline (Task 6)

- Nút "Kích hoạt khoá học" (:2537-2545): thêm điều kiện `completion_reports.length > 0` vào
  `disabled` + hint `"Cần báo đơn hoàn thành trước"`.
- Timeline (:2436-2465): 4 bước → 5 bước — chèn sau B2:
  `B3 · Báo đơn hoàn thành (đã đủ tiền)` (trạng thái: "Chưa báo" / "Đã báo N lần · lần cuối
  HH:MM DD/MM"); đổi label `B3 · Active Request…` → `B4 · …`, `B4 · Yêu cầu xuất hoá đơn` → `B5 · …`.

## API contract với BE (Đạt) — ĐÓNG BĂNG, mock theo cái này, không chờ BE

- `POST /api/v1/payment-requests/{pr_id}/report-complete` body `{reason?: string}`
  → 200 `{report, reports[]}`; 400 (chưa đủ tiền | thiếu bill | lần ≥2 thiếu lý do — show message
  BE trả về); 403 không có quyền.
- PR detail có thêm `completion_reports: [{id, seq, reason, reported_by, total_net, target, created_at}]`.

## Làm song song — không chặn nhau

- Đức và Đạt **không chung file nào** — bắt đầu ngay, không chờ BE.
- **Mock để dev + test**: unit test dùng MSW (pattern sẵn trong repo) — thêm handler
  `POST .../report-complete` trả `{report, reports}` theo contract; thêm `completion_reports`
  vào `mockPaymentRequests.ts` (3 biến thể: rỗng / 1 report / có backfill).
- **Code phòng thủ**: đọc `pr.completion_reports ?? []` — BE merge trước hay sau đều không vỡ.
- Làm trên nhánh riêng `feat/bdht-fe` (tách từ `sandbox` mới nhất), tests + `tsc -b` pass thì
  merge vào `sandbox` ngay — KHÔNG chờ Đạt. Trước khi push: `git pull --rebase origin sandbox`.
- Review chéo (Đạt review FE) làm SAU merge sandbox — không phải điều kiện merge.
- Smoke UI cuối trên sandbox cần BE live — đó là việc Minh nối (Task 8), không phải việc Đức chờ.

## Definition of done

- [ ] `cd frontend && npm run test` PASS — test mới: Block (disabled/enabled/lịch sử/lần 1 không
      modal/lần 2 mở modal), Modal (nút khóa khi trống, preview đúng), AR button gating
- [ ] `cd frontend && npx tsc -b` PASS — **bắt buộc tsc -b, KHÔNG dùng --noEmit** (Vercel build khác)
- [ ] Smoke UI trên sandbox: https://palfish-gmv-manager-sandbox.vercel.app (test.user@dev / test.admin@dev)
- [ ] Commit lên `sandbox`, Đạt review chéo FE, xong ping Minh

## Bẫy đã biết

- Drawer có business rules riêng: đọc `frontend/src/components/payment-request/CLAUDE.md`
  (allocation guard, stale content, bill soft-lock) trước khi sửa.
- Đừng tự chế copy tiếng Việt — mọi string ở trên đã chốt nguyên văn với Minh/kế toán.
- PR list đang cap 100 dòng (bug đã biết, chưa fix) — test với PR mới tạo cho chắc.
