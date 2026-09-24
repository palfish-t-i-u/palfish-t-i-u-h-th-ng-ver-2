-- Migration: RPC pr_badge_counts — gộp 3 badge sidebar (reconciliation/activation/invoice)
-- vào 1 câu SQL, thay ~36 round-trip Supabase tuần tự của _compute_badge_counts (6-13s -> ~100ms).
-- Mirror đúng Python: _compute_badge_counts + _ar_status_is_pending_order (payment_request_routes.py)
-- + _course_order_id (order_id ?? orderId) / _course_is_invoiced / _course_invoice_requested_at
-- (activation_routes.py). p_emails null = admin/ops (mọi PR); ngược lại lọc theo sale_email.
-- Idempotent: CREATE OR REPLACE. Date: 2026-09-24
create or replace function pr_badge_counts(p_emails text[])
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  with scoped_pr as (
    select id
    from payment_requests
    where state <> 'cancelled'
      and (p_emails is null or lower(coalesce(sale_email, '')) = any(p_emails))
  ),
  recon as (
    select count(*) as n
    from payment_lines l
    where l.status = 'pending'
      and l.payment_request_id in (select id from scoped_pr)
  ),
  ar as (
    select a.id, a.uids_data
    from active_requests a
    where a.pr_id in (select id from scoped_pr)
  ),
  course_flat as (
    -- AR không có course sẽ KHÔNG sinh dòng ở đây (n_courses=0 lấy qua left join ở ar_agg)
    select ar.id as ar_id, c.course
    from ar
    cross join lateral jsonb_array_elements(coalesce(ar.uids_data, '[]'::jsonb)) u
    cross join lateral jsonb_array_elements(coalesce(u -> 'courses', '[]'::jsonb)) c(course)
  ),
  course_pred as (
    select
      ar_id,
      (nullif(trim(coalesce(course ->> 'order_id', course ->> 'orderId', '')), '') is not null) as has_order,
      (case jsonb_typeof(course -> 'invoiced')
         when 'boolean' then (course ->> 'invoiced')::boolean
         when 'number'  then (course ->> 'invoiced')::numeric <> 0
         when 'string'  then lower(trim(course ->> 'invoiced')) in ('1', 'true', 'yes', 'y')
         else false end) as is_invoiced,
      (trim(coalesce(course ->> 'invoice_requested_at', '')) <> '') as inv_requested
    from course_flat
  ),
  ar_agg as (
    select
      ar.id as ar_id,
      count(cp.ar_id) as n_courses,
      coalesce(bool_and(cp.is_invoiced), false) as all_invoiced,
      coalesce(bool_and(cp.has_order), false) as all_ordered
    from ar
    left join course_pred cp on cp.ar_id = ar.id
    group by ar.id
  ),
  activation as (
    -- pending_order = không có course HOẶC (chưa all invoiced VÀ chưa all ordered)
    select count(*) as n
    from ar_agg
    where n_courses = 0 or (not all_invoiced and not all_ordered)
  ),
  invoice as (
    select count(*) as n
    from course_pred
    where inv_requested and not is_invoiced
  )
  select jsonb_build_object(
    'reconciliation', (select n from recon),
    'activation',     (select n from activation),
    'invoice',        (select n from invoice)
  )
$$;

revoke execute on function pr_badge_counts(text[]) from public, anon, authenticated;
grant execute on function pr_badge_counts(text[]) to service_role;
notify pgrst, 'reload schema';

-- ROLLBACK:
-- drop function if exists pr_badge_counts(text[]);
-- notify pgrst, 'reload schema';
