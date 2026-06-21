-- Gateway reconciliation for mPOS / Payoo card transactions
-- Run in Supabase SQL Editor, then PostgREST reload is triggered at bottom.

CREATE TABLE IF NOT EXISTS public.gateway_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('mpos', 'payoo')),
  category text NOT NULL,
  txn_code text NOT NULL UNIQUE,
  settlement_code text,
  cardholder_name text,
  card_masked text,
  card_type text,
  amount numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  installment_term int,
  bank text,
  collector_region text,
  paid_at timestamptz,
  match_status text NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('pending', 'matched', 'ignored', 'needs_review')),
  payment_line_id uuid REFERENCES public.payment_lines(id),
  matched_by text,
  matched_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  parent_txn_id uuid REFERENCES public.gateway_transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_gateway_txns_source_status
  ON public.gateway_transactions (source, match_status);

CREATE INDEX IF NOT EXISTS idx_gateway_txns_paid_at
  ON public.gateway_transactions (paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_txns_payment_line
  ON public.gateway_transactions (payment_line_id);

CREATE INDEX IF NOT EXISTS idx_gateway_txns_settlement
  ON public.gateway_transactions (settlement_code);

CREATE TABLE IF NOT EXISTS public.gateway_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'mpos' CHECK (source IN ('mpos', 'payoo')),
  settlement_code text NOT NULL UNIQUE,
  created_date date,
  gross numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  bank text,
  branch text,
  account text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateway_settlements_created_date
  ON public.gateway_settlements (created_date DESC);

ALTER TABLE public.gateway_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gateway_transactions_service_all ON public.gateway_transactions;
CREATE POLICY gateway_transactions_service_all ON public.gateway_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS gateway_settlements_service_all ON public.gateway_settlements;
CREATE POLICY gateway_settlements_service_all ON public.gateway_settlements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
