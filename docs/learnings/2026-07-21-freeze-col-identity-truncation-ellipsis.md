# Freeze column identity truncation & ellipsis on child block elements

**Related files:** `frontend/src/components/permissions/permissions.css`, `frontend/src/components/permissions/PermissionsTab.tsx`

**Problem:** Trong ma trận phân quyền Phân quyền (Perms), khi cuộn ngang trên mobile 375px, cột Module đầu tiên được freeze trái (`position: sticky; left: 0`). Áp dụng `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` lên `td:first-child` với `max-width: 150px` hoạt động tốt để co bề rộng, nhưng chữ thực sự nằm trong `<div class="pm-module-name">{label}</div>`. Vì `text-overflow` không kế thừa xuống phần tử block con, các module tên dài ("Đối soát giao dịch (Chuyển khoản)", "Đối soát giao dịch mPOS/Payoo", "BC01/BC03", v.v.) bị cắt chữ thô mép phải mà không xuất hiện dấu `...` (ellipsis).

**Trap:** Thấy cell `<td>` bị tràn text → đặt thẳng `text-overflow: ellipsis` lên `<td>`. Thuộc tính `text-overflow: ellipsis` chỉ có tác dụng trực tiếp lên các phần tử inline / inline-block / block chứa text Node trực tiếp. Khi nội dung bên trong là `<div class="pm-module-name">`, `<td>` bọc ngoài không tự truyền ellipsis xuống `<div>` con. Kết quả: chữ bị xén cụt mà không có dấu ba chấm `...`.

**Insight:** Để ellipsis hiển thị đúng trên các ô freeze có cấu trúc JSX phức tạp (như `<td><div class="pm-module-name">...</div></td>`), thuộc tính `text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap`, và `display: block` phải được đặt trực tiếp lên phần tử class con chứa text (`.pm-module-name`), trong khi `max-width` và `position: sticky` giữ nguyên trên `td:first-child`.

**Rule:** Khi xử lý ellipsis cho cột đông cứng (freeze column) hoặc cell trong bảng:
1. Đặt `max-width` + `overflow: hidden` ở `<td>` / `<th>` để khống chế ô.
2. Đặt `display: block`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap` trực tiếp lên `class` / phần tử text con thực sự chứa chuỗi.

**Verify:** Mở bảng ở 375px, kiểm tra các dòng có tên dài — xác nhận hiển thị dấu `...` ở đuôi tên module và không bị xén chữ tràn sang cột kế bên.
