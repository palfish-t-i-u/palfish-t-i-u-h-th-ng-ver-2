-- B3 — Standalone Active Request (không gắn Payment Request).
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

ALTER TABLE public.active_requests DROP CONSTRAINT IF EXISTS active_requests_pr_id_fkey;

ALTER TABLE public.active_requests
  ALTER COLUMN pr_id DROP NOT NULL;

ALTER TABLE public.active_requests
  ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'active_requests_pr_id_fkey'
  ) THEN
    ALTER TABLE public.active_requests
      ADD CONSTRAINT active_requests_pr_id_fkey
      FOREIGN KEY (pr_id) REFERENCES public.payment_requests (id) ON DELETE RESTRICT;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'active_requests_pr_id_fkey: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
