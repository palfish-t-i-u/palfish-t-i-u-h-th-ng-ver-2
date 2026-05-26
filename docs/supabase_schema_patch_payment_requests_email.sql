-- Add customer email to payment_requests (invoice export flow — B1).
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

alter table public.payment_requests
  add column if not exists email text not null default '';

notify pgrst, 'reload schema';
