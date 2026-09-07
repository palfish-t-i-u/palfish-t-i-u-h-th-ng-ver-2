-- Backstop DingTalk "Tạo gói học thành công" cho đơn XUẤT HĐ TRƯỚC khi điền order_id.
--
-- Bug: trigger fn_course_activated_dingtalk_notify chỉ fire khi active_requests.status
-- CHUYỂN sang 'activated'. Nhưng derive_ar_status_from_uids xếp invoiced/ready_invoice
-- CAO HƠN activated → đơn xuất HĐ trước khi điền đủ order_id thì status nhảy thẳng
-- ready_invoice/invoiced, KHÔNG BAO GIỜ chạm 'activated' → trigger bất khả thi → điền
-- order_id sau không bắn tin (chị Hiền báo 7/9).
--
-- Fix: RPC bắn course_activated khi MỌI course đã có order_id, keyed GIỐNG HỆT trigger
-- (md5(ar_id)::uuid + event 'course_activated') → ON CONFLICT DO NOTHING = idempotent:
--   - Luồng thường (chưa HĐ): trigger đã bắn khi status→activated → RPC bị nuốt.
--   - Luồng HĐ-trước: trigger không bắn → RPC là dòng DUY NHẤT → bắn 1 lần.
--   - Đơn nhiều course mới điền 1: guard v_ordered=v_total = false → không bắn sớm.
-- Gọi best-effort từ activation_routes.patch_active_request_course_order sau khi set order_id.

CREATE OR REPLACE FUNCTION public.enqueue_course_activated_if_all_ordered(p_ar_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_row        active_requests%ROWTYPE;
  v_uid        jsonb;
  v_course     jsonb;
  v_total      int := 0;
  v_ordered    int := 0;
  v_sale_email text;
  v_sale_team  text;
  v_team_code  text;
  v_message    text;
BEGIN
  SELECT * INTO v_row FROM public.active_requests WHERE id = p_ar_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Guard: MỌI course phải có order_id (không thì để trigger/luồng thường lo)
  FOR v_uid IN SELECT * FROM jsonb_array_elements(COALESCE(v_row.uids_data, '[]'::jsonb))
  LOOP
    FOR v_course IN SELECT * FROM jsonb_array_elements(COALESCE(v_uid->'courses', '[]'::jsonb))
    LOOP
      v_total := v_total + 1;
      IF trim(COALESCE(v_course->>'order_id', v_course->>'orderId', '')) <> '' THEN
        v_ordered := v_ordered + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF v_total = 0 OR v_ordered <> v_total THEN
    RETURN;  -- chưa đủ order_id → không bắn
  END IF;

  -- Resolve team GIỐNG fn_course_activated_dingtalk_notify (RAW team, skip nếu không có group)
  SELECT pr.sale_email, ns.team
    INTO v_sale_email, v_sale_team
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = v_row.pr_id
    LIMIT 1;

  SELECT team_code INTO v_team_code
    FROM public.dingtalk_team_groups
    WHERE team_code = v_sale_team AND is_active = true
    LIMIT 1;

  IF v_team_code IS NULL THEN
    RETURN;
  END IF;

  v_message := public.build_course_activated_message(v_row);

  -- Key TRÙNG trigger (2026-06-26-dingtalk-tables.sql:123) → idempotent, không double-send
  INSERT INTO public.dingtalk_outbox (event_type, source_table, source_id, team_code, message)
  VALUES ('course_activated', 'active_requests', md5(v_row.id::text)::uuid, v_team_code, v_message)
  ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enqueue_course_activated_if_all_ordered(text) TO service_role;
