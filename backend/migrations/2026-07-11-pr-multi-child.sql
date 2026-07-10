-- Migration: PR multi-con — extra_children + payment_lines.student_name
-- Plan: docs/superpowers/plans/2026-07-10-pr-multi-con-va-ar-modal-mo-rong.md
-- Spec: docs/superpowers/specs/2026-07-07-pr-multi-con-design.md
--
-- ĐẶT TÊN 2026-07-11 (sau 2026-07-10-zalo-payment-paid-net-amount.sql) CÓ CHỦ ĐÍCH:
-- function build_payment_paid_message dưới đây copy từ bản net-amount + thêm
-- student_name. Replay migrations theo thứ tự tên file phải áp bản này SAU CÙNG,
-- không thì bản net-amount đè mất dòng student_name.
--
-- Idempotent. Date: 2026-07-10 (chạy thật), tên file 2026-07-11 vì lý do ordering trên.

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS extra_children jsonb;
COMMENT ON COLUMN public.payment_requests.extra_children IS
  'Bé thứ 2 trở đi: [{"name": text, "uid": text|null}]. Bé 1 = child_name + uid.';

ALTER TABLE public.payment_lines
  ADD COLUMN IF NOT EXISTS student_name text;
COMMENT ON COLUMN public.payment_lines.student_name IS
  'Lần TT của bé nào. NULL = bé chính (child_name của PR).';

-- ============================================================================
-- build_payment_paid_message — base: 2026-07-10-zalo-payment-paid-net-amount.sql
-- Thay đổi DUY NHẤT: thêm dòng v_child := COALESCE(NULLIF(line_row.student_name...
-- ngay sau SELECT ... INTO (multi-con: lần TT gắn bé nào thì báo tên bé đó).
-- ============================================================================
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
  v_amount_label TEXT;
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

  -- Multi-con: lần TT gắn bé nào thì báo tên bé đó
  v_child := COALESCE(NULLIF(line_row.student_name, ''), v_child);

  IF LOWER(COALESCE(line_row.method, '')) IN ('card', 'installment') THEN
    IF line_row.verified_received IS NOT NULL THEN
      v_amount_label := 'Thực nhận';
      v_amount_fmt := to_char(line_row.verified_received, 'FM999,999,999,999');
    ELSE
      v_amount_label := 'Số tiền (Gross)';
      v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');
    END IF;
  ELSE
    v_amount_label := 'Số tiền';
    v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');
  END IF;

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
    format(E'\U0001F538 %s: %s VND lúc %s - %s',
           v_amount_label,
           v_amount_fmt,
           COALESCE(v_time_fmt, '?'),
           v_method_label);
END;
$function$;

NOTIFY pgrst, 'reload schema';
