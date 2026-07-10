-- Migration: tin Zalo riêng bắn ảnh bill sau khi sale upload (tách khỏi course_activated)
-- Yêu cầu sale 10/7: "tách riêng gửi báo tiền trước, khi nào có ảnh bill thì bắn ảnh về sau"
-- 1 implementation duy nhất (SQL), gọi từ 2 đường: trigger payment_paid + RPC từ endpoint upload bill.
-- Idempotent: CREATE OR REPLACE + ON CONFLICT. Date: 2026-07-10

-- 1. Event type mới: bill_uploaded (GIỮ nguyên các giá trị cũ — CHECK mới re-validate toàn bộ rows cũ)
ALTER TABLE public.zalo_outbox DROP CONSTRAINT IF EXISTS zalo_outbox_event_type_check;
ALTER TABLE public.zalo_outbox ADD CONSTRAINT zalo_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_paid'::text, 'course_activated'::text,
    'activation_urgent_reminder'::text, 'activation_request_created'::text,
    'bill_uploaded'::text]));

-- 2. Enqueue function — nguồn sự thật DUY NHẤT cho tin bill
--    Trả về true nếu có row được insert/update, false nếu skip (chưa paid / chưa có bill / thiếu group).
CREATE OR REPLACE FUNCTION public.enqueue_bill_uploaded_zalo(p_line_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_line       public.payment_lines%ROWTYPE;
  v_pr_id      TEXT;
  v_sale_email TEXT;
  v_sale_team  TEXT;
  v_group_id   TEXT;
  v_message    TEXT;
  v_image_urls JSONB;
BEGIN
  SELECT * INTO v_line FROM public.payment_lines WHERE id = p_line_id;
  IF NOT FOUND OR v_line.status IS DISTINCT FROM 'paid' THEN
    RETURN false;
  END IF;

  -- Gom ảnh bill của CHÍNH line này (bill_images JSONB + legacy bill_image), dedup
  SELECT jsonb_agg(DISTINCT u)
    INTO v_image_urls
    FROM (
      SELECT jsonb_array_elements_text(v_line.bill_images) AS u
       WHERE v_line.bill_images IS NOT NULL
         AND jsonb_typeof(v_line.bill_images) = 'array'
         AND jsonb_array_length(v_line.bill_images) > 0
      UNION
      SELECT v_line.bill_image AS u
       WHERE v_line.bill_image IS NOT NULL AND v_line.bill_image != ''
    ) sub(u)
   WHERE u IS NOT NULL AND u != '';

  IF v_image_urls IS NULL THEN
    RETURN false;  -- chưa có bill nào → không có gì để bắn
  END IF;

  -- Lookup team để route tới đúng Zalo group
  SELECT pr.id, pr.sale_email, ns.team
    INTO v_pr_id, v_sale_email, v_sale_team
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = v_line.payment_request_id
    LIMIT 1;

  SELECT group_id INTO v_group_id
    FROM public.zalo_team_groups
    WHERE team_code = v_sale_team AND is_active = true
    LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
    RETURN false;
  END IF;

  -- Format gọn theo yêu cầu sale 10/7:
  --   TH bình thường:              🧾 BILL - PR-2026-0226
  --   TH card/installment có net:  🧾 BILL - PR-2026-0226 - FHR61
  --                                🔸 Thực nhận: 4,559,000 VND
  v_message := format(E'\U0001F9FE BILL - %s', COALESCE(v_pr_id, '?'));

  IF LOWER(COALESCE(v_line.method, '')) IN ('card', 'installment')
     AND v_line.verified_received IS NOT NULL THEN
    v_message := v_message || format(' - %s',
      COALESCE(NULLIF(TRIM(v_line.transfer_code), ''), '?'));
    v_message := v_message || E'\n' ||
      format(E'\U0001F538 Thực nhận: %s VND',
             to_char(v_line.verified_received, 'FM999,999,999,999'));
  END IF;

  -- Upsert: up thêm ảnh trong lúc CHƯA gửi → merge vào 1 tin. Đã gửi rồi → không gửi lại (chống spam).
  INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message, image_urls)
  VALUES ('bill_uploaded', 'payment_lines', v_line.id, v_group_id, v_message, v_image_urls)
  ON CONFLICT (source_table, source_id, event_type) DO UPDATE
    SET image_urls = EXCLUDED.image_urls,
        message    = EXCLUDED.message
    WHERE zalo_outbox.sent_at IS NULL;
  RETURN true;
END;
$function$;

-- 3. Security: theo pattern 2026-07-06-security-revoke-rpc — chỉ backend (service_role) được gọi qua PostgREST
REVOKE EXECUTE ON FUNCTION public.enqueue_bill_uploaded_zalo(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enqueue_bill_uploaded_zalo(uuid) TO service_role;

-- 4. Trigger payment_paid: sau khi báo tiền, nếu line ĐÃ có bill sẵn (up trước khi xác nhận)
--    thì bắn luôn tin bill theo sau. Body copy từ 2026-06-23-zalo-oa-tables.sql:137 + 1 dòng PERFORM.
CREATE OR REPLACE FUNCTION public.fn_payment_paid_zalo_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team TEXT;
  v_group_id TEXT;
  v_message TEXT;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
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

    -- Bill đã up từ trước → bắn tin bill NGAY SAU tin tiền (id outbox lớn hơn → worker gửi sau)
    PERFORM public.enqueue_bill_uploaded_zalo(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
