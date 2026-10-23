-- Sale→CS handover v2: nguồn sự thật claim/dedup cho việc đẩy sheet bàn giao.
-- Thay cờ handover_pushed_at trong JSONB uids_data (bị ghi đè nguyên khối bởi nhiều endpoint
-- → lost update, và hook dùng snapshot cũ → race đẩy đôi: AR-2026-1740 23/10).
-- Plan: docs/plans/PLAN_cs_handover_v2_hybrid_2026-10-23.md (G1-T1).

create table if not exists cs_handover_log (
  course_code   text primary key,
  ar_id         text not null,
  team          text,
  spreadsheet_id text,
  tab           text,
  -- claimed | appended | matched | merged | done | not_found | ambiguous | verify_failed
  -- | dup_manual | skipped_no_handover | pending_retry | failed
  status        text not null default 'claimed',
  marker        text,            -- = course_code ghi lên sheet (cột "App Order ID" / W trên L8)
  sheet_row     int,
  l8_status     text,            -- IH2: appended|stamped|exists|cleaned|ambiguous|skip
  claimed_at    timestamptz not null default now(),
  pushed_at     timestamptz,
  updated_at    timestamptz not null default now(),
  attempts      int not null default 0,
  last_error    text
);

create index if not exists idx_cs_handover_log_status on cs_handover_log(status);
create index if not exists idx_cs_handover_log_ar on cs_handover_log(ar_id);

-- Seed: course đã đẩy theo cơ chế cũ (cờ JSONB) → done, để worker v2 KHÔNG re-push.
insert into cs_handover_log(course_code, ar_id, status, pushed_at, marker)
select c->>'code', ar.id, 'done', (c->>'handover_pushed_at')::timestamptz, c->>'code'
from active_requests ar
cross join lateral jsonb_array_elements(coalesce(ar.uids_data, '[]'::jsonb)) ub
cross join lateral jsonb_array_elements(coalesce(ub->'courses', '[]'::jsonb)) c
where c->>'handover_pushed_at' is not null
  and coalesce(c->>'code', '') <> ''
on conflict (course_code) do nothing;
