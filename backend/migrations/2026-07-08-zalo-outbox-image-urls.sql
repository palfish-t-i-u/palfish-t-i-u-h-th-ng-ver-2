-- Migration: add image_urls (JSONB array) to zalo_outbox for multi-bill support
-- Existing image_url (single) kept for backward compat; worker uses image_urls if present.

ALTER TABLE public.zalo_outbox
  ADD COLUMN IF NOT EXISTS image_urls JSONB;

-- Update fn_course_activated_zalo_notify to aggregate bill images from all paid lines of the PR.
-- Collects bill_images array elements + legacy bill_image string, deduped, ordered oldest-first.
-- ON CONFLICT clause changed from DO NOTHING to DO UPDATE SET image_urls so that
-- re-activation edge cases refresh the bill list instead of silently skipping.
CREATE OR REPLACE FUNCTION public.fn_course_activated_zalo_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sale_email TEXT;
  v_sale_team  TEXT;
  v_group_id   TEXT;
  v_message    TEXT;
  v_image_urls JSONB;
BEGIN
  IF NEW.status = 'activated' AND (OLD.status IS NULL OR OLD.status != 'activated') THEN
    SELECT pr.sale_email, ns.team
      INTO v_sale_email, v_sale_team
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.pr_id
      LIMIT 1;

    SELECT group_id INTO v_group_id
      FROM public.zalo_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_group_id IS NULL THEN
      RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    v_message := public.build_course_activated_message(NEW);

    -- Aggregate all bill URLs from paid lines of this PR, deduped
    SELECT jsonb_agg(DISTINCT u)
      INTO v_image_urls
      FROM (
        SELECT jsonb_array_elements_text(pl.bill_images) AS u
          FROM public.payment_lines pl
         WHERE pl.payment_request_id = NEW.pr_id
           AND pl.status = 'paid'
           AND pl.bill_images IS NOT NULL
           AND jsonb_array_length(pl.bill_images) > 0
        UNION
        SELECT pl.bill_image AS u
          FROM public.payment_lines pl
         WHERE pl.payment_request_id = NEW.pr_id
           AND pl.status = 'paid'
           AND pl.bill_image IS NOT NULL
           AND pl.bill_image != ''
      ) sub(u)
     WHERE u IS NOT NULL AND u != '';

    INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message, image_urls)
    VALUES ('course_activated', 'active_requests', md5(NEW.id)::uuid, v_group_id, v_message, v_image_urls)
    ON CONFLICT (source_table, source_id, event_type) DO UPDATE
      SET image_urls = EXCLUDED.image_urls;
  END IF;
  RETURN NEW;
END;
$function$;
