-- 2026-07-17: Suppress "báo tiền về" khi giờ khách trả < giờ tạo lần TT
--
-- Vấn đề: khách CK từ đêm hôm trước, hôm sau sale mới tạo PR + lần TT, chiều
-- ghép xong → trigger vẫn bắn báo tiền → nhóm Zalo nhận tin cũ/nhầm.
--
-- Logic: trước khi enqueue zalo_outbox, tra xem giờ khách trả thật
-- (bank_transactions.transaction_date hoặc gateway_transactions.paid_at)
-- có sớm hơn thời điểm tạo lần TT (payment_lines.created_at) không.
-- Nếu CÓ → im, không báo. Nếu KHÔNG thấy link (cash, kế toán force tay)
-- → báo như cũ (không đủ dữ liệu để kết luận).
--
-- Thay đổi: chỉ fn_payment_paid_zalo_notify(). Không đụng DingTalk / FE / Render.
-- Idempotent: CREATE OR REPLACE. Reversible: xem ROLLBACK SCRIPT ở cuối file.

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
  v_pay_time   TIMESTAMPTZ;   -- giờ khách trả thật (sớm nhất từ 2 nguồn)
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN

    -- Giờ khách trả thật: min(bank_transactions.transaction_date,
    --                         gateway_transactions.paid_at) theo payment_line_id.
    -- Cả 2 cột có index btree sẵn → lookup O(log n).
    -- LEAST bỏ qua NULL → nếu chỉ 1 nguồn có link vẫn đúng.
    SELECT LEAST(
      (SELECT min(bt.transaction_date)
         FROM public.bank_transactions bt
        WHERE bt.payment_line_id = NEW.id),
      (SELECT min(gt.paid_at)
         FROM public.gateway_transactions gt
        WHERE gt.payment_line_id = NEW.id)
    ) INTO v_pay_time;

    -- Suppress: khách trả TRƯỚC khi lần TT được tạo → không báo.
    -- Dùng < strict: trả đúng giờ hoặc sau → báo bình thường.
    -- Không tìm thấy link (v_pay_time IS NULL) → báo như cũ.
    IF v_pay_time IS NOT NULL AND v_pay_time < NEW.created_at THEN
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

-- =============================================================
-- ROLLBACK SCRIPT (paste vào psql để khôi phục bản cũ nếu cần)
-- =============================================================
-- CREATE OR REPLACE FUNCTION public.fn_payment_paid_zalo_notify()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
-- DECLARE
--   v_sale_email TEXT; v_sale_team TEXT; v_group_id TEXT; v_message TEXT;
-- BEGIN
--   IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
--     SELECT pr.sale_email, ns.team INTO v_sale_email, v_sale_team
--       FROM public.payment_requests pr
--       LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
--       WHERE pr.id = NEW.payment_request_id LIMIT 1;
--     SELECT group_id INTO v_group_id FROM public.zalo_team_groups
--       WHERE team_code = v_sale_team AND is_active = true LIMIT 1;
--     IF v_group_id IS NULL THEN
--       RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
--       RETURN NEW;
--     END IF;
--     v_message := public.build_payment_paid_message(NEW);
--     INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message)
--     VALUES ('payment_paid', 'payment_lines', NEW.id, v_group_id, v_message)
--     ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
--     PERFORM public.enqueue_bill_uploaded_zalo(NEW.id);
--   END IF;
--   RETURN NEW;
-- END;
-- $function$;
