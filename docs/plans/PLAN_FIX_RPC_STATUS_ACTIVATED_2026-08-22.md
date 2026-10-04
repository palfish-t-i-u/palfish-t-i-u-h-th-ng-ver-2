# PLAN: Fix RPC patch_active_request_course_order thiếu status `activated`

**Ngày:** 2026-08-22
**Bug report:** Đơn AR-2026-0486 (Lê Thị Cúc / Dinh Ngoc Hai IH2) — Ops điền Order ID
xong nhưng không có tin "ĐÃ TẠO GÓI HỌC THÀNH CÔNG" trên DingTalk.

---

## ĐỌC TRƯỚC KHI LÀM

Mở các file/resource này trước khi sửa bất kỳ thứ gì:

1. File plan này (đang đọc)
2. `docs/learnings/outbox-unique-source-id-second-business-event.md` — trap UNIQUE outbox
3. RPC prod: `SELECT prosrc FROM pg_proc WHERE proname = 'patch_active_request_course_order'`
4. Function đúng: `SELECT prosrc FROM pg_proc WHERE proname = 'derive_ar_status_from_uids'`

**STOP conditions** — dừng và hỏi user nếu:
- RPC prod khác nội dung ghi trong plan (code drift)
- Có >3 AR bị lệch status (scope lớn hơn dự kiến)
- Test đỏ không rõ nguyên nhân

---

## Root cause

RPC `patch_active_request_course_order` (gắn Order ID per-course) có inline status logic
**thiếu case `activated`** và **không check `invoice_requested_at`**:

```sql
-- BUG (hiện tại trong RPC):
if v_total = 0 or v_ordered = 0 then 'pending_order'
elsif v_ordered < v_total then 'partial_order'
elsif v_invoiced = v_total then 'invoiced'
else 'ready_invoice'   ← SAI: khi all có order_id → phải là 'activated'
```

Python `_derive_status` (activation_routes.py:343) tính đúng. SQL function
`derive_ar_status_from_uids()` cũng tính đúng (dùng bởi `clear_course_order_id_atomic`).
Chỉ RPC `patch_active_request_course_order` dùng inline logic sai.

**Hậu quả:** Trigger `trg_course_activated_dingtalk` chỉ fire khi `NEW.status = 'activated'`.
Status chưa bao giờ = `activated` → trigger không fire → không gửi tin DingTalk.

**Bằng chứng DB (prod 22/08):**

| AR | status DB | status đúng | Tin DingTalk `course_activated` |
|----|-----------|-------------|-------------------------------|
| AR-2026-0478 | ready_invoice | activated | ❌ Không có |
| AR-2026-0486 | ready_invoice | activated | ❌ Không có |
| AR-2026-0487 | ready_invoice | activated | ❌ Không có |

Query xác nhận: `SELECT id, status, derive_ar_status_from_uids(uids_data) FROM active_requests WHERE status != derive_ar_status_from_uids(uids_data)`

---

## Approach: Thay inline logic bằng `derive_ar_status_from_uids()`

Dùng shared function đã có sẵn và đúng — giống `clear_course_order_id_atomic`.

```
TC1 Triệt để:      ✅ Gốc rễ = inline logic sai → xoá, dùng function đúng
TC2 Không lỗi con:  ✅ derive_ar_status_from_uids đã live, clear_course dùng OK
TC3 Hạ tầng/perf:   ✅ 0 infra change, 1 function call thay 5 dòng if/else
TC4 Token economy:  ✅ 1 migration file, 1 subagent Sonnet đủ
TC5 Task-model:     ✅ Sonnet — task rõ ràng, single-file SQL
→ 5/5 Recommend
```

---

## GUARDRAILS (không được phá)

| # | Quy tắc | Nguồn | Cách kiểm |
|---|---------|-------|-----------|
| G1 | `derive_ar_status_from_uids` KHÔNG được sửa | Function shared, `clear_course_order_id_atomic` phụ thuộc | Verify function source không đổi sau migration |
| G2 | UNIQUE outbox `(source_table, source_id, event_type)` — `course_activated` khác `activation_request_created` nên không conflict | `docs/learnings/outbox-unique-source-id-second-business-event.md` | Backfill UPDATE trigger → insert OK vì event_type khác |
| G3 | Trigger `trg_course_activated_dingtalk` WHEN clause = `NEW.status IS DISTINCT FROM OLD.status` | `migrations/2026-06-26-dingtalk-tables.sql:142-146` | Backfill đổi status ready_invoice→activated = DISTINCT = trigger fires |
| G4 | RPC vẫn phải `FOR UPDATE` lock row + raise nếu not found | Hiện tại đã có | Verify trong migration code |

---

## Tasks

### Task 1: Migration SQL — fix RPC + backfill (Sonnet)

**File:** `backend/migrations/2026-08-22-fix-rpc-course-order-status.sql`

**Nội dung chính xác:**

