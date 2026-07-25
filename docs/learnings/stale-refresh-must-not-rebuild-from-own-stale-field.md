# Stale-content refresh must not rebuild from the line's own stale field

**Related files:** `backend/payment_request_routes.py`, `backend/tests/test_refresh_content_endpoint.py`, `frontend/src/components/payment-request/PrStaleContentWarning.tsx`

**Problem:** PR-2026-0558 — bấm "Cập nhật QR" trên cảnh báo "Khách đã đổi thông tin" xong, reload/đổi tab thì cảnh báo hiện lại y cũ. Trạng thái không bao giờ tắt.

**Trap:** Nghĩ do lần thanh toán ĐÃ HUỶ giữ thông tin cũ nên cờ lệch không tắt. Sai — `_is_payment_line_content_stale` đã return False cho line non-pending (cancelled/paid), cờ là PER-LINE, cảnh báo đang nằm ở line PENDING. Sửa nhầm chỗ cancelled sẽ không đổi gì.

**Insight:** Hàm phát hiện lệch (`_is_payment_line_content_stale`) build "content mong đợi" từ tên HIỆN TẠI của PR (`child_name`/`name`/extra_children), nhưng endpoint refresh (`refresh_payment_line_content`) lại rebuild từ `line.name_for_transfer` — chính là tên CŨ đã stale. Khi chỉ đổi tên (phone giữ nguyên): `new_content == old_content` → guard early-return `updated:False` → KHÔNG ghi DB. FE ẩn cảnh báo lạc quan, nhưng reload BE tính lại (tên hiện tại vs stored cũ) → lệch lại. Hai đường (detect vs fix) đọc khác nguồn tên là gốc của vòng lặp không tắt.

**Rule:** Khi có cặp "detect divergence" + "resolve divergence" trên cùng dữ liệu: cả hai PHẢI đọc cùng một nguồn chân lý. Ở đây resolve phải rebuild từ tên hiện tại của PR (`pr_row.child_name → name`), KHÔNG ưu tiên `line.name_for_transfer`. Sau khi resolve, ghi lại field đã dùng để 2 đường hội tụ. Test hồi quy: đổi tên (giữ phone), gọi refresh không body → `updated:True` và content mang tên mới.

**Verify:** `cd backend && python -m pytest tests/test_refresh_content_endpoint.py::TestRefreshContentEndpoint::test_rebuilds_using_current_name_when_only_name_changed_and_no_body -q`
