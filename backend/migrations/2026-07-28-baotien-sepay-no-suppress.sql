-- 2026-07-28: SePay auto-confirm không bao giờ suppress tin "báo tiền về"
--
-- Bug: SePay trả transaction_date làm tròn về đầu phút (15:13:00) còn
-- payment_lines.created_at chính xác microsecond (15:13:18). KH chuyển
-- trong cùng phút với lúc tạo lần TT → v_pay_time < created_at →
-- suppress nhầm (mất tin PR-2026-0603 lần #2, PR-2026-0604 lần #1, 27/7).
--
-- Fix: suppress theo NGUỒN xác nhận thay vì đoán mò thời gian.
-- confirmed_source='sepay' chỉ set từ SePay webhook (sepay_routes.py) =
-- tiền vừa về real-time (transfer_code sinh cùng lần TT, không thể chuyển
-- đúng mã trước khi lần TT tồn tại) → luôn báo, bỏ so timestamp.
-- Ghép tay (manual) giữ suppress theo thời gian như cũ — tiền cũ thật
-- lệch hàng giờ/ngày, không dính lỗi làm tròn phút.
--
-- Idempotent: CREATE OR REPLACE.
-- Reversible: chạy lại migration 2026-07-20-allow-baotien-card-installment.sql

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

    -- Suppress CHỈ cho ghép tay/nguồn khác với tiền về trước lần TT.
    -- SePay webhook (confirmed_source='sepay') = real-time → không bao giờ suppress.
    -- Thẻ/trả góp → luôn báo (kế toán ghép mPOS/Payoo = xác nhận thủ công).
    IF v_pay_time IS NOT NULL
       AND v_pay_time < NEW.created_at
       AND COALESCE(NEW.method, '') NOT IN ('card', 'installment')
       AND COALESCE(NEW.confirmed_source, '') <> 'sepay' THEN
      RAISE NOTICE '[zalo] payment_paid suppressed: pay_time=% < line.created_at=% line_id=% source=%',
        v_pay_time, NEW.created_at, NEW.id, NEW.confirmed_source;
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
