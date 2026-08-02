-- Migration: Add fee and net revenue fields to so_doanh_thu (REV-04)
-- Date: 2026-07-30

ALTER TABLE so_doanh_thu ADD COLUMN IF NOT EXISTS phi_cong bigint NOT NULL DEFAULT 0;
ALTER TABLE so_doanh_thu ADD COLUMN IF NOT EXISTS so_tien_net bigint NULL;
ALTER TABLE so_doanh_thu ADD COLUMN IF NOT EXISTS gateway_txn_id uuid NULL;
