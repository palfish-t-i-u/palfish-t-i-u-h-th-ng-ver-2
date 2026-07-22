-- 2026-07-20: Cho phép Zalo "báo tiền về" cho GD thẻ/trả góp kể cả tiền về trước lần TT
--
-- Vấn đề: kế toán ghép mPOS/Payoo xong → không có tin Zalo báo tiền
-- vì trigger suppress khi paid_at < created_at. Đúng cho CK (SePay),
-- nhưng SAI cho thẻ — ghép thẻ luôn do kế toán thủ công = xác nhận tiền.
--
-- Fix: thêm điều kiện method NOT IN ('card','installment') vào suppress.
-- Thẻ/trả góp → luôn báo. CK → giữ nguyên suppress cũ.
--
-- Idempotent: CREATE OR REPLACE. Reversible: chạy lại migration 2026-07-17.

CREATE OR REPLACE FUNCTION public.fn_payment_paid_zalo_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team  TEXT;
  v_group_id   TEXT;
  v_message    TEXT;
  v_pay_time   TIMESTAMPTZ;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN

    SELECT LEAST(
      (SELECT min(bt.transaction_date)
         FROM public.bank_transactions bt
        WHERE bt.payment_line_id = NEW.id),
      (SELECT min(gt.paid_at)
         FROM public.gateway_transactions gt
        WHERE gt.payment_line_id = NEW.id)
    ) INTO v_pay_time;

    -- Suppress CHỈ cho CK (bank transfer). Thẻ/trả góp luôn báo vì
    -- ghép mPOS/Payoo = kế toán xác nhận thủ công → cần thông báo.
    IF v_pay_time IS NOT NULL
       AND v_pay_time < NEW.created_at
       AND COALESCE(NEW.method, '') NOT IN ('card', 'installment') THEN
      RAISE NOTICE '[zalo] payment_paid suppressed: pay_time=% < line.created_at=% line_id=%',
        v_pay_time, NEW.created_at, NEW.id;
      RETURN NEW;
    END IF;

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

    PERFORM public.enqueue_bill_uploaded_zalo(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
