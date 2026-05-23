-- PalFish GMV — schema bổ sung Module 1 (v3, idempotent)
-- Thứ tự: v1 → v2 → v3 → v4 (supabase_schema_patch_v4.sql).
-- Prod chỉ có v2: chạy v3 (+ v4) rồi NOTIFY pgrst, 'reload schema';
-- Sau khi chạy: docs/supabase_diagnose.sql để verify cột.

-- === khach_hang (Tab 1 / create order) ===
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS crm_uid varchar;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS ma_vung varchar DEFAULT '+84';
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS dia_chi text;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS tinh varchar;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS quan varchar;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS phuong varchar;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS dia_chi_chi_tiet varchar;

CREATE INDEX IF NOT EXISTS idx_khach_hang_crm_uid ON khach_hang (crm_uid);

-- === don_hang (Tab 1, bill upload, PATCH) ===
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS ma_don_hang varchar;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS goi_hoc varchar;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS nguon_doanh_thu varchar;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS tien_ve boolean DEFAULT false;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS don_crm boolean DEFAULT false;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS bill_image text;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS created_by varchar;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS sale_crm_name varchar;

CREATE UNIQUE INDEX IF NOT EXISTS idx_don_hang_ma_don ON don_hang (ma_don_hang) WHERE ma_don_hang IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_don_hang_info_code ON don_hang (info_code);
CREATE INDEX IF NOT EXISTS idx_don_hang_sale_crm ON don_hang (sale_crm_name);

-- === giao_dich (webhook / đối soát) ===
ALTER TABLE giao_dich ADD COLUMN IF NOT EXISTS info_code_thuc_te varchar;

-- === Nhân sự: ẩn sale Thailand đã seed (không xóa) ===
UPDATE nhan_su_sale
SET is_active = false,
    updated_at = now()
WHERE is_active = true
  AND (
    depart6_name ILIKE '%thailand%'
    OR team IN ('Tele sale', 'P''AU Group', 'P''TEE Group')
  );
