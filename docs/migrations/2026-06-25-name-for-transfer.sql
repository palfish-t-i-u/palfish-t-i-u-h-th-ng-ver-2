-- 2026-06-25: thêm name_for_transfer vào payment_lines
-- Lưu lựa chọn tên (parent / child) sale chọn lúc tạo lần thanh toán,
-- để khi sale PATCH PR sau đó có thể rebuild transfer_content giữ đúng
-- lựa chọn ban đầu.
ALTER TABLE public.payment_lines
  ADD COLUMN IF NOT EXISTS name_for_transfer text;

COMMENT ON COLUMN public.payment_lines.name_for_transfer IS
  'Tên (parent name HOẶC child name) sale chọn lúc tạo line. NULL = chưa biết (line cũ trước migration). Refresh-content endpoint dùng làm input cho _build_payos_transfer_description.';
