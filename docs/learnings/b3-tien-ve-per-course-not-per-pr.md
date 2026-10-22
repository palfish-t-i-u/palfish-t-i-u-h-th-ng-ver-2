# Tiền về sớm/muộn ở B3 phải tính per-course, không per-PR

**Related files:** `backend/activation_routes.py`, `frontend/src/components/ActivationTab.tsx`, `frontend/src/components/activation/activationFlatList.ts`

**Problem:** Đơn nhiều bé chung 1 PR (PR-2026-2309: Hồng Ngọc tiền về 08/10, Anh Đức 09/10), tab Tạo gói học (B3) hiện bé Hồng Ngọc "tiền về muộn nhất = 09/10" — kéo mốc của bé kia sang. Kế toán lọc "muộn nhất = hôm nay" ra cả 2 bé → báo sai số.

**Trap:** Tưởng `payment_lines` gắn với từng bé/khoá nên cứ lấy ngày theo line là đúng. Thực ra `_tien_ve_map` gom **tất cả** ngày tiền về của **cả PR** rồi `min/max`, dán nguyên cặp `(som, muon)` lên **mọi** course trong PR (list phẳng render mỗi bé 1 dòng → mọi bé hiện cùng khoảng ngày). Sửa "lấy line mới nhất" cũng sai — vẫn là cấp PR.

**Insight:** `payment_lines` thuộc về **PR, KHÔNG gắn course_code** (schema không có cột liên kết line→bé). Nên không có nguồn trực tiếp nào nói "line này của bé nào". Phải **suy ra bằng ghép** (`_pair_course_dates`): khi số line == số khoá + mọi khoá >0đ → ghép 1-1 theo thứ tự `uids_data` × ngày sort tăng dần; ngược lại (1 khoá nhiều line = tín dụng/cọc; lệch số; có khoá 0đ refer) → fallback `(min,max)` cả PR = hành vi cũ, không regression. Filter ngày ở `ActivationTab.courseVisible` cũng phải hạ xuống **cấp dòng khoá** (trước đó lọc cấp AR rồi mới trải → không cô lập được 1 bé).

**Rule:** Mọi thay đổi "mốc tiền về / ngày theo đơn" ở B3 phải hỏi: **đang ở cấp PR hay cấp course?** Hiển thị + lọc + ngày xuất HĐ (`invoiceDateFor`) đều phải per-course. Đừng neo vào 1 line đại diện của PR. Nếu cần per-course tuyệt đối (ca mixed: 2 bé mà 1 bé tín dụng 2 line), cần thêm cột link `payment_line → course_code` — hiện CHƯA có, đang chấp nhận fallback.

**Verify:** `grep -n "_pair_course_dates" backend/activation_routes.py` (phải có def + gọi trong `_tien_ve_map`); chạy `cd backend && python -m pytest tests/test_tien_ve_map.py -q` — 14 pass gồm 5 ca `_pair_course_dates`.
