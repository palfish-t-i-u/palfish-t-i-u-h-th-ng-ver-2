-- 2026-08-26 — Trường "Họ tên đầy đủ trên hóa đơn" cho PR (thuế NĐ 70/2025)
-- Chuẩn kế toán (Sương Mai 26/8): khách LẤY HĐ phải có họ tên đầy đủ + CCCD + email.
-- Tên PR (name) là tên gọi hằng ngày ("Chị Hằng") dùng đối soát/Zalo — không đổi được,
-- nên tách cột riêng cho tên pháp lý in trên hóa đơn.
-- Chạy: sandbox (pxgybyfiwywksesyogti) -> verify -> prod (jozcvbbypwvzaefteoxn).

ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS invoice_customer_name text;

COMMENT ON COLUMN payment_requests.invoice_customer_name IS
  'Họ tên đầy đủ của khách in trên hóa đơn (khách lấy HĐ). NULL = chưa khai.';
