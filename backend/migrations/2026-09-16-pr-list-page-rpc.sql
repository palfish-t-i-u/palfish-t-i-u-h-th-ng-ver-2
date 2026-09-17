-- Migration: Tab "Quản lý thanh toán" (B1) chuyển sang server-side pagination.
-- Plan: docs/superpowers/plans/2026-09-15-pr-list-server-pagination.md (M1-T1)
-- Idempotent: CREATE INDEX IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- Quyết định đã chốt với anh Minh (M0-T4 + phản hồi 2026-09-17):
--   (a) search không dấu = hàm SQL norm_vi (mirror JS normVi), KHÔNG dùng extension unaccent.
--   (b) has_pending_qr tính theo created_at của PAYMENT_REQUESTS (không phải payment_lines).
--   (c) sort tiếng Việt cho danh sách TVTS để ở FE (localeCompare("vi")), RPC trả KHÔNG sort
--       — né phụ thuộc collation "vi" trên server (collation thật = en_US.UTF-8, xem M0-T2).
--   (d) bug SĐT rỗng: length(pd) >= 4 phải đứng TRƯỚC position(...)/like — nếu không,
--       position('' in x) trong Postgres trả về 1 (không phải 0), khiến mọi PR không có SĐT
--       tự khớp với BẤT KỲ tìm kiếm dạng số nào.
-- Date: 2026-09-16

-- =====================================================================
-- 1. Index mới (2 cái, đúng M1-T1)
-- =====================================================================
create index if not exists idx_pr_created_at_id_desc
  on payment_requests (created_at desc, id desc);

create index if not exists idx_payment_lines_pending_qr
  on payment_lines (created_at desc)
  where method = 'qr' and status = 'pending';

-- =====================================================================
-- 2. norm_vi(text) — mirror frontend/src/lib/textUtils.ts:15-21 tuyệt đối:
--    lower -> NFD -> bỏ combining marks (U+0300-036F) -> đ/Đ -> d.
--    KHÔNG dùng extension unaccent (đã chốt M0-T4). replace đ/Đ đặt SAU
--    normalize NFD vì đ/Đ (U+0111/U+0110) là base character riêng, NFD
--    không decompose thành d + dấu (xem docs/learnings/2026-07-11-search-normalize-vi.md).
-- =====================================================================
create or replace function norm_vi(t text)
returns text
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select replace(
           replace(
             regexp_replace(normalize(lower(coalesce(t, '')), NFD), E'[̀-ͯ]', '', 'g'),
             'đ', 'd'
           ),
           'Đ', 'd'
         )
$$;

-- =====================================================================
-- 3. pr_effective(id, target, state) — eff_received/eff_state tính TỪ
--    payment_lines (mirror _line_net + _sum_paid_amount + _compute_state,
--    backend/payment_request_routes.py:270-296) — KHÔNG đọc cột
--    payment_requests.received/state trực tiếp (cột này có thể drift,
--    xem plan §M0-N1 + Phụ lục B: 1 PR lệch ghi nhận trên prod PR-2026-0222).
--    Nhận target/state từ caller (đã có sẵn trong payment_requests row đang
--    quét) để tránh SELECT lại payment_requests bên trong hàm này.
-- =====================================================================
create or replace function pr_effective(p_pr_id text, p_target bigint, p_state text)
returns table (recv bigint, st text)
language sql stable parallel safe
set search_path = public, pg_temp
as $$
  with r as (
    select coalesce(sum(
      case
        when lower(coalesce(l.method, '')) in ('card', 'installment')
             and coalesce(l.verified_received, 0) <> 0
        then l.verified_received
        else l.amount
      end
    ) filter (where lower(coalesce(l.status, '')) = 'paid'), 0)::bigint as recv
    from payment_lines l
    where l.payment_request_id = p_pr_id
  )
  select
    r.recv,
    case
      when p_state = 'cancelled' then 'cancelled'
      when r.recv <= 0 then 'pending'
      when r.recv < p_target then 'short'
      when r.recv = p_target then 'done'
      else 'over'
    end as st
  from r
$$;

