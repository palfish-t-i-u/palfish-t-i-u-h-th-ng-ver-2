-- Cancel metadata for payment_requests (B1 cancel flow).
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

alter table public.payment_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_reason text;

notify pgrst, 'reload schema';
