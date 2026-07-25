-- PR-2026-0558: persist lựa chọn "Huỷ / giữ QR cũ" trên cảnh báo stale content.
--
-- Bối cảnh: khi khách đổi thông tin (name/phone/child), line PENDING có QR content cũ
-- → cảnh báo "Khách đã đổi thông tin". Sale có 2 lựa chọn:
--   • Cập nhật QR  → rebuild content theo tên hiện tại (đã lưu vào transfer_content).
--   • Huỷ          → giữ QR cũ (khách đã có QR cũ, SePay vẫn match theo transfer_code).
-- Trước đây "Huỷ" chỉ dismiss trong phiên (React state) → reload/đổi tab là cảnh báo
-- hiện lại. Cột này lưu thời điểm dismiss về server để không nhắc lại.
--
-- Vòng đời cờ:
--   • dismiss-stale endpoint  → set = now()
--   • refresh-content (Cập nhật QR) → clear (NULL): line không còn stale.
--   • patch PR đổi name/phone/child/country/extra_children → clear (NULL): re-arm để
--     divergence MỚI vẫn cảnh báo (tránh giấu lệch mới).
-- _is_payment_line_content_stale trả False khi cột != NULL.

alter table public.payment_lines
  add column if not exists content_stale_dismissed_at timestamptz;

comment on column public.payment_lines.content_stale_dismissed_at is
  'Thời điểm sale bấm "Huỷ/giữ QR cũ" trên cảnh báo stale content. NULL = chưa dismiss. '
  'Clear khi refresh-content hoặc khi PR đổi name/phone/child/country/extra_children.';
