-- Migration: thêm image_urls (JSONB array) vào dingtalk_outbox — hỗ trợ gửi NHIỀU ảnh bill.
-- Lý do: a Hiếu chốt 17/7 — tin "báo đơn" (activation_request_created) trên DingTalk phải
--   gom TẤT CẢ bill của các lần TT gửi 1 thể (trước chỉ gửi 1 ảnh qua image_url).
-- Worker: nếu image_urls có → loop send_group_image từng ảnh; else fallback image_url đơn.
-- Mirror pattern zalo_outbox.image_urls (2026-07-08). Nullable, backward-compat.

ALTER TABLE public.dingtalk_outbox
  ADD COLUMN IF NOT EXISTS image_urls jsonb;
