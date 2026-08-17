# Plan triển khai Phiếu lương — Apps Script/Sheet (17/8/2026)

Nguồn: họp 17/8 + feedback Chung + recon 5 agent đọc code thật (BangLuong.gs, PhieuLuongGate.gs, payroll_routes.py, migration, phiếu mẫu Doc 1Jd0…).

**Phạm vi:** toàn bộ trên Apps Script/Google Sheet (Minh dán+chạy vì Drive MCP chỉ đọc) + một ít backend cho phần khóa. KHÔNG đụng FE React (làm session khác). File chính: `docs/apps-script/BangLuong.gs`.

---

## 0. GỠ BLOCKER TRƯỚC (P0 — có thể đang gãy ngay bây giờ)

1. **Sửa SQL gọi cột không tồn tại** — `BangLuong.gs:38` đang dùng `tro_cap_xang_xe` + `tro_cap_trach_nhiem`, nhưng view thật đã gộp thành `tro_cap_xe_trach_nhiem`. Query nhiều khả năng FAIL "Unrecognized name" → **toàn bộ refresh bảng lương vỡ**. Sửa `xe_pc = COALESCE(t.tro_cap_xe_trach_nhiem,0)`. Chạy `/bq-watch` (bq-schema-watch.js) xác nhận hết drift trước khi làm tiếp.

---

## A. Bảng lương trước/sau thuế đúng số (BangLuong.gs)

*Hiện trạng: bảng "Bảng lương" 29 cột đã dựng, tính CẢ trước lẫn sau thuế trong 1 tab. Còn thiếu/sai như dưới.*

2. **Kéo cột điện thoại** — BQ_SQL chưa SELECT `dien_thoai_van` (có trong view, `bq-schema-baseline.json:98`). Thêm vào SQL + COLS + numericKeys; **cộng vào cả "Tổng lương" (:65) lẫn "Tổng thu nhập" (:79)** — nếu quên là trả thiếu lương.
3. **(Nên có) cột gross "Tổng trước thuế"** — headline "Tổng lương+thưởng" (:64) hiện đã trừ thuế (= Net) → thêm 1 cột tổng trước thuế để chị Trang đối chiếu trước/sau thuế rõ ràng.

## B. Sửa công thức thuế theo pipeline Chung (BangLuong.gs:82 + thueTNCN:51-57)

4. **Kéo nguồn thuế từ view** — thêm `an_ca_van`, `dien_thoai_van`, `income_col_u`, `giam_tru_gia_canh` vào SQL/COLS (role ẩn). ⚠ Trừ đúng cột **`_van`** (đã cap 730k + khoán trong view), KHÔNG trừ `an_trua` thô (660k).
5. **Sửa "Thu nhập tính thuế" (:82)** — theo pipeline: `income_col_u − an_ca_van − dien_thoai_van − bao_hiem_xa_hoi − giam_tru_gia_canh`. Re-anchor về `income_col_u` (số Vân) thay vì tự dựng `tong_tn` trên sheet.
6. **Nhánh theo loại NV** — chính thức = biểu lũy tiến 5 bậc; thử việc/CTV/other = **flat 10% nếu ≥5tr, else 0**, không trừ giảm trừ. (`employee_type` đã fetch ở SQL:26 nhưng chưa map COLS.)
7. **Ngoại lệ gán thuế = 0** — HN0051 Nguyễn Thị Sương Mai, HN0164 Nguyễn Thị Oanh.
8. **Fix bug thuế >100tr** — `thueTNCN()` :56 có cụm `30tr×20%` lặp → base 26,5tr thay vì 20,5tr → dư 6tr thuế cho người thu nhập tính thuế >100tr (leader/GĐ). Xóa cụm thừa.
9. **(Chung — không phải Minh) Bug BQ cộng đôi khấu trừ thuế** — cột tổng lương BQ chênh bảng lương đúng bằng khấu trừ thuế → Chung sửa công thức view.

*Mọi công thức dùng dấu `;` (locale VN).*

## C. Preview phiếu lương trên màn hình (HtmlService, BangLuong.gs)

*Hiện trạng: CHƯA có render 1 phiếu ở bất kỳ đâu. Nhưng đã có sẵn hàm build data 1 phiếu = `gEnqueueRow_` (PhieuLuongGate.gs:124).*

