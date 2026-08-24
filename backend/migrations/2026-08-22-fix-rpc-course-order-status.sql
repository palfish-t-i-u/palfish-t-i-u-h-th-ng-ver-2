-- Fix: RPC patch_active_request_course_order inline status logic thiếu 'activated'
-- và không check invoice_requested_at.
-- Thay bằng derive_ar_status_from_uids() (shared function, đã đúng).
-- Giống clear_course_order_id_atomic đã dùng.
-- Bug: status = 'ready_invoice' khi all courses có order_id → trigger DingTalk không fire.

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

-- Backfill: sửa AR bị lệch status do bug trên.
-- UPDATE trigger trg_course_activated_dingtalk sẽ tự fire
-- (status đổi ready_invoice→activated = IS DISTINCT FROM = trigger condition met).
UPDATE active_requests
SET status = derive_ar_status_from_uids(uids_data),
    updated_at = now()
WHERE status != derive_ar_status_from_uids(uids_data);
