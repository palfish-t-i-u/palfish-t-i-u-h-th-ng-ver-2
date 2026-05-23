-- PalFish GMV — schema patch v5 (idempotent)
-- Chạy SAU v4. Cuối: NOTIFY pgrst, 'reload schema';
-- Hỗ trợ form QR mới (2026-05-22):
--   1) dat_coc bool — sale tick "Đặt cọc" → không cần gói học + nguồn
--   2) lead_kenh varchar — children droplist khi nguồn = "Bán mới" (KOC, Offline, Booth, Livestream, Tiktok, Tiktokshop, FB-*)
--   3) uid_phu jsonb — danh sách UID con khi 1 khách thanh toán gói cho >=2 bé

-- === 1. Cột mới trên don_hang ===
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS dat_coc boolean NOT NULL DEFAULT false;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS lead_kenh varchar;
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS uid_phu jsonb NOT NULL DEFAULT '[]'::jsonb;

-- === 2. Mở rộng CHECK nguon_doanh_thu (nếu có constraint cũ) ===
ALTER TABLE don_hang DROP CONSTRAINT IF EXISTS don_hang_nguon_check;
-- Không tái tạo CHECK cứng — danh sách nguồn có thể mở rộng. Validation FE.

-- === 3. Reload PostgREST schema cache ===
NOTIFY pgrst, 'reload schema';
