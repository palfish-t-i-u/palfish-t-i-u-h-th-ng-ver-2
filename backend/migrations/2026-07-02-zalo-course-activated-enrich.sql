-- Migration: Enrich build_course_activated_message with SĐT, UID list, course names
-- Workstream C1 (Giang)
-- Base: 2026-06-29-zalo-msg-use-crm-name.sql (lines 47-91)
-- Format mới:
--   ✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC
--   KH: {customer} · Sale {sale_name} · Team {team}
--   SĐT: {phone} · UID: {uid1, uid2…}
--   Gói: {danh sách tên gói}
-- Trigger + routing + event_type giữ nguyên
-- Idempotent: CREATE OR REPLACE
-- Date: 2026-07-02

CREATE OR REPLACE FUNCTION public.build_course_activated_message(ar_row public.active_requests)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  v_sale_email  TEXT;
  v_customer_from_pr TEXT;
  v_sale_team   TEXT;
  v_sale_name   TEXT;
BEGIN
  -- 1. Fetch sale info + PR phone (join already exists in base fn)
  SELECT pr.sale_email, pr.name, pr.phone, ns.team,
         COALESCE(ns.display_name, ns.crm_name)
    INTO v_sale_email, v_customer_from_pr, v_pr_phone, v_sale_team, v_sale_name
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = ar_row.pr_id
    LIMIT 1;

  -- 2. Loop through uids_data to collect phones, UIDs, and course names
  IF ar_row.uids_data IS NOT NULL AND jsonb_typeof(ar_row.uids_data) = 'array' THEN
    FOR v_uid_block IN SELECT * FROM jsonb_array_elements(ar_row.uids_data)
    LOOP
      -- Collect phone (fallback to PR phone)
      v_phone := COALESCE(NULLIF(TRIM(v_uid_block->>'phone'), ''), v_pr_phone, '?');
      IF v_phones != '' THEN
        v_phones := v_phones || ', ';
      END IF;
      v_phones := v_phones || v_phone;

      -- Collect UID
      v_uid := COALESCE(NULLIF(TRIM(v_uid_block->>'uid'), ''), '?');
      IF v_uids != '' THEN
        v_uids := v_uids || ', ';
      END IF;
      v_uids := v_uids || v_uid;

      -- Collect course names
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

  -- 3. Fallbacks when no UID data extracted
  IF v_phones = '' THEN
    v_phones := COALESCE(v_pr_phone, '?');
  END IF;
  IF v_uids = '' THEN
    v_uids := '?';
  END IF;

  -- 4. Build message in new multi-line format
  RETURN format(
    E'✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC\nKH: %s · Sale %s · Team %s\nSĐT: %s · UID: %s\nGói: %s',
    COALESCE(ar_row.customer_name, v_customer_from_pr, '?'),
    COALESCE(v_sale_name, v_sale_email, '?'),
    COALESCE(NULLIF(v_sale_team, ''), '?'),
    v_phones,
    v_uids,
    CASE WHEN v_courses_list = '' THEN '?' ELSE v_courses_list END
  );
END;
$function$;
