-- Thêm event_type 'bill_updated' cho DingTalk outbox.
-- Dùng cho tin "SALE CẬP NHẬT ẢNH BILL" khi sale up bill lên đơn ĐÃ BÁO.
-- Producer: activation_routes._maybe_enqueue_bill_updated_dingtalk (gọi tại
--   payment_request_routes POST /payment-lines/{id}/bills). Worker KHÔNG đổi
--   (route theo nội dung row: text → sampleText, ảnh+message rỗng → card ảnh).
--
-- CHECK re-validate TOÀN BỘ dòng cũ khi ADD → PHẢI liệt kê ĐỦ 5 value cũ
-- (từ 2026-07-13-notification-rearchitecture.sql:107-111) + 'bill_updated'.
-- Idempotent DROP+ADD; apply sandbox -> smoke -> prod.

ALTER TABLE public.dingtalk_outbox DROP CONSTRAINT IF EXISTS dingtalk_outbox_event_type_check;
ALTER TABLE public.dingtalk_outbox ADD CONSTRAINT dingtalk_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_paid'::text, 'course_activated'::text, 'activation_urgent_reminder'::text,
    'activation_request_created'::text, 'pr_fully_paid'::text, 'bill_updated'::text
  ]));
