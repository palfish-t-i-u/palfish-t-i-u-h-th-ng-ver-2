-- PalFish GMV Reconciliation — bổ sung cột cho Module 1
-- Chạy trong Supabase SQL Editor (project jozcvbbypwvzaefteoxn)
-- uid CRM ≠ khach_hang.id (uuid nội bộ)

-- === khach_hang ===
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS crm_uid varchar;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS ma_vung varchar DEFAULT '+84';
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS dia_chi text;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS tinh varchar;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS quan varchar;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS phuong varchar;
ALTER TABLE khach_hang ADD COLUMN IF NOT EXISTS dia_chi_chi_tiet varchar;

CREATE INDEX IF NOT EXISTS idx_khach_hang_crm_uid ON khach_hang (crm_uid);

COMMENT ON COLUMN khach_hang.crm_uid IS 'UID PalFish/CRM — sale nhập ở Tab 1';
COMMENT ON COLUMN khach_hang.id IS 'UUID nội bộ — FK don_hang.khach_hang_id';

-- === don_hang ===
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS ma_don_hang varchar;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS goi_hoc varchar;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS nguon_doanh_thu varchar;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS tien_ve boolean DEFAULT false;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS don_crm boolean DEFAULT false;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS bill_image text;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS created_by varchar;

CREATE UNIQUE INDEX IF NOT EXISTS idx_don_hang_ma_don ON don_hang (ma_don_hang) WHERE ma_don_hang IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_don_hang_info_code ON don_hang (info_code);

-- trang_thai gợi ý: cho_thanh_toan | da_thanh_toan | da_tao_crm

-- === giao_dich ===
-- Giữ nguyên: chỉ INSERT khi tiền thật vào bank (webhook / đối soát SMS)
-- don_hang_id gán sau khi khớp info_code từ nội dung CK
ALTER TABLE giao_dich ADD COLUMN IF NOT EXISTS info_code_thuc_te varchar;
-- trang_thai_doi_soat gợi ý: khop | chua_xu_ly | sai_tien
