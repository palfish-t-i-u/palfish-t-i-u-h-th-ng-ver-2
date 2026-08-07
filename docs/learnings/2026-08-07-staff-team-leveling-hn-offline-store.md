# Staff sync mis-levels HN Offline Store sub-stores → mất thông báo Zalo

**Related files:** `backend/admin_routes.py` (`_hierarchy_member_to_row`, `_flatten_hierarchy`, `_DEPART6_AS_TEAM`), `docs/team_hierarchy.json`, `backend/tests/test_team_hierarchy_flatten.py`

**Problem:** Bill PR-2026-0935 (sale An Bình / HN Offline Store) auto-confirm đúng nhưng không bắn thông báo Zalo. Sau khi sync nhân sự chạy sáng 2026-08-07, `nhan_su_sale.team` của các sale store bị đổi từ `"HN Offline Store"` → tên store con (`An Binh Store`, `Linh Dam Store`).

**Trap:** Hai hướng "hiển nhiên" đều sai:
1. **Thêm row `zalo_team_groups(team_code=<store>)`** — chỉ vá Zalo, KHÔNG chữa `nhan_su_sale.team` sai, nên dashboard/BXH/báo cáo/RBAC (đều đọc `nhan_su_sale.team` qua `enforce_report_scope`, `rbac.py`) vẫn lệch; mỗi store mới lại phải thêm map.
2. **Sửa sync thành `team = depart6` cho tất cả** — sẽ PHÁ IH1/IH2: depart6 của họ là `"HN Inhouse"` nhưng team đúng phải là depart7 (`"Inhouse 2"`). Không có quy tắc đồng nhất.

**Insight:** `_flatten_hierarchy` copy THẲNG `team`/`sub_team` từ `docs/team_hierarchy.json`, mà file này (snapshot CRM) đặt store con làm `team` (giá trị depart7) và để trống `sub_team`. Việc gộp cấp là **theo từng ô lớn**, không đồng nhất: chỉ `HN Offline Store` (depart6) mới gộp store con (depart7) thành sub-team; inhouse giữ team=depart7. Vì trigger Zalo `payment_paid` route bằng **khớp chuỗi tuyệt đối** `nhan_su_sale.team = zalo_team_groups.team_code` (không canonical hóa) và chỉ `RAISE WARNING + RETURN` khi không thấy group, mọi lệch giá trị team làm rớt tin **âm thầm** — không lỗi, không outbox row (nên không retry được).

**Rule:** Khi thấy `nhan_su_sale.team` của sale store "lạ", so với `depart6_name`/`depart7_name`: HN Offline Store PHẢI là `team`, store là `sub_team`. Sửa ở tầng sync (`_hierarchy_member_to_row` + `_DEPART6_AS_TEAM`), KHÔNG band-aid bằng `zalo_team_groups`. Thêm store/ô lớn mới cần gộp cấp thì thêm vào `_DEPART6_AS_TEAM`, đừng đụng IH1/IH2. Sau sửa dữ liệu prod nhớ deploy Render (backend) trước khi có ai bấm "Sync sales" lại.

**Verify:** `grep -n "_DEPART6_AS_TEAM" backend/admin_routes.py` (phải thấy hằng + dùng trong `_hierarchy_member_to_row`) và `py -m pytest backend/tests/test_team_hierarchy_flatten.py -q` (4 passed).
