-- Thêm cột uid vào cs_handover_log để webhook GVCN lookup nhanh theo UID.
-- Trước đây uid nằm trong activation_records.uids_data (JSONB nested) — query chậm.

ALTER TABLE cs_handover_log ADD COLUMN IF NOT EXISTS uid TEXT;
CREATE INDEX IF NOT EXISTS idx_cs_handover_log_uid ON cs_handover_log(uid);

-- Backfill: lấy uid từ activation_records.uids_data[0].uid
UPDATE cs_handover_log h
SET uid = sub.first_uid
FROM (
  SELECT ar.id::text AS ar_id_text,
         ar.uids_data->0->>'uid' AS first_uid
  FROM active_requests ar
  WHERE ar.uids_data IS NOT NULL
    AND jsonb_array_length(ar.uids_data) > 0
) sub
WHERE h.ar_id = sub.ar_id_text
  AND h.uid IS NULL;
