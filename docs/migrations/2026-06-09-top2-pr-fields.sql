-- TOP2-01/02/03: lead_source, lead_channel, tax_id, customer_type, company_name
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS lead_channel TEXT;

NOTIFY pgrst, 'reload schema';
