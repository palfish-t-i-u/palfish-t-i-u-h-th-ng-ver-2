-- ============================================================================
-- Migration: Fix SePay Unique Constraint for ON CONFLICT resolution
-- Date: 2026-06-16
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- 1. Drop the constraint nếu đã tồn tại (idempotency: chạy lại không báo
--    "constraint already exists"). Cũng drop luôn backing index của constraint.
ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_sepay_id_unique;

-- 2. Drop legacy partial unique index nếu vẫn còn (từ schema cũ trước migration này).
--    Đặt SAU DROP CONSTRAINT để tránh lỗi "cannot drop index ... because constraint requires it".
DROP INDEX IF EXISTS public.bank_transactions_sepay_id_unique;

-- 3. Add a full UNIQUE constraint to sepay_id.
--    This allows ON CONFLICT (sepay_id) DO NOTHING to resolve correctly,
--    while still allowing multiple NULL values in Postgres.
ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_sepay_id_unique UNIQUE (sepay_id);

-- 4. Reload schema
NOTIFY pgrst, 'reload schema';
