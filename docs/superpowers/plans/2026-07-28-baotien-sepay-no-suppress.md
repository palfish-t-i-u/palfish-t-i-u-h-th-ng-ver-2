# Fix: Tin "báo tiền về" Zalo bị nuốt khi KH chuyển nhanh (SePay minute-rounding) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa trigger `fn_payment_paid_zalo_notify` để giao dịch xác nhận tự động qua SePay webhook **không bao giờ** bị suppress theo timestamp; suppress theo thời gian chỉ còn áp dụng cho ghép tay (manual).

**Architecture:** DB-only change. 1 migration file mới `CREATE OR REPLACE` trigger function (thêm 1 điều kiện `confirmed_source <> 'sepay'` vào suppress). Không sửa Python, không sửa FE, không deploy Render/Vercel. Verify bằng SQL test script chạy trong `BEGIN...ROLLBACK` trên cả sandbox lẫn prod.

**Tech Stack:** Postgres (Supabase) trigger function plpgsql, Supabase MCP (`apply_migration` cho DDL, `execute_sql` cho verify).

---

## Bối cảnh (đọc trước khi làm)

**Bug (28/7):** PR-2026-0603 Lần #2 và PR-2026-0604 Lần #1 được SePay auto-match nhưng không có tin Zalo "💰 ĐÃ VÀO TK". Nguyên nhân: SePay trả `bank_transactions.transaction_date` **làm tròn về đầu phút** (vd `15:13:00`), còn `payment_lines.created_at` chính xác microsecond (`15:13:18`). KH chuyển trong cùng phút với lúc tạo lần TT → trigger thấy `v_pay_time < NEW.created_at` → tưởng "tiền cũ về trước khi tạo lần TT" → suppress nhầm.

**Fix đã chốt (phương án A):** Suppress theo **nguồn xác nhận** thay vì đoán mò thời gian cho luồng SePay:
- `confirmed_source = 'sepay'` chỉ được set từ đúng 1 chỗ: SePay webhook handler (`backend/sepay_routes.py:639`), cùng 1 patch với `status='paid'` → trigger đọc được `NEW.confirmed_source`. Webhook SePay = tiền VỪA về (transfer_code sinh ra cùng lần TT, KH không thể chuyển đúng mã trước khi lần TT tồn tại) → **luôn báo**.
- Ghép tay (`confirmed_source='manual'`) giữ nguyên suppress theo thời gian — case đó tiền cũ thật, lệch hàng giờ/ngày, không dính lỗi làm tròn phút.
- Late-match path (`sepay_routes.py:584-589`) không update `payment_lines` → không qua trigger → không ảnh hưởng.
- Thẻ/trả góp (`method IN ('card','installment')`) đã được miễn suppress từ migration 2026-07-20 → giữ nguyên.

**Lineage trigger function** (mỗi bản REPLACE toàn bộ bản trước):
1. `backend/migrations/2026-06-23-zalo-oa-tables.sql` — bản gốc + `CREATE TRIGGER trg_payment_paid_zalo`
2. `backend/migrations/2026-07-17-suppress-baotien-pay-before-created.sql` — thêm suppress theo thời gian
3. `backend/migrations/2026-07-20-allow-baotien-card-installment.sql` — miễn suppress cho card/installment ← **bản đang live**
4. `backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql` — bản mới (plan này tạo)

**Supabase projects:**
- Sandbox: `pxgybyfiwywksesyogti`
- Prod: `jozcvbbypwvzaefteoxn`

---

## ⛔ GUARDRAILS — đọc kỹ, vi phạm = dừng ngay

