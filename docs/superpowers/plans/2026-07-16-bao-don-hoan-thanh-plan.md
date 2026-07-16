# Nút "Báo đơn hoàn thành" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay trigger tự động DingTalk `pr_fully_paid` bằng nút bấm tay có soft-block lý do từ lần 2, gate 2 chiều với Active Request.

**Architecture:** Bảng mới `pr_completion_reports` làm nguồn sự thật (mỗi lần báo = 1 row, seq tăng dần); outbox insert dùng report UUID làm `source_id` (fix bug type UUID/TEXT); guards tái dùng từ activation qua module chung `pr_guards.py`; AR creation gate trên sự tồn tại của report, có env flag thoát hiểm.

**Tech Stack:** FastAPI + Supabase (BE), React 19 + TS (FE), pytest + vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-bao-don-hoan-thanh-dingtalk-design.md`

**Phân việc (chốt Minh 16/7):**
| Task | Ai | Ghi chú |
|------|-----|--------|
| 1-4 (BE: guards, migration, endpoint, AR gate) | **Đạt** | Handoff: `docs/HANDOFF_DAT_BE_BAO_DON_HOAN_THANH.md` |
| 5-6 (FE: block, modal, timeline, AR button) | **Đức** | Handoff: `docs/HANDOFF_DUC_FE_BAO_DON_HOAN_THANH.md` |
| 7 (verify + merge) | Minh | |
| 8 (migration + deploy + smoke sandbox) | Minh | |
| Review chéo trước merge main | Đức review BE, Đạt review FE | + cavecrew-reviewer |

**Chạy song song, không chặn nhau**: 2 stream không chung file. Mỗi người nhánh riêng
(`feat/bdht-be`, `feat/bdht-fe`) tách từ sandbox, xong tests merge sandbox ngay không chờ nhau;
FE mock MSW theo API contract đóng băng (ghi trong 2 handoff); review chéo sau merge sandbox,
chỉ là gate trước main. Điểm nối duy nhất = smoke Task 8 (Minh).

---

### Task 1: Tách guards chung sang `pr_guards.py`

**Files:**
- Create: `backend/pr_guards.py`
- Modify: `backend/activation_routes.py` (bỏ 2 function, import từ pr_guards)

- [ ] **Step 1: Tạo `backend/pr_guards.py`** — MOVE nguyên văn 2 function từ `activation_routes.py`:
  - `_assert_pr_paid` (activation_routes.py:620) → rename public `assert_pr_paid`
  - `_assert_all_paid_lines_have_bill` (activation_routes.py:1215) → rename public `assert_all_paid_lines_have_bill`
  - Mang theo import phụ thuộc (HTTPException, helpers parse). KHÔNG sửa logic.

- [ ] **Step 2: Sửa `activation_routes.py`** — xóa 2 function gốc, thêm `from pr_guards import assert_pr_paid, assert_all_paid_lines_have_bill`, cập nhật call sites trong `_save_active_request` (lines 1328-1337).

- [ ] **Step 3: Chạy test hiện có** — `cd backend && python -m pytest tests/ -x -q` → PASS (refactor thuần, không đổi hành vi).

- [ ] **Step 4: Commit** — `git commit -m "refactor(be): tách guards paid+bill sang pr_guards.py dùng chung"`

### Task 2: Migration bảng `pr_completion_reports` + backfill

**Files:**
- Create: `backend/migrations/2026-07-16-pr-completion-reports.sql`

- [ ] **Step 1: Viết migration**

```sql
-- Bảng lịch sử báo đơn hoàn thành (thay trigger số học pr_fully_paid)
CREATE TABLE IF NOT EXISTS public.pr_completion_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id       TEXT NOT NULL,
  seq         INT  NOT NULL,
  reason      TEXT,
  reported_by TEXT NOT NULL,
  total_net   NUMERIC NOT NULL,
  target      NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pr_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_pcr_pr_id ON public.pr_completion_reports (pr_id);

-- Backfill: PR đã có AR → coi như đã báo (không gửi tin)
INSERT INTO public.pr_completion_reports (pr_id, seq, reason, reported_by, total_net, target)
SELECT DISTINCT ar.pr_id, 1,
       'Backfill 16/07/2026 — AR đã tạo trước khi có bước báo hoàn thành',
       'system-backfill',
       COALESCE(pr.received, 0), COALESCE(pr.target, 0)
  FROM public.active_requests ar
  JOIN public.payment_requests pr ON pr.id = ar.pr_id
 WHERE ar.pr_id IS NOT NULL
