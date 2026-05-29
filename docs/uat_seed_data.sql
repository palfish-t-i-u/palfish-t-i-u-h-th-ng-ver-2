-- ========================================================
-- UAT SEED DATA - NAP DU LIEU UAT TOI THIEU CHUAN HOA
-- ========================================================

BEGIN;

-- 1. Tạo PR Tiền mặt (PR-2026-UAT01) - Đã thanh toán đầy đủ 5.000.000 VND
INSERT INTO public.payment_requests (id, name, uid, phone, country, target, received, state)
VALUES ('PR-2026-UAT01', 'Khach UAT Tien Mat', 'uat_tienmat_101', '0912345678', 'VN', 5000000, 5000000, 'done')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, paid_at)
VALUES ('d03e54b3-c12e-4b2a-a53c-1d54f3b7c201', 'PR-2026-UAT01', 'cash', 5000000, 'paid', 'TT-UAT-CASH-01', now())
ON CONFLICT (id) DO NOTHING;

-- 2. Tạo PR Chuyển khoản QR (PR-2026-UAT02) - Đang chờ thanh toán 12.000.000 VND
INSERT INTO public.payment_requests (id, name, uid, phone, country, target, received, state)
VALUES ('PR-2026-UAT02', 'Khach UAT Chuyen Khoan', 'uat_ck_102', '0987654321', 'VN', 12000000, 0, 'pending')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payment_lines (id, payment_request_id, method, amount, status, transfer_code, bill_images)
VALUES ('a8f3b7c2-1d54-4b2a-a53c-d03e54b3c12e', 'PR-2026-UAT02', 'qr', 12000000, 'pending', 'TT-UAT-QR-02', '["https://jozcvbbypwvzaefteoxn.supabase.co/storage/v1/object/public/bills/payment-lines/a8bb7fe2-7dd3-4faa-b3d9-1a9d3f5fe11e/bill-20260529050035086639.jpg"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 3. Tạo Active Request (AR-2026-UAT01) - Đang chờ kích hoạt khóa học (Liên kết với PR Tiền mặt đã thanh toán)
INSERT INTO public.active_requests (id, pr_id, uids_data, status)
VALUES (
  'AR-2026-UAT01',
  'PR-2026-UAT01',
  '[{"uid": "uat_tienmat_101", "phone": "0912345678", "country": "VN", "courses": [{"code": "CODE-UAT-KID1", "name": "Palfish Kid Starter 1", "amount": 2500000, "invoiced": false, "order_id": ""}, {"code": "CODE-UAT-KID2", "name": "Palfish Kid Starter 2", "amount": 2500000, "invoiced": false, "order_id": ""}]}]'::jsonb,
  'pending_order'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
