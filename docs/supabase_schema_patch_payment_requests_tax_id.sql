-- Add tax_id to payment_requests.
-- Run in Supabase SQL Editor on sandbox and production.

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS tax_id text DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
