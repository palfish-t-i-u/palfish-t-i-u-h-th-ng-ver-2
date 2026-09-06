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

## 2. Việc cần làm — chia theo người (không chia theo ngày)

**Nguyên tắc tránh đụng nhau:** Đạt chỉ sửa file `backend/*.py` + `backend/tests/*`; Đức chỉ sửa file `frontend/src/*` + test FE. Hai bên **không đụng chung file nào** → làm song song thoải mái, không lo conflict khi merge. Điểm nối duy nhất giữa 2 bên là **tên field JSON trả về** (`is_split`, `unmatched`, `unsynced_settlement_count`, `unsynced_settlement_amount`) — đã chốt sẵn tên ở dưới, Đức có thể code FE với field giả lập (mock) song song mà **không cần chờ** Đạt code xong BE, miễn giữ đúng tên field khi ráp lại (**bước A0 dưới đây phải đọc trước khi bắt đầu** để cả 2 dùng chung 1 tên).

### A0 — Chốt hợp đồng field (đọc trước, không phải code — cả 2 đọc 1 lần, ~5 phút)

Response `GET /reports/cash-in`, mỗi row thêm 2 field mới, `summary` thêm 2 field mới:
- `row.is_split: boolean` — `true` nếu `row.source == "gateway"` (đã tách từ Đối soát quẹt thẻ); `false` nếu `row.source == "bank"` và có `settlement_code` (cục PC còn nguyên vì phiếu chi đó chưa có trong gateway).
- `row.unmatched: boolean` — chỉ có ý nghĩa khi `is_split=true`; `true` nếu `payment_line_id is null` (đã tách nhưng chưa rõ Team/Sale).
- `summary.unsynced_settlement_count: number` — số cục PC còn nguyên (chưa đồng bộ) trong kỳ đang xem.
- `summary.unsynced_settlement_amount: number` — tổng tiền của các cục đó.

---

### A. Việc của Đạt (BE) — chỉ đụng `backend/*` — ✅ ĐÃ XONG B1-B7

1. **B1 (~0.5h) ✅** — Đã chạy lại SQL khảo sát trên sandbox, khớp đúng số liệu ở mục 4 (49/49 gateway rows 30 ngày gần nhất `payment_line_id is null`).
2. **B2 (~0.5h) ✅** — Đã đọc `match_gateway_txn` ([gateway_routes.py:549](../../backend/gateway_routes.py)) + `gateway_match_candidates` ([:440](../../backend/gateway_routes.py)) — API match thủ công đã có sẵn, không cần xây mới.
3. **B3 (~1h) ✅** — `_load_bc04_card_rows` ([report_routes.py:536](../../backend/report_routes.py)): mọi row `is_split=True`, `unmatched = not bool(t.get("payment_line_id"))`.
4. **B4 (~1h) ✅** — `_load_bc04_bank_rows` ([report_routes.py:579](../../backend/report_routes.py)): `is_split = not bool(pc)`, `unmatched=False`. **Đúng công thức Đức đã lưu ý** — CK/rút TikTok/khoản lạ không có PC vẫn `is_split=True` (atomic, không phải "chưa tách"), chỉ cục PC chưa có trong gateway mới `False`.
5. **B5 (~1h) ✅** — `_build_bc04_rows` ([report_routes.py:645](../../backend/report_routes.py)): thêm `summary.unsynced_settlement_count` + `unsynced_settlement_amount`, tính trên **toàn bộ dataset trước khi lọc team** (cùng nguyên tắc với `balance` — cảnh báo toàn tài khoản, không theo team), dedup theo `settlement_code`.
6. **B6 (~1h) ✅** — 6 test mới trong `backend/tests/test_cash_in_report.py` (class `TestBc04SplitAndUnsyncedFlags`), dùng đúng ca vàng PC 79523736 (2 dòng 15.697.500 + 22.446.240, `payment_line_id=null` cả 2) + case đã khớp payment_line + case CK/TikTok thường (guard đúng lưu ý của Đức) + case cục chưa đồng bộ + case filter team không ảnh hưởng `unsynced_settlement_count`. Đã mở rộng `TestBc04ResponseShapeMatchesFeContract` thêm 4 field mới. **34/34 test file này pass, 901/907 toàn bộ backend pass** (6 fail còn lại là pre-existing, không liên quan — đã xác nhận bằng `git stash` chạy lại y hệt fail trước khi có thay đổi này).
7. **B7 (~0.5h) ✅** — Xác nhận trong `admin_routes.py` (`DEFAULT_DEPT_PERMISSIONS`): chỉ **department `hr`** có `bc04="full"` mặc định (`sale`/`marketing`/`cs` đều `"none"`) — đúng lý do `test.admin@dev` không thấy menu Báo cáo. Ngoài ra `SYSTEM_ADMIN_EMAILS` (gồm `system_admin@palfish.vn`) bypass toàn bộ RBAC. Không có sẵn mật khẩu 2 tài khoản này để tự đăng nhập verify UI trực tiếp — **C3 cần Đạt/Đức dùng tài khoản hr thật hoặc xin anh Minh cấp quyền `bc04` cho 1 tài khoản test** để chụp lại UI cuối cùng trên sandbox thật.

