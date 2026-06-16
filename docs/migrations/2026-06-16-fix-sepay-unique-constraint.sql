-- ============================================================================
-- Migration: Fix SePay Unique Constraint for ON CONFLICT resolution
-- Date: 2026-06-16
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- 1. Drop the partial unique index (which cannot be used by ON CONFLICT targets)
DROP INDEX IF EXISTS public.bank_transactions_sepay_id_unique;

-- 2. Add a full UNIQUE constraint to sepay_id
-- This allows ON CONFLICT (sepay_id) DO NOTHING to resolve correctly,
-- while still allowing multiple NULL values in Postgres.
ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_sepay_id_unique UNIQUE (sepay_id);

-- 3. Reload schema
NOTIFY pgrst, 'reload schema';
