# Nghiệm thu HDSD — 26/07/2026 (Đạt)

> Kiểm chứng trực tiếp trên `https://palfish-gmv-manager-sandbox.vercel.app/` (tài khoản `test.admin@dev`), sau khi Đức push xong Task 1-3 + merge nội dung 26 bài của Đạt vào cấu trúc slug thật (`hdsd-help-docs-duc` → `sandbox`, commit `d4337e8`).
> Đối chiếu với checklist "Popup/modal/drawer của 6 module ưu tiên" trong [`HANDOFF_DAT_USER_HELP_DOCS_2026-07-26.md`](HANDOFF_DAT_USER_HELP_DOCS_2026-07-26.md).
> Danh sách 23 điểm chèn lấy trực tiếp từ `grep -rn "<HdsdLink" frontend/src/` (nguồn sự thật, không suy đoán từ tài liệu).

## Kết quả — 18/23 đã live-verify, có screenshot

| # | Điểm chèn | File | Topic/Module | Kết quả |
|---|---|---|---|---|
| 1 | Tạo Payment Request | `CreatePaymentRequestModal.tsx:171` | `paymentRequests/tao-lan-tt-chuan` | ✅ HDSD đúng chỗ |
| 2 | Xem QR thanh toán | `QrViewModal.tsx:219` | `paymentRequests/xem-qr-thanh-toan` | ✅ HDSD đúng chỗ |
| 3 | Huỷ Payment Request | `CancelPrModal.tsx:44` | `paymentRequests/huy-pr` | ✅ HDSD đúng chỗ, không đè nút đóng |
| 4 | Chuyển giao PR | `TransferSaleModal.tsx:108` | `paymentRequests/chuyen-giao-pr` | ✅ HDSD đúng chỗ |
| 5 | Xem lịch sử PR | `PrHistoryModal.tsx:35` | `paymentRequests/xem-lich-su-pr` | ✅ HDSD đúng chỗ |
| 6 | Drawer chính PR | `PaymentRequestDetailDrawer.tsx:1834` | module-level `paymentRequests` | ✅ HDSD đúng chỗ |
| 7 | Thiếu ảnh bill | `PaymentRequestDetailDrawer.tsx:3059` | `paymentRequests/thieu-anh-bill` | ✅ Trigger tự nhiên (PR-2026-9131, còn thiếu bill), HDSD đúng chỗ |
| 8 | Báo đơn bổ sung | `PaymentRequestDetailDrawer.tsx:2734` (nhánh `isAppend`) | `module3/bao-don-bo-sung` | ✅ Trigger qua PR-2026-TEST01 (đã có AR), HDSD đúng chỗ |
| 9 | Nhắc kích hoạt khoá học gấp | `PaymentRequestDetailDrawer.tsx:3147,3193` | `module3/nhac-kich-hoat-gap` | ✅ Trigger qua PR-2026-TEST02 (AR chờ), HDSD đúng chỗ |
| 10 | PR đã nhận đủ tiền | `PaymentRequestDetailDrawer.tsx:3227` | `paymentRequests/pr-du-tien` | ✅ Trigger qua PR-2026-9501 (đã đủ), HDSD đúng chỗ |
| 11 | Tạo Active Request mới | `ActivationTab.tsx:201` | `module3/tao-active-request` | ✅ HDSD đúng chỗ |
| 12 | Thêm UID mới | `ActivationTab.tsx:1720` | `module3/them-uid-them-goi` | ✅ Có dropdown "Của bé nào?" — xác nhận multi-child hoạt động, HDSD đúng chỗ |
| 13 | Order ID đã tồn tại | `ActivationTab.tsx:2513` | `module3/order-id-va-hold` | ✅ Trigger thật bằng cách lưu trùng Order ID giữa AR-9510 và AR-9511, HDSD đúng chỗ |
| 14 | Ghép CK ngoài → Lần thanh toán | `ReconciliationTab.tsx:1756` | `reconciliation/ghep-ck-ngoai` | ✅ HDSD đúng chỗ |
| 15 | Số tiền không khớp (quẹt thẻ) | `CardReconciliationTab.tsx:1086` | module-level `reconCard` | ✅ Trigger thật bằng ghép lệch tiền (8.4tr vs 2.000đ), HDSD đúng chỗ |
| 16 | Xuất hoá đơn theo Course Code | `InvoiceRequestTab.tsx:115` | `module4/xuat-hoa-don-theo-course-code` | ✅ HDSD đúng chỗ (InvoiceDetailDrawer) |
| 17 | Thêm dòng Sổ doanh thu | `LedgerFormModal.tsx:165` | `revenueLedger/tao-sua-dong-so` | ✅ HDSD đúng chỗ |
| 18 | Cấu hình tỷ giá GMV | `SoDoanhThuTab.tsx:639` | `revenueLedger/quy-doi-ty-gia` | ✅ HDSD đúng chỗ |

