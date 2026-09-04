# B3 "Tiền về" = ngày tiền thực về TK (đối soát), tách khỏi doanh thu = ngày quẹt

**Related files:** `backend/activation_routes.py` (`_tien_ve_map`, `_funded_vn_date`, `_bank_vn_date`, `_tien_ve_map_from_ledger`), `backend/tests/test_tien_ve_map.py`

**Problem:** Màn Tạo gói học (B3) lấy ngày "tiền về" từ `so_doanh_thu` (Sổ lên trễ, phụ thuộc import) → AR chưa có dòng Sổ bị mất ngày → bị lọc khỏi tab khi lọc theo ngày. Kế toán không lấy được danh sách đơn về TK theo ngày để xuất HĐ, phải điền file riêng. VD 03/09: sao kê 24 khoản về nhưng B3 hiện 1.

**Trap 1 (chọn sai khái niệm ngày):** Tưởng B3 "tiền về" nên = ngày doanh thu (ngày quẹt) cho nhất quán Sổ/BC02. SAI cho mục đích: B3 là công cụ **đối soát sao kê để xuất HĐ** → cần ngày tiền **THỰC về TK** (funded), không phải ngày quẹt. Đơn tín dụng quẹt cuối T8, tiền về TK 03/09 → nếu key theo ngày quẹt thì lọc 03/09 KHÔNG thấy (nằm ở 28–31/08). Đã ship bản ngày-quẹt trước (9fc1714) rồi phải đảo sang funded (27ab814) khi chị đưa bằng chứng 3 cục settlement.

**Trap 2 (timezone ngược nhau giữa các nguồn):**
- `gateway_transactions.paid_at` = timestamptz đã UTC → ngày quẹt phải ép `astimezone(utc).date()` (C-T1).
- `gateway_transactions.funded_date` = **`timestamp without time zone`** = giờ VN naive (nguồn mPOS/Payoo) → **CHỈ `::date`, KHÔNG convert timezone**. Convert = lệch ngày.
- `bank_transactions.transaction_date` = timestamptz → đổi giờ VN (+7).
Dùng nhầm helper giữa 3 cột này = off-by-one-day. Xem `docs/learnings/timestamp-vs-date-funded-date-gateway.md` + `2026-08-08-ct1-ngay-tien-ve-don-the-paid-at-utc.md`.

**Trap 3 (đơn nhiều lần thanh toán):** Đơn có **cọc + tín dụng** nhận tiền 2 ngày (cọc trước qua CK/QR, tín dụng về TK sau). Filter "Tiền về **sớm nhất**" (`tien_ve_som` = min) xếp theo ngày cọc; "**muộn nhất**" (`tien_ve_muon` = max) theo ngày tín dụng. Đối soát cục settlement tín dụng ngày X → phải lọc **"muộn nhất" = X** mới đủ đơn (VD AR-2026-0771: cọc 21/08 + tín dụng 03/09 → sớm 21/08, muộn 03/09).

**Insight:** 2 khái niệm khác nhau, 2 chỗ — KHÔNG gộp 1 field:
- Sổ/BC01/BC02/doanh thu = **ngày quẹt** (kế toán ghi nhận doanh thu; chốt chị Thu Hiền, C-T1). Fix này KHÔNG đụng.
- B3/BC04 = **ngày tiền thực về TK** (đối soát dòng tiền: tín dụng=`funded_date`, CK=`transaction_date`).
`_tien_ve_map` lấy từ giao dịch cổng/bank ĐÃ KHỚP (`match_status='matched'`), fallback `_tien_ve_map_from_ledger` (Sổ) cho AR chưa khớp → không hồi quy. **CHỈ ĐỌC**, tien_ve_som/muon chỉ dùng hiển thị+lọc ở ActivationTab, không report/export nào đọc → đổi nguồn = rủi ro thấp.

**Rule:** Ngày "tiền về" cho đối soát/xuất HĐ = ngày tiền THỰC về TK (funded_date/transaction_date từ giao dịch đã khớp), KHÔNG phải ngày quẹt/ngày Sổ. `funded_date` naive VN → chỉ `::date`. Đơn multi-payment: đối soát theo "muộn nhất". Doanh thu vẫn giữ ngày quẹt riêng ở Sổ.

**Verify:** Lọc B3 "Tiền về muộn nhất" = ngày X → số AR khớp số khoản tiền tín dụng+CK về TK sao kê ngày X. Prod 03/09: 17 AR (khớp 3 cục mPOS/Payoo + CK). SQL đối chiếu: `min/max` funded (tín dụng) + transaction_date VN (CK) per AR, fallback `so_doanh_thu.ngay_tien_ve`.
