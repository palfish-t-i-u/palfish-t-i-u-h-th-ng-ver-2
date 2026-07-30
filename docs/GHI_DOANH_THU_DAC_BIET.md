# Ghi doanh thu đặc biệt (Special revenue attribution)

Sổ ghi các trường hợp doanh thu **không gắn với sale cá nhân** mà cần ghi nhận
GMV cho một team (in-house), xử lý trực tiếp qua DB vì app chưa hỗ trợ khái niệm
"PR team-level không thuộc sale nào".

## Bối cảnh kỹ thuật (vì sao phải sửa DB)

- `payment_requests` **không có** cột `team`/`team_id`. Team luôn suy ra tại thời
  điểm query: `payment_requests.sale_email` → join `nhan_su_sale.email` →
  `nhan_su_sale.team`.
- Vì vậy muốn "ghi doanh thu cho team X" thì buộc phải trỏ `sale_email` về một
  người thuộc team X. Không có cách gán trực tiếp cho team.
- Tính năng "Tạo hộ PR" (`_TRANSFER_ACTOR_ROLES = {leader, manager, system}`,
  `backend/payment_request_routes.py:927`) chỉ cho phép gán cho **một sale cụ
  thể** trong scope team của actor — cũng không tạo được PR "không thuộc sale nào".
- DingTalk/Zalo routing cũng theo `nhan_su_sale.team` của `sale_email`. Nếu
  `sale_email` không có trong `nhan_su_sale` → PR không thuộc team nào, tin không
  bắn vào nhóm nào.

## Quy ước xử lý

Gán `sale_email` của PR về **manager của team** cần ghi nhận GMV. GMV đội sẽ cộng
đúng cho team đó; ở report cá nhân, PR hiện dưới tên manager (chấp nhận được vì
mục đích là ghi cho team, không phải cho một sale). Luôn ghi một dòng
`pr_ownership_log` (action=`transfer`) làm dấu vết kiểm toán.

Team → manager (tham chiếu, kiểm lại `nhan_su_sale` khi dùng):
- **Inhouse 2** → Bùi Thị Nga `ngabuipalfish@gmail.com` (role=manager)
- Inhouse 1 → Đào Thị Trang (alias Nina)
- Offline → Phạm Thùy Linh

## Nhật ký case

### PR-2026-0698 — 2026-07-30

- **KH**: Chị Lung (`name` = "Chị Lung") — 6,572,000đ, state=done, đã CK. (theo
  yêu cầu của chị Thu Hiền — không xác nhận đây là KH của chị)
- **Người tạo PR**: chị Thu Hiền (`thuhien250801@gmail.com`) — tạo trực tiếp
  (không dùng Tạo hộ). Email này **không có** trong `nhan_su_sale` → PR ban đầu
  không thuộc team nào, không bắn nhóm DingTalk nào.
- **Yêu cầu**: không tính cho sale cá nhân nào, ghi nhận GMV cho **Inhouse 2**.
- **Xử lý**: đổi `sale_email` `thuhien250801@gmail.com` → `ngabuipalfish@gmail.com`
  (Bùi Thị Nga, manager IH2). Ghi `pr_ownership_log` action=`transfer`.
- **SQL**:
  ```sql
  UPDATE payment_requests
  SET sale_email = 'ngabuipalfish@gmail.com', updated_at = now()
  WHERE id = 'PR-2026-0698' AND sale_email = 'thuhien250801@gmail.com';

  INSERT INTO pr_ownership_log (pr_id, action, from_sale_email, to_sale_email, actor_email, reason)
  VALUES ('PR-2026-0698', 'transfer', 'thuhien250801@gmail.com',
          'ngabuipalfish@gmail.com', 'anhminhcv0512@gmail.com',
          'Ghi doanh thu đặc biệt theo yêu cầu của chị Thu Hiền: không tính cho sale cá nhân, ghi nhận GMV cho team Inhouse 2. Gắn cho manager Bùi Thị Nga (IH2).');
  ```
- **Kết quả**: GMV 6,572,000đ cộng cho Inhouse 2. DB PROD
  (`jozcvbbypwvzaefteoxn`).