1. **DB-only.** KHÔNG sửa bất kỳ file Python/TypeScript nào. KHÔNG deploy Render/Vercel. KHÔNG chạy `npm`/`pytest`.
2. **Chỉ được tạo/sửa đúng 3 file:** migration SQL mới, learnings note, và tick checkbox trong plan này. Không đụng file khác.
3. **Pre-flight bắt buộc (Task 2):** dump function definition đang live ở CẢ sandbox và prod, so với bản 2026-07-20 trong repo. Nếu **khác về logic** (không tính whitespace) → **DỪNG, báo user**, không apply. (Bài học prod divergence PR-0558: prod có thể đã drift.)
4. **Test script chỉ chạy trong `BEGIN; ... ROLLBACK;`** trong MỘT lệnh `execute_sql` duy nhất. TUYỆT ĐỐI không `COMMIT` dữ liệu test. Không insert dữ liệu test ngoài transaction. (Worker Zalo poll bảng `zalo_outbox` — row chưa commit thì worker không thấy, an toàn kể cả trên prod.)
5. **Không UPDATE/DELETE bất kỳ row thật nào** trong `zalo_outbox`, `payment_lines`, `payment_requests`, `bank_transactions`. Test chỉ INSERT row mới (rồi rollback).
6. **Thứ tự bất di bất dịch:** sandbox apply → sandbox verify PASS → prod apply → prod verify PASS. Sandbox fail thì không được đụng prod.
7. **Nếu INSERT trong test script fail vì cột NOT NULL thiếu:** được phép thêm đúng cột đó với giá trị hợp lý rồi chạy lại. Mọi lỗi khác (permission, trigger error, constraint lạ) → DỪNG, báo user kèm error nguyên văn.
8. **Rollback plan nếu có sự cố sau khi apply:** chạy lại nguyên văn nội dung `backend/migrations/2026-07-20-allow-baotien-card-installment.sql` (idempotent, khôi phục hành vi cũ).
9. **Commit git:** đúng 1 commit duy nhất ở cuối (Task 7), gom migration + learnings + plan. Không commit lắt nhắt.

---

### Task 1: Tạo migration file

**Files:**
- Create: `backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql`

- [ ] **Step 1.1: Viết file migration với nội dung CHÍNH XÁC sau**

Toàn bộ function copy từ bản 2026-07-20, chỉ thêm đúng 1 điều kiện `AND COALESCE(NEW.confirmed_source, '') <> 'sepay'` vào khối suppress:

```sql
-- 2026-07-28: SePay auto-confirm không bao giờ suppress tin "báo tiền về"
--
-- Bug: SePay trả transaction_date làm tròn về đầu phút (15:13:00) còn
-- payment_lines.created_at chính xác microsecond (15:13:18). KH chuyển
-- trong cùng phút với lúc tạo lần TT → v_pay_time < created_at →
-- suppress nhầm (mất tin PR-2026-0603 lần #2, PR-2026-0604 lần #1, 27/7).
--
-- Fix: suppress theo NGUỒN xác nhận thay vì đoán mò thời gian.
-- confirmed_source='sepay' chỉ set từ SePay webhook (sepay_routes.py) =
-- tiền vừa về real-time (transfer_code sinh cùng lần TT, không thể chuyển
-- đúng mã trước khi lần TT tồn tại) → luôn báo, bỏ so timestamp.
-- Ghép tay (manual) giữ suppress theo thời gian như cũ — tiền cũ thật
-- lệch hàng giờ/ngày, không dính lỗi làm tròn phút.
--
-- Idempotent: CREATE OR REPLACE.
-- Reversible: chạy lại migration 2026-07-20-allow-baotien-card-installment.sql

CREATE OR REPLACE FUNCTION public.fn_payment_paid_zalo_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team  TEXT;
  v_group_id   TEXT;
  v_message    TEXT;
  v_pay_time   TIMESTAMPTZ;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN

    SELECT LEAST(
      (SELECT min(bt.transaction_date)
         FROM public.bank_transactions bt
        WHERE bt.payment_line_id = NEW.id),
      (SELECT min(gt.paid_at)
         FROM public.gateway_transactions gt
        WHERE gt.payment_line_id = NEW.id)
    ) INTO v_pay_time;

    -- Suppress CHỈ cho ghép tay/nguồn khác với tiền về trước lần TT.
    -- SePay webhook (confirmed_source='sepay') = real-time → không bao giờ suppress.
    -- Thẻ/trả góp → luôn báo (kế toán ghép mPOS/Payoo = xác nhận thủ công).
    IF v_pay_time IS NOT NULL
       AND v_pay_time < NEW.created_at
       AND COALESCE(NEW.method, '') NOT IN ('card', 'installment')
       AND COALESCE(NEW.confirmed_source, '') <> 'sepay' THEN
      RAISE NOTICE '[zalo] payment_paid suppressed: pay_time=% < line.created_at=% line_id=% source=%',
        v_pay_time, NEW.created_at, NEW.id, NEW.confirmed_source;
      RETURN NEW;
    END IF;

    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.payment_request_id
      LIMIT 1;

    SELECT group_id INTO v_group_id
      FROM public.zalo_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_group_id IS NULL THEN
      RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_payment_paid_message(NEW);

    INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message)
    VALUES ('payment_paid', 'payment_lines', NEW.id, v_group_id, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;

    PERFORM public.enqueue_bill_uploaded_zalo(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
```

