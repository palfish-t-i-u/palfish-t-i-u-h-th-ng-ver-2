# Sale→CS handover v2: claim DB + upsert sheet + neo hàng theo cột khoá

**Ngày**: 23/10/2026 · **File**: `backend/cs_handover_sheet.py`, `cs_handover_store.py`, `cs_handover_dedup.py`, `cs_handover_reconcile_worker.py`, `cs_l8_order.py` · **Plan**: `docs/plans/PLAN_cs_handover_v2_hybrid_2026-10-23.md`

## Problem
App ghi dòng bàn giao sang Google Sheet của team sale, nhưng team vẫn ghi tay. Sau 1 ngày live: đẩy đôi (AR-1740), dòng app rơi xa dữ liệu 320 dòng (IH1 gia hạn 848 vs team 526), đẩy dòng rỗng khi sale chưa điền Kênh/Contact, Sale = full name bị dropdown báo "Không hợp lệ", trigger sai (chờ order_id thay vì lúc báo đơn).

## Trap
1. **Cờ dedup trong JSONB `uids_data`** bị ≥4 endpoint ghi đè nguyên khối → lost update; hook dùng snapshot AR cũ → worker + hook cùng đẩy.
2. **`_next_empty_row = len(values)+1`**: 1 ô nháp lẻ (dropdown "Undone" cột N) hoặc cột STT điền sẵn tới dòng 847 kéo điểm append xuống rất xa. Team luôn điền ngay sau dòng dữ liệu cuối → 2 bên lệch vị trí → sinh trùng.
3. **Match theo tiền** sai với đơn thẻ (app lưu NET 17.778.324, team ghi niêm yết 17.820.000).
4. **Match theo SĐT 1 cột** sai khi team ghi SĐT = số Zalo liên hệ, app lưu SĐT tài khoản (AR-1731: …3668 vs …7839).
5. Trạng thái terminal cho course "thiếu Kênh/Contact" sẽ chặn vĩnh viễn khi sale điền bổ sung sau.
6. Header giả "Column 3…15" (Google sinh khi import) làm cột trống cuối lệch 13 cột.

## Insight
- Nguồn sự thật dedup phải là **bảng riêng + claim atomic** (`INSERT … ON CONFLICT DO NOTHING`, reclaim có điều kiện khi stale/retryable). Kẻ thua race dừng TRƯỚC khi chạm sheet. Mọi hook re-fetch AR lúc chạy.
- **Upsert** thay append-only: khớp 1 dòng team → chỉ điền ô trống; 0 → append + đọc lại xác minh marker; ≥2 → không đoán. Khoá = {SĐT, Contact ID} hai phía ∩ + tên bé; tiền chỉ là tiebreak ±3%.
- **Neo hàng trống theo cột khoá** (Tên KH/SĐT/UID): last_data = dòng cuối có ô khoá; target = dòng đầu sau đó mà mọi cột app sở hữu trống. Ô nháp cột khác / STT điền sẵn không ảnh hưởng.
- Cửa sổ match **14 ngày theo Ngày bàn giao** (fallback 400 dòng cuối) để đơn cũ cùng khách (gia hạn) không bị điền nhầm.
- Dropdown-aware: đọc `dataValidation` (LIST/RANGE) cột Sale/Kênh, cache 1h; Sale = mã TVTS ngắn nếu ∈ list.
- Worker dedup: dòng app (marker) + dòng team trùng → merge khi dòng app CS=0 (fill-empty → re-read marker → deleteDimension), có CS data → `dup_manual`. Xử từ dưới lên, cặp có dòng dưới dòng vừa xoá để tick sau.

## Rule
- Ghi sheet của team: **claim DB trước**, **đọc tab 1 lần**, **không đè ô có data**, **không xoá dòng có CS data**, **đọc lại sau ghi**. Course thiếu dữ kiện → KHÔNG ghi row terminal.
- Mọi kênh ghi (hook / worker) phải có nhánh "đã được kênh khác xử lý" (learning `dual-channel-race-match-only-pending.md`).
- Script dọn sheet: dry-run mặc định, `--apply` riêng; xoá chỉ sau khi đọc lại khớp key.
