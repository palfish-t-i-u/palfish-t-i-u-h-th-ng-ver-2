-- Fix: build_course_activated_message thiếu format_phone_intl
-- SĐT hiển thị raw (916953289) thay vì 84-916953289
-- Thêm pr.country vào SELECT, wrap v_phone qua format_phone_intl()

CREATE OR REPLACE FUNCTION public.build_course_activated_message(ar_row public.active_requests)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_uid_block   JSONB;
  v_course      JSONB;
  v_courses_list TEXT := '';
  v_phones      TEXT := '';
  v_uids        TEXT := '';
  v_phone       TEXT;
  v_uid         TEXT;
  v_pr_phone    TEXT;
  v_pr_country  TEXT;
  v_sale_email  TEXT;
  v_customer_from_pr TEXT;
  v_sale_team   TEXT;
  v_sale_name   TEXT;
BEGIN
  SELECT pr.sale_email, pr.name, pr.phone, pr.country,
         ns.team, COALESCE(ns.display_name, ns.crm_name)
    INTO v_sale_email, v_customer_from_pr, v_pr_phone, v_pr_country,
         v_sale_team, v_sale_name
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

      v_uid := COALESCE(NULLIF(TRIM(v_uid_block->>'uid'), ''), '?');
      IF v_uids != '' THEN
        v_uids := v_uids || ', ';
      END IF;
      v_uids := v_uids || v_uid;

      IF jsonb_typeof(v_uid_block->'courses') = 'array' THEN
        FOR v_course IN SELECT * FROM jsonb_array_elements(v_uid_block->'courses')
        LOOP
          IF v_courses_list != '' THEN
            v_courses_list := v_courses_list || ', ';
          END IF;
          v_courses_list := v_courses_list || COALESCE(v_course->>'name', '?');
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  IF v_phones = '' THEN
    v_phones := COALESCE(public.format_phone_intl(v_pr_phone, COALESCE(v_pr_country, 'VN')), v_pr_phone, '?');
  END IF;
  IF v_uids = '' THEN
    v_uids := '?';
  END IF;

  RETURN format(
    E'✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC\nKH: %s · Sale %s · Team %s\nSĐT: %s · UID: %s\nGói: %s',
    COALESCE(NULLIF(TRIM(ar_row.customer_name), ''), NULLIF(TRIM(v_customer_from_pr), ''), '?'),
    COALESCE(NULLIF(TRIM(v_sale_name), ''), NULLIF(TRIM(v_sale_email), ''), '?'),
    COALESCE(NULLIF(TRIM(v_sale_team), ''), '?'),
    v_phones,
    v_uids,
    CASE WHEN v_courses_list = '' THEN '?' ELSE v_courses_list END
  );
END;
$function$;
