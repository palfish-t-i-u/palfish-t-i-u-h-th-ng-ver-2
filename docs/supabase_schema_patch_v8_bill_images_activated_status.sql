-- =============================================================================
-- supabase_schema_patch_v8_bill_images_activated_status.sql
-- Nâng cấp Schema: Hỗ trợ trạng thái 'activated' cho Active Request
-- và mảng bill_images (JSONB) cho payment_lines kèm RPC atomic append.
-- Chạy tệp này trên Supabase SQL Editor.
-- =============================================================================

-- 1. Cập nhật check constraint của active_requests.status để cho phép trạng thái 'activated'
ALTER TABLE public.active_requests DROP CONSTRAINT IF EXISTS active_requests_status_check;
ALTER TABLE public.active_requests ADD CONSTRAINT active_requests_status_check CHECK (
  status IN ('pending_order', 'partial_order', 'ready_invoice', 'invoiced', 'activated')
);

-- 2. Thêm cột bill_images (jsonb) vào bảng payment_lines nếu chưa có
ALTER TABLE public.payment_lines ADD COLUMN IF NOT EXISTS bill_images jsonb DEFAULT '[]'::jsonb;

-- 3. Di chuyển dữ liệu cũ từ cột bill_image sang mảng bill_images để bảo toàn dữ liệu
UPDATE public.payment_lines
SET bill_images = jsonb_build_array(bill_image)
WHERE bill_image IS NOT NULL 
  AND bill_image <> '' 
  AND (bill_images IS NULL OR jsonb_array_length(bill_images) = 0);

-- 4. Tạo hàm RPC phục vụ upload ảnh bill atomic (tránh race condition ghi đè khi upload nhiều ảnh song song)
CREATE OR REPLACE FUNCTION append_payment_line_bill(
  p_line_id uuid,
  p_bill_url text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.payment_lines
  SET bill_images = COALESCE(bill_images, '[]'::jsonb) || jsonb_build_array(p_bill_url),
      bill_image = p_bill_url, -- Giữ để tương thích ngược với các luồng hiển thị cũ
      updated_at = now()
  WHERE id = p_line_id;
END;
$$;

-- Reload PostgREST schema cache để PostgREST cập nhật các cột mới tức thì
NOTIFY pgrst, 'reload schema';
