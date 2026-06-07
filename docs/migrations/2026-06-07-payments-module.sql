-- GĐ1 — Module Quản lý Doanh thu (payments) — song song Sổ doanh thu cũ
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Master tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  uid         text PRIMARY KEY,
  full_name   text,
  phone       text,
  first_seen  date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  short_code  text,
  team        text,
  khoi        text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.channels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_code  text,
  name          text,
  type          text
);

CREATE TABLE IF NOT EXISTS public.packages (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name   text NOT NULL,
  fixed  text
);

-- ---------------------------------------------------------------------------
-- Core payments (payment_id = PK, not "id")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  payment_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid           text NOT NULL REFERENCES public.customers(uid),
  pay_time      timestamptz NOT NULL,
  bank_day      date,
  package_id    uuid REFERENCES public.packages(id),
  payment_seq   text,
  real_pay_vnd  numeric NOT NULL,
  gmv_rmb       numeric,
  gmv_final     numeric,
  channel_id    uuid REFERENCES public.channels(id),
  sale_id       uuid NOT NULL REFERENCES public.sales(id),
  team          text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  note          text,
  crm_order_id  text,
  crm_activated boolean NOT NULL DEFAULT false,
  activated_at  date,
  bank_matched  boolean NOT NULL DEFAULT false,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_status_check CHECK (status IN ('active', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_payments_pay_time ON public.payments (pay_time);
CREATE INDEX IF NOT EXISTS idx_payments_uid ON public.payments (uid);
CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON public.payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_channel_id ON public.payments (channel_id);
CREATE INDEX IF NOT EXISTS idx_payments_package_id ON public.payments (package_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON public.payments (deleted_at);

CREATE UNIQUE INDEX IF NOT EXISTS payments_bizkey
  ON public.payments (uid, pay_time, real_pay_vnd)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Future tables (GĐ1 schema only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  txn_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date               date,
  amount             numeric,
  content            text,
  matched_payment_id uuid REFERENCES public.payments(payment_id)
);

CREATE TABLE IF NOT EXISTS public.crm_orders (
  crm_order_id text PRIMARY KEY,
  uid          text REFERENCES public.customers(uid),
  course       text,
  activated    boolean,
  activated_at date
);

-- ---------------------------------------------------------------------------
-- Duplicate check helper (optional warnings / import guard)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_payment_duplicate(
  p_uid text,
  p_pay_time timestamptz,
  p_real_pay_vnd numeric
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.uid = p_uid
      AND p.pay_time = p_pay_time
      AND p.real_pay_vnd = p_real_pay_vnd
      AND p.deleted_at IS NULL
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS (service_role backend)
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_service_all ON public.customers;
CREATE POLICY customers_service_all ON public.customers
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sales_service_all ON public.sales;
CREATE POLICY sales_service_all ON public.sales
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS channels_service_all ON public.channels;
CREATE POLICY channels_service_all ON public.channels
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS packages_service_all ON public.packages;
CREATE POLICY packages_service_all
  ON public.packages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS payments_service_all ON public.payments;
CREATE POLICY payments_service_all ON public.payments
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bank_transactions_service_all ON public.bank_transactions;
CREATE POLICY bank_transactions_service_all ON public.bank_transactions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_orders_service_all ON public.crm_orders;
CREATE POLICY crm_orders_service_all ON public.crm_orders
  FOR ALL USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.check_payment_duplicate(text, timestamptz, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