ON CONFLICT (pr_id, seq) DO NOTHING;
```

- [ ] **Step 2: Apply lên SANDBOX only** (`palfish-gmv-sandbox` pxgybyfiwywksesyogti) qua Supabase MCP `apply_migration`. PROD chờ Task 8.

- [ ] **Step 3: Verify** — `SELECT count(*) FROM pr_completion_reports;` ≈ số PR có AR. Commit file SQL.

### Task 3: BE endpoint `report-complete` + bỏ auto-trigger

**Files:**
- Modify: `backend/payment_request_routes.py` (xóa :277-322 `_enqueue_pr_fully_paid_dingtalk` + call :1330; thêm endpoint + builder)
- Modify: `backend/env_utils.py` (thêm flag helper)
- Test: `backend/tests/test_completion_report.py` (mới), sửa `backend/tests/test_pr_fully_paid_dingtalk.py`

- [ ] **Step 1: Viết failing tests** `test_completion_report.py` (mock sb theo pattern test_pr_fully_paid_dingtalk.py cũ):

```python
# Các case bắt buộc:
# 1. seq=1 happy: message KHÔNG có "Lần #", KHÔNG có "Lý do:"; outbox source_id == report UUID (not pr_id)
# 2. seq=2 thiếu reason -> HTTPException 400
# 3. seq=2 có reason: message có " - Lần #2" và "\nLý do: {reason}"
# 4. PR state != done/over -> 400 (assert_pr_paid)
# 5. paid line thiếu bill -> 400 (assert_all_paid_lines_have_bill)
# 6. actor không có quyền PR (_can_access_request False) -> 403
# 7. is_test PR -> report được tạo, outbox KHÔNG insert
# 8. dingtalk_event_enabled('pr_fully_paid') False -> report tạo, outbox skip
```

- [ ] **Step 2: Run** — `python -m pytest tests/test_completion_report.py -q` → FAIL (endpoint chưa có).

- [ ] **Step 3: Implement builder + endpoint** trong `payment_request_routes.py`:

```python
def _build_completion_message(pr_row, seq, reason, received, target) -> str:
    student = _clean_text(pr_row.get("child_name")) or _clean_text(pr_row.get("name")) or "?"
    recv_fmt = f"{int(received):,}".replace(",", ".")
    tgt_fmt = f"{int(target):,}".replace(",", ".")
    header = f"✅ ĐƠN ĐÃ ĐỦ TIỀN — {pr_row.get('id')}"
    if seq >= 2:
        header += f" - Lần #{seq}"
    msg = f"{header}\nHọc viên: {student}\nTổng net đã thu: {recv_fmt} / {tgt_fmt} VND"
    if seq >= 2:
        msg += f"\nLý do: {reason}"
    return msg
```

Endpoint (theo pattern route + auth hiện có của file):

```python
@app.post("/api/v1/payment-requests/{payment_request_id}/report-complete")
def report_pr_complete(payment_request_id: str, body: CompletionReportBody, ...auth...):
    # 1. load PR, 404 nếu không có; 403 nếu not _can_access_request(sb, actor, pr_row)
    # 2. pr_guards.assert_pr_paid(...); pr_guards.assert_all_paid_lines_have_bill(sb, payment_request_id)
    # 3. seq = (SELECT max(seq)) + 1; if seq >= 2 and not _clean_text(body.reason): raise 400
    # 4. insert pr_completion_reports (retry 1 lần nếu UNIQUE conflict — race double-click)
    # 5. nếu pr_row.is_test hoặc not dingtalk_event_enabled('pr_fully_paid'): return (skip outbox)
    # 6. lookup team qua nhan_su_sale + dingtalk_group_config (copy đoạn lookup từ function cũ TRƯỚC KHI XÓA)
    # 7. insert dingtalk_outbox: event_type='pr_fully_paid', source_table='pr_completion_reports',
    #    source_id=report_id (UUID!), team_code, message=_build_completion_message(...)
    # 8. return {"report": ..., "reports": [list đầy đủ order by seq]}
```

`CompletionReportBody(BaseModel): reason: str | None = None`

- [ ] **Step 4: Xóa auto-trigger** — xóa function `_enqueue_pr_fully_paid_dingtalk` (:277-322, SAU khi đã copy đoạn lookup team sang endpoint mới) và call site `if state == "done" and old_state != "done"` (:1329-1330). Sửa `test_pr_fully_paid_dingtalk.py`: assert state→done KHÔNG enqueue outbox nữa.

- [ ] **Step 5: Serialize history** — endpoint GET PR detail: attach `completion_reports` (select * from pr_completion_reports where pr_id=... order by seq) vào response.

- [ ] **Step 6: Run** — `python -m pytest tests/ -q` → PASS toàn bộ.

- [ ] **Step 7: Commit** — `git commit -m "feat(be): endpoint report-complete thay auto-trigger pr_fully_paid — fix bug source_id UUID"`

### Task 4: Gate AR + env flag

**Files:**
- Modify: `backend/env_utils.py`, `backend/activation_routes.py` (`_save_active_request` :1317)
- Test: thêm case vào test activation hiện có

- [ ] **Step 1: Failing tests** — 5 case: chưa báo → 400; đã báo → OK; flag off → OK; standalone AR (không pr_id) → OK; PR backfilled → OK.

- [ ] **Step 2: env_utils.py**

```python
def require_completion_report_enabled() -> bool:
    return os.getenv("REQUIRE_COMPLETION_REPORT_FOR_AR", "1") != "0"
