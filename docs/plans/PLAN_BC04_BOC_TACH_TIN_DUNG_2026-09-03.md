# BC04 — Bóc tách khoản tín dụng/trả góp gộp cục thành giao dịch nhỏ lẻ

**Ngày:** 2026-09-03 · **Trạng thái:** PLAN v1 (grounded theo dữ liệu sandbox thật) · **Người yêu cầu:** chị Vân (qua anh Minh) · **Giao:** Đạt (BE) + Đức (FE) · **Nhánh:** `feature/bo-sung-bc04`

> **Bối cảnh:** Ngân hàng gộp nhiều giao dịch quẹt thẻ tín dụng/trả góp vào **1 phiếu chi (PC)** rồi chuyển về TK MB Hà Nội **1 cục**. BC04 hiện tại (xem [PLAN_BC04_DONG_TIEN_VE_2026-08-27.md](PLAN_BC04_DONG_TIEN_VE_2026-08-27.md)) cần hiện đúng **từng giao dịch nhỏ lẻ** trong cục đó thay vì 1 dòng gộp, tận dụng dữ liệu đã có ở **Đối soát giao dịch quẹt thẻ** (`gateway_transactions`, nạp từ `backend/mpos_import.py` + `gateway_routes.py`).

---

## 1. Đã verify trên sandbox — hiện trạng THẬT (không đoán)

Tra trực tiếp Supabase sandbox (`pxgybyfiwywksesyogti`) cho đúng ca ví dụ chị Vân nêu (PC ngày 3/9, ~38tr):

| Bảng | Dữ liệu |
|---|---|
| `bank_transactions` | 1 dòng cục: `+38.143.740đ`, nội dung `... PC 79523736 ...`, `match_status='ignored'` |
| `gateway_transactions` (settlement_code=79523736) | **2 dòng thật đã có sẵn**: "Quẹt thẻ" 15.697.500đ (VU THI THU TRANG) + "Trả góp" 22.446.240đ, kỳ hạn 6 tháng (Bùi Thị Hạnh) → tổng = **38.143.740đ khớp tuyệt đối** với cục bank |

Quét thêm **18 phiếu chi khác** từ 18/7 → 3/9 (mọi PC gộp gần đây, `match_status='ignored'`, nội dung có "PC ..."): **100% tổng `net_amount` các dòng gateway khớp chính xác từng đồng** với cục bank tương ứng (VD PC 79492392 = 60.732.000đ = 4 dòng gateway; PC 79515507 = 105.090.120đ = 8 dòng...).

→ **Kết luận:** hệ thống Đối soát quẹt thẻ **đã đọc đúng từng giao dịch nhỏ trong mọi phiếu chi** (đúng như anh Minh mô tả), và code BC04 hiện có (`_load_bc04_card_rows` + `_load_bc04_bank_rows` trong [report_routes.py:536-623](../../backend/report_routes.py)) **đã có cơ chế dedup-thay-thế**: cục bank có PC trùng `settlement_code` bên gateway thì bị bỏ, thay bằng các dòng gateway per-giao dịch. Về mặt số học, **BC04 không hề mất tiền và không đúp**.

### 1.1 Gap thật sự tìm được (lý do chị Vân vẫn thấy "chưa tách")

Cả 2 dòng gateway của PC 79523736 đều có **`payment_line_id = null`, `match_status = 'pending'`** — nghĩa là 2 giao dịch quẹt thẻ này **CHƯA được khớp** với đơn hàng/sale nào trong "Đối soát giao dịch" ([gateway_routes.py:549](../../backend/gateway_routes.py) `match_gateway_txn`). Hệ quả trên BC04:

- Cột **Đội** (I) và **Nhãn Nội dung** vẫn hiện đúng là 2 dòng tách riêng ("Quẹt thẻ" / "Trả góp"), NHƯNG **trống Team/Sale** → nhìn giống như "chưa tách" vì không biết của ai/team nào.
- Nếu 1 phiếu chi **chưa được đồng bộ** (chưa upload file mPOS/Payoo cho đợt đó — xem G4, [PLAN_BC04...§9](PLAN_BC04_DONG_TIEN_VE_2026-08-27.md)), BC04 **vẫn hiện nguyên cục** — đây là giới hạn phụ thuộc quy trình đồng bộ thủ công, không phải bug tính toán.

