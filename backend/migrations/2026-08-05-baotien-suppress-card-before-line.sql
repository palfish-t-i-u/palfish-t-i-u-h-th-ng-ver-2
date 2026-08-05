-- 2026-08-05: Suppress tin "báo tiền về" cho MỌI phương thức khi tiền về
-- TRƯỚC thời điểm tạo lần TT — bỏ miễn trừ card/installment (migration 2026-07-20).
--
-- Rule (PM chốt 05/08): tiền về trước created_at của lần TT = booking hồi tố,
-- KHÔNG báo, bất kể CK/thẻ/trả góp. Đơn thẻ quẹt-trước-tạo-PR-sau (vd
-- PR-2026-0906: quẹt 04/08 01:18, tạo lần TT 05/08 14:10) không được spam nhóm.
--
-- An toàn (verify prod 05/08): mPOS/Payoo paid_at có giây THẬT (không làm tròn
-- phút như SePay) → không false-suppress do rounding; 0/45 line thẻ nằm trong
-- vùng [created_at, +60s); 17 line "trước" đều cách 4h–10 ngày = hồi tố thật.
--
-- Giữ carve-out SePay (confirmed_source='sepay'): SePay sinh transfer_code cùng
-- lần TT nên tiền không thể về trước thật; pay_time<created_at ở SePay chỉ là ảo
-- do làm tròn phút → vẫn phải báo.
--
-- Idempotent: CREATE OR REPLACE.
-- Reversible: chạy lại backend/migrations/2026-07-28-baotien-sepay-no-suppress.sql

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

    -- Suppress khi tiền về TRƯỚC lúc tạo lần TT (booking hồi tố) — áp cho MỌI
    -- method (CK ghép tay, thẻ, trả góp). Chỉ SePay-auto được miễn vì
    -- transaction_date làm tròn phút (tiền SePay không thể về trước thật).
    IF v_pay_time IS NOT NULL
       AND v_pay_time < NEW.created_at
       AND COALESCE(NEW.confirmed_source, '') <> 'sepay' THEN
      RAISE NOTICE '[zalo] payment_paid suppressed: pay_time=% < line.created_at=% line_id=% method=% source=%',
        v_pay_time, NEW.created_at, NEW.id, NEW.method, NEW.confirmed_source;
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