```

- [ ] **Step 3: `_save_active_request`** — trong nhánh `require_paid_pr=True` (cạnh các assert :1328-1337):

```python
if require_completion_report_enabled():
    rep = sb.table("pr_completion_reports").select("id").eq("pr_id", pr_id).limit(1).execute()
    if not rep.data:
        raise HTTPException(400, "Chưa báo đơn hoàn thành. Bấm 'Báo đơn hoàn thành' trong phiếu trước khi tạo Active Request.")
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** — `git commit -m "feat(be): AR gate yêu cầu completion report + env flag thoát hiểm"`

### Task 5: FE — CompletionReportBlock + Modal

**Files:**
- Create: `frontend/src/components/payment-request/CompletionReportBlock.tsx`, `CompletionReportModal.tsx`
- Modify: `PaymentRequestDetailDrawer.tsx` (chèn giữa :2411 panel lần TT và :2413 AR mini-window), `frontend/src/api.ts` hoặc client tương ứng (POST report-complete, type CompletionReport)
- Test: `CompletionReportBlock.test.tsx`, `CompletionReportModal.test.tsx`

- [ ] **Step 1: Types + API client** — `CompletionReport { id, seq, reason, reported_by, total_net, target, created_at }`; `postReportComplete(prId, reason?)`.

- [ ] **Step 2: Failing tests** (vitest + testing-library, pattern các test drawer hiện có):
  - Block: disabled + note khi `state==='short'` hoặc có paid line thiếu bill; enabled khi đủ; render lịch sử "Lần #1 · … · bởi …"; click lần 1 gọi API thẳng KHÔNG mở modal; click khi đã có report → mở modal.
  - Modal: nút xác nhận disabled khi reason trống; preview chứa `- Lần #2` + `Lý do:`; submit gọi API với reason.

- [ ] **Step 3: Implement Block** — gate FE: `ready = (pr.state==='done'||pr.state==='over') && paidLinesWithoutBill.length===0` (tái dùng `findPaidLinesWithoutBill` :2541); hiển thị lịch sử reports từ PR detail; badge "Đã báo N lần"; disable in-flight. UI theo mockup đã duyệt 16/7 (block panel + badge + history rows). Style theo class `panel` hiện có của drawer.

- [ ] **Step 4: Implement Modal** — pattern theo `CancelPrModal.tsx`: banner warning copy chính xác `"Đơn này đã báo hoàn thành ở lần #{n} ({DD/MM} · {tổng} đ). Nhập lý do báo lại để kế toán theo dõi."`, textarea placeholder `"Vì sao đơn đủ tiền thêm lần nữa — VD: Khách mua thêm gói cho con / Khách đóng nốt phần bổ sung"`, preview live message, nút "Xác nhận và báo đơn hoàn thành" disabled khi trống.

- [ ] **Step 5: Run** — `cd frontend && npm run test` → PASS. **Step 6: Commit.**

### Task 6: FE — AR button gate + timeline 5 bước

**Files:**
- Modify: `PaymentRequestDetailDrawer.tsx` — nút Kích hoạt (:2537-2545) + timeline (:2436-2465)
- Test: cập nhật test drawer liên quan

- [ ] **Step 1: AR button** — thêm điều kiện `hasCompletionReport` vào `disabled` (:2537); hint "Cần báo đơn hoàn thành trước" khi thiếu.
- [ ] **Step 2: Timeline** — chèn step mới sau B2: `B3 · Báo đơn hoàn thành (đã đủ tiền)` — trạng thái: chưa báo / "Đã báo N lần · lần cuối HH:MM DD/MM"; đổi label AR → `B4 · Active Request (Tạo khoá học)`, hóa đơn → `B5 · Yêu cầu xuất hoá đơn`.
- [ ] **Step 3: Tests pass + commit.**

### Task 7: Verify toàn cục

- [ ] `cd frontend && npx tsc -b` → PASS (bắt buộc, KHÔNG dùng --noEmit)
- [ ] `cd frontend && npm run test` + `cd backend && python -m pytest tests/ -q` → PASS
- [ ] cavecrew-reviewer review diff sandbox; Đạt review BE
- [ ] Squash các commit lẻ nếu >6 commit (feedback squash), push sandbox

### Task 8: Deploy + smoke sandbox (Minh)

- [ ] Migration đã apply sandbox (Task 2); `bash scripts/deploy.sh sandbox`
- [ ] Smoke theo spec §5: PR test end-to-end (báo lần 1 → AR → báo lần 2 + lý do). Tin test CHỈ gửi account người test.
- [ ] Soak 1-2 ngày → merge main → apply migration PROD + `deploy.sh prod` + set env flag (ghi checklist pending-migration)
- [ ] Chạy skill extract-approach cho bug source_id UUID silent-fail (learning: `except: pass` nuốt lỗi type — cần log)
