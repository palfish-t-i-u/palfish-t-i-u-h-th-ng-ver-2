-- Migration: Enrich build_payment_paid_message with child_name + phone (multi-line format)
-- Base: 2026-06-23-zalo-oa-tables.sql
-- Format mới:
--   💰 ĐÃ VÀO - KH {name}[ - Bé {child_name}] - ĐT: {phone|chưa cung cấp}
--   🔸 Sale {sale_name} · Team {team}
--   🔸 Số tiền: {amount} VND lúc {HH:MM DD/MM/YYYY}
-- Trigger + event_type + routing giữ nguyên
-- Idempotent: CREATE OR REPLACE
-- Date: 2026-07-04

CREATE OR REPLACE FUNCTION public.build_payment_paid_message(line_row payment_lines)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_customer   TEXT;
  v_child      TEXT;
  v_phone      TEXT;
  v_sale_team  TEXT;
  v_sale_name  TEXT;
  v_amount_fmt TEXT;
  v_time_fmt   TEXT;
  v_header     TEXT;
BEGIN
  SELECT pr.sale_email, pr.name, pr.child_name, pr.phone, ns.team,
         COALESCE(ns.display_name, ns.crm_name)
    INTO v_sale_email, v_customer, v_child, v_phone, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = line_row.payment_request_id
    LIMIT 1;

  v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');
  v_time_fmt := to_char(
    COALESCE(line_row.paid_at, line_row.confirmed_at, line_row.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'HH24:MI DD/MM/YYYY'
  );

  -- Header: KH + (Bé nếu có) + ĐT
  v_header := format(E'\U0001F4B0 ĐÃ VÀO - KH %s',
                     COALESCE(NULLIF(TRIM(v_customer), ''), '?'));

  IF v_child IS NOT NULL AND TRIM(v_child) <> '' THEN
    v_header := v_header || format(' - Bé %s', TRIM(v_child));
  END IF;

  v_header := v_header || format(' - ĐT: %s',
    COALESCE(NULLIF(TRIM(v_phone), ''), 'chưa cung cấp'));

  RETURN v_header || E'\n' ||
    format(E'\U0001F538 Sale %s · Team %s',
           COALESCE(NULLIF(TRIM(v_sale_name), ''), NULLIF(TRIM(v_sale_email), ''), '?'),
           COALESCE(NULLIF(TRIM(v_sale_team), ''), '?')) ||
    E'\n' ||
    format(E'\U0001F538 Số tiền: %s VND lúc %s',
           v_amount_fmt,
           COALESCE(v_time_fmt, '?'));
END;
$function$;
