-- Cờ sale tự xác nhận đã điền địa chỉ khách trên CRM (số VN) khi báo đơn.
-- Mirror hold_activation: NOT NULL DEFAULT false.
-- Grandfather: đơn cũ đã qua cổng địa chỉ cũ / đã xử lý → set true để Ops không thấy cảnh báo giả.
ALTER TABLE active_requests
  ADD COLUMN IF NOT EXISTS crm_address_confirmed boolean NOT NULL DEFAULT false;

UPDATE active_requests
  SET crm_address_confirmed = true
  WHERE crm_address_confirmed = false;
