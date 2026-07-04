-- Migration: Add format_phone_intl helper + apply to build_payment_paid_message
-- Format: {dial_code}-{local_number} (VD: 84-353748121)
-- Country dial code map: VN=84, CN=86, KR=82, US=1, JP=81; fallback = 84
-- Strip leading 0 và strip country code nếu đã có prefix.
-- Date: 2026-07-04

-- 1. Helper function
CREATE OR REPLACE FUNCTION public.format_phone_intl(phone TEXT, country TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits TEXT;
  v_cc     TEXT;
BEGIN
  IF phone IS NULL OR TRIM(phone) = '' THEN
    RETURN NULL;
  END IF;

  v_digits := regexp_replace(phone, '[^0-9]', '', 'g');
  IF v_digits = '' THEN
    RETURN phone;
  END IF;

  v_cc := CASE UPPER(COALESCE(NULLIF(TRIM(country), ''), 'VN'))
    WHEN 'VN' THEN '84'
    WHEN 'CN' THEN '86'
    WHEN 'KR' THEN '82'
    WHEN 'US' THEN '1'
    WHEN 'JP' THEN '81'
    WHEN 'TW' THEN '886'
    WHEN 'HK' THEN '852'
    WHEN 'SG' THEN '65'
    WHEN 'TH' THEN '66'
    WHEN 'PH' THEN '63'
    ELSE '84'
  END;

  v_digits := regexp_replace(v_digits, '^0+', '');

  IF LEFT(v_digits, LENGTH(v_cc)) = v_cc AND LENGTH(v_digits) > LENGTH(v_cc) + 5 THEN
    v_digits := SUBSTRING(v_digits FROM LENGTH(v_cc) + 1);
  END IF;

  RETURN v_cc || '-' || v_digits;
END;
$$;

-- 2. Update build_payment_paid_message to use format_phone_intl
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

  v_header := format(E'\U0001F4B0 ĐÃ VÀO - KH %s',
                     COALESCE(NULLIF(TRIM(v_customer), ''), '?'));

  IF v_child IS NOT NULL AND TRIM(v_child) <> '' THEN
    v_header := v_header || format(' - Bé %s', TRIM(v_child));
  END IF;

  v_header := v_header || format(' - ĐT: %s',
    COALESCE(NULLIF(TRIM(v_phone_fmt), ''), 'chưa cung cấp'));

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
