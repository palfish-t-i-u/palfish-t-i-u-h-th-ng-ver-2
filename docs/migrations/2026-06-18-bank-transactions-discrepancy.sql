-- Store amount discrepancy for manual external bank transaction matching.
-- Run in Supabase SQL Editor for sandbox and prod, then PostgREST reload is triggered.

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS discrepancy_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bank_transactions.discrepancy_amount IS
  'Chenh lech giua so tien giao dich ngan hang va so tien payment_line duoc ghep. Duong = thua, am = thieu, 0 = khop.';

NOTIFY pgrst, 'reload schema';