- [ ] **Step 1.2: Đối chiếu diff với bản 2026-07-20**

Đọc `backend/migrations/2026-07-20-allow-baotien-card-installment.sql`, so bằng mắt: khác biệt DUY NHẤT được phép là (a) header comment, (b) dòng `AND COALESCE(NEW.confirmed_source, '') <> 'sepay'`, (c) comment trong khối suppress, (d) thêm `source=%` + `NEW.confirmed_source` vào RAISE NOTICE. Nếu lỡ khác chỗ nào khác → sửa file cho khớp.

---

### Task 2: Pre-flight — verify function đang live không bị drift

**Files:** không sửa file nào (read-only).

- [ ] **Step 2.1: Dump function definition ở SANDBOX**

Chạy `execute_sql` với project_id `pxgybyfiwywksesyogti`:

```sql
SELECT pg_get_functiondef('public.fn_payment_paid_zalo_notify'::regproc);
```

- [ ] **Step 2.2: Dump function definition ở PROD**

Chạy `execute_sql` với project_id `jozcvbbypwvzaefteoxn`, cùng câu SQL trên.

- [ ] **Step 2.3: So sánh với repo**

So cả 2 bản dump với function trong `backend/migrations/2026-07-20-allow-baotien-card-installment.sql`. Bỏ qua khác biệt whitespace/format do `pg_get_functiondef`. Kiểm tra logic: điều kiện suppress, các SELECT, INSERT, ON CONFLICT phải khớp.

**Expected:** cả 2 khớp bản 2026-07-20.
**Nếu KHÁC logic ở bất kỳ env nào → DỪNG TOÀN BỘ, báo user kèm bản dump.** (Guardrail 3.)

- [ ] **Step 2.4: Verify trigger còn gắn trên bảng**

Chạy ở CẢ 2 project:

```sql
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.payment_lines'::regclass AND tgname = 'trg_payment_paid_zalo';
```

**Expected:** 1 row, `tgenabled = 'O'` (enabled) ở cả 2 env. Khác → DỪNG, báo user.

---

### Task 3: Apply migration lên SANDBOX

- [ ] **Step 3.1: Apply**

Dùng MCP `apply_migration` với project_id `pxgybyfiwywksesyogti`, name `baotien_sepay_no_suppress`, query = toàn bộ nội dung file Task 1.

**Expected:** success, không error.

- [ ] **Step 3.2: Confirm function mới đã live**

```sql
SELECT pg_get_functiondef('public.fn_payment_paid_zalo_notify'::regproc);
```

**Expected:** output chứa chuỗi `confirmed_source, '') <> 'sepay'`.

---

### Task 4: Verify trên SANDBOX bằng test script (BEGIN...ROLLBACK)

**Files:** không sửa file nào.

4 test case:

| # | confirmed_source | method | pay_time vs created_at | Kỳ vọng outbox |
|---|---|---|---|---|
| T1 | `sepay` | qr | trước 18s (bug làm tròn phút) | **CÓ tin** (fix mới) |
| T2 | `manual` | qr | trước 2 ngày (tiền cũ ghép tay) | **KHÔNG tin** (rule cũ giữ nguyên) |
| T3 | `manual` | qr | sau 3 giờ (tiền mới ghép tay) | **CÓ tin** (rule cũ giữ nguyên) |
| T4 | `gateway` | card | trước 1 ngày (thẻ) | **CÓ tin** (miễn trừ 2026-07-20 giữ nguyên) |

