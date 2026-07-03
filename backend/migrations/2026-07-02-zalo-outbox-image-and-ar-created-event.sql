-- 1. Hỗ trợ ảnh trên outbox
ALTER TABLE public.zalo_outbox
  ADD COLUMN IF NOT EXISTS image_url     TEXT,
  ADD COLUMN IF NOT EXISTS image_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_error   TEXT;

-- 2. Event type mới: activation_request_created
ALTER TABLE public.zalo_outbox DROP CONSTRAINT IF EXISTS zalo_outbox_event_type_check;
ALTER TABLE public.zalo_outbox ADD CONSTRAINT zalo_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_paid'::text, 'course_activated'::text,
    'activation_urgent_reminder'::text, 'activation_request_created'::text]));
