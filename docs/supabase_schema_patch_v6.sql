-- =============================================================================
-- supabase_schema_patch_v6.sql  —  Module 3 + 4 (Hóa đơn thuế)
-- Chạy TOÀN BỘ file này 1 lần trên Supabase SQL Editor.
-- Idempotent: chạy lại nhiều lần không bị lỗi.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- BƯỚC 1: Thêm cột mới vào bảng don_hang
-- ---------------------------------------------------------------------------
ALTER TABLE don_hang
  ADD COLUMN IF NOT EXISTS trang_thai_thu_tuc  TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tax_product_name    TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tax_invoice_code    TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tax_product_code    TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS m3_approved_at      TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS crm_order_id        TEXT        DEFAULT NULL;


-- ---------------------------------------------------------------------------
-- BƯỚC 2: Bảng tax_sequences (sequence hóa đơn + mã sản phẩm)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS tax_sequences CASCADE;
CREATE TABLE tax_sequences (
  id          TEXT        PRIMARY KEY,
  current_val INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO tax_sequences (id, current_val) VALUES ('product_code', 0);


-- ---------------------------------------------------------------------------
-- BƯỚC 3: Bảng export_batches (lịch sử xuất hóa đơn)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS export_batches CASCADE;
CREATE TABLE export_batches (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  order_ids   TEXT[]      NOT NULL,
  order_count INTEGER     NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- BƯỚC 4: Trigger tự động set CHO_XAC_NHAN khi tien_ve → TRUE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_trang_thai_thu_tuc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tien_ve = TRUE
     AND (OLD.tien_ve IS DISTINCT FROM TRUE)
     AND NEW.trang_thai_thu_tuc IS NULL
  THEN
    NEW.trang_thai_thu_tuc := 'CHO_XAC_NHAN';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_trang_thai_thu_tuc ON don_hang;
CREATE TRIGGER trg_set_trang_thai_thu_tuc
  BEFORE UPDATE ON don_hang
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_trang_thai_thu_tuc();


-- ---------------------------------------------------------------------------
-- BƯỚC 5: Backfill — đưa các đơn cũ đã có tiền về vào luồng M3
-- ---------------------------------------------------------------------------
UPDATE don_hang
SET trang_thai_thu_tuc = 'CHO_XAC_NHAN'
WHERE tien_ve = TRUE
  AND trang_thai_thu_tuc IS NULL
  AND (trang_thai IS DISTINCT FROM 'huy');


-- ---------------------------------------------------------------------------
-- BƯỚC 6: RLS (Row Level Security) cho 2 bảng mới
-- ---------------------------------------------------------------------------
ALTER TABLE tax_sequences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role bypass tax_sequences" ON tax_sequences;
CREATE POLICY "service_role bypass tax_sequences"
  ON tax_sequences FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role bypass export_batches" ON export_batches;
CREATE POLICY "service_role bypass export_batches"
  ON export_batches FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated read export_batches" ON export_batches;
CREATE POLICY "authenticated read export_batches"
  ON export_batches FOR SELECT TO authenticated USING (true);


-- ---------------------------------------------------------------------------
-- KIỂM TRA KẾT QUẢ (uncomment để chạy sau)
-- ---------------------------------------------------------------------------
-- SELECT trang_thai_thu_tuc, COUNT(*) FROM don_hang GROUP BY 1 ORDER BY 2 DESC;
-- SELECT * FROM tax_sequences;
