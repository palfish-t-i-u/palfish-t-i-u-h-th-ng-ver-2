-- Fix: payment_requests.id = text (PR-2026-XXXX), active_requests.pr_id phải là text
-- Chạy 1 lần nếu POST active-requests báo lỗi FK / type mismatch.

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

ALTER TABLE active_requests
  ADD CONSTRAINT active_requests_pr_id_fkey
  FOREIGN KEY (pr_id) REFERENCES payment_requests (id) ON DELETE RESTRICT;

NOTIFY pgrst, 'reload schema';
