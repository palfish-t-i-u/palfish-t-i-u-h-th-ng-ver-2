# Nhãn sub-team map cứng → IH2 mượn nhầm tên leader IH1 (+ bẫy reseed ghi đè)

**Related files:** `frontend/src/lib/subTeamLabels.ts`, `frontend/src/lib/subTeamLabels.test.ts`, các call-site `subTeamLabel` (ProfilePage, StaffCRMTab, DashboardTab, AccountDetailDrawer, CrmLinkModal, SignUpPage), `backend/admin_routes.py` (`_hierarchy_member_to_row`, `/admin/sales/sync`), `scripts/seed_nhan_su_sale.py`, `docs/team_hierarchy.json`

**Problem:** Theo yêu cầu anh Hoàng, chia Inhouse 2 thành Team 1 (leader Phi Thi Thu Ha) / Team 2 (leader Nguyen Thi Hai Yen 2) bằng cách set `nhan_su_sale.sub_team = "Team 1"/"Team 2"` cho IH2 (trước đó IH2 để phẳng, `sub_team = null`). Ngay sau đó account IH2 (vd Le Thi Le) hiển thị **"Inhouse 2 · Team SonTT"** — SonTT là leader Team 2 của **Inhouse 1**, chẳng liên quan IH2.

**Trap:** Hai hướng "hiển nhiên" đều sai:
1. **Nghi phân quyền/RBAC lẫn team** — sai. `rbac.py` (`visible_creator_emails`, `enforce_report_scope`) và `_leader_name_for` (payment_request_routes.py) đều so **cả `team` + `sub_team`**, không lẫn. Leader phụ trách trong app vốn ĐÚNG; chỉ NHÃN hiển thị sai.
2. **Đổi tên sub_team IH2 thành chuỗi lạ (vd "Team Ha")** để né map — sẽ vỡ bộ từ vựng dropdown `SUBTEAMS_BY_TEAM` (hardcode `["Team 1".."Sales"]`) → admin sửa account IH2 không có option khớp.

**Insight:** `subTeamLabel(value)` chỉ nhận `value`, tra map cứng `SUBTEAM_LABELS = { "Team 1":"Team HuongPT", "Team 2":"Team SonTT", ... }`. Map này dựng **riêng cho Inhouse 1** (mã "Team N" ↔ tên leader IH1) nhưng áp cho MỌI team. IH2 tái dùng chính "Team 1"/"Team 2" nên bị remap sang leader IH1. Bản chất: **key sub_team KHÔNG unique toàn tổ chức** — nó chỉ unique trong 1 team. Bất cứ hàm nào biến đổi/gom theo `sub_team` mà bỏ `team` đều va chạm chéo team.

**Rule:** Nhãn/nhóm theo `sub_team` PHẢI kèm `team`. `subTeamLabel(value, team?)`: chỉ remap khi `team === "Inhouse 1"` (hoặc không truyền team = backward-compat); team khác trả nhãn thô. Truyền `team` ở mọi call-site render + dropdown. Khi thêm team mới có sub-team, thêm vào `SUBTEAMS_BY_TEAM` (3 file: AccountDetailDrawer/CreateAccountModal/SignUpPage) chứ đừng đổi tên sub_team thành chuỗi ngoài từ vựng.

**Bẫy đi kèm — reseed ghi đè cấu trúc set tay:** Cấu trúc IH2 (sub_team + role leader) set thẳng DB, KHÔNG có trong `docs/team_hierarchy.json` (CRM export để IH2 phẳng). Nút **"Sync Metabase now"** (`/admin/sales/sync`) và `scripts/seed_nhan_su_sale.py` đều `upsert(on_conflict="crm_name")` với `sub_team` từ JSON (null cho IH2) + `role` hardcode "sale" → **ghi đè** cho mọi `crm_name` trùng JSON. Với IH2: 26 người có trong JSON → mất sub_team; 2 leader (Phi Thi Thu Ha không có trong JSON; "Nguyen Thi Hai Yen 2" khác chuỗi "Nguyen Thi Hai Yen" trong JSON) → an toàn. Hệ quả: split IH2 sập → nhãn/leader vỡ lại. Muốn bền phải nhúng IH2 vào `team_hierarchy.json` + **Render redeploy** (file baked vào Docker image, nút đọc file trong container), lưu ý sẽ bị wipe nếu re-export từ Metabase (`extract_hierarchy.cjs`).

**Verify:** `npx vitest run src/lib/subTeamLabels.test.ts` (4 passed: IH1 remap, IH2 giữ thô, backward-compat, rỗng) + `npx tsc -b` clean. Browser: mở drawer account IH2 thấy "Inhouse 2 · Team 2" (không phải "Team SonTT").
