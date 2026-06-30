-- Migration: Fix Zalo message showing email instead of sale name
-- Problem: display_name column is NULL for all sales; crm_name has actual names
-- Fix: COALESCE(display_name, crm_name) so it falls back to crm_name
-- Target: PRODUCTION (jozcvbbypwvzaefteoxn)
-- Date: 2026-06-29
-- Idempotent: CREATE OR REPLACE

-- 1. Fix build_payment_paid_message
CREATE OR REPLACE FUNCTION public.build_payment_paid_message(line_row public.payment_lines)
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
  SELECT pr.sale_email, pr.name, ns.team, COALESCE(ns.display_name, ns.crm_name)
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
    E'\U0001F4B0 Đã vào - KH %s | Sale %s · Team %s | %sđ | %s',
    COALESCE(v_customer, '?'),
    COALESCE(v_sale_name, v_sale_email, '?'),
    COALESCE(NULLIF(v_sale_team, ''), '?'),
    v_amount_fmt,
    COALESCE(v_time_fmt, '?')
  );
END;
$function$;

-- 2. Fix build_course_activated_message
CREATE OR REPLACE FUNCTION public.build_course_activated_message(ar_row public.active_requests)
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

  SELECT pr.sale_email, pr.name, ns.team, COALESCE(ns.display_name, ns.crm_name)
    INTO v_sale_email, v_customer_from_pr, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = ar_row.pr_id
    LIMIT 1;

  RETURN format(
    E'✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC — KH %s của %s · Team %s với gói %s',
    COALESCE(ar_row.customer_name, v_customer_from_pr, '?'),
    COALESCE(v_sale_name, v_sale_email, '?'),
    COALESCE(NULLIF(v_sale_team, ''), '?'),
    CASE WHEN v_courses_list = '' THEN '?' ELSE v_courses_list END
  );
END;
$function$;