- [ ] **Step 4.1: Chạy test script**

Chạy `execute_sql` với project_id `pxgybyfiwywksesyogti`, TOÀN BỘ script sau trong MỘT lệnh duy nhất (mở đầu `BEGIN;` kết thúc `ROLLBACK;` — Guardrail 4):

```sql
BEGIN;

-- Setup: mượn 1 PR thật có sale map được vào Zalo group active
-- (chỉ đọc PR đó, mọi INSERT là row mới, cuối cùng ROLLBACK hết)
CREATE TEMP TABLE _t_ctx ON COMMIT DROP AS
SELECT pr.id AS pr_id
FROM public.payment_requests pr
JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
JOIN public.zalo_team_groups g ON g.team_code = ns.team AND g.is_active = true
WHERE COALESCE(pr.is_test, false) = false
LIMIT 1;

DO $$ BEGIN
  IF (SELECT count(*) FROM _t_ctx) = 0 THEN
    RAISE EXCEPTION 'SETUP FAIL: khong tim duoc PR co sale map vao Zalo group active';
  END IF;
END $$;

-- ========== T1: sepay + pay_time trước created_at 18s → PHẢI CÓ tin ==========
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, pr_id, 'qr', 1000000, 'pending', 'ZZT1', now() FROM _t_ctx;

INSERT INTO public.bank_transactions (txn_id, amount, content, transfer_content, transaction_date, match_status, payment_line_id, gateway)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001'::uuid, 1000000, 'TEST T1 ZZT1', 'TEST T1 ZZT1',
        now() - interval '18 seconds', 'auto_matched', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'sepay_webhook');

UPDATE public.payment_lines
SET status = 'paid', confirmed_source = 'sepay', confirmed_by = 'system:sepay', confirmed_at = now(), paid_at = now()
WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001'::uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.zalo_outbox
                 WHERE source_id = 'aaaaaaaa-0000-4000-8000-000000000001'::uuid
                   AND event_type = 'payment_paid') THEN
    RAISE EXCEPTION 'T1 FAIL: sepay + rounding le 18s van bi suppress (bug chua fix)';
  END IF;
  RAISE NOTICE 'T1 PASS';
END $$;

-- ========== T2: manual + tiền cũ 2 ngày → PHẢI KHÔNG CÓ tin ==========
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, pr_id, 'qr', 2000000, 'pending', 'ZZT2', now() FROM _t_ctx;

INSERT INTO public.bank_transactions (txn_id, amount, content, transfer_content, transaction_date, match_status, payment_line_id, gateway)
VALUES ('bbbbbbbb-0000-4000-8000-000000000002'::uuid, 2000000, 'TEST T2 ZZT2', 'TEST T2 ZZT2',
        now() - interval '2 days', 'manual_matched', 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'sepay_webhook');

UPDATE public.payment_lines
SET status = 'paid', confirmed_source = 'manual', confirmed_by = 'test@dev', confirmed_at = now(), paid_at = now()
WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'::uuid;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.zalo_outbox
             WHERE source_id = 'aaaaaaaa-0000-4000-8000-000000000002'::uuid
               AND event_type = 'payment_paid') THEN
    RAISE EXCEPTION 'T2 FAIL: manual + tien cu 2 ngay ma van ban tin (rule suppress bi pha)';
  END IF;
  RAISE NOTICE 'T2 PASS';
END $$;

-- ========== T3: manual + tiền về SAU khi tạo lần TT 3 giờ → PHẢI CÓ tin ==========
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, pr_id, 'qr', 3000000, 'pending', 'ZZT3', now() - interval '3 hours' FROM _t_ctx;

INSERT INTO public.bank_transactions (txn_id, amount, content, transfer_content, transaction_date, match_status, payment_line_id, gateway)
VALUES ('bbbbbbbb-0000-4000-8000-000000000003'::uuid, 3000000, 'TEST T3 ZZT3', 'TEST T3 ZZT3',
        now(), 'manual_matched', 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'sepay_webhook');

UPDATE public.payment_lines
SET status = 'paid', confirmed_source = 'manual', confirmed_by = 'test@dev', confirmed_at = now(), paid_at = now()
WHERE id = 'aaaaaaaa-0000-4000-8000-000000000003'::uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.zalo_outbox
                 WHERE source_id = 'aaaaaaaa-0000-4000-8000-000000000003'::uuid
                   AND event_type = 'payment_paid') THEN
    RAISE EXCEPTION 'T3 FAIL: manual + tien ve sau lan TT ma khong ban tin';
  END IF;
  RAISE NOTICE 'T3 PASS';
END $$;

-- ========== T4: card + tiền trước 1 ngày → PHẢI CÓ tin (miễn trừ 2026-07-20) ==========
INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, created_at)
SELECT 'aaaaaaaa-0000-4000-8000-000000000004'::uuid, pr_id, 'card', 4000000, 'pending', 'ZZT4', now() FROM _t_ctx;

INSERT INTO public.bank_transactions (txn_id, amount, content, transfer_content, transaction_date, match_status, payment_line_id, gateway)
VALUES ('bbbbbbbb-0000-4000-8000-000000000004'::uuid, 4000000, 'TEST T4 ZZT4', 'TEST T4 ZZT4',
        now() - interval '1 day', 'manual_matched', 'aaaaaaaa-0000-4000-8000-000000000004'::uuid, 'mpos_import');

UPDATE public.payment_lines
SET status = 'paid', confirmed_source = 'gateway', confirmed_by = 'test@dev', confirmed_at = now(), paid_at = now()
WHERE id = 'aaaaaaaa-0000-4000-8000-000000000004'::uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.zalo_outbox
                 WHERE source_id = 'aaaaaaaa-0000-4000-8000-000000000004'::uuid
                   AND event_type = 'payment_paid') THEN
    RAISE EXCEPTION 'T4 FAIL: card + tien truoc 1 ngay bi suppress (pha mien tru 2026-07-20)';
  END IF;
  RAISE NOTICE 'ALL 4 TESTS PASSED';
END $$;

ROLLBACK;
```

