-- Active Request 3-state rollout.
-- Run in Supabase SQL Editor, then verify PostgREST has reloaded.

create or replace function public.derive_active_request_status_3_state(p_uids jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_uid jsonb;
  v_course jsonb;
  v_courses jsonb;
  v_total int := 0;
  v_invoiced int := 0;
  v_missing_order int := 0;
begin
  if p_uids is null or jsonb_typeof(p_uids) <> 'array' then
    return 'pending_order';
  end if;

  for v_uid in select value from jsonb_array_elements(p_uids) as t(value)
  loop
    if coalesce(jsonb_typeof(v_uid), '') <> 'object' then
      continue;
    end if;

    if coalesce(jsonb_typeof(v_uid->'courses'), '') = 'array' then
      v_courses := v_uid->'courses';
    else
      v_courses := '[]'::jsonb;
    end if;

    for v_course in select value from jsonb_array_elements(v_courses) as t(value)
    loop
      if coalesce(jsonb_typeof(v_course), '') <> 'object' then
        continue;
      end if;

      v_total := v_total + 1;

      if lower(coalesce(v_course->>'invoiced', v_course->>'isInvoiced', 'false'))
        in ('true', 't', '1', 'yes', 'y') then
        v_invoiced := v_invoiced + 1;
      end if;

      if coalesce(trim(v_course->>'order_id'), trim(v_course->>'orderId'), '') = '' then
        v_missing_order := v_missing_order + 1;
      end if;
    end loop;
  end loop;

  if v_total = 0 then
    return 'pending_order';
  elsif v_invoiced = v_total then
    return 'invoiced';
  elsif v_missing_order > 0 then
    return 'pending_order';
  end if;

  return 'activated';
end;
$$;

alter table public.active_requests
  drop constraint if exists active_requests_status_check;

update public.active_requests
set status = public.derive_active_request_status_3_state(uids_data),
    updated_at = now()
where status is distinct from public.derive_active_request_status_3_state(uids_data);

alter table public.active_requests
  add constraint active_requests_status_check
  check (status in ('pending_order', 'activated', 'invoiced'));

create or replace function public.patch_active_request_course_order(
  p_ar_id        text,
  p_course_code  text,
  p_order_id     text
)
returns active_requests
language plpgsql
as $$
declare
  v_row active_requests%ROWTYPE;
  v_uids jsonb;
  v_uid jsonb;
  v_new_uids jsonb := '[]'::jsonb;
  v_courses jsonb;
  v_course jsonb;
  v_new_courses jsonb;
  v_found boolean := false;
  v_status text;
begin
  select * into v_row
  from public.active_requests
  where id = p_ar_id
  for update;

  if not found then
    raise exception 'active_request_not_found' using errcode = 'P0002';
  end if;

  if v_row.uids_data is null or jsonb_typeof(v_row.uids_data) <> 'array' then
    v_uids := '[]'::jsonb;
  else
    v_uids := v_row.uids_data;
  end if;

  for v_uid in select value from jsonb_array_elements(v_uids) as t(value)
  loop
    if coalesce(jsonb_typeof(v_uid), '') <> 'object' then
      v_new_uids := v_new_uids || jsonb_build_array(v_uid);
      continue;
    end if;

    if coalesce(jsonb_typeof(v_uid->'courses'), '') = 'array' then
      v_courses := v_uid->'courses';
    else
      v_courses := '[]'::jsonb;
    end if;

    v_new_courses := '[]'::jsonb;
    for v_course in select value from jsonb_array_elements(v_courses) as t(value)
    loop
      if coalesce(jsonb_typeof(v_course), '') <> 'object' then
        v_new_courses := v_new_courses || jsonb_build_array(v_course);
        continue;
      end if;

      if coalesce(trim(v_course->>'order_id'), '') = ''
        and coalesce(trim(v_course->>'orderId'), '') <> '' then
        v_course := jsonb_set(v_course, '{order_id}', to_jsonb(trim(v_course->>'orderId')), true);
      end if;
      if not (v_course ? 'invoiced') and v_course ? 'isInvoiced' then
        v_course := jsonb_set(
          v_course,
          '{invoiced}',
          to_jsonb(lower(coalesce(v_course->>'isInvoiced', 'false')) in ('true', 't', '1', 'yes', 'y')),
          true
        );
      end if;
      if not (v_course ? 'invoice_requested_at') and v_course ? 'invoiceRequestedAt' then
        v_course := jsonb_set(
          v_course,
          '{invoice_requested_at}',
          coalesce(to_jsonb(v_course->>'invoiceRequestedAt'), 'null'::jsonb),
          true
        );
      end if;
      if not (v_course ? 'invoice_id') and v_course ? 'invoiceId' then
        v_course := jsonb_set(
          v_course,
          '{invoice_id}',
          coalesce(to_jsonb(v_course->>'invoiceId'), 'null'::jsonb),
          true
        );
      end if;
      if not (v_course ? 'invoiced_at') and v_course ? 'invoicedAt' then
        v_course := jsonb_set(
          v_course,
          '{invoiced_at}',
          coalesce(to_jsonb(v_course->>'invoicedAt'), 'null'::jsonb),
          true
        );
      end if;
      if not (v_course ? 'tax_invoice_code') and v_course ? 'taxInvoiceCode' then
        v_course := jsonb_set(
          v_course,
          '{tax_invoice_code}',
          coalesce(to_jsonb(v_course->>'taxInvoiceCode'), 'null'::jsonb),
          true
        );
      end if;
      if not (v_course ? 'tax_product_code') and v_course ? 'taxProductCode' then
        v_course := jsonb_set(
          v_course,
          '{tax_product_code}',
          coalesce(to_jsonb(v_course->>'taxProductCode'), 'null'::jsonb),
          true
        );
      end if;
      if not (v_course ? 'invoice_requested_at') then
        v_course := jsonb_set(v_course, '{invoice_requested_at}', 'null'::jsonb, true);
      end if;
      if not (v_course ? 'invoiced') then
        v_course := jsonb_set(v_course, '{invoiced}', 'false'::jsonb, true);
      end if;

      if v_course->>'code' = p_course_code then
        v_course := jsonb_set(v_course, '{order_id}', to_jsonb(trim(coalesce(p_order_id, ''))), true);
        v_found := true;
      end if;

      v_course := v_course
        - 'orderId'
        - 'isInvoiced'
        - 'invoiceRequestedAt'
        - 'invoiceId'
        - 'invoicedAt'
        - 'taxInvoiceCode'
        - 'taxProductCode';
      v_new_courses := v_new_courses || jsonb_build_array(v_course);
    end loop;

    v_uid := jsonb_set(v_uid, '{courses}', v_new_courses, true);
    v_new_uids := v_new_uids || jsonb_build_array(v_uid);
  end loop;

  if not v_found then
    raise exception 'course_code_not_found' using errcode = 'P0002';
  end if;

  v_status := public.derive_active_request_status_3_state(v_new_uids);

  update public.active_requests
  set uids_data = v_new_uids,
      status = v_status,
      updated_at = now()
  where id = p_ar_id
  returning * into v_row;

  return v_row;
end;
$$;

notify pgrst, 'reload schema';
