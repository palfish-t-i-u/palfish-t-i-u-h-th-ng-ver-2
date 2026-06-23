-- Migration SQL: Zalo OA Notification Integration
-- Creates tables: zalo_outbox, zalo_team_groups, zalo_oa_credentials
-- Creates triggers on: payment_lines (paid), active_requests (activated)

-- 1. Create Tables

CREATE TABLE IF NOT EXISTS public.zalo_outbox (
  id              BIGSERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL CHECK (event_type IN ('payment_paid', 'course_activated')),
  source_table    TEXT NOT NULL,
  source_id       UUID NOT NULL,
  group_id        TEXT NOT NULL,
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  retries         INT DEFAULT 0,
  last_error      TEXT,
  next_retry_at   TIMESTAMPTZ,
  zalo_message_id TEXT,
  UNIQUE (source_table, source_id, event_type)
);

CREATE TABLE IF NOT EXISTS public.zalo_team_groups (
  team_code   TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL,
  group_name  TEXT,
  is_active   BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.zalo_oa_credentials (
  id              SERIAL PRIMARY KEY,
  app_id          TEXT NOT NULL,
  app_secret      TEXT NOT NULL,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Indices
CREATE INDEX IF NOT EXISTS idx_zalo_outbox_pending ON public.zalo_outbox(next_retry_at) WHERE sent_at IS NULL;

-- 3. Enable RLS and add service_role policies
ALTER TABLE public.zalo_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role bypass zalo_outbox" ON public.zalo_outbox;
CREATE POLICY "service_role bypass zalo_outbox"
  ON public.zalo_outbox FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.zalo_team_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role bypass zalo_team_groups" ON public.zalo_team_groups;
CREATE POLICY "service_role bypass zalo_team_groups"
  ON public.zalo_team_groups FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.zalo_oa_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role bypass zalo_oa_credentials" ON public.zalo_oa_credentials;
CREATE POLICY "service_role bypass zalo_oa_credentials"
  ON public.zalo_oa_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Trigger Functions and Triggers

-- Trigger 1: payment_lines (paid)
CREATE OR REPLACE FUNCTION public.fn_payment_paid_zalo_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_sale_email TEXT;
  v_customer TEXT;
  v_sale_team TEXT;
  v_sale_name TEXT;
  v_group_id TEXT;
  v_message TEXT;
  v_amount_fmt TEXT;
BEGIN
  -- Fire only when status transitions from not-paid to paid
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    -- Lookup parent payment request and sale info
    SELECT pr.sale_email, pr.name, ns.team, ns.display_name
      INTO v_sale_email, v_customer, v_sale_team, v_sale_name
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.payment_request_id
      LIMIT 1;

    -- Look up group_id mapped to sale's team
    SELECT group_id INTO v_group_id
      FROM public.zalo_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_group_id IS NULL THEN
      RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    -- Format amount: e.g. 1,500,000
    v_amount_fmt := to_char(NEW.amount, 'FM999,999,999,999');
    
    -- Format message matching specification
    v_message := format(
      '💰 PAID — KH %s | %sđ | sale %s | %s | %s',
      COALESCE(v_customer, '?'),
      v_amount_fmt,
      COALESCE(v_sale_name, v_sale_email, '?'),
      COALESCE(NEW.method, '?'),
      COALESCE(to_char(COALESCE(NEW.paid_at, NEW.confirmed_at, NEW.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), '?')
    );

    -- Insert into outbox table
    INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message)
    VALUES ('payment_paid', 'payment_lines', NEW.id, v_group_id, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_payment_paid_zalo ON public.payment_lines;
CREATE TRIGGER trg_payment_paid_zalo
  AFTER UPDATE ON public.payment_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_paid_zalo_notify();


-- Trigger 2: active_requests (activated)
CREATE OR REPLACE FUNCTION public.fn_course_activated_zalo_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_uid_block JSONB;
  v_course JSONB;
  v_courses_list TEXT := '';
  v_sale_email TEXT;
  v_customer_from_pr TEXT;
  v_sale_team TEXT;
  v_sale_name TEXT;
  v_group_id TEXT;
  v_message TEXT;
BEGIN
  -- Fire only when status transitions from not-activated to activated
  IF NEW.status = 'activated' AND (OLD.status IS NULL OR OLD.status != 'activated') THEN
    -- Extract all course names from JSONB uids_data safely
    IF NEW.uids_data IS NOT NULL AND jsonb_typeof(NEW.uids_data) = 'array' THEN
      FOR v_uid_block IN SELECT * FROM jsonb_array_elements(NEW.uids_data)
      LOOP
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

    -- Lookup parent payment request and sale info
    SELECT pr.sale_email, pr.name, ns.team, ns.display_name
      INTO v_sale_email, v_customer_from_pr, v_sale_team, v_sale_name
      FROM public.payment_requests pr
      LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
      WHERE pr.id = NEW.pr_id
      LIMIT 1;

    -- Look up group_id mapped to sale's team
    SELECT group_id INTO v_group_id
      FROM public.zalo_team_groups
      WHERE team_code = v_sale_team AND is_active = true
      LIMIT 1;

    IF v_group_id IS NULL THEN
      RAISE WARNING 'No active Zalo group mapping found for team: %', v_sale_team;
      RETURN NEW;
    END IF;

    -- Format message matching specification
    v_message := format(
      '✅ KÍCH HOẠT — KH %s | gói %s | sale %s',
      COALESCE(NEW.customer_name, v_customer_from_pr, '?'),
      CASE WHEN v_courses_list = '' THEN '?' ELSE v_courses_list END,
      COALESCE(v_sale_name, v_sale_email, '?')
    );

    -- Insert into outbox table
    -- Since active_requests.id is TEXT, we deterministically convert it to UUID using md5
    INSERT INTO public.zalo_outbox (event_type, source_table, source_id, group_id, message)
    VALUES ('course_activated', 'active_requests', md5(NEW.id)::uuid, v_group_id, v_message)
    ON CONFLICT (source_table, source_id, event_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_course_activated_zalo ON public.active_requests;
CREATE TRIGGER trg_course_activated_zalo
  AFTER UPDATE ON public.active_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_course_activated_zalo_notify();

NOTIFY pgrst, 'reload schema';