**Expected:** chạy hết không exception (nếu MCP không trả NOTICE thì "không error" = pass; exception nào nổi lên = FAIL).

**Nếu fail vì cột NOT NULL thiếu trong INSERT** → Guardrail 7: thêm đúng cột đó, chạy lại toàn bộ script.
**Nếu fail vì lý do khác** → DỪNG, báo user, KHÔNG apply prod.

⚠️ **Prod drift (phát hiện 28/7):** prod có CHECK constraint `bank_txn_gateway_check` mà sandbox KHÔNG có → `gateway` chỉ nhận `'sepay_webhook' | 'sepay_poll' | 'mpos_import' | 'manual'`. Script trên đã dùng giá trị hợp lệ (`sepay_webhook` cho T1/T2/T3, `mpos_import` cho T4). `gateway` không ảnh hưởng logic trigger — chỉ cần qua constraint.

- [ ] **Step 4.2: Confirm không để lại rác**

```sql
SELECT count(*) FROM public.payment_lines WHERE transfer_code LIKE 'ZZT%';
```

**Expected:** `0` (rollback sạch). Nếu > 0 → DỪNG, báo user ngay (không tự xoá).

---

### Task 5: Apply + verify trên PROD

- [ ] **Step 5.1: Apply migration lên prod**

Điều kiện tiên quyết: Task 4 PASS toàn bộ. Dùng `apply_migration` với project_id `jozcvbbypwvzaefteoxn`, name `baotien_sepay_no_suppress`, query = cùng nội dung Task 1.

- [ ] **Step 5.2: Confirm function mới live trên prod**

```sql
SELECT pg_get_functiondef('public.fn_payment_paid_zalo_notify'::regproc);
```

**Expected:** chứa `confirmed_source, '') <> 'sepay'`.

- [ ] **Step 5.3: Chạy CÙNG test script Task 4.1 trên prod**

Cùng script, project_id `jozcvbbypwvzaefteoxn`. An toàn vì toàn bộ trong BEGIN...ROLLBACK (row chưa commit → worker Zalo không thấy — Guardrail 4).

**Expected:** pass hết, không exception.

