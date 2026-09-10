-- ============================================================
-- Tracker tạm 1 tuần: phát hiện regression từ fix sửa AR 9/9
-- Tested on sandbox pxgybyfiwywksesyogti — 3/3 anomaly types detected, 0 false positives
-- Chạy TEARDOWN cuối file sau khi hết theo dõi (~16/9/2026)
-- ============================================================

-- 1. Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Change log: ghi mỗi lần uids_data hoặc hold thay đổi
CREATE TABLE IF NOT EXISTS ops_ar_change_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ar_id      text        NOT NULL,
  pr_id      text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_uids   jsonb       NOT NULL,
  new_uids   jsonb       NOT NULL,
  old_hold   boolean,
  new_hold   boolean,
  course_count_old int NOT NULL DEFAULT 0,
  course_count_new int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ops_ar_log_time ON ops_ar_change_log(changed_at);

-- 3. Trigger function (AFTER UPDATE, exception-safe — không bao giờ chặn PATCH)
CREATE OR REPLACE FUNCTION ops_log_ar_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cnt_old int := 0;
  cnt_new int := 0;
BEGIN
  IF OLD.uids_data IS NOT DISTINCT FROM NEW.uids_data
     AND OLD.hold_activation IS NOT DISTINCT FROM NEW.hold_activation THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO cnt_old
    FROM jsonb_array_elements(OLD.uids_data) u,
         jsonb_array_elements(u.value->'courses') c;
  SELECT count(*) INTO cnt_new
    FROM jsonb_array_elements(NEW.uids_data) u,
         jsonb_array_elements(u.value->'courses') c;

  INSERT INTO ops_ar_change_log
    (ar_id, pr_id, old_uids, new_uids, old_hold, new_hold, course_count_old, course_count_new)
  VALUES
    (NEW.id, NEW.pr_id, OLD.uids_data, NEW.uids_data,
     OLD.hold_activation, NEW.hold_activation, cnt_old, cnt_new);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- 4. Trigger
DROP TRIGGER IF EXISTS trg_ops_ar_change ON active_requests;
CREATE TRIGGER trg_ops_ar_change
  AFTER UPDATE ON active_requests
  FOR EACH ROW
  EXECUTE FUNCTION ops_log_ar_change();

-- 5. Alerts table
CREATE TABLE IF NOT EXISTS ops_alerts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ar_id      text        NOT NULL,
  alert_type text        NOT NULL,
  severity   text        NOT NULL DEFAULT 'warning',
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_dedup
  ON ops_alerts(ar_id, alert_type, created_at);

-- 6. Check function (chạy mỗi 30 phút bởi pg_cron)
--    Checks: cross-AR code, course removed, hold flip-back, UID shift
--    Alert → notifications table → chuông in-app
CREATE OR REPLACE FUNCTION ops_check_ar_edit() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r           record;
  alert_count int := 0;
  v_email     text := 'anhminhcv0512@gmail.com';
  ar_seq      text;
  pr_seq      text;