**Việc cần làm không phải là "viết lại logic tách"** (đã đúng), mà là:
1. Đảm bảo giao dịch quẹt thẻ trong mỗi phiếu chi được **khớp payment_line** đầy đủ trước khi chị Vân xem báo cáo → có Team/Sale trên BC04.
2. Làm rõ trên UI dòng nào **đã tách** (từ gateway) vs **cục còn nguyên vì chưa đồng bộ** (fallback bank) — để chị Vân biết khi nào cần nhắc sale đồng bộ, không tưởng nhầm là hệ thống lỗi.
3. Rà lại toàn bộ **lịch sử chưa khớp** (`payment_line_id is null`) trong `gateway_transactions` để ước lượng khối lượng tồn đọng cần xử lý.

---

## 2. Việc cần làm — chia nhỏ theo ngày (Đạt + Đức)

### Ngày 1 — Khảo sát & chốt phương án (song song, ai xong trước làm tiếp mục sau)

- **N1-T1 (Đạt, ~1h)** — Đối chiếu lại phát hiện ở mục 1 bằng SQL trên sandbox (không tin lại theo doc, tự query), xác nhận số lượng `gateway_transactions` có `payment_line_id is null` trong 30 ngày gần nhất (query mẫu: `select settlement_code, count(*) from gateway_transactions where payment_line_id is null and funded_date >= now() - interval '30 days' group by 1`). Ghi số liệu thật vào doc này (mục 4).
- **N1-T2 (Đạt, ~0.5h)** — Đọc lại `match_gateway_txn` ([gateway_routes.py:549](../../backend/gateway_routes.py)) + `gateway_match_candidates` ([:440](../../backend/gateway_routes.py)) để xác nhận có sẵn API match thủ công (KHÔNG cần xây API mới cho việc khớp — chỉ cần đẩy user thao tác đúng chỗ).
- **N1-T3 (Đức, ~1h)** — Đọc `CardReconciliationTab` (FE của "Đối soát giao dịch") để xác nhận UI khớp giao dịch hiện có filter theo ngày/PC được không (dùng cho việc dồn khớp nhanh các giao dịch tồn đọng của phiếu chi cũ).
- **N1-T4 (Đạt, ~0.5h)** — Chốt trong doc này: badge "Đã tách"/"Chưa tách" hiển thị dựa theo cột nào (đề xuất: `data_source` — `mPOS`/`Payoo` = đã tách, `HN BANK` với `settlement_code` khác null = cục fallback do PC chưa có gateway).

### Ngày 2 — Backend (Đạt)

- **N2-T1 (~1.5h)** — Thêm cờ `is_split: bool` vào từng row trả về của `GET /reports/cash-in` ([report_routes.py:536-623](../../backend/report_routes.py)): `true` nếu `source == "gateway"`, `false` nếu `source == "bank"` mà có `settlement_code` khớp pattern PC (cục thẻ chưa đồng bộ — phân biệt với CK khách thường không có PC).
- **N2-T2 (~1h)** — Thêm vào `summary` của response: `unsynced_settlement_count` + `unsynced_settlement_amount` (đếm số cục PC còn nguyên trong kỳ đang xem, tổng tiền) — để FE hiển thị cảnh báo tổng quan kiểu "còn N phiếu chi (x đồng) chưa đồng bộ thẻ".
- **N2-T3 (~1.5h)** — Thêm vào row (khi `source == "gateway"` và `payment_line_id is null`): field `unmatched: true` — để FE tô cảnh báo nhẹ "chưa khớp đơn" trên dòng đó (khác với chưa tách — dòng NÀY đã tách nhưng thiếu Team).
- **N2-T4 (~1h)** — Unit test (`backend/tests/test_cash_in_report.py`): case PC có gateway nhưng `payment_line_id is null` → row có `is_split=true`, `unmatched=true`, `team=""`. Case PC chưa có gateway → row `is_split=false`. Dùng lại số liệu thật PC 79523736 (2 dòng 15.697.500 + 22.446.240) làm fixture cho test này.

### Ngày 3 — Frontend (Đức)

