# Payoo không có ngày tiền về — funded_date luôn NULL

**Related files:** `backend/mpos_import.py` (`_payoo_row`, `parse_payoo_online/installment/orders`, alias maps `PAYOO_ONLINE_ALIASES`/`PAYOO_INSTALLMENT_ALIASES`), `backend/gateway_routes.py` (list filter `funded_date`), `backend/activation_routes.py` (`_tien_ve_map`), `frontend/src/components/CardReconciliationTab.tsx`

**Related learnings:** `2026-09-04-b3-tien-ve-funded-not-quet.md` (B3 tiền về = funded_date, không phải ngày quẹt), `timestamp-vs-date-funded-date-gateway.md`

**Problem:** Kế toán (Sương Mai) báo 1 giao dịch Payoo (Trần Thị Thanh Hương, 17.820.000đ, quẹt 11/09, PR-2026-1647) "mất" trên GMV: (1) tab Quẹt thẻ lọc theo Ngày tiền về không thấy, (2) B3 cột "tiền về muộn nhất" hiện 11/09 trong khi tiền thực về TK ngày 14/09. Thực ra giao dịch KHÔNG mất — đã ghép PR + tạo gói AR-2026-0904; chỉ bị ẩn/sai ngày.

**Trap:** Tưởng Payoo có report ngày tiền về giống mПОS ("Ngày nhận tiền" per-txn → `funded_date`), chỉ cần "đấu thêm tab settlement". SAI. Đã soi tận portal Payoo cả 4 tab (Quản lý giao dịch, Lịch sử TT thẻ/TKNH, Quản lý đặt hàng, Quản lý yêu cầu TT): **mọi mốc ngày = ngày quẹt (11/09)**, kể cả "Thời gian cập nhật". **Payoo KHÔNG lưu ngày payout/chuẩn chi về TK ở bất kỳ đâu.** Order feed (JSON extension auto-fetch) chỉ có `PurchaseDate`. Alias maps Payoo online/installment không có field ngày nhận tiền — cả 3 đường nạp đều hardcode `funded_date=None` (`mpos_import.py` ~495/563). Hệ quả: 16/16 giao dịch Payoo có `funded_date=NULL` (mPOS 158/158 có đủ).

Vì sao gây 2 triệu chứng:
- Tab Quẹt thẻ: filter `gte/lte("funded_date", ...)` (`gateway_routes.py`) rớt mọi dòng NULL → chọn Ngày tiền về = mất hết Payoo. Bỏ lọc (Tất cả) thì hiện.
- B3: `_tien_ve_map` lấy card→`gateway_transactions.funded_date`; Payoo NULL → không đóng góp ngày; còn mỗi line phụ (SePay 11/09) → min=max=11/09. Nếu funded_date=14/09 thì muộn nhất tự đúng.

**Insight:** mPОS = máy POS vật lý, có report settlement T+1 ghi "Ngày nhận tiền" từng giao dịch. Payoo online gateway KHÔNG cấp granularity đó — chỉ có ngày quẹt. Con số "tiền về 14/09" chỉ tồn tại ở **sao kê ngân hàng của mình** (Payoo gom nhiều đơn, net phí, chi 1 cục về TK). App đã kéo sẵn `bank_transactions` cho CK/SePay → đó là nguồn ngày tiền về Payoo thật, KHÔNG phải Payoo. Đây là **giới hạn dữ liệu nhà cung cấp**, không phải bug code: fallback ngày quẹt là hành vi đúng khi thiếu funded_date.

**Rule:** Đừng hứa "đấu report Payoo để điền funded_date" — Payoo không có ngày tiền về per-giao-dịch. Muốn ngày tiền về Payoo chuẩn chỉ có 2 đường: (A) kế toán đánh dấu ngày theo lô payout (UI stamp funded_date cho nhóm giao dịch Payoo cùng đợt — chính xác, khớp việc đối soát sao kê tay, ít code — hướng nghiêng); (B) tự dò dòng Payoo settlement trong `bank_transactions` gán ngày cho giao dịch cùng cửa sổ (tự động hơn nhưng dễ sai vì net + phí, khó map 1-1). Trước khi khẳng định "kéo thêm data từ cổng X", phải soi tận UI cổng đó có cột cần không — đừng suy từ cổng khác.

**Verify:** `SELECT source, count(*)-count(funded_date) AS null_funded FROM gateway_transactions GROUP BY source;` — kỳ vọng payoo = tổng (mọi dòng NULL), mpos = 0. Portal Payoo: không tab nào có cột ngày ≠ ngày quẹt.