### B. Việc của Đức (FE) — chỉ đụng `frontend/src/*`

1. **F1 (~0.5h)** — Đọc `CardReconciliationTab` (Đối soát giao dịch) để biết UI khớp giao dịch hiện tại filter theo ngày/PC ra sao — chỉ đọc, dùng để hiểu chỗ chị Vân/sale sẽ vào khớp tay các giao dịch tồn đọng, không sửa gì ở đây.
2. **F2 (~0.5h)** — Thêm 2 field mới vào type `CashInRow` và `CashInReport.summary` trong `frontend/src/types/cashIn.ts` (`isSplit`, `unmatched`, `unsyncedSettlementCount`, `unsyncedSettlementAmount` — map đúng theo tên JSON ở mục A0), cập nhật `mapCashInReport`.
3. **F3 (~1h)** — Badge cạnh cột Nội dung trong `BC04CashInReport.tsx` (bảng desktop) + `BC04CashInRowCards.tsx` (mobile): `isSplit=true` → không cần badge thêm (đã hiện đúng nhãn nhóm rồi); `isSplit=false` (cục PC còn nguyên) → badge "Cục — chưa đồng bộ" tông màu warn.
4. **F4 (~1h)** — Row có `unmatched=true`: hiện chữ nhỏ màu nhạt "Chưa khớp đơn" ở cột Đội (I) thay vì để trống — phân biệt "trống vì loại tiền không cần Team" (VD rút TikTok) với "trống vì sale chưa khớp".
5. **F5 (~1h)** — Thêm 1 dòng cảnh báo tổng phía trên bảng khi `summary.unsyncedSettlementCount > 0`: "Còn {n} phiếu chi ({tổng đồng}) chưa đồng bộ thẻ — nhắc sale chạy Đồng bộ mPOS/Payoo". Tái dùng component cảnh báo/alert đã có trong trang, không tự vẽ mới.
6. **F6 (~0.5h)** — Cập nhật `BC04CashInReport.test.tsx` cho badge mới + dòng cảnh báo tổng (dùng mock response theo đúng field ở mục A0).
7. **F7 (~0.5h)** — Kiểm tra `utils/cashInXlsxExport.ts` xuất Excel giữ đúng từng dòng đã tách (không tự gộp lại theo PC khi export) — nếu code export hiện tại chỉ lặp qua mảng `rows` như bảng thì không cần sửa, chỉ cần viết test xác nhận.

### C. Việc chung (làm sau khi A + B đều xong, phối hợp trực tiếp — không phải code song song)

