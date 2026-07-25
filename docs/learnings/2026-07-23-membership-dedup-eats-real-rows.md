# Membership-dedup nuốt giao dịch thật (import GSheet → Sổ doanh thu)

**Problem:** 11 GD / 175tr (2026) có trên All File nhưng không vào Sổ. Tỷ lệ khớp
recent-month tụt (T6 −42tr, T7 −11tr) dù full-year vẫn "đạt" 99.66%.

**Trap:** Dedup bằng membership (`key in existing_set`) — 1 dòng UID-trống trong DB
tạo key `|sale|tháng|tiền` chặn VĨNH VIỄN mọi khách mới trùng bộ ba đó. Giá gói cố
định → trùng là chuyện thường. Trap kép: (1) trung bình cả năm che vết rò đang phình
(seed 29/5 sạch → lỗi chỉ hiện từ T6, nhìn aggregate không thấy); (2) suýt vá sai —
"bỏ check blank cho dòng có UID" sẽ mở lại pattern-B dup (vụ 15/6, 18 cặp X).

**Insight:** Membership hỏi "key này TỒN TẠI chưa?" — sai câu hỏi. Câu đúng: "còn dòng
DB nào CHƯA ĐƯỢC GHÉP không?" = consumption. Audit A1 dùng consumption nên ra số đúng
trong khi import sai. Fix triệt để = import và audit dùng CHUNG reconcile() → audit
thành dry-run của import, hai bên không thể lệch nhau. Kèm: tầng blank phải guard
tên/SĐT (không thì thứ tự sheet quyết ai bị nuốt), global tier-pass (không thì tầng
yếu cướp dòng của cặp exact — artifact Hiểu Minh), sheet-dup y hệt → dup_suspect chờ
người quyết chứ không auto gì cả.

**Rule:** Sổ tiền dedup bằng CONSUMPTION, không membership. Mọi key dedup bỏ-trường
(blank-fallback) phải có guard bằng trường định danh khác + chỉ tiêu thụ 1:1. Nghi
ngờ giữa thừa và thiếu → chọn hướng lộ ra cho người quyết (dup_suspect), không chọn
hướng âm thầm.