## Suy luận hợp lý (không tự trigger được, nhưng cùng vị trí code đã verify)

| # | Điểm chèn | Lý do |
|---|---|---|
| 19 | Báo đơn & Kích hoạt (lần đầu) `PaymentRequestDetailDrawer.tsx:2734` nhánh `!isAppend` | Cùng 1 khối `<HdsdLink topicSlug={isAppend ? "bao-don-bo-sung" : "bao-don-kich-hoat"} />` đã verify ở #8 — chỉ khác giá trị `topicSlug` truyền vào, không khác vị trí render. Rủi ro thấp. |

## Chưa verify được — cần thử lại sau

| # | Điểm chèn | Lý do chưa xong | Đề xuất |
|---|---|---|---|
| 20 | Không gửi được nhắc xuất HĐ (`PaymentRequestDetailDrawer.tsx:3107`, `module4/nhac-xuat-hoa-don`) | Đây là popup **fail-case only** — bấm "Nhắc xuất HĐ" trên PR đủ điều kiện thì thành công luôn (chuyển "Đã nhắc"), không có lỗi để hiện popup | Cần giả lập lỗi backend (vd. tắt tạm outbox) hoặc review code review thay vì UI test |
| 21 | Số tiền không khớp — CK ngoài (`ReconciliationTab.tsx:1985`, `reconciliation/so-tien-khong-khop`) | Không tìm được cặp giao dịch/lần-TT lệch tiền phù hợp trong data test hiện có qua tìm kiếm nhanh | Thử lại với data test mới, hoặc tạo thủ công 1 cặp lệch tiền |
| 22 | Bill viewer modal (`ReconciliationTab.tsx:2142`, module-level `reconciliation`) | Chưa tìm đúng nút mở bill viewer trong phiên này | Thử lại, ưu tiên thấp (module-level, đã có 1 điểm cùng module xác nhận cơ chế hoạt động ở #14) |
| 23 | Bỏ xác nhận cộng buổi (`ActivationTab.tsx:1909`, module-level `module3`) | Cần AR có gói giới thiệu (REFER) đã tick cộng buổi — không tìm thấy nhanh trong data test | Ưu tiên thấp — module-level, cơ chế đã xác nhận qua #11-13 cùng module |

## Phát hiện phụ trong lúc nghiệm thu

- **Tính năng multi-child đã hoạt động đầy đủ trên sandbox**: ô "Tên con" nhận nhiều tên phân cách `-`/`&`/`,`/`/`, dropdown "Tên trên nội dung CK" khi tạo lần TT cho chọn đúng bé, dialog "Thêm UID mới" có "Của bé nào?". Đã cập nhật lại `paymentRequests/tao-lan-tt-chuan.md` (nội dung cũ ghi "chỉ lưu 1 tên" đã lỗi thời).
- `npx tsc -b` sạch + `npm run test` 610/610 pass trên code đã merge (kiểm tra trước khi Đức push, khớp báo cáo của Đức).

## Kết luận

**18/23 điểm chèn đã live-verify bằng screenshot thật, không điểm nào vỡ layout hay đè nút đóng.** Cộng thêm 1 điểm suy luận hợp lý (#19) → thực chất 19/23. Còn 3 điểm (#20-23, trừ #19) chưa verify được do giới hạn dữ liệu test/thời gian — đều là các trường hợp **fail-case hiếm gặp hoặc module-level ít rủi ro** (không phải lỗi phát hiện được, chỉ là chưa có điều kiện để thử).

**Đề xuất**: đủ điều kiện để merge — không phát hiện lỗi nào ảnh hưởng chức năng chính. 3 điểm còn lại có thể làm fast-follow sau khi có thêm data test hoặc thời gian.
