-- Migration: Append payment method label to build_payment_paid_message
-- Format: "🔸 Số tiền: {amount} VND lúc {time} - {method_label}"
-- method_label:
--   qr          → "Chuyển khoản QR"
--   cash        → "Tiền mặt"
--   card        → "Thẻ"
--   installment → "Trả góp {platform}" (VD: "Trả góp Payoo") hoặc "Trả góp"
--   khác        → "?"
-- Base: 2026-07-04-zalo-phone-intl-format.sql
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
  v_country    TEXT;
  v_sale_team  TEXT;
  v_sale_name  TEXT;
  v_amount_fmt TEXT;
  v_time_fmt   TEXT;
  v_phone_fmt  TEXT;
  v_header     TEXT;
  v_method_label TEXT;
BEGIN
  SELECT pr.sale_email, pr.name, pr.child_name, pr.phone, pr.country, ns.team,
         COALESCE(ns.display_name, ns.crm_name)
    INTO v_sale_email, v_customer, v_child, v_phone, v_country, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = line_row.payment_request_id
    LIMIT 1;

  v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');
  v_time_fmt := to_char(
    COALESCE(line_row.paid_at, line_row.confirmed_at, line_row.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'HH24:MI DD/MM/YYYY'
  );
  v_phone_fmt := public.format_phone_intl(v_phone, v_country);

  v_method_label := CASE LOWER(COALESCE(line_row.method, ''))
    WHEN 'qr' THEN 'Chuyển khoản QR'
    WHEN 'cash' THEN 'Tiền mặt'
    WHEN 'card' THEN 'Thẻ'
    WHEN 'installment' THEN
      CASE WHEN COALESCE(NULLIF(TRIM(line_row.installment_platform), ''), '') <> ''
           THEN 'Trả góp ' || TRIM(line_row.installment_platform)
           ELSE 'Trả góp' END
    ELSE '?'
  END;

  v_header := format(E'\U0001F4B0 ĐÃ VÀO - KH %s',
                     COALESCE(NULLIF(TRIM(v_customer), ''), '?'));

  IF v_child IS NOT NULL AND TRIM(v_child) <> '' THEN
    v_header := v_header || format(' - Bé %s', TRIM(v_child));
  END IF;

  v_header := v_header || format(' - ĐT: %s' || E'​',
    COALESCE(NULLIF(TRIM(v_phone_fmt), ''), 'chưa cung cấp'));

  RETURN v_header || E'\n' ||
    format(E'\U0001F538 Sale %s · Team %s',
           COALESCE(NULLIF(TRIM(v_sale_name), ''), NULLIF(TRIM(v_sale_email), ''), '?'),
           COALESCE(NULLIF(TRIM(v_sale_team), ''), '?')) ||
    E'\n' ||
    format(E'\U0001F538 Số tiền: %s VND lúc %s - %s',
           v_amount_fmt,
           COALESCE(v_time_fmt, '?'),
           v_method_label);
END;
$function$;
