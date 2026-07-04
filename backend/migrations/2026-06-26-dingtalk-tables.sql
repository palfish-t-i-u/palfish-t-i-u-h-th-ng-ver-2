-- backend/migrations/2026-06-26-dingtalk-tables.sql
-- Migration: DingTalk group robot notification tables + triggers + builders
-- Target: PRODUCTION (jozcvbbypwvzaefteoxn) + sandbox (pxgybyfiwywksesyogti)
-- Date: 2026-06-26
-- Prerequisite: payment_lines, active_requests, payment_requests, nhan_su_sale exist
-- AND functions build_payment_paid_message, build_course_activated_message exist (from 2026-06-23-zalo-oa-tables.sql)
-- Note: Apply on sandbox first, smoke-test, then prod.

-- =============================================
-- 1. Tables
-- =============================================

CREATE TABLE IF NOT EXISTS public.dingtalk_team_groups (
  team_code TEXT PRIMARY KEY,
  webhook_url TEXT NOT NULL,
  secret TEXT NOT NULL,
  group_name TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dingtalk_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  team_code TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  retries INTEGER DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  dingtalk_message_id TEXT,
  UNIQUE(source_table, source_id, event_type),
  CONSTRAINT dingtalk_outbox_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'payment_paid'::text,
      'course_activated'::text,
      'activation_urgent_reminder'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS idx_dingtalk_outbox_pending
  ON public.dingtalk_outbox (next_retry_at) WHERE sent_at IS NULL;

-- =============================================
-- 2. Trigger functions (enqueue DingTalk in parallel with Zalo)
-- =============================================

CREATE OR REPLACE FUNCTION public.fn_payment_paid_dingtalk_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team TEXT;
  v_team_code TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.payment_request_id
      LIMIT 1;

    SELECT team_code INTO v_team_code
      FROM public.dingtalk_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_team_code IS NULL THEN
      RAISE WARNING 'No active DingTalk group mapping for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_payment_paid_message(NEW);

    INSERT INTO public.dingtalk_outbox (event_type, source_table, source_id, team_code, message)
    VALUES ('payment_paid', 'payment_lines', NEW.id, v_team_code, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_course_activated_dingtalk_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team TEXT;
  v_team_code TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = 'activated' AND (OLD.status IS NULL OR OLD.status != 'activated') THEN
    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.pr_id
      LIMIT 1;

    SELECT team_code INTO v_team_code
      FROM public.dingtalk_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_team_code IS NULL THEN
      RAISE WARNING 'No active DingTalk group mapping for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_course_activated_message(NEW);

    INSERT INTO public.dingtalk_outbox (event_type, source_table, source_id, team_code, message)
    VALUES ('course_activated', 'active_requests', md5(NEW.id::text)::uuid, v_team_code, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- =============================================
-- 3. Triggers
-- =============================================

DROP TRIGGER IF EXISTS trg_payment_paid_dingtalk ON public.payment_lines;
CREATE TRIGGER trg_payment_paid_dingtalk
  AFTER UPDATE ON public.payment_lines
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION fn_payment_paid_dingtalk_notify();

DROP TRIGGER IF EXISTS trg_course_activated_dingtalk ON public.active_requests;
CREATE TRIGGER trg_course_activated_dingtalk
  AFTER UPDATE ON public.active_requests
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION fn_course_activated_dingtalk_notify();
