-- TOP1-02: Accountant verified installment fields on payment_lines
ALTER TABLE public.payment_lines
  ADD COLUMN IF NOT EXISTS verified_total bigint,
  ADD COLUMN IF NOT EXISTS verified_received bigint;
