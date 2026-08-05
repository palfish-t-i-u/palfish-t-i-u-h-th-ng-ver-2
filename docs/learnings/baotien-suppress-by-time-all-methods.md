# Suppress "báo tiền về" theo THỜI GIAN cho mọi method, không miễn trừ theo method

**Problem:** Đơn thẻ/trả góp quẹt-trước-tạo-PR-sau (PR-2026-0906: quẹt 04/08,
tạo lần TT 05/08) vẫn bắn tin Zalo "ĐÃ VÀO TK" → spam nhóm sale với tiền hồi tố.
Do migration 2026-07-20 MIỄN suppress cho method IN ('card','installment').

**Trap:** Miễn trừ theo method (2026-07-20) được thêm vì tưởng "kế toán ghép mPOS
= luôn cần báo". Nhưng rule đúng của nghiệp vụ là theo THỜI GIAN: tiền về trước
lúc tạo lần TT = booking hồi tố → không báo, bất kể phương thức. Miễn theo method
đã vô hiệu hoá rule thời gian cho cả nhánh thẻ quẹt-trước.

**Insight:** Trước khi tin "so timestamp không đáng tin cho method X", phải đo độ
phân giải nguồn. mPOS/Payoo gateway_transactions.paid_at có GIÂY thật (khác SePay
làm tròn phút) → so trực tiếp paid_at < created_at là chuẩn cho thẻ. Verify prod:
0/45 line thẻ nằm trong [created_at,+60s), 17 line "trước" cách 4h–10 ngày = hồi
tố thật → bỏ miễn trừ an toàn, không suppress oan đơn quẹt-sau. Carve-out SePay
giữ nguyên vì SePay mới thật sự dính rounding.

**Rule:** Rule nghiệp vụ ("cũ/mới theo mốc tạo") nên áp đồng nhất theo dữ liệu
thời gian đã kiểm chứng độ phân giải, thay vì miễn trừ theo loại. Miễn trừ theo
method chỉ dùng khi CHÍNH nguồn thời gian của method đó không tin được (SePay).
Fix: backend/migrations/2026-08-05-baotien-suppress-card-before-line.sql. Liên
quan: [[sepay-minute-rounding-suppress]].
