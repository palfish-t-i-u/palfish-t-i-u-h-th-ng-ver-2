-- Add is_test flag to all operational tables so test data can be
-- identified and cleaned up easily.
--
-- PR tạo bởi tài khoản @dev → is_test = true.
-- payment_lines, active_requests, so_doanh_thu kế thừa từ PR gốc.

ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE payment_lines
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE active_requests
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE so_doanh_thu
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
