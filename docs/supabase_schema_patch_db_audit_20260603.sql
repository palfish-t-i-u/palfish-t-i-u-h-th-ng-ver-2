-- DB audit 2026-06-03 (Đức) — atomic ID allocation + guarded AR update + BC03 transactional save
-- Run in Supabase SQL Editor, then:
--   NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- DB-01: don_hang ma_don_hang KH### via sequence (no read-latest race)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS don_hang_seq;

DO $$
DECLARE
  max_val bigint := 0;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(ma_don_hang, '^KH([0-9]+)$', 'i'))[1]::bigint),
    0
  )
  INTO max_val
  FROM don_hang
  WHERE ma_don_hang ~* '^KH[0-9]+$';

  PERFORM setval('don_hang_seq', GREATEST(max_val, 1), true);
END $$;

CREATE OR REPLACE FUNCTION public.next_ma_don()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v bigint;
BEGIN
  v := nextval('don_hang_seq');
  RETURN 'KH' || lpad(v::text, 3, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- DB-03: PR-YYYY-#### via atomic upsert on payment_request_sequences
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_payment_request_id(p_year int DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_key text;
  seq bigint;
BEGIN
  year_key := COALESCE(p_year::text, to_char(now() AT TIME ZONE 'UTC', 'YYYY'));
  INSERT INTO payment_request_sequences (year_key, current_val)
  VALUES (year_key, 1)
  ON CONFLICT (year_key) DO UPDATE
    SET current_val = payment_request_sequences.current_val + 1
  RETURNING current_val INTO seq;
  RETURN format('PR-%s-%s', year_key, lpad(seq::text, 4, '0'));
END;
$$;

-- ---------------------------------------------------------------------------
-- DB-02: tax invoice + product code batch allocate (tax_sequences)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_tax_sequences(p_date_key text, p_n int)
RETURNS TABLE(inv_start bigint, prod_start bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq_id_inv text;
  v_inv bigint;
  v_prod bigint;
  n int;
BEGIN
  n := GREATEST(COALESCE(p_n, 0), 0);
  IF n = 0 THEN
    inv_start := 0;
    prod_start := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  seq_id_inv := 'invoice_' || trim(p_date_key);

  INSERT INTO tax_sequences (id, current_val, updated_at)
  VALUES (seq_id_inv, n, now())
  ON CONFLICT (id) DO UPDATE
    SET current_val = tax_sequences.current_val + EXCLUDED.current_val,
        updated_at = now()
  RETURNING (tax_sequences.current_val - n) INTO v_inv;

  INSERT INTO tax_sequences (id, current_val, updated_at)
  VALUES ('product_code', n, now())
  ON CONFLICT (id) DO UPDATE
    SET current_val = tax_sequences.current_val + EXCLUDED.current_val,
        updated_at = now()
  RETURNING (tax_sequences.current_val - n) INTO v_prod;

  inv_start := COALESCE(v_inv, 0);
  prod_start := COALESCE(v_prod, 0);
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- DB-05: BC03 monthly settings + KPI rows in one transaction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_bc03_monthly(
  p_month_key text,
  p_exchange_rate bigint,
  p_actor text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row jsonb;
  i int := 0;
BEGIN
  IF p_month_key IS NULL OR p_month_key !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid_month_key' USING ERRCODE = '22023';
  END IF;

  INSERT INTO bc03_month_settings (month_key, exchange_rate, updated_at, updated_by)
  VALUES (p_month_key, COALESCE(p_exchange_rate, 3700), now(), p_actor)
  ON CONFLICT (month_key) DO UPDATE
    SET exchange_rate = EXCLUDED.exchange_rate,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

  DELETE FROM bc03_kpi_rows WHERE month_key = p_month_key;

  IF p_rows IS NOT NULL AND jsonb_typeof(p_rows) = 'array' THEN
    FOR row IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
      IF COALESCE(trim(row->>'sale_name'), '') = '' THEN
        CONTINUE;
      END IF;
      INSERT INTO bc03_kpi_rows (
        month_key, sale_name, b2_orders, b4_gmv_vnd, sort_order, updated_at
      ) VALUES (
        p_month_key,
        trim(row->>'sale_name'),
        COALESCE((row->>'b2_orders')::bigint, 0),
        COALESCE((row->>'b4_gmv_vnd')::bigint, 0),
        COALESCE((row->>'sort_order')::int, i),
        now()
      );
      i := i + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'month', p_month_key);
END;
$$;

-- ---------------------------------------------------------------------------
-- DB-04: atomic per-course JSONB patches (jsonb_set, no full replace)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.derive_ar_status_from_uids(p_uids jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_uid jsonb;
  v_course jsonb;
  v_total int := 0;
  v_invoiced int := 0;
  v_requested int := 0;
  v_ordered int := 0;
  v_order_id text;
  v_inv_raw text;
BEGIN
  IF p_uids IS NULL OR jsonb_typeof(p_uids) <> 'array' OR jsonb_array_length(p_uids) = 0 THEN
    RETURN 'pending_order';
  END IF;

  FOR v_uid IN SELECT * FROM jsonb_array_elements(p_uids)
  LOOP
    FOR v_course IN SELECT * FROM jsonb_array_elements(COALESCE(v_uid->'courses', '[]'::jsonb))
    LOOP
      v_total := v_total + 1;
      v_inv_raw := lower(trim(COALESCE(v_course->>'invoiced', '')));
      IF (v_course->>'invoiced')::text IN ('true', 't')
         OR v_inv_raw IN ('true', '1', 'yes', 'y')
         OR COALESCE((v_course->>'invoiced')::boolean, false) THEN
        v_invoiced := v_invoiced + 1;
      END IF;
      IF COALESCE(trim(v_course->>'invoice_requested_at'), '') <> '' THEN
        v_requested := v_requested + 1;
      END IF;
      v_order_id := trim(COALESCE(v_course->>'order_id', v_course->>'orderId', ''));
      IF v_order_id <> '' THEN
        v_ordered := v_ordered + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF v_total = 0 THEN
    RETURN 'pending_order';
  END IF;
  IF v_invoiced = v_total THEN
    RETURN 'invoiced';
  END IF;
  IF v_requested > 0 THEN
    RETURN 'ready_invoice';
  END IF;
  IF v_ordered = v_total THEN
    RETURN 'activated';
  END IF;
  IF v_ordered > 0 THEN
    RETURN 'partial_order';
  END IF;
  RETURN 'pending_order';
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_course_invoice_atomic(
  p_ar_id text,
  p_course_code text,
  p_invoice_id text,
  p_invoiced_at text,
  p_course_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS active_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row active_requests%ROWTYPE;
  v_uids jsonb;
  v_uid jsonb;
  v_new_uids jsonb := '[]'::jsonb;
  v_courses jsonb;
  v_course jsonb;
  v_new_courses jsonb;
  v_found boolean := false;
  v_key text;
  v_val jsonb;
  v_inv_raw text;
BEGIN
  SELECT * INTO v_row FROM active_requests WHERE id = p_ar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_uids := COALESCE(v_row.uids_data, '[]'::jsonb);

  FOR v_uid IN SELECT * FROM jsonb_array_elements(v_uids)
  LOOP
    v_new_courses := '[]'::jsonb;
    FOR v_course IN SELECT * FROM jsonb_array_elements(COALESCE(v_uid->'courses', '[]'::jsonb))
    LOOP
      IF v_course->>'code' = p_course_code THEN
        v_inv_raw := lower(trim(COALESCE(v_course->>'invoiced', '')));
        IF (v_course->>'invoiced')::text IN ('true', 't')
           OR v_inv_raw IN ('true', '1', 'yes', 'y')
           OR COALESCE((v_course->>'invoiced')::boolean, false) THEN
          RAISE EXCEPTION 'course_already_invoiced' USING ERRCODE = '22023';
        END IF;
        IF p_course_patch IS NOT NULL AND jsonb_typeof(p_course_patch) = 'object' THEN
          FOR v_key, v_val IN SELECT * FROM jsonb_each(p_course_patch)
          LOOP
            IF v_val IS NOT NULL AND v_val::text NOT IN ('null', '""') THEN
              v_course := jsonb_set(v_course, ARRAY[v_key], v_val, true);
            END IF;
          END LOOP;
        END IF;
        v_course := jsonb_set(v_course, '{invoiced}', 'true'::jsonb, true);
        v_course := jsonb_set(v_course, '{invoice_id}', to_jsonb(trim(p_invoice_id)), true);
        v_course := jsonb_set(v_course, '{invoiced_at}', to_jsonb(trim(p_invoiced_at)), true);
        v_found := true;
      END IF;
      v_new_courses := v_new_courses || jsonb_build_array(v_course);
    END LOOP;
    v_uid := jsonb_set(v_uid, '{courses}', v_new_courses, true);
    v_new_uids := v_new_uids || jsonb_build_array(v_uid);
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'course_code_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE active_requests
  SET uids_data = v_new_uids,
      status = derive_ar_status_from_uids(v_new_uids),
      updated_at = now()
  WHERE id = p_ar_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_course_invoice_atomic(
  p_ar_id text,
  p_course_code text
)
RETURNS active_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row active_requests%ROWTYPE;
  v_uids jsonb;
  v_uid jsonb;
  v_new_uids jsonb := '[]'::jsonb;
  v_course jsonb;
  v_new_courses jsonb;
  v_found boolean := false;
  v_inv_raw text;
BEGIN
  SELECT * INTO v_row FROM active_requests WHERE id = p_ar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_uids := COALESCE(v_row.uids_data, '[]'::jsonb);

  FOR v_uid IN SELECT * FROM jsonb_array_elements(v_uids)
  LOOP
    v_new_courses := '[]'::jsonb;
    FOR v_course IN SELECT * FROM jsonb_array_elements(COALESCE(v_uid->'courses', '[]'::jsonb))
    LOOP
      IF v_course->>'code' = p_course_code THEN
        v_inv_raw := lower(trim(COALESCE(v_course->>'invoiced', '')));
        IF NOT (
          (v_course->>'invoiced')::text IN ('true', 't')
          OR v_inv_raw IN ('true', '1', 'yes', 'y')
          OR COALESCE((v_course->>'invoiced')::boolean, false)
        ) THEN
          RAISE EXCEPTION 'course_not_invoiced' USING ERRCODE = '22023';
        END IF;
        v_course := jsonb_set(v_course, '{invoiced}', 'false'::jsonb, true);
        v_course := jsonb_set(v_course, '{invoice_id}', '""'::jsonb, true);
        v_course := jsonb_set(v_course, '{invoiced_at}', '""'::jsonb, true);
        v_found := true;
      END IF;
      v_new_courses := v_new_courses || jsonb_build_array(v_course);
    END LOOP;
    v_uid := jsonb_set(v_uid, '{courses}', v_new_courses, true);
    v_new_uids := v_new_uids || jsonb_build_array(v_uid);
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'course_code_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE active_requests
  SET uids_data = v_new_uids,
      status = derive_ar_status_from_uids(v_new_uids),
      updated_at = now()
  WHERE id = p_ar_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_course_order_id_atomic(
  p_ar_id text,
  p_course_code text
)
RETURNS active_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row active_requests%ROWTYPE;
  v_uids jsonb;
  v_uid jsonb;
  v_new_uids jsonb := '[]'::jsonb;
  v_course jsonb;
  v_new_courses jsonb;
  v_found boolean := false;
BEGIN
  SELECT * INTO v_row FROM active_requests WHERE id = p_ar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_uids := COALESCE(v_row.uids_data, '[]'::jsonb);

  FOR v_uid IN SELECT * FROM jsonb_array_elements(v_uids)
  LOOP
    v_new_courses := '[]'::jsonb;
    FOR v_course IN SELECT * FROM jsonb_array_elements(COALESCE(v_uid->'courses', '[]'::jsonb))
    LOOP
      IF v_course->>'code' = p_course_code THEN
        v_course := jsonb_set(v_course, '{order_id}', '""'::jsonb, true);
        v_course := v_course - 'orderId';
        v_found := true;
      END IF;
      v_new_courses := v_new_courses || jsonb_build_array(v_course);
    END LOOP;
    v_uid := jsonb_set(v_uid, '{courses}', v_new_courses, true);
    v_new_uids := v_new_uids || jsonb_build_array(v_uid);
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'course_code_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE active_requests
  SET uids_data = v_new_uids,
      status = derive_ar_status_from_uids(v_new_uids),
      updated_at = now()
  WHERE id = p_ar_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_active_request_uids_snapshot(
  p_ar_id text,
  p_uids_data jsonb
)
RETURNS active_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row active_requests%ROWTYPE;
BEGIN
  UPDATE active_requests
  SET uids_data = COALESCE(p_uids_data, '[]'::jsonb),
      status = derive_ar_status_from_uids(COALESCE(p_uids_data, '[]'::jsonb)),
      updated_at = now()
  WHERE id = p_ar_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_ar_invoice_atomic(
  p_ar_id text,
  p_requested_at text
)
RETURNS active_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row active_requests%ROWTYPE;
  v_uids jsonb;
  v_uid jsonb;
  v_new_uids jsonb := '[]'::jsonb;
  v_course jsonb;
  v_new_courses jsonb;
  v_inv_raw text;
  v_changed boolean := false;
BEGIN
  SELECT * INTO v_row FROM active_requests WHERE id = p_ar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_uids := COALESCE(v_row.uids_data, '[]'::jsonb);

  FOR v_uid IN SELECT * FROM jsonb_array_elements(v_uids)
  LOOP
    v_new_courses := '[]'::jsonb;
    FOR v_course IN SELECT * FROM jsonb_array_elements(COALESCE(v_uid->'courses', '[]'::jsonb))
    LOOP
      v_inv_raw := lower(trim(COALESCE(v_course->>'invoiced', '')));
      IF NOT (
        (v_course->>'invoiced')::text IN ('true', 't')
        OR v_inv_raw IN ('true', '1', 'yes', 'y')
        OR COALESCE((v_course->>'invoiced')::boolean, false)
      ) AND COALESCE(trim(v_course->>'invoice_requested_at'), '') = '' THEN
        v_course := jsonb_set(
          v_course,
          '{invoice_requested_at}',
          to_jsonb(trim(p_requested_at)),
          true
        );
        v_changed := true;
      END IF;
      v_new_courses := v_new_courses || jsonb_build_array(v_course);
    END LOOP;
    v_uid := jsonb_set(v_uid, '{courses}', v_new_courses, true);
    v_new_uids := v_new_uids || jsonb_build_array(v_uid);
  END LOOP;

  IF v_changed THEN
    UPDATE active_requests
    SET uids_data = v_new_uids,
        status = derive_ar_status_from_uids(v_new_uids),
        updated_at = now()
    WHERE id = p_ar_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- DB-04: optimistic lock on full uids_data replace
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_active_request_uids_data_guarded(
  p_ar_id text,
  p_expected_updated_at timestamptz,
  p_uids_data jsonb,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row active_requests%ROWTYPE;
  v_cur active_requests%ROWTYPE;
BEGIN
  UPDATE active_requests
  SET uids_data = COALESCE(p_uids_data, '[]'::jsonb),
      status = COALESCE(p_status, status),
      updated_at = now()
  WHERE id = p_ar_id
    AND updated_at = p_expected_updated_at
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'conflict', false,
      'row', to_jsonb(v_row)
    );
  END IF;

  SELECT * INTO v_cur FROM active_requests WHERE id = p_ar_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'conflict', true,
    'row', to_jsonb(v_cur)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_ma_don() TO service_role;
GRANT EXECUTE ON FUNCTION public.next_payment_request_id(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_tax_sequences(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_bc03_monthly(text, bigint, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_active_request_uids_data_guarded(text, timestamptz, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.derive_ar_status_from_uids(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_course_invoice_atomic(text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_course_invoice_atomic(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_course_order_id_atomic(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_ar_invoice_atomic(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_active_request_uids_snapshot(text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
