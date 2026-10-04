# Phiếu lương kỳ 2026-09 — danh sách chưa nhận + ô tick lệch

Ngày lập: 2026-10-04. Nguồn: DB app (payslips) + sheet "Bảng lương" + _outbox + _gate_state.
**CHƯA TICK gì cả** — bảng này để hỏi Chung xác nhận.

## Trạng thái tổng
- Hàng chờ (_outbox) kỳ 2026-09: 52 dòng, TẤT CẢ "sent", 0 đang chờ. Queue sạch.
- App thực nhận: **44 người sau thuế** (2 đã xác nhận: HN0006 Trần Thị Sơn, HN0115 Vũ Hồ Thanh Hương), **8 người trước thuế** (0 xác nhận).
- Sheet tick "Gửi BL sau thuế" ✔ = chỉ 33 (toàn Inhouse 1).
- Cột tick đúng với 89/100; SAI với 11 (tick nói chưa gửi nhưng app đã gửi).

## A. 11 người ĐÃ gửi nhưng ô tick đã nhả về ✗ (ĐỪNG tick lại — tick lại = gửi trùng lần 2)
| Mã | Tên | Team |
|---|---|---|
| HN0028 | Bùi Lâm Linh | Inhouse 1 |
| HN0148 | Đào Mỹ Nhật Huyền | Inhouse 1 |
| HN0115 | Vũ Hồ Thanh Hương | Inhouse 2 |
| HN0122 | Tạ Thị Thu Phương | Inhouse 2 |
| HN0147 | Nguyễn Việt Hoàng | Inhouse 2 |
| HN0199 | Ngô Văn Tuấn | Inhouse 2 |
| HN0201 | Nguyễn Thị Hải Yến | Inhouse 2 |
| HN0038 | Phạm Thùy Linh | Offline |
| HN0040 | Vũ Thúy Hường | Offline |
| HN0164 | Nguyễn Thị Oanh | Offline |
| HN0180 | Đỗ Thu Uyên | Offline |

(Trước thuế: HN0009 Lê Kim Chi cũng đã gửi nhưng ô "Gửi BL trước thuế" đã rụng.)

## B. 56 người CHƯA nhận phiếu sau thuế & chưa tick — HỎI CHUNG: đúng là chưa đến lúc xác nhận phải không?

### CSKH (18) — chưa ai gửi
HN0094 Nguyễn Thị Lung · HN0205 Nguyễn Thị Tuyết Nhung · HN0103 Bùi Hoàng Yến · HN0097 Bùi Thảo Chi · HN0197 Bùi Thị Thu Trang · HN0108 Hoàng Cẩm Tú · HN0105 Hà Ngọc Linh · HN0098 Lê Thị Thanh Thuỷ · HN0186 Lại Thị Thủy Tiên · HN0109 Nguyễn Mai Linh · HN0107 Nguyễn Thị Bảo Khánh · HN0100 Nguyễn Thị Diễm Quỳnh · HN0146 Nguyễn Thị Mai Hương · HN0192 Ngô Mai Lan · HN0161 Trần Khánh Ly · HN0096 Trần Thu Hà · HN0196 Vương Anh Thư · HN0188 Đoàn Mai Hương

### Inhouse 2 (12 còn lại)
HN0110 Bùi Thị Nga · HN0121 Kiều Lan Anh · HN0200 Lê Thị Lê · HN0111 Lê Thị Thúy Vân · HN0119 Mai Thị Liên · HN0117 Nguyễn Thị Hải Yến · HN0157 Nguyễn Thị Thu Huyền · HN0123 Nguyễn Thị Trang · HN0211 Phí Thị Thu Hà · HN0202 Trịnh Thị Hương · HN0112 Vũ Cẩm Ly · HN0158 Đinh Ngọc Hải

### Offline (5 còn lại)
HN0046 Nguyễn Yến Nhi · HN0042 Nguyễn Phương Thảo · HN0044 Hoàng Thị Hồng Thắm · HN0049 Nguyễn Thị Lan · HN0050 Ngô Thị Thùy Linh

### Back office (8)
HN0151 Nguyễn Thị Hồng Vân · HN0057 Bùi Thị Diệu Thúy · HN0060 Lê Thu Trang · HN0141 Nguyễn Thị Phương Thanh · HN0051 Nguyễn Thị Sương Mai · HN0163 Nguyễn Thị Thắm · HN0062 Vũ Thị Thu Hiền · HN0138 Lê Minh Thuý

### MKT (11)
HN0084 An Thị Cẩm Ly · HN0002 Hoàng Ngọc Hiếu · HN0153 Hoàng Viết Đức · HN0086 Lê Lan Mỹ Linh · HN0181 Lê Thị Chung · HN0193 Nguyễn Ngọc Mai · HN0087 Phạm Anh Minh · HN0083 Phạm Thế Anh · HN0198 Vũ Minh Huyền · HN0154 Vũ Tiến Đạt · HN0140 Lưu Đức Minh

### Head quarter (2)
HN0059 Nguyễn Trung Đức · HN0058 Trần Thị Thùy Trang

Inhouse 1: đủ cả 35, không ai thiếu.

## C. Ô tick nhả về ✗ — nguyên nhân (chưa phải lỗi Chung báo)
- Chung báo: "tick xong không vào hàng đợi" = tick ✔ nhưng KHÔNG gửi được (lỗi enqueue).
- Hiện tượng nham nhở = NGƯỢC LẠI: đã gửi xong (có trong app + _outbox "sent"), rồi ô tick mới rụng về ✗.
- Bằng chứng: _gate_state kỳ 2026-09 lưu "Gửi BL sau thuế":false cho HN0028/HN0147/HN0115, nhưng HN0115 lại có "NV xác nhận sau thuế":true → không thể xác nhận phiếu chưa gửi ⇒ đã gửi rồi tick mới mất.
- _gate_state = false (không phải trống) ⇒ có hành động BỎ TICK đã chạy (người bỏ tick trực tiếp, hoặc bỏ ô trước làm interlock thu hồi ô sau), KHÔNG phải "ô tự nhảy khi không ai đụng".
- Cần chốt người-hay-script: mở Apps Script → Executions quanh 18:09 ngày 4/10 (có guiPhieuOnEdit / chayTinhLuong không).