10. **Menu "Xem trước phiếu"** — thêm vào `onOpen` (:91); hàm lấy dòng đang chọn → tái dùng `gEnqueueRow_` build dict phiếu.
11. **HTML template dạng thư** — dựng theo layout phiếu mẫu Doc 1Jd0 (tiêu đề tháng + "Kính gửi Anh/Chị {Name}" + bảng 2 cột + footer HR), `showModalDialog`. Build **động từ header** (đừng hardcode nhãn — Chung hay đổi cột). Map "Họ tên"→"Name", format tiền `#,##0`.
12. **Toggle trước/sau thuế** — Doc mẫu là bản sau thuế; thêm nút ẩn/hiện dòng thuế+Net. Dùng HtmlService (KHÔNG clone Doc — tránh đẻ file rác).

## D. Khóa thao tác 23:59 mùng 4 (2 mặt)

*Recon: app đã khóa MỘT PHẦN nhưng chưa đủ chặt.*

13. **Backend — vá 3 điểm** (`payroll_routes.py`):
    - `_review_locked` (:58-69) đang so **DATE** → khóa từ **00:00 mùng 4** (sớm ~24h). Sửa so **datetime 23:59:59 giờ VN**.
    - Thêm cờ `locked` (derive) vào `_serialize_payslip` (:72) để FE render chế độ chỉ-còn-nút-xác-nhận.
    - Cân nhắc guard `receive_payslip` (:99) chặn Gate đè phiếu sau mùng 4. Giữ `confirm` KHÔNG khóa (đúng ý).
14. **Sheet — thêm khóa** — hàm `lockPayrollSheet()`: `range.protect().removeEditors(...)`/`setDomainEdit(false)`, chừa đúng account service/owner. Cài **clock trigger** chạy mùng 4. Đặt `appsscript.json` `"timeZone":"Asia/Ho_Chi_Minh"`.
    - ⚠ Clock trigger chỉ chạy theo **khung ~1h** (không đúng phút) → **app là khóa chuẩn, sheet là hàng rào phụ**.
    - ⚠ `removeEditors` không gỡ được quyền OWNER — nếu HR là owner sheet thì vẫn sửa được.

## E. Xuất PDF từng phiếu + Excel theo phòng ban (BangLuong.gs)

*Hiện trạng: CHƯA có export nào. Đã có sẵn cột `Team` (IH1/IH2/Offline/WFH) làm hạt giống gom nhóm — nhưng chưa phải 7 phòng ban org thật.*

15. **PDF từng phiếu** — Doc merge: `makeCopy` template 1Jd0 → `replaceText` từng ô `<<...>>` → `getAs('application/pdf')` → lưu folder Drive → `setTrashed` temp Doc. Tái dùng bộ render Task C. **Batching + continuation trigger** né timeout 6 phút (~98 NV). ✅ Đã xác nhận Doc có sẵn 15 ô `<<...>>` khớp tên cột bảng lương. ⚠ Sửa 1 ô lỗi: `<<Khấu trừ thuế tháng 05>>` (nhãn ghi T07 nhưng tag còn T05, sót từ template T5) → đổi tag ổn định `<<Khấu trừ thuế>>`.
16. **Excel theo phòng ban** — group-by cột Phòng ban (Trang thêm; fallback Team) → temp Spreadsheet mỗi phòng → export `.xlsx` → lưu folder. Đề xuất **1 file/phòng ban** (Trang gửi từng nhóm).
17. **Bật scope + folder** — `appsscript.json` scope Drive/Docs + Drive Advanced Service; lưu vào 1 folder Drive (Trang tải tay), KHÔNG auto gửi mail.

---

## Thứ tự làm + phụ thuộc

```
0 (blocker SQL)  →  A + B (cùng file BQ_SQL/COLS/formula, làm 1 lượt)  →  C (preview)  →  E (export, tái dùng render C)
                    D (khóa) chạy song song, độc lập
```

| Nhóm | Ưu tiên | Ước lượng | Ghi chú |
|---|---|---|---|
| 0 Blocker SQL | P0 | 15 phút | Có thể đang gãy refresh ngay |
| A+B Bảng + thuế | P0 | 0,5–1 ngày | Rủi ro ở CHỐT cột nguồn, không ở code |
| C Preview | P1 | 0,5–1 ngày | +vòng lặp dán-chạy-sửa (Claude không render được) |
| D Khóa mùng 4 | P1 | 0,5 ngày | Backend nhỏ + sheet vừa |
| E Xuất PDF/Excel | P2 | 1–1,5 ngày | Tốn công batching + bật scope Drive |

