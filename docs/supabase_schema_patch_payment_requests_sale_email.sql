-- Add sale_email for RBAC scope in Payment Requests (BE Task 1)
-- Run in Supabase SQL Editor (project env being tested)

BEGIN;

ALTER TABLE public.payment_requests
ADD COLUMN IF NOT EXISTS sale_email text;

CREATE INDEX IF NOT EXISTS idx_payment_requests_sale_email
ON public.payment_requests (sale_email);

COMMIT;

-- IMPORTANT: reload PostgREST schema cache to avoid PGRST204
NOTIFY pgrst, 'reload schema';
