-- Thêm cột wants_invoice cho payment_requests
-- Khách cần xuất hóa đơn → bắt buộc địa chỉ đầy đủ khi tạo PR
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS wants_invoice boolean DEFAULT false;
