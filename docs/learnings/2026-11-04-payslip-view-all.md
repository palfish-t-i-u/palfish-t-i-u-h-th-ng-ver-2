# Xem hết phiếu lương không được gắn vào role `system` (email trong SYSTEM_ADMIN_EMAILS tự thành system)

**Related files:** `backend/rbac.py` (`visible_payslip_codes`, `_effective_role`, `resolve_actor`), `backend/payroll_routes.py`, `backend/migrations/2026-11-04-hien-ma-nv.sql`

**Problem:** Chị Thu Hiền (HR) xem được phiếu lương của 62 mã NV khác (nhật ký `payslip_views`) dù chỉ cần xem phiếu của mình; đồng thời không xác nhận được phiếu của chính chị (403).

**Trap:**
- `visible_payslip_codes` trả "xem hết" cho mọi `role == "system"`. Role `system` có 3 nguồn độc lập: email trong env `SYSTEM_ADMIN_EMAILS` (Render, `sync: false` → KHÔNG có trong repo), `user_metadata.role` (Supabase Auth), `nhan_su_sale.role`. `_effective_role` lấy role CAO nhất giữa chúng. Query DB (Auth + nhan_su_sale) không thấy chị là system → nguồn duy nhất còn lại là env Render; không đọc được từ repo/git history.
- Email thêm vào `SYSTEM_ADMIN_EMAILS` để cấp quyền admin ở module khác (Sổ doanh thu…) vô tình cấp luôn quyền xem lương toàn công ty.
- Lỗi xác nhận: `_require_owner` cần `nhan_su_sale.ma_nv` khớp `payslips.code`. Chị có phiếu `HN0062` nhưng KHÔNG có dòng `nhan_su_sale` (migration backfill chỉ `UPDATE`, không `INSERT`) → `actor_ma_nv` = None → 403.
- Query lọc `role in ('system','admin')` có thể sót do `_normalize_role` strip + lower; tra thẳng theo email người cần kiểm tra thì chắc hơn.

**Insight:** "Quyền admin ở module khác" và "quyền xem lương mọi người" là hai quyền khác nhau; gắn cả hai vào một role thì mỗi lần cấp admin là lộ lương. Allowlist riêng cho dữ liệu nhạy cảm tách được hai thứ.

**Rule:**
- Xem hết phiếu = role `system` VÀ (env `PAYSLIP_VIEW_ALL_EMAILS` chưa đặt, hoặc email nằm trong danh sách). Env chưa đặt = hành vi cũ nên deploy code không đổi gì cho tới khi đặt env; khi đặt phải liệt kê ĐỦ người cần xem hết (thiếu = họ chỉ thấy phiếu mình).
- Người không có dòng `nhan_su_sale` thì không có `ma_nv` → không xác nhận được phiếu. Thêm dòng với `is_active=false` (rbac không lọc is_active khi tra `ma_nv`, còn mọi roster lọc `is_active=true` nên không lẫn vào danh sách sale).
- Khi điều tra "ai xem được gì" dùng bằng chứng thật: `select viewer_email, count(distinct p.code) from payslip_views join payslips p ...`.

**Verify:** `cd backend && pytest tests/test_payslip_view_all_allowlist.py` pass; sau deploy + đặt env, `GET /payslips` của người ngoài allowlist chỉ trả phiếu có `code` = `ma_nv` của họ.
