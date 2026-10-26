-- GVCN write-back Phase 2: cho phép máy GHI ĐÈ cột GVCN khi GVCN đổi, nhưng KHÔNG
-- đè ô người điền tay. Cần nhớ giá trị GVCN máy ghi lần trước cho mỗi course/dòng
-- sheet: chỉ đè khi ô hiện tại == giá trị máy ghi trước đó (đổi GVCN → cập nhật);
-- ô khác (người điền) → giữ nguyên. NULL = máy chưa ghi GVCN cho course này.
-- (Phase 1 chỉ ghi khi trống; xem cs_handover_sheet._gvcn_decision.)

alter table cs_handover_log add column if not exists gvcn_written text;
