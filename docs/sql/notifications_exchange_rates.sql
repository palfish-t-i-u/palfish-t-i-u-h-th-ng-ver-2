-- PR4 2026-06-13: in-app notifications + date-based exchange rates
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  text NOT NULL,
  kind        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_email, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_created_at_idx
  ON public.notifications (user_email, created_at DESC);

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  effective_from date PRIMARY KEY,
  rate           numeric(10, 4) NOT NULL CHECK (rate > 0),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text
);

INSERT INTO public.exchange_rates (effective_from, rate, note)
VALUES ('2020-01-01', 3700, 'Default historical rate (pre-feature)')
ON CONFLICT (effective_from) DO NOTHING;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_service_all ON public.notifications;
CREATE POLICY notifications_service_all ON public.notifications
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS exchange_rates_service_all ON public.exchange_rates;
CREATE POLICY exchange_rates_service_all ON public.exchange_rates
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
