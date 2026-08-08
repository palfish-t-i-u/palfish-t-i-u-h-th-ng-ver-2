# Phí cổng nhân đôi trên đơn multi-con — chia tỷ lệ ở CẢ 2 điểm stamp

**Related files:** `backend/gateway_routes.py`, `backend/revenue_routes.py`

**Problem:** Đơn 1 PR nhiều bé (multi-con) trả 1 lần bằng thẻ → mỗi dòng Sổ (mỗi bé) bị trừ TRỌN phí cổng của cả giao dịch. 2 bé = phí bị tính đôi (CC-0597 phi_cong 479k khi đúng là 239.5k/bé; CC-0853 2158k khi đúng 1079k/bé).

**Trap:** Nghĩ phí stamp ở đúng 1 nơi nên chỉ sửa 1 chỗ. Thực tế có **2 điểm stamp độc lập** chạy ở 2 thời điểm khác nhau — sửa 1 chỗ vẫn còn đường kia nhân đôi.

**Insight:** Cùng 1 `fee_total = gw_amount - gw_net` bị áp cho từng bé qua 2 luồng:
1. **Cổng khớp giao dịch** (`gateway_routes.py:601-647`, `match` txn): thấy TẤT CẢ dòng sibling cùng lúc (query `so_doanh_thu` theo `note IN ('AR {id}'...)`). Lọc `eligible_rows` (chỉ dòng thẻ/quẹt/trả góp), chia `row_fee = fee_total × row_vnd / total_vnd`, **dòng cuối nhận phần dư** `fee_remaining` (tránh mất 1đ do làm tròn).
2. **B3 tạo từng bé tuần tự** (`revenue_routes.py:_try_auto_stamp_fee`, line 237): mỗi bé stamp riêng lúc tạo AR → không thấy sibling qua vòng lặp. Phải query lại toàn bộ AR cùng PR (`active_requests.pr_id`) → `so_doanh_thu.note IN`, tính `sibling_vnd_total` (chỉ dòng eligible), rồi `row_fee = fee_total × gross_vnd / sibling_vnd_total`.

Đơn 1 con: `total_vnd == row_vnd` → `row_fee == fee_total`, không regression.

**Rule:** Khi phân bổ 1 đại lượng tổng (phí, chiết khấu) xuống nhiều dòng con, tìm HẾT các điểm ghi trước khi sửa — grep `stamp_net_fee(` ra mọi call site. Mỗi điểm phải chia theo mẫu số = tổng VND eligible của TẤT CẢ sibling, không phải VND riêng dòng đó. Điểm nào chỉ thấy 1 dòng (per-child) phải tự query lại sibling.

**Verify:** `grep -Fn "stamp_net_fee(" backend/gateway_routes.py backend/revenue_routes.py` — phải thấy 3 dòng: 1 def (`revenue_routes.py:193`) + 2 call site (`gateway_routes.py:639`, `revenue_routes.py:294`); cả 2 call site đều tính `row_fee` theo tỷ lệ trước khi gọi.
