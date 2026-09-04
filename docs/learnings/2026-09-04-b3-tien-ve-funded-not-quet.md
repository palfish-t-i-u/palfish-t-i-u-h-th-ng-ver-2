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

---

## Follow-up CHƯA QUYẾT (4/9 — đừng tự implement khi chưa chốt)

**Vấn đề UX phát sinh sau khi ship funded:** filter sớm/muộn gây rối cho kế toán đối soát. Chị Mai hỏi *"sớm nhất với muộn nhất khác gì nhau?"*. Bản chất: đơn **cọc + tín dụng** nhận tiền 2 ngày, nhưng filter chỉ hiện đơn ở **1 ngày** (`tien_ve_som` HOẶC `tien_ve_muon`) → dễ sót. Chứng cứ prod 03/09: 8 đơn tín dụng đã ghép, lọc **"sớm nhất"** chỉ hiện **4** (tín dụng thuần, som=03/09); 4 đơn có cọc (AR-0645/0730/0763/0771, som=21–31/08) bị đẩy về ngày cọc → chỉ hiện dưới **"muộn nhất"** (đủ 8).

**Đề xuất (CHƯA quyết, CHƯA làm):** đổi filter ngày B3 sang **"có tiền về trong khoảng"** — đơn hiện nếu **BẤT KỲ** ngày tiền về nào của nó nằm trong khoảng lọc (thay mô hình som/muon single-date). Lọc 03/09 → mọi đơn có tiền về 03/09 (đủ 8, kể cả đơn có cọc), đúng cách kế toán nghĩ ("đơn nào có tiền về hôm nay thì hiện"), bỏ được rối sớm/muộn. Kỹ thuật dự kiến: BE trả **list ngày tiền về** mỗi AR (không chỉ som/muon); FE lọc any-in-range (`inDateRange` xét cả list); giữ 2 cột som/muon để xem span.

**Giới hạn KHÔNG sửa được bằng filter:** giao dịch tín dụng **chưa ghép** (pending, không có `payment_line`/AR) KHÔNG hiện ở B3 dù đổi filter thế nào — vì B3 liệt kê **AR**, mà chúng chưa có AR. VD 03/09 có 2 GD HCM chưa ghép (17.2M + 16.43M) → phải ghép ở Đối soát giao dịch (B2) mới có AR để hiện. "Đủ 10 đơn tín dụng" = 8 (đã ghép, hiện được) + 2 (chưa ghép, cần B2 — data-ops, không phải code).

**Workaround hiện tại (dặn kế toán):** đối soát cục tín dụng theo ngày → lọc **"Tiền về muộn nhất"** (KHÔNG phải "sớm nhất").
