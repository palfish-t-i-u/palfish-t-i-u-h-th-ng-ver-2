-- Add audit columns to payment_lines for tracking who confirmed/rejected each transaction
ALTER TABLE payment_lines
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_source TEXT;

COMMENT ON COLUMN payment_lines.confirmed_by IS 'Email of user who last confirmed/rejected, or system:payos / system:sepay for auto';
COMMENT ON COLUMN payment_lines.confirmed_at IS 'Timestamp of last confirm/reject action';
COMMENT ON COLUMN payment_lines.confirmed_source IS 'Source: manual / payos / sepay / outside / card';

CREATE INDEX IF NOT EXISTS idx_payment_lines_confirmed_by ON payment_lines(confirmed_by);
