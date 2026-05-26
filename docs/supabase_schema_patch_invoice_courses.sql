-- B4 — Invoice sequences + cập nhật derive status AR khi xuất INV.
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

create table if not exists public.invoice_sequences (
  year_key text primary key,
  current_val bigint not null default 0 check (current_val >= 0)
);

-- Cập nhật RPC map order_id — thêm nhánh invoiced khi mọi course đã xuất HĐ
create or replace function patch_active_request_course_order(
  p_ar_id        text,
  p_course_code  text,
  p_order_id     text
)
returns active_requests
language plpgsql
as $$
declare
  v_row   active_requests%ROWTYPE;
  v_uids  jsonb;
  v_uid   jsonb;
  v_new_uids jsonb := '[]'::jsonb;
  v_courses jsonb;
  v_course jsonb;
  v_new_courses jsonb;
  v_found boolean := false;
  v_status text;
  v_total int := 0;
  v_ordered int := 0;
  v_invoiced int := 0;
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
      v_total := v_total + 1;
      if v_course->>'code' = p_course_code then
        v_course := jsonb_set(v_course, '{order_id}', to_jsonb(trim(p_order_id)), true);
        v_found := true;
      end if;
      if coalesce(trim(v_course->>'order_id'), '') <> '' then
        v_ordered := v_ordered + 1;
      end if;
      if coalesce(v_course->>'invoiced', 'false') in ('true', 't', '1') then
        v_invoiced := v_invoiced + 1;
      end if;
      v_new_courses := v_new_courses || jsonb_build_array(v_course);
    end loop;
    v_uid := jsonb_set(v_uid, '{courses}', v_new_courses, true);
    v_new_uids := v_new_uids || jsonb_build_array(v_uid);
  end loop;

  if not v_found then
    raise exception 'course_code_not_found' using errcode = 'P0002';
  end if;

  if v_total = 0 or v_ordered = 0 then
    v_status := 'pending_order';
  elsif v_ordered < v_total then
    v_status := 'partial_order';
  elsif v_invoiced = v_total then
    v_status := 'invoiced';
  else
    v_status := 'ready_invoice';
  end if;

  update active_requests
  set uids_data = v_new_uids,
      status = v_status,
      updated_at = now()
  where id = p_ar_id
  returning * into v_row;

  return v_row;
end;
$$;

notify pgrst, 'reload schema';
