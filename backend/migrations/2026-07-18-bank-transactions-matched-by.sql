-- Ghi lại cột matched_by trên bank_transactions vào migration history.
-- Cột ĐÃ TỒN TẠI ở cả prod lẫn sandbox (thêm tay trước đây, không có file) —
-- file này chống mất cột khi reset sandbox / dựng env mới từ migrations
-- (vết xe đổ 23/6: sandbox reset thiếu cột vì replay migrations không đủ).
--
-- Ai ghi cột này:
--   - Manual match (PATCH /api/v1/bank-transactions/{id}/match): email kế toán
--   - Late match (race PayOS↔SePay, fix 18/7): 'system:sepay_late'
--   - auto_matched thường: NULL

ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS matched_by text;

NOTIFY pgrst, 'reload schema';