- **N3-T1 (~1h)** — Thêm badge nhỏ cạnh cột Nội dung trong `BC04CashInReport.tsx`/`BC04CashInRowCards.tsx`: "Đã tách" (dựa `is_split`) / "Cục — chưa đồng bộ" (khi `is_split=false` và có `settlement_code`).
- **N3-T2 (~1h)** — Dòng nào `unmatched=true` (đã tách nhưng chưa rõ Team): hiện chữ "Chưa khớp đơn" màu nhạt ở cột Đội thay vì để trống trơn (giúp chị Vân phân biệt "trống vì loại tiền không cần Team" và "trống vì sale chưa khớp").
- **N3-T3 (~1h)** — Thêm dòng cảnh báo tổng ở đầu bảng khi `unsynced_settlement_count > 0`: "Còn {n} phiếu chi ({tổng đồng}) chưa đồng bộ thẻ — nhắc sale chạy Đồng bộ mPOS/Payoo". Tái dùng style cảnh báo đã có sẵn trong trang (không tự vẽ mới).
- **N3-T4 (~0.5h)** — Cập nhật test `BC04CashInReport.test.tsx` cho 2 badge mới + dòng cảnh báo tổng.

### Ngày 4 (thứ 2) — Dọn tồn đọng + verify cuối

- **N4-T1 (Đạt hoặc Đức, ~1-2h, tùy khối lượng thật ở N1-T1)** — Vào "Đối soát giao dịch" khớp thủ công các giao dịch `payment_line_id is null` còn tồn đọng gần đây (ưu tiên các PC trong tháng hiện tại vì ảnh hưởng trực tiếp báo cáo tháng chị Vân đang xem).
- **N4-T2 (Đạt, ~1h)** — Chạy lại BC04 trên sandbox cho đúng khoảng ngày có PC 79523736 (3/9) bằng tài khoản có quyền `bc04` thật (không phải test.admin — cần xác nhận role nào đang có quyền `bc04` theo RBAC ở [PLAN_BC04...§7](PLAN_BC04_DONG_TIEN_VE_2026-08-27.md)), chụp lại 2 dòng đã tách + badge, đối chiếu đúng 38.143.740đ.
- **N4-T3 (Đức, ~1h)** — Test cột Excel xuất ra ([utils/cashInXlsxExport.ts](../../frontend/src/utils/cashInXlsxExport.ts)) có giữ đúng 2 dòng tách (không tự gộp lại khi export).
- **N4-T4 (cả hai, ~0.5h)** — Merge `feature/bo-sung-bc04` → `sandbox`, báo anh Minh + chị Vân kiểm tra trên sandbox trước khi lên prod.

---

## 3. Việc KHÔNG làm trong scope này

- Không sửa lại thuật toán dedup/khớp PC hiện có ở M1-T3b — đã đúng, có bằng chứng thật ở mục 1.
- Không parse/khớp tự động payment_line cho giao dịch thẻ (matching engine) — đó là việc thủ công qua "Đối soát giao dịch" đã có sẵn, ngoài phạm vi BC04.
- Không đổi ngưỡng/luồng đồng bộ mPOS/Payoo (G4) — chỉ hiển thị rõ hơn để nhắc, không tự động hoá sync.

## 4. Số liệu khảo sát (đã chạy N1-T1 trên sandbox 2026-09-03)

Toàn bộ `gateway_transactions` có `funded_date` trong 30 ngày gần nhất: **49/49 dòng `payment_line_id is null`** (tổng `net_amount` = 696.983.095đ), trải trên ~18 phiếu chi khác nhau (VD PC 79515507: 8 dòng/105.090.120đ; PC 79523924: 8 dòng/126.256.150đ; PC 79492392: 4 dòng/60.732.000đ...).

**Lưu ý quan trọng:** con số 100% chưa khớp này đo trên **sandbox** — môi trường test, có thể không phản ánh đúng thực tế đội vận hành có match thủ công trên **prod** hay không (sandbox có thể chỉ là bản copy dữ liệu, chưa ai thao tác khớp lại). **N4-T1 phải kiểm tra lại con số này trên prod (chỉ đọc, không sửa)** trước khi ước lượng khối lượng khớp tay thật sự cần làm — nếu prod cũng phần lớn chưa khớp thì đây là backlog đáng kể, không chỉ vài giao dịch lẻ.

## 5. Test / Done criteria

- Unit test BE mục N2-T4 pass.
- Unit test FE mục N3-T4 pass.
- Trên sandbox: mở BC04 khoảng ngày chứa PC 79523736 → thấy đúng 2 dòng "Quẹt thẻ" 15.697.500 + "Trả góp" 22.446.240, không còn dòng cục 38.143.740, badge đúng, tổng Input ngày đó khớp.
- Excel xuất ra giữ nguyên 2 dòng tách.