```sql
-- Fix: RPC patch_active_request_course_order inline status logic thiếu 'activated'
-- và không check invoice_requested_at.
-- Thay bằng derive_ar_status_from_uids() (shared function, đã đúng).
-- Giống clear_course_order_id_atomic đã dùng.

CREATE OR REPLACE FUNCTION public.patch_active_request_course_order(
  p_ar_id text,
  p_course_code text,
  p_order_id text
)
RETURNS active_requests
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_row   active_requests%ROWTYPE;
  v_uids  jsonb;
  v_uid   jsonb;
  v_new_uids jsonb := '[]'::jsonb;
  v_courses jsonb;
  v_course jsonb;
  v_new_courses jsonb;
  v_found boolean := false;
begin
  select * into v_row
  from active_requests
  where id = p_ar_id
  for update;

  if not found then
    raise exception 'active_request_not_found' using errcode = 'P0002';
  end if;

  v_uids := coalesce(v_row.uids_data, '[]'::jsonb);

  for v_uid in select * from jsonb_array_elements(v_uids)
  loop
    v_new_courses := '[]'::jsonb;
    for v_course in select * from jsonb_array_elements(coalesce(v_uid->'courses', '[]'::jsonb))
    loop
      if v_course->>'code' = p_course_code then
        v_course := jsonb_set(v_course, '{order_id}', to_jsonb(trim(p_order_id)), true);
        v_found := true;
      end if;
      v_new_courses := v_new_courses || jsonb_build_array(v_course);
    end loop;
    v_uid := jsonb_set(v_uid, '{courses}', v_new_courses, true);
    v_new_uids := v_new_uids || jsonb_build_array(v_uid);
  end loop;

  if not v_found then
    raise exception 'course_code_not_found' using errcode = 'P0002';
  end if;

  update active_requests
  set uids_data = v_new_uids,
      status = derive_ar_status_from_uids(v_new_uids),
      updated_at = now()
  where id = p_ar_id
  returning * into v_row;

  return v_row;
end;
$function$;

-- Backfill: sửa 3 AR bị lệch status.
-- UPDATE trigger trg_course_activated_dingtalk sẽ tự fire
-- (status đổi ready_invoice→activated = IS DISTINCT FROM = trigger condition met).
-- Worker DingTalk sẽ pick up và gửi tin.
UPDATE active_requests
SET status = derive_ar_status_from_uids(uids_data),
    updated_at = now()
WHERE status != derive_ar_status_from_uids(uids_data);
```

**Thay đổi so với bản gốc:**
- XOÁ: 5 biến counter (`v_status`, `v_total`, `v_ordered`, `v_invoiced`) + khối if/elsif
- THÊM: 1 dòng `status = derive_ar_status_from_uids(v_new_uids)` (giống `clear_course_order_id_atomic`)
- GIỮ NGUYÊN: `FOR UPDATE`, exception handling, JSONB traversal logic

**Verify sau khi apply (sandbox trước, prod sau):**
```sql
-- 1. Không còn AR lệch status
SELECT count(*) FROM active_requests
WHERE status != derive_ar_status_from_uids(uids_data);
-- Expected: 0

-- 2. 3 AR đã có tin course_activated trong outbox
SELECT source_id, event_type, sent_at
FROM dingtalk_outbox
WHERE event_type = 'course_activated'
  AND source_table = 'active_requests'
  AND source_id IN (
    md5('AR-2026-0478')::uuid,
    md5('AR-2026-0486')::uuid,
    md5('AR-2026-0487')::uuid
  );
-- Expected: 3 rows, sent_at NULL (chờ worker gửi)

-- 3. derive_ar_status_from_uids không bị sửa
SELECT md5(prosrc) FROM pg_proc WHERE proname = 'derive_ar_status_from_uids';
-- Ghi lại hash trước migration, so sánh sau — phải bằng nhau
```

### Task 2: Ghi migration file vào repo (Sonnet — cavecrew-builder)

**File:** `backend/migrations/2026-08-22-fix-rpc-course-order-status.sql`
Nội dung = SQL trong Task 1. Tạo file mới, không sửa file cũ.

### Task 3: Verify build (inline)

```bash
cd frontend && npx tsc -b
cd backend && python -m pytest tests/ -x -q 2>/dev/null || echo "no pytest"
```

Không cần test mới — đây là fix SQL thuần, không đổi Python/TS code.

---

## Rollback

- Revert commit (1 file migration, 0 code change)
- Nếu đã apply DB: chạy lại RPC cũ (copy từ `pg_proc` trước migration)
- 3 AR backfill: vô hại (status đúng hơn cũ), nhưng nếu cần revert:
  `UPDATE active_requests SET status = 'ready_invoice' WHERE id IN (...)`

---

## Definition of Done

- [ ] Migration file tạo
- [ ] Apply sandbox: `SELECT prosrc FROM pg_proc WHERE proname = 'patch_active_request_course_order'` chứa `derive_ar_status_from_uids`
- [ ] Query verify: 0 AR lệch status
- [ ] Query verify: 3 row `course_activated` trong outbox
- [ ] Worker gửi tin DingTalk cho 3 AR (check group IH2 + group liên quan)
- [ ] Apply prod
- [ ] `tsc -b` pass (regression check)

---

## Checklist tiến độ

- [ ] Task 1: Migration SQL viết xong
- [ ] Task 2: File ghi vào repo
- [ ] Task 3: tsc -b pass
- [ ] Apply sandbox
- [ ] Verify sandbox
- [ ] Apply prod
- [ ] Verify prod