-- =====================================================================
-- 4. pr_list_page — trang 50 dòng (pager số, KHÔNG keyset cursor).
--    Search field-by-field (KHÔNG concat bằng ' ') — mirror
--    paymentRequestMatchesSearch (paymentRequestUtils.ts:53-67) +
--    phoneMatchesQuery (phoneSearch.ts) 2 chiều, có ESCAPE LIKE (\, %, _)
--    và guard length(pd) >= 4 (bug SĐT rỗng đã sửa — position('' in x) = 1).
-- =====================================================================
create or replace function pr_list_page(
  p_emails text[], p_is_test boolean, p_from timestamptz, p_to timestamptz,
  p_bucket text, p_state text, p_tvts text[], p_q text, p_limit int, p_offset int
)
returns table (pr jsonb, filtered_total bigint)
language sql stable
set search_path = public, pg_temp
as $$
  with q as (
    select
      norm_vi(p_q) as nq,
      coalesce(p_q, '') ~ '^[+0-9][0-9\s().-]*$' as is_phone,
      regexp_replace(regexp_replace(coalesce(p_q, ''), '[^0-9]', '', 'g'), '^0+', '') as qd,
      replace(replace(replace(norm_vi(p_q), '\', '\\'), '%', '\%'), '_', '\_') as nq_like
  ),
  scoped as (
    select p.*
    from payment_requests p
    where (p_emails is null or lower(coalesce(p.sale_email, '')) = any(p_emails))
      and (p_is_test is null or coalesce(p.is_test, false) = p_is_test)
      and (p_from is null or p.created_at >= p_from)
      and (p_to is null or p.created_at <= p_to)
      and (
        p_tvts is null
        or lower(coalesce(p.sale_email, '')) = any(p_tvts)
        or ('__unknown_tvts__' = any(p_tvts) and coalesce(p.sale_email, '') = '')
      )
  ),
  eff as (
    select s.*, e.recv as eff_received, e.st as eff_state
    from scoped s
    cross join lateral pr_effective(s.id, s.target, s.state) e
  ),
  filtered as (
    select eff.*
    from eff, q
    where (
      case p_bucket
        when 'cancelled' then eff.eff_state = 'cancelled'
        when 'created' then eff.eff_state <> 'cancelled'
             and exists (select 1 from active_requests a where a.pr_id = eff.id)
        else eff.eff_state <> 'cancelled'
      end
    )
    and (p_state is null or p_bucket = 'cancelled' or eff.eff_state = p_state)
    and (
      q.nq = '' or
      norm_vi(eff.id) like '%' || q.nq_like || '%' escape '\' or
      norm_vi(eff.name) like '%' || q.nq_like || '%' escape '\' or
      norm_vi(eff.uid) like '%' || q.nq_like || '%' escape '\' or
      norm_vi(eff.phone) like '%' || q.nq_like || '%' escape '\' or
      norm_vi(eff.child_name) like '%' || q.nq_like || '%' escape '\' or
      exists (
        select 1 from jsonb_array_elements(coalesce(eff.extra_children, '[]'::jsonb)) c
        where norm_vi(c ->> 'name') like '%' || q.nq_like || '%' escape '\'
      ) or
      (
        -- SĐT 2 chiều — guard length(pd) >= 4 TRƯỚC position()/like (bug SĐT rỗng, xem đầu file).
        q.is_phone and length(q.qd) >= 4 and
        length(regexp_replace(regexp_replace(coalesce(eff.phone, ''), '[^0-9]', '', 'g'), '^0+', '')) >= 4 and
        (
          regexp_replace(regexp_replace(coalesce(eff.phone, ''), '[^0-9]', '', 'g'), '^0+', '') like '%' || q.qd || '%'
          or position(regexp_replace(regexp_replace(coalesce(eff.phone, ''), '[^0-9]', '', 'g'), '^0+', '') in q.qd) > 0
        )
      )
    )
  )
  select to_jsonb(filtered) as pr, count(*) over () as filtered_total
  from filtered
  order by filtered.created_at desc, filtered.id desc
  limit p_limit offset p_offset
$$;

-- =====================================================================
-- 5. pr_list_summary — chips/tabs/kpi/tvts/has_pending_qr cho toàn bộ
--    trang (không phải chỉ 50 dòng đang xem). Mirror chính xác
--    PaymentRequestsTab.tsx:133-238 + PaymentRequestKpiCards.tsx:6-15 +
--    deriveTvtsOptions (paymentRequestUtils.ts:1042-1063) + hasPendingQrPayments
--    (paymentRequestUtils.ts:814-822, quyết định (b) — theo created_at PR).
--    tvts KHÔNG lọc theo ngày/tvts (mirror deriveTvtsOptions dùng visibleRequests,
--    tức TRƯỚC dateFiltered/tvtsFiltered) + KHÔNG sort (quyết định (c), FE sort).
--    has_pending_qr KHÔNG lọc is_test/ngày/tvts (mirror PaymentFlowContext.tsx:228
--    dùng "requests" gốc, chưa qua hideTest/dateRange/tvts filter của tab).
-- =====================================================================
create or replace function pr_list_summary(
  p_emails text[], p_is_test boolean, p_from timestamptz, p_to timestamptz, p_tvts text[]
)
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  with base as (
    -- Scope RBAC + is_test — dùng cho tvts (deriveTvtsOptions chạy trên visibleRequests).
    select p.*
    from payment_requests p
    where (p_emails is null or lower(coalesce(p.sale_email, '')) = any(p_emails))
      and (p_is_test is null or coalesce(p.is_test, false) = p_is_test)
  ),
  scoped as (
    -- + tvts filter (tvtsFiltered)
    select b.*
    from base b
    where (
      p_tvts is null
      or lower(coalesce(b.sale_email, '')) = any(p_tvts)
      or ('__unknown_tvts__' = any(p_tvts) and coalesce(b.sale_email, '') = '')
    )
  ),
  date_filtered as (
    -- + date range filter (dateFiltered)
    select s.*
    from scoped s
    where (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at <= p_to)
  ),
  eff as (
    select d.*, e.recv as eff_received, e.st as eff_state
    from date_filtered d
    cross join lateral pr_effective(d.id, d.target, d.state) e
  ),
  tracking as (
    select * from eff where eff_state <> 'cancelled'
  ),
  chips_agg as (
    select
      count(*) as c_all,
      count(*) filter (where eff_state = 'pending') as c_pending,
      count(*) filter (where eff_state = 'short') as c_short,
      count(*) filter (where eff_state = 'done') as c_done,
      count(*) filter (where eff_state = 'over') as c_over,
      coalesce(sum(eff_received), 0) as c_received,
      coalesce(sum(target), 0) as c_target
    from tracking
  ),
  created_count as (
    select count(*) as n
    from tracking t
    where exists (select 1 from active_requests a where a.pr_id = t.id)
  ),
  cancelled_count as (
    select count(*) as n from eff where eff_state = 'cancelled'
  ),
  tvts_agg as (
    select
      coalesce(nullif(lower(trim(sale_email)), ''), '__unknown_tvts__') as email,
      count(*) as cnt
    from base
    group by 1
  ),
  qr_flag as (
    -- has_pending_qr: scope RBAC only (quyết định (b) + mirror :228 dùng requests
    -- gốc chưa lọc is_test/ngày/tvts).
    select exists (
      select 1
      from payment_requests p
      join payment_lines l on l.payment_request_id = p.id
      where (p_emails is null or lower(coalesce(p.sale_email, '')) = any(p_emails))
        and p.state <> 'cancelled'
        and p.created_at >= now() - interval '30 days'
        and l.method = 'qr' and l.status = 'pending'
    ) as flag
  )
  select jsonb_build_object(
    'chips', jsonb_build_object(
      'all', chips_agg.c_all, 'pending', chips_agg.c_pending, 'short', chips_agg.c_short,
      'done', chips_agg.c_done, 'over', chips_agg.c_over
    ),
    'tabs', jsonb_build_object(
      'tracking', chips_agg.c_all,
      'created', created_count.n,
      'cancelled', cancelled_count.n
    ),
    'kpi', jsonb_build_object(
      'total', chips_agg.c_all, 'done', chips_agg.c_done, 'over', chips_agg.c_over,
      'short', chips_agg.c_short + chips_agg.c_pending,
      'received', chips_agg.c_received, 'target', chips_agg.c_target
    ),
    'tvts', (select coalesce(jsonb_agg(jsonb_build_object('email', email, 'count', cnt)), '[]'::jsonb) from tvts_agg),
    'has_pending_qr', (select flag from qr_flag)
  )
  from chips_agg, created_count, cancelled_count
$$;

-- =====================================================================
-- 6. Bảo mật: chỉ backend (service_role) gọi qua PostgREST — pattern
--    2026-07-06-security-revoke-rpc (mẫu 2026-07-10-zalo-bill-uploaded-event.sql:97-99).
--    BE dùng service key (backend/main.py:287) — THIẾU GRANT = 503 khi gọi RPC.
-- =====================================================================
revoke execute on function norm_vi(text) from public, anon, authenticated;
revoke execute on function pr_effective(text, bigint, text) from public, anon, authenticated;
revoke execute on function pr_list_page(text[], boolean, timestamptz, timestamptz, text, text, text[], text, int, int) from public, anon, authenticated;
revoke execute on function pr_list_summary(text[], boolean, timestamptz, timestamptz, text[]) from public, anon, authenticated;

grant execute on function norm_vi(text) to service_role;
grant execute on function pr_effective(text, bigint, text) to service_role;
grant execute on function pr_list_page(text[], boolean, timestamptz, timestamptz, text, text, text[], text, int, int) to service_role;
grant execute on function pr_list_summary(text[], boolean, timestamptz, timestamptz, text[]) to service_role;

notify pgrst, 'reload schema';

-- =====================================================================
-- ROLLBACK (chạy tay nếu cần lùi lại — không mất dữ liệu, chỉ xoá function/index):
--
-- drop function if exists pr_list_summary(text[], boolean, timestamptz, timestamptz, text[]);
-- drop function if exists pr_list_page(text[], boolean, timestamptz, timestamptz, text, text, text[], text, int, int);
-- drop function if exists pr_effective(text, bigint, text);
-- drop function if exists norm_vi(text);
-- drop index if exists idx_pr_created_at_id_desc;
-- drop index if exists idx_payment_lines_pending_qr;
-- notify pgrst, 'reload schema';
-- =====================================================================