1. **C1 ✅** — Ráp FE + BE thật, chạy local (backend `uvicorn` port 8000 trỏ Supabase sandbox thật + frontend Vite port 5173): `npx vitest` 3 file FE liên quan (15/15 pass) + `tsc -b` sạch — 2 bên khớp contract hoàn toàn.
2. **C2 — chưa làm** — Vào "Đối soát giao dịch" khớp thủ công các giao dịch `payment_line_id is null` tồn đọng của tháng hiện tại (ưu tiên các PC gần đây nhất trước, xem số liệu thật ở mục 4) — ai rảnh trước làm, không cần chia cứng. (Việc này đổi dữ liệu thật trên sandbox nên cần Đạt/Đức tự làm qua UI, không tự động hoá ở đây.)
3. **C3 ✅** — Đã verify trực tiếp trên **local backend + sandbox DB thật** bằng JWT thật của `test.admin@dev` (role `system` → bypass RBAC, xem B7): gọi thẳng `GET /reports/cash-in?from=2026-09-03&to=2026-09-03` → đúng 2 dòng gateway PC 79523736 (15.697.500 + 22.446.240, `is_split:true, unmatched:true`), không còn cục 38.143.740 nào, `unsynced_settlement_count:0` (đúng vì mọi PC gần đây đã đồng bộ). Sau đó mở qua **UI thật trên trình duyệt** (đăng nhập `test.admin@dev`, vào Báo cáo → BC04, lọc đúng ngày 3/9) → thấy đúng 2 dòng "Quẹt thẻ" 22.446.240 + 15.697.500 (nguồn mPOS) với chữ **"Chưa khớp đơn"** ở cột Đội, tổng Thu vào ngày khớp 301.817.270đ với API. Badge "Cục — chưa đồng bộ" không hiện nhầm ở bất kỳ dòng CK/Khoản khác nào (đã `find` không ra kết quả) — đúng lưu ý của Đức.
4. **C4 — chưa làm** — Merge `feature/bo-sung-bc04` → `sandbox`, báo anh Minh + chị Vân kiểm tra trước khi lên prod. (Chưa merge — chờ xác nhận cuối từ anh/chị trước khi đẩy lên nhánh dùng chung.)

**Phát hiện phụ khi verify C3 (không thuộc scope sửa ở đây, ghi lại để theo dõi sau):** dòng "Trả góp" 17.639.380đ ngày 3/9 (nội dung `Payoo CT DS N28.8...`, nhóm `the_gop`) có `is_split=true` dù nhãn hiển thị vẫn là "(chưa tách)" — vì `extract_settlement_code()` chỉ nhận dạng pattern `PC \d+` của VCB, không nhận dạng được mã chuẩn chi của Payoo trong nội dung bank, nên công thức `is_split = not bool(pc)` coi đây là "atomic" thay vì "cục chưa đồng bộ". Đây là hạn chế **có từ trước** (không phải do B3-B5 gây ra) — dòng này trước giờ vẫn luôn hiển thị đúng số tiền, chỉ là sẽ không được đếm vào `unsynced_settlement_count`/không hiện badge cảnh báo mới. Nếu chị Vân cần badge chính xác cho cả các cục Payoo, cần thêm 1 task riêng dạy `extract_settlement_code` nhận diện mã chuẩn chi Payoo — **không làm trong phạm vi task này**.

---

## 3. Việc KHÔNG làm trong scope này

- Không sửa lại thuật toán dedup/khớp PC hiện có ở M1-T3b — đã đúng, có bằng chứng thật ở mục 1.
- Không parse/khớp tự động payment_line cho giao dịch thẻ (matching engine) — đó là việc thủ công qua "Đối soát giao dịch" đã có sẵn, ngoài phạm vi BC04.
- Không đổi ngưỡng/luồng đồng bộ mPOS/Payoo (G4) — chỉ hiển thị rõ hơn để nhắc, không tự động hoá sync.

## 4. Số liệu khảo sát (đã chạy N1-T1 trên sandbox 2026-09-03)

Toàn bộ `gateway_transactions` có `funded_date` trong 30 ngày gần nhất: **49/49 dòng `payment_line_id is null`** (tổng `net_amount` = 696.983.095đ), trải trên ~18 phiếu chi khác nhau (VD PC 79515507: 8 dòng/105.090.120đ; PC 79523924: 8 dòng/126.256.150đ; PC 79492392: 4 dòng/60.732.000đ...).

**Lưu ý quan trọng:** con số 100% chưa khớp này đo trên **sandbox** — môi trường test, có thể không phản ánh đúng thực tế đội vận hành có match thủ công trên **prod** hay không (sandbox có thể chỉ là bản copy dữ liệu, chưa ai thao tác khớp lại). **N4-T1 phải kiểm tra lại con số này trên prod (chỉ đọc, không sửa)** trước khi ước lượng khối lượng khớp tay thật sự cần làm — nếu prod cũng phần lớn chưa khớp thì đây là backlog đáng kể, không chỉ vài giao dịch lẻ.

## 5. Test / Done criteria

- Unit test BE mục B6 pass.
- Unit test FE mục F6 pass.
- Trên sandbox: mở BC04 khoảng ngày chứa PC 79523736 → thấy đúng 2 dòng "Quẹt thẻ" 15.697.500 + "Trả góp" 22.446.240, không còn dòng cục 38.143.740, badge đúng, tổng Input ngày đó khớp.
- Excel xuất ra giữ nguyên 2 dòng tách.
