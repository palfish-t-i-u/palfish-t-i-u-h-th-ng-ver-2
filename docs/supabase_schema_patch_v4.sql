-- PalFish GMV — schema patch v4 (idempotent)
-- Chạy SAU v3. Cuối cùng (hoặc sau mọi patch): NOTIFY pgrst, 'reload schema';
-- Fix các lỗi user test 2026-05-21:
--   1) don_hang_trang_thai_check chặn 'cho_thanh_toan'
--   2) cột ghi_chu thiếu trên don_hang → "Schema chưa đủ cột" khi điền ghi chú
--   3) PostgREST schema cache stale → PGRST204 'bill_image'

-- === 1. Drop + recreate CHECK constraint don_hang.trang_thai ===
ALTER TABLE don_hang DROP CONSTRAINT IF EXISTS don_hang_trang_thai_check;
ALTER TABLE don_hang
  ADD CONSTRAINT don_hang_trang_thai_check
  CHECK (trang_thai IN ('cho_thanh_toan', 'da_thanh_toan', 'da_tao_crm', 'huy'));

-- === 2. Cột ghi_chu (Tab 1, optional) ===
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS ghi_chu text;

-- === 3. Reload PostgREST schema cache (fix PGRST204 sau ALTER) ===
NOTIFY pgrst, 'reload schema';
