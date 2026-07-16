# Settlement patterns phải viết từ sao kê thật, verify bằng đối chiếu chéo tổng net

**Related files:** `backend/sepay_routes.py`

**Problem:** Tiền quyết toán mPOS/Payoo (settle về MB hàng ngày) lẫn vào tab "CK ngoài chờ ghép" khiến kế toán suýt ghép nhầm vào PR khách.

**Trap:** Viết regex nhận diện settle bằng cách ĐOÁN nội dung ("MPOS SETTLE", "KET TOAN MPOS", "PAYOO SETTLE"). 4 pattern cũ trong `MPOS_SETTLE_PATTERNS` sống ~1 tháng mà **0 lần bắt trúng** (`SELECT count(*) FROM bank_transactions WHERE match_status='ignored'` = 0) — nội dung thật ngân hàng gửi khác hoàn toàn: mPOS settle qua Ngân Lượng có dạng `VCBCSH.<lô>.<32hex>. ... CDSNL<số> ... CT tu 1064604204 CTCP CONG TG THANH TOAN NGAN`, Payoo có dạng `Payoo CT DS N<ngày> cho TK ECOM. PY3 PALFISH EC`.

**Insight:** Có cách verify pattern khách quan, không cần đoán: settle về T+1 với số tiền = **tổng `net_amount` của `gateway_transactions` theo ngày**. Đối chiếu `SUM(net_amount) GROUP BY source, paid_at::date` với amount của dòng bank nghi là settle → khớp exact từng đồng (kể cả ngày tách 2 lô: 2 khoản VCBCSH 14/7 cộng đúng bằng mPOS net 13/7). Pattern nào pass phép đối chiếu này là pattern thật. Chống false-positive: yêu cầu ≥2 tín hiệu độc lập cùng họ (khách gõ tay không thể trùng cả `CDSNL\d+` lẫn TK Ngân Lượng `1064604204`) — quét toàn bộ lịch sử: 26/26 settle trúng, 0/216 giao dịch khách dính.

**Rule:** Trước khi thêm/sửa pattern nhận diện nội dung CK: (1) query nội dung THẬT từ `bank_transactions` trước, không viết regex từ trí nhớ; (2) sau khi viết, chạy pattern trên toàn bộ bảng và đếm hit theo `match_status` — hit phải khớp đúng tập kỳ vọng, 0 hit trên nhóm đã matched; (3) nếu là settle, đối chiếu amount với tổng net `gateway_transactions` theo ngày.

**Verify:** `grep -n "_MPOS_SETTLE_SIGNALS" backend/sepay_routes.py` — tồn tại 3 signal regex (VCBCSH+hex, CDSNL, TK 1064604204) và `_PAYOO_SETTLE_SIGNALS` 2 signal.
