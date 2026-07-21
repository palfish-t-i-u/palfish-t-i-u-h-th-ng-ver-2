# activation — module notes

## UID sync (B1↔B3 divergence)

PR và AR lưu UID độc lập. Khi sale sửa UID ở PR (B1), AR (B3) KHÔNG tự cập nhật.

- `ActivationTab.uidSync.ts` — `getUidSyncState(pr, ar)`: phân loại `match` / `none` / `diverged`
- Drawer kích hoạt hiện badge đỏ "UID lệch với TT khách" khi diverged
- AR 1-UID: nút "Đồng bộ từ PR" ghi đè UID trong `uids_data`
- AR nhiều UID: chỉ cảnh báo, KHÔNG ghi đè (G-UID1 — effect never-overwrite)
- FE-only, 0 BE changes

## Báo đơn bổ sung (append flow)

Khi PH đóng thêm gói (cùng PR), sale append bé/gói vào AR đã tạo thay vì tạo AR mới.

- BE: `POST /active-requests/{ar_id}/append` — `_append_children_core`
- Course code tiếp seq: `start_seq + _max_course_seq` (không trùng code cũ)
- DingTalk tin bổ sung: `source_suffix` deterministic né outbox UNIQUE
- FE: modal báo đơn bổ sung → SĐT per bé, cảnh báo Sửa

## Key files

| File | Mục đích |
|------|----------|
| `ActivationTab.tsx` | Tab chính + UID warning badge + sync button |
| `ActivationTab.uidSync.ts` | Pure fn `getUidSyncState` |
| `ActivationTab.uidSync.test.ts` | Unit tests cho UID sync |
| `ActivationRowCards.tsx` | Mobile card layout |
