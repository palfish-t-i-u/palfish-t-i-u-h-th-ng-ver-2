-- Migration: Ưu tiên báo SỐ TIỀN THỰC NHẬN (sau phí) cho quẹt thẻ/trả góp
-- Bug (10/7): tin "💰 ĐÃ VÀO" luôn báo line_row.amount (số gộp, trước phí
-- mPOS/Payoo trừ) — kế toán cần số thực đổ vào tài khoản để đối soát.
--
-- Cơ chế: match_gateway_txn (gateway_routes.py) giờ đã copy net_amount từ
-- gateway_transactions vào payment_lines.verified_received cùng lúc xác nhận
-- paid (xem docs/superpowers/plans/2026-07-10-bao-tien-net-amount.md).
-- Function này chỉ cần ưu tiên đọc verified_received khi có.
--
-- Label đổi theo (CHỈ áp dụng card/installment — cash/qr giữ nguyên "Số tiền"):
--   card/installment + có verified_received -> "Thực nhận: {net}"
--   card/installment + không có (fallback)   -> "Số tiền (Gross): {amount}"
--   method khác (cash/qr/...)                -> "Số tiền: {amount}" (không đổi)
--
-- Base: 2026-07-04-zalo-payment-paid-add-method.sql
-- Idempotent: CREATE OR REPLACE
-- Date: 2026-07-10

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
