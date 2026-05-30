-- Gamification dashboard RPC.
-- Run in Supabase SQL Editor, then PostgREST schema cache is reloaded below.

ALTER TABLE public.nhan_su_sale
ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE INDEX IF NOT EXISTS idx_payment_lines_status_paid_at
ON public.payment_lines (status, paid_at)
WHERE status = 'paid';

CREATE OR REPLACE FUNCTION public.get_top_sales(
  p_start timestamptz,
  p_end timestamptz,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  sale_email text,
  sale_name text,
  avatar_url text,
  total_revenue bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    pr.sale_email,
    COALESCE(
      NULLIF(ns.display_name, ''),
      NULLIF(SPLIT_PART(pr.sale_email, '@', 1), ''),
      'Unknown'
    ) AS sale_name,
    ns.avatar_url,
    COALESCE(SUM(pl.amount), 0)::bigint AS total_revenue
  FROM public.payment_lines pl
  JOIN public.payment_requests pr
    ON pr.id = pl.payment_request_id
  LEFT JOIN public.nhan_su_sale ns
    ON LOWER(ns.email) = LOWER(pr.sale_email)
  WHERE pl.status = 'paid'
    AND pl.paid_at >= p_start
    AND pl.paid_at < p_end
  GROUP BY pr.sale_email, ns.display_name, ns.avatar_url
  ORDER BY total_revenue DESC
  LIMIT p_limit;
$$;

NOTIFY pgrst, 'reload schema';