## Đã chốt (17/8)

- **Render tầng nào:** CẢ trước thuế và sau thuế → preview + PDF đều làm 2 bản.
- **Mốc bậc thuế:** theo đúng công thức chị Vân — GIỮ NGUYÊN biểu hiện tại, không tự đổi.
- **"Mùng 4" nghĩa là gì:** mùng 4 của tháng SAU kỳ lương. VD: lương tháng 5 làm từ 1–5 tháng 6 → khóa 23:59 mùng 4 tháng 6. Khớp code hiện tại → chỉ sửa giờ 00:00 → 23:59.
- **Timezone:** bảng tính đang GMT+7 Hà Nội. Vẫn set `appsscript.json` `"timeZone":"Asia/Ho_Chi_Minh"` cho chắc phần trigger.
- **Doc phiếu mẫu:** ĐÃ có sẵn 15 ô điền `<<...>>` khớp tên cột bảng lương → xuất PDF bằng Google Doc merge. ⚠ Sửa 1 ô lỗi: nhãn "Khấu trừ thuế tháng 07" nhưng tag còn `<<Khấu trừ thuế tháng 05>>` → đổi `<<Khấu trừ thuế>>`.
- **Từ ảnh bảng chị Vân:** Thu nhập chịu thuế = Tổng thu nhập − ăn ca − điện thoại (39.565.000 − 730.000 − 3.000.000 = 35.835.000) → đúng hướng fix. **Xăng xe (3tr) VẪN chịu thuế**, không trừ.

## ~~Còn phải hỏi Chung~~ → ĐÃ TỰ TRẢ LỜI từ schema BQ (17/8)

1. ✅ **Cột nào dùng cho thuế:** view có CẢ HAI bộ — `tro_cap_an_trua` (hiển thị, 660k) vs `an_ca_van` (thuế, đã cap 730k). `dien_thoai_van` dùng cho cả hiển thị lẫn thuế. Pipeline Chung nói trừ `an_ca_van` + `dien_thoai_van` → đã code đúng.
2. ✅ **View có sẵn TNTT chưa:** KHÔNG — view chỉ có `income_col_u`, `an_ca_van`, `dien_thoai_van`, `bao_hiem_xa_hoi`. Tính thuế trên sheet, dùng `income_col_u` làm anchor.
3. ✅ **BHXH có trừ trước thuế không:** CÓ — pipeline ghi rõ `taxable_income − bao_hiem_xa_hoi − giam_tru_gia_canh → assessable_income`. Ảnh chị Vân chỉ không show bước này, nhưng BQ có `bao_hiem_xa_hoi`.

## Đã code (17/8) — BangLuong.gs v3

- ✅ **P0 Fix SQL blocker:** `tro_cap_xang_xe`+`tro_cap_trach_nhiem` → `tro_cap_xe_trach_nhiem`
- ✅ **A2 Kéo cột điện thoại:** thêm `dien_thoai_van` vào SQL/COLS/numericKeys, cộng vào Tổng lương + Tổng thu nhập
- ✅ **A3 Cột gross:** thêm "Tổng trước thuế" = Tổng lương + Thưởng COM (trước trừ thuế)
- ✅ **B4 Kéo nguồn thuế:** thêm `income_col_u`, `an_ca_van` vào SQL/COLS
- ✅ **B5 Sửa TNTT:** re-anchor về `income_col_u`, thêm bước "Thu nhập chịu thuế" = income_col_u − an_ca_van − dien_thoai (chính thức) | income_col_u (thử việc)
- ✅ **B6 Nhánh loại NV:** chính thức = lũy tiến 5 bậc; thử việc/other = flat 10% ≥5tr
- ✅ **B7 Ngoại lệ:** HN0051 + HN0164 gán thuế = 0
- ✅ **B8 Fix bug >100tr:** xóa `30000000*20%` thừa (base sai 26.5tr → đúng 20.5tr)
- ✅ **Thêm cột:** Mã NV, Loại NV (cho formula reference + hiển thị)
- ✅ `thueTNCN()` bỏ `=` đầu (embed được trong formula phức hợp)
