-- Bill image for B1/B2 payment lines (upload → Supabase Storage bucket `bills`).
-- REQUIRED: run in Supabase SQL Editor, then:
--   NOTIFY pgrst, 'reload schema';

ALTER TABLE public.payment_lines
  ADD COLUMN IF NOT EXISTS bill_image text;

NOTIFY pgrst, 'reload schema';