-- PalFish GMV — B3 Active Request (course activation / CRM matching)
-- Khớp payment_requests Hiếu/prototype:
--   id text (PR-2026-XXXX), state, target, received, name, uid, ...
-- KHÔNG sửa payment_requests. Chỉ tạo active_requests + RPC.

-- ---------------------------------------------------------------------------
-- active_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS active_requests (
  id         text PRIMARY KEY,
  pr_id      text        NOT NULL REFERENCES payment_requests (id) ON DELETE RESTRICT,
  uids_data  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status     text        NOT NULL DEFAULT 'pending_order',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE active_requests ADD COLUMN IF NOT EXISTS uids_data jsonb;
ALTER TABLE active_requests ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE active_requests ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE active_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Sai kiểu từ patch cũ (pr_id uuid) → text
ALTER TABLE active_requests DROP CONSTRAINT IF EXISTS active_requests_pr_id_fkey;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'active_requests'
      AND column_name = 'pr_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE active_requests ALTER COLUMN pr_id TYPE text USING pr_id::text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'active_requests_pr_id_fkey'
  ) THEN
    ALTER TABLE active_requests
      ADD CONSTRAINT active_requests_pr_id_fkey
      FOREIGN KEY (pr_id) REFERENCES payment_requests (id) ON DELETE RESTRICT;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'active_requests_pr_id_fkey: %', SQLERRM;
END $$;

UPDATE active_requests SET uids_data = '[]'::jsonb WHERE uids_data IS NULL;
UPDATE active_requests SET status = 'pending_order' WHERE status IS NULL;

ALTER TABLE active_requests ALTER COLUMN uids_data SET DEFAULT '[]'::jsonb;
ALTER TABLE active_requests ALTER COLUMN status SET DEFAULT 'pending_order';
ALTER TABLE active_requests ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE active_requests ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE active_requests DROP CONSTRAINT IF EXISTS active_requests_status_check;
ALTER TABLE active_requests ADD CONSTRAINT active_requests_status_check CHECK (
  status IN ('pending_order', 'partial_order', 'ready_invoice', 'invoiced')
);

CREATE INDEX IF NOT EXISTS idx_active_requests_pr_id
  ON active_requests (pr_id);

CREATE INDEX IF NOT EXISTS idx_active_requests_status
  ON active_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_active_requests_uids_data_gin
  ON active_requests USING gin (uids_data);

-- ---------------------------------------------------------------------------
-- Atomic PATCH: map CRM order_id onto one course by code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION patch_active_request_course_order(
  p_ar_id        text,
  p_course_code  text,
  p_order_id     text
)
RETURNS active_requests
LANGUAGE plpgsql
AS $$
DECLARE
  v_row   active_requests%ROWTYPE;
  v_uids  jsonb;
  v_uid   jsonb;
  v_new_uids jsonb := '[]'::jsonb;
  v_courses jsonb;
  v_course jsonb;
  v_new_courses jsonb;
  v_found boolean := false;
  v_status text;
  v_total int := 0;
  v_ordered int := 0;
BEGIN
  SELECT * INTO v_row
  FROM active_requests
  WHERE id = p_ar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_uids := COALESCE(v_row.uids_data, '[]'::jsonb);

  FOR v_uid IN SELECT * FROM jsonb_array_elements(v_uids)
  LOOP
    v_new_courses := '[]'::jsonb;
    FOR v_course IN SELECT * FROM jsonb_array_elements(COALESCE(v_uid->'courses', '[]'::jsonb))
    LOOP
      v_total := v_total + 1;
      IF v_course->>'code' = p_course_code THEN
        v_course := jsonb_set(v_course, '{order_id}', to_jsonb(trim(p_order_id)), true);
        v_found := true;
      END IF;
      IF COALESCE(trim(v_course->>'order_id'), '') <> '' THEN
        v_ordered := v_ordered + 1;
      END IF;
      v_new_courses := v_new_courses || jsonb_build_array(v_course);
    END LOOP;
    v_uid := jsonb_set(v_uid, '{courses}', v_new_courses, true);
    v_new_uids := v_new_uids || jsonb_build_array(v_uid);
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'course_code_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_total = 0 OR v_ordered = 0 THEN
    v_status := 'pending_order';
  ELSIF v_ordered = v_total THEN
    v_status := 'ready_invoice';
  ELSE
    v_status := 'partial_order';
  END IF;

  UPDATE active_requests
  SET uids_data = v_new_uids,
      status = v_status,
      updated_at = now()
  WHERE id = p_ar_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

ALTER TABLE active_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active_requests_service_all" ON active_requests;
CREATE POLICY "active_requests_service_all" ON active_requests
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
