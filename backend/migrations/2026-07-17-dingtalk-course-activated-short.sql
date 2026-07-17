-- Migration: rút gọn tin DingTalk "kích hoạt khoá học thành công" (course_activated).
-- Chốt a Hiếu 17/7: tin này chỉ cần NGẮN GỌN — SĐT + Tên sale + Order ID.
-- Live path = SQL fn build_course_activated_message (trigger trg_course_activated_dingtalk).
-- Python mirror utils/zalo_message_builder.build_course_activated_message giữ đồng bộ.
--
-- Format mới:
--   ✅ ĐÃ KÍCH HOẠT THÀNH CÔNG
--   SĐT: {phones} · Sale {sale_name}
--   Order ID: {order_ids}
--
-- order_id lấy từ uids_data[].courses[].order_id (đã có lúc status='activated').

CREATE OR REPLACE FUNCTION public.build_course_activated_message(ar_row public.active_requests)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_uid_block   JSONB;
  v_course      JSONB;
  v_phones      TEXT := '';
  v_order_ids   TEXT := '';
  v_phone       TEXT;
  v_oid         TEXT;
  v_pr_phone    TEXT;
  v_pr_country  TEXT;
  v_sale_email  TEXT;
  v_sale_name   TEXT;
BEGIN
  SELECT pr.sale_email, pr.phone, pr.country,
         COALESCE(ns.display_name, ns.crm_name)
    INTO v_sale_email, v_pr_phone, v_pr_country, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = ar_row.pr_id
    LIMIT 1;

  IF ar_row.uids_data IS NOT NULL AND jsonb_typeof(ar_row.uids_data) = 'array' THEN
    FOR v_uid_block IN SELECT * FROM jsonb_array_elements(ar_row.uids_data)
    LOOP
      v_phone := COALESCE(NULLIF(TRIM(v_uid_block->>'phone'), ''), v_pr_phone, '?');
      v_phone := COALESCE(
        public.format_phone_intl(
          v_phone,
          COALESCE(NULLIF(TRIM(v_uid_block->>'country'), ''), v_pr_country, 'VN')
        ),
        v_phone
      );
      IF v_phones != '' THEN
        v_phones := v_phones || ', ';
      END IF;
      v_phones := v_phones || v_phone;

      IF jsonb_typeof(v_uid_block->'courses') = 'array' THEN
        FOR v_course IN SELECT * FROM jsonb_array_elements(v_uid_block->'courses')
        LOOP
          v_oid := NULLIF(TRIM(v_course->>'order_id'), '');
          IF v_oid IS NOT NULL THEN
            IF v_order_ids != '' THEN
              v_order_ids := v_order_ids || ', ';
            END IF;
            v_order_ids := v_order_ids || v_oid;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  IF v_phones = '' THEN
    v_phones := COALESCE(public.format_phone_intl(v_pr_phone, COALESCE(v_pr_country, 'VN')), v_pr_phone, '?');
  END IF;
  IF v_order_ids = '' THEN
    v_order_ids := '?';
  END IF;

  RETURN format(
    E'✅ ĐÃ KÍCH HOẠT THÀNH CÔNG\nSĐT: %s · Sale %s\nOrder ID: %s',
    v_phones,
    COALESCE(NULLIF(TRIM(v_sale_name), ''), NULLIF(TRIM(v_sale_email), ''), '?'),
    v_order_ids
  );
END;
$function$;
