-- ============================================================================
-- Migration: Fix SePay transaction_date timezone (double UTC+7 bug)
-- Date: 2026-06-21
-- Problem: SePay sends Vietnam local time (UTC+7) but backend stored it as
--          naive datetime → Postgres treated as UTC → FE added +7 again
-- Fix: Subtract 7 hours from all existing SePay bank_transactions
-- Run in Supabase SQL Editor on BOTH sandbox and prod
-- ============================================================================

-- Dry-run: preview affected rows (run this SELECT first)
-- SELECT id, transaction_date,
--        transaction_date - INTERVAL '7 hours' AS corrected
-- FROM public.bank_transactions
-- WHERE gateway IN ('sepay_webhook', 'sepay_poll')
--   AND transaction_date IS NOT NULL
-- ORDER BY transaction_date DESC
-- LIMIT 20;

-- Apply fix
UPDATE public.bank_transactions
SET transaction_date = transaction_date - INTERVAL '7 hours',
    updated_at = NOW()
WHERE gateway IN ('sepay_webhook', 'sepay_poll')
  AND transaction_date IS NOT NULL;

NOTIFY pgrst, 'reload schema';
