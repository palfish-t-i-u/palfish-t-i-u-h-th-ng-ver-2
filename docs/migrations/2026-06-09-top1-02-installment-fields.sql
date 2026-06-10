-- TOP1-02: Installment platform fields on payment_lines
ALTER TABLE public.payment_lines
  ADD COLUMN IF NOT EXISTS installment_platform text,
  ADD COLUMN IF NOT EXISTS installment_total bigint,
  ADD COLUMN IF NOT EXISTS sale_received bigint;