BEGIN
  -- A: Cross-AR code contamination
  -- Course code CC-<seq>-NNN phải match PR seq HOẶC AR seq
  FOR r IN
    SELECT ar.id AS ar_id, ar.pr_id,
           substring(ar.pr_id FROM '(\d+)\D*$') AS pr_seq,
           substring(ar.id   FROM '(\d+)\D*$') AS ar_seq,
           c.value->>'code' AS course_code
      FROM active_requests ar,
           jsonb_array_elements(ar.uids_data) u,
           jsonb_array_elements(u.value->'courses') c
     WHERE ar.is_test IS NOT TRUE
       AND ar.status != 'cancelled'
       AND c.value->>'code' IS NOT NULL
       AND ar.pr_id ~ '-\d{4,}$'
  LOOP
    pr_seq := r.pr_seq;
    ar_seq := r.ar_seq;
    IF pr_seq IS NOT NULL AND ar_seq IS NOT NULL
       AND r.course_code !~ ('^CC-' || pr_seq || '-')
       AND r.course_code !~ ('^CC-' || ar_seq || '-') THEN
      IF NOT EXISTS (
        SELECT 1 FROM ops_alerts
         WHERE ar_id = r.ar_id AND alert_type = 'cross_ar_code'
           AND created_at > now() - interval '24 hours'
      ) THEN
        INSERT INTO ops_alerts (ar_id, alert_type, severity, detail)
        VALUES (r.ar_id, 'cross_ar_code', 'critical',
                jsonb_build_object(
                  'course_code', r.course_code,
                  'expected_pr_prefix', 'CC-' || pr_seq || '-',
                  'expected_ar_prefix', 'CC-' || ar_seq || '-',
                  'pr_id', r.pr_id));
        alert_count := alert_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- B: Course removed after PATCH (đặc biệt gói đã có order_id)
  FOR r IN
    SELECT cl.ar_id, cl.pr_id, cl.changed_at,
           cl.course_count_old, cl.course_count_new,
           (SELECT count(*)
              FROM jsonb_array_elements(cl.old_uids) ou,
                   jsonb_array_elements(ou.value->'courses') oc
             WHERE coalesce(oc.value->>'order_id','') != ''
               AND NOT EXISTS (
                 SELECT 1 FROM jsonb_array_elements(cl.new_uids) nu,
                               jsonb_array_elements(nu.value->'courses') nc
                  WHERE nc.value->>'code' = oc.value->>'code'
               )
           ) AS ordered_lost
      FROM ops_ar_change_log cl
     WHERE cl.changed_at > now() - interval '2 hours'
       AND cl.course_count_new < cl.course_count_old
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM ops_alerts
       WHERE ar_id = r.ar_id AND alert_type IN ('course_removed','course_removed_ordered')
         AND created_at > now() - interval '24 hours'
    ) THEN
      INSERT INTO ops_alerts (ar_id, alert_type, severity, detail)
      VALUES (r.ar_id,
              CASE WHEN r.ordered_lost > 0 THEN 'course_removed_ordered' ELSE 'course_removed' END,
              CASE WHEN r.ordered_lost > 0 THEN 'critical' ELSE 'warning' END,
              jsonb_build_object('old_count', r.course_count_old, 'new_count', r.course_count_new,
                                 'ordered_lost', r.ordered_lost, 'changed_at', r.changed_at));
      alert_count := alert_count + 1;
    END IF;
  END LOOP;

  -- C: Hold flip-back (A→B→A trong ≤2 phút = draft đè hold)
  FOR r IN
    SELECT c1.ar_id, c1.changed_at AS flip1, c2.changed_at AS flip2
      FROM ops_ar_change_log c1
      JOIN ops_ar_change_log c2
        ON c1.ar_id = c2.ar_id AND c2.id > c1.id
     WHERE c1.changed_at > now() - interval '2 hours'
       AND c1.old_hold IS DISTINCT FROM c1.new_hold
       AND c2.old_hold IS DISTINCT FROM c2.new_hold
       AND c1.old_hold = c2.new_hold
       AND c2.changed_at - c1.changed_at < interval '2 minutes'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM ops_alerts
       WHERE ar_id = r.ar_id AND alert_type = 'hold_flip_back'
         AND created_at > now() - interval '24 hours'
    ) THEN
      INSERT INTO ops_alerts (ar_id, alert_type, severity, detail)
      VALUES (r.ar_id, 'hold_flip_back', 'warning',
              jsonb_build_object('flip1', r.flip1, 'flip2', r.flip2));
      alert_count := alert_count + 1;
    END IF;
  END LOOP;

  -- D: UID shift (uid đổi vị trí block — bug removeUidGroup)
  FOR r IN
    SELECT cl.ar_id, cl.changed_at,
           ou.value->>'uid' AS uid,
           ou.ordinality AS old_pos, nu.ordinality AS new_pos
      FROM ops_ar_change_log cl,
           jsonb_array_elements(cl.old_uids) WITH ORDINALITY ou,
           jsonb_array_elements(cl.new_uids) WITH ORDINALITY nu
     WHERE cl.changed_at > now() - interval '2 hours'
       AND ou.value->>'uid' = nu.value->>'uid'
       AND coalesce(ou.value->>'uid','') != ''
       AND ou.ordinality != nu.ordinality
       AND jsonb_array_length(cl.old_uids) = jsonb_array_length(cl.new_uids)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM ops_alerts
       WHERE ar_id = r.ar_id AND alert_type = 'uid_shift'
         AND created_at > now() - interval '24 hours'
    ) THEN
      INSERT INTO ops_alerts (ar_id, alert_type, severity, detail)
      VALUES (r.ar_id, 'uid_shift', 'warning',
              jsonb_build_object('uid', r.uid, 'old_pos', r.old_pos, 'new_pos', r.new_pos,
                                 'changed_at', r.changed_at));
      alert_count := alert_count + 1;
    END IF;
  END LOOP;

  -- Gửi notification nếu có alert mới
  IF alert_count > 0 THEN
    INSERT INTO notifications (id, user_email, kind, payload, created_at)
    VALUES (gen_random_uuid(), v_email, 'ops_alert',
      jsonb_build_object(
        'title', '[Tracker] ' || alert_count || ' canh bao sua AR',
        'body', 'Phat hien ' || alert_count || ' bat thuong trong 2h qua. Xem bang ops_alerts.'),
      now());
  END IF;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO notifications (id, user_email, kind, payload, created_at)
  VALUES (gen_random_uuid(), v_email, 'ops_alert',
    jsonb_build_object('title', '[Tracker] Loi chay check', 'body', SQLERRM),
    now());
END;
$$;

-- 7. Cron job: mỗi 30 phút
SELECT cron.schedule('ops-check-ar-edit', '*/30 * * * *', 'SELECT ops_check_ar_edit()');


-- ============================================================
-- TEARDOWN — chạy SAU khi hết theo dõi (~16/9/2026)
-- ============================================================
-- SELECT cron.unschedule('ops-check-ar-edit');
-- DROP TRIGGER IF EXISTS trg_ops_ar_change ON active_requests;
-- DROP FUNCTION IF EXISTS ops_log_ar_change();
-- DROP FUNCTION IF EXISTS ops_check_ar_edit();
-- DROP TABLE IF EXISTS ops_alerts;
-- DROP TABLE IF EXISTS ops_ar_change_log;
-- DROP EXTENSION IF EXISTS pg_cron;