- [ ] **Step 5.4: Confirm không rác trên prod**

```sql
SELECT count(*) FROM public.payment_lines WHERE transfer_code LIKE 'ZZT%';
```

**Expected:** `0`.

---

### Task 6: Learnings note

**Files:**
- Create: `docs/learnings/sepay-minute-rounding-suppress.md`
- Modify: `docs/learnings/README.md` (thêm 1 dòng index theo format sẵn có trong file)

- [ ] **Step 6.1: Viết note**

```markdown
# SePay minute-rounding làm trigger suppress nhầm tin báo tiền

**Problem:** PR-2026-0603 lần #2 + PR-2026-0604 (27/7/2026): SePay auto-match
thành công nhưng không có tin Zalo "ĐÃ VÀO TK". `fn_payment_paid_zalo_notify`
suppress vì `bank_transactions.transaction_date < payment_lines.created_at`.

**Trap:** SePay trả `transaction_date` làm tròn về đầu phút (`15:13:00`),
`payment_lines.created_at` chính xác microsecond (`15:13:18`). So sánh 2
timestamp khác độ phân giải → KH chuyển trong cùng phút với lúc tạo lần TT
nhìn như "tiền về trước khi tạo" → suppress nhầm. Bug chỉ xuất hiện khi KH
chuyển QR trong <60s — càng nhanh càng dễ mất tin, nên khó tái hiện khi test tay.

**Insight:** Suppress "tiền cũ ghép sau thì đừng báo" là rule đúng, nhưng dùng
timestamp để đoán "cũ/mới" là sai công cụ — hệ thống đã biết chắc nguồn xác
nhận. `confirmed_source='sepay'` chỉ set từ SePay webhook = tiền vừa về
real-time (transfer_code sinh ra cùng lần TT, không thể chuyển đúng mã trước
khi lần TT tồn tại) → không cần đoán. Timestamp check chỉ còn nghĩa cho ghép
tay (manual), nơi lệch hàng giờ/ngày nên làm tròn phút vô hại.

**Rule:** So sánh timestamp từ 2 hệ thống khác nhau → phải kiểm tra độ phân
giải của TỪNG nguồn trước (SePay = phút). Khi cần phân loại sự kiện
(cũ/mới, tự động/thủ công), ưu tiên metadata rõ ràng (`confirmed_source`,
`matched_by`...) thay vì suy diễn từ thời gian. Fix:
`backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql`.
```

- [ ] **Step 6.2: Thêm dòng index vào `docs/learnings/README.md`** theo đúng format các dòng sẵn có.

---

### Task 7: Commit (1 commit duy nhất)

- [ ] **Step 7.1: Kiểm tra staging**

```bash
git status
```

Chỉ được có: migration file, learnings note, README.md learnings, plan file này. File lạ → không add.

- [ ] **Step 7.2: Commit**

```bash
git add backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql docs/learnings/sepay-minute-rounding-suppress.md docs/learnings/README.md docs/superpowers/plans/2026-07-28-baotien-sepay-no-suppress.md
git commit -m "fix(zalo): SePay auto-confirm không suppress tin báo tiền (minute-rounding)

SePay trả transaction_date tròn phút, KH chuyển nhanh trong cùng phút
với lúc tạo lần TT → trigger tưởng tiền cũ → nuốt tin (PR-0603/0604 27/7).
Suppress giờ theo confirmed_source: sepay=luôn báo, manual=giữ rule cũ.
DB-only, đã apply sandbox+prod, verify 4 case BEGIN/ROLLBACK.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 7.3: Push**

```bash
git push origin main
```

(FE/BE code không đổi → Vercel build ra output y hệt, Render auto-deploy OFF — push an toàn.)

---

## Definition of Done

- [ ] Function ở sandbox + prod chứa điều kiện `confirmed_source <> 'sepay'`
- [ ] 4 test case pass ở CẢ 2 env, không để lại row rác (`ZZT%` count = 0)
- [ ] Learnings note + index committed
- [ ] 1 commit duy nhất trên main, đã push
- [ ] Không file Python/TS nào bị sửa (`git status` sạch ngoài 4 file kể trên)
