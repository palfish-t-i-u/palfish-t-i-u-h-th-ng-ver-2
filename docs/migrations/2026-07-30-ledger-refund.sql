-- Migration: Support refund lines in so_doanh_thu (REV-02)
-- Date: 2026-07-30

ALTER TABLE so_doanh_thu ADD COLUMN IF NOT EXISTS hoan_ref_id uuid NULL;

-- Drop existing loai_nhap check constraints if present and re-add to include 'hoan'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'so_doanh_thu'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) LIKE '%loai_nhap%'
    ) LOOP
        EXECUTE 'ALTER TABLE so_doanh_thu DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;

    ALTER TABLE so_doanh_thu ADD CONSTRAINT so_doanh_thu_loai_nhap_check
        CHECK (loai_nhap IN ('tu_dong', 'tay', 'import:excel', 'import:gsheet', 'hoan'));
END $$;
