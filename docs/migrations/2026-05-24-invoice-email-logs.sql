-- Delivery log: kế toán ghi nhận đã gửi hóa đơn (email/zalo) từ hệ thống thuế
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.invoice_email_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active_request_id   text NOT NULL,
  payment_request_id  text,
  sent_to             text NOT NULL,
  sent_by_email       text NOT NULL,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  status              text NOT NULL,
  channel             text NOT NULL DEFAULT 'email',
  error_message       text,
  provider_message_id text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT invoice_email_logs_status_check
    CHECK (status IN ('sent', 'dry_run', 'failed')),
  CONSTRAINT invoice_email_logs_channel_check
    CHECK (channel IN ('email', 'zalo'))
);

ALTER TABLE public.invoice_email_logs
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';

ALTER TABLE public.invoice_email_logs DROP CONSTRAINT IF EXISTS invoice_email_logs_channel_check;
ALTER TABLE public.invoice_email_logs
  ADD CONSTRAINT invoice_email_logs_channel_check
  CHECK (channel IN ('email', 'zalo'));

CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_active_request_id
  ON public.invoice_email_logs (active_request_id);

CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_payment_request_id
  ON public.invoice_email_logs (payment_request_id);

CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_sent_at_desc
  ON public.invoice_email_logs (sent_at DESC);

ALTER TABLE public.invoice_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_email_logs_service_all ON public.invoice_email_logs;
CREATE POLICY invoice_email_logs_service_all ON public.invoice_email_logs
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
