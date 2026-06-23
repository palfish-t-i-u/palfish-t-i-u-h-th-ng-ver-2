-- Migration: Zalo OA notification tables + triggers + message builders
-- Target: PRODUCTION (jozcvbbypwvzaefteoxn)
-- Date: 2026-06-23
-- Prerequisite: tables payment_lines, active_requests, payment_requests, nhan_su_sale must exist

-- =============================================
-- 1. Tables
-- =============================================

CREATE TABLE IF NOT EXISTS public.zalo_oa_credentials (
  id SERIAL PRIMARY KEY,
  app_id TEXT NOT NULL,
  app_secret TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.zalo_team_groups (
  team_code TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  group_name TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.zalo_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  group_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  retries INTEGER DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  zalo_message_id TEXT,
  UNIQUE(source_table, source_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_zalo_outbox_pending
  ON public.zalo_outbox (next_retry_at) WHERE sent_at IS NULL;

-- =============================================
-- 2. Message builder functions (G1, G2)
-- =============================================

CREATE OR REPLACE FUNCTION public.build_payment_paid_message(line_row payment_lines)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_customer TEXT;
  v_sale_team TEXT;
  v_sale_name TEXT;
  v_amount_fmt TEXT;
  v_time_fmt TEXT;
BEGIN
  SELECT pr.sale_email, pr.name, ns.team, ns.display_name
    INTO v_sale_email, v_customer, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = line_row.payment_request_id
    LIMIT 1;

  v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');
  v_time_fmt := to_char(
    COALESCE(line_row.paid_at, line_row.confirmed_at, line_row.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'HH24:MI DD/MM/YYYY'
  );

  RETURN format(
    '💰 Đã vào - KH %s của %s thanh toán %sđ vào lúc %s',
    COALESCE(v_customer, '?'),
    COALESCE(v_sale_name, v_sale_email, '?'),
    v_amount_fmt,
    COALESCE(v_time_fmt, '?')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.build_course_activated_message(ar_row active_requests)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid_block JSONB;
  v_course JSONB;
  v_courses_list TEXT := '';
  v_sale_email TEXT;
  v_customer_from_pr TEXT;
  v_sale_team TEXT;
  v_sale_name TEXT;
BEGIN
  IF ar_row.uids_data IS NOT NULL AND jsonb_typeof(ar_row.uids_data) = 'array' THEN
    FOR v_uid_block IN SELECT * FROM jsonb_array_elements(ar_row.uids_data)
    LOOP
      IF jsonb_typeof(v_uid_block->'courses') = 'array' THEN
        FOR v_course IN SELECT * FROM jsonb_array_elements(v_uid_block->'courses')
        LOOP
          IF v_courses_list != '' THEN
            v_courses_list := v_courses_list || ', ';
          END IF;
          v_courses_list := v_courses_list || COALESCE(v_course->>'name', '?');
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  SELECT pr.sale_email, pr.name, ns.team, ns.display_name
    INTO v_sale_email, v_customer_from_pr, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = ar_row.pr_id
    LIMIT 1;

  RETURN format(
    '✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC — KH %s của %s với gói %s',
    COALESCE(ar_row.customer_name, v_customer_from_pr, '?'),
    COALESCE(v_sale_name, v_sale_email, '?'),
    CASE WHEN v_courses_list = '' THEN '?' ELSE v_courses_list END
  );
END;
$function$;

-- =============================================
-- 3. Trigger functions (Đạt)
-- =============================================

CREATE OR REPLACE FUNCTION public.fn_payment_paid_zalo_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team TEXT;
  v_group_id TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.payment_request_id
      LIMIT 1;

    SELECT group_id INTO v_group_id
      FROM public.zalo_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_group_id IS NULL THEN
      RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_payment_paid_message(NEW);

    INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message)
    VALUES ('payment_paid', 'payment_lines', NEW.id, v_group_id, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_course_activated_zalo_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team TEXT;
  v_group_id TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = 'activated' AND (OLD.status IS NULL OR OLD.status != 'activated') THEN
    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.pr_id
      LIMIT 1;

    SELECT group_id INTO v_group_id
      FROM public.zalo_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_group_id IS NULL THEN
      RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_course_activated_message(NEW);

    INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message)
    VALUES ('course_activated', 'active_requests', md5(NEW.id)::uuid, v_group_id, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- =============================================
-- 4. Triggers
-- =============================================

DROP TRIGGER IF EXISTS trg_payment_paid_zalo ON public.payment_lines;
CREATE TRIGGER trg_payment_paid_zalo
  AFTER UPDATE ON public.payment_lines
  FOR EACH ROW
  EXECUTE FUNCTION fn_payment_paid_zalo_notify();

DROP TRIGGER IF EXISTS trg_course_activated_zalo ON public.active_requests;
CREATE TRIGGER trg_course_activated_zalo
  AFTER UPDATE ON public.active_requests
  FOR EACH ROW
  EXECUTE FUNCTION fn_course_activated_zalo_notify();
