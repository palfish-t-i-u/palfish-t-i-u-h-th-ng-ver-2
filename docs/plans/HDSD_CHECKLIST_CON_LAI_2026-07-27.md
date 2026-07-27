> ✅ **HOÀN THÀNH 27/07/2026** — Đạt làm toàn bộ 9 module (phần Đức) + 3 module còn lại của mình luôn (theo yêu cầu "xử lý hết toàn bộ phần còn lại"). 17 bài mới, 17 điểm chèn `HdsdLink` (9 module), `tsc -b`/`npm run test`/`npm run build`/bundle-leak check đều xanh, ảnh chụp thật qua Playwright trên sandbox. Tiện thể dọn thêm 9/21 bài nợ ảnh cũ (chỉ phần chụp thuần đọc, không mutate dữ liệu — xem cuối file). MODULES.md §12 đã cập nhật số liệu cuối cùng.
>
> ✅ **CẬP NHẬT 28/07/2026** — Đức xử lý nốt 10/12 bài nợ ảnh còn lại (mutate + revert theo phương án "tự mutate trên sandbox, revert ngay sau khi chụp"): `paymentRequests/pr-du-tien`, `module3/bao-don-kich-hoat`, `module3/order-id-va-hold`, `module3/them-uid-them-goi`, `module4/xuat-hoa-don-theo-course-code`, `module3/cong-buoi-gioi-thieu`, `reconciliation/ghep-giao-dich`, `revenueLedger/tao-sua-dong-so` (8 bài chụp + wire xong) + `paymentRequests/chuyen-giao-pr`, `paymentRequests/huy-pr` (đã xong từ trước). `screenshots.test.ts` còn đúng 2 mục trong `NO_SCREENSHOT_YET`: `reconciliation/so-tien-khong-khop` và `revenueLedger/quy-doi-ty-gia` — cả hai **không khả thi qua UI thuần** (xem lý do cuối file), không phải do thiếu thời gian.
>
> **Phát hiện phụ + đã fix**: bug thật trong `PaymentRequestDetailDrawer.tsx` — form "Sửa" (B1) dùng `setDraft({ ...draft, field: v })` (closure cũ) thay vì `setDraft(prev => ({ ...prev, field: v }))`. Vì `VietnamAddressFields.handleProvinceChange` gọi 2 lần `onChange` liên tiếp (province + reset ward) trong cùng 1 handler, lần gọi thứ 2 luôn ghi đè lần thứ 1 bằng draft cũ — chọn Tỉnh/Thành lần đầu trong form Sửa bị mất ngay lập tức, chặn đúng luồng kế toán bổ sung địa chỉ để xuất HĐ. Đã sửa toàn bộ 23 chỗ `setDraft` sang functional-updater form. `tsc -b` + 656 unit test xanh.

# Checklist HDSD còn lại — 12 module (27/07/2026)

> Đọc kèm `docs/HDSD_HUONG_DAN_VIET_BAI.md` (cách viết 1 bài + cách gắn HdsdLink) trước khi bắt đầu. Nguồn sự thật cho điểm chèn đã gắn: `grep -rn "<HdsdLink" frontend/src`.

Đã xong hôm nay (không đụng lại): 6 module ưu tiên cũ (paymentRequests, reconciliation, reconCard, module3, module4, revenueLedger) — 36 điểm chèn, đủ nội dung.

**Còn lại 12 module, ước tính ~26 điểm chèn mới.** Chia theo plan đã chốt:

---

## Phần Đức — 9 module (kỹ thuật/vận hành)

### 1. `gatewaySync` — Đồng bộ mPOS / Payoo
File: `frontend/src/components/GatewaySyncTab.tsx`

| Điểm chèn | Vị trí | Đề xuất topic |
|---|---|---|
| Header "Xem lại hướng dẫn" | dòng ~274 | `tong-quan` |
| Panel "Trạng thái + đồng bộ" | dòng ~327 | `tong-quan` |
| Panel "Cài tiện ích đồng bộ" (`panel-head`, dòng 418-419) | | `cai-tien-ich` |
| Modal onboarding "Hướng dẫn dùng tiện ích đồng bộ" (dòng 495) | | `cai-tien-ich` |

**Bài cần viết (2):**
- `gatewaySync/tong-quan.md` — tổng quan: giao dịch mPOS/Payoo tự động kéo về qua extension trình duyệt, không cần thao tác thủ công; nút "Đồng bộ ngay" kéo cả 2 kênh.
- `gatewaySync/cai-tien-ich.md` — cách cài tiện ích trình duyệt để extension hoạt động (xem đúng nội dung modal onboarding có sẵn để viết lại ngắn gọn hơn).

### 2. `authAccounts` — Tài khoản Auth
File: `frontend/src/components/AuthAccountsTab.tsx` + `auth/CreateAccountModal.tsx`, `auth/DeleteAccountsModal.tsx`, `auth/CrmLinkModal.tsx`, `auth/AccountDetailDrawer.tsx`

| Điểm chèn | Vị trí | Đề xuất topic |
|---|---|---|
| `aa-header-bar` toolbar — nút "🗑 Xóa tài khoản" + "+ Thêm tài khoản" (dòng ~262-268) | | `tong-quan` |
| `CreateAccountModal.tsx` (dùng `Modal` chung, `headerExtra`) | | `tao-tai-khoan` |
| `DeleteAccountsModal.tsx` | | `xoa-tai-khoan` |
| `CrmLinkModal.tsx` | | `lien-ket-crm` |
| `AccountDetailDrawer.tsx` (`aa-drawer-header`, dòng 230) | | `chi-tiet-tai-khoan` |

**Bài cần viết (5):** tổng quan trang, tạo tài khoản mới, xoá tài khoản (kèm điều kiện), liên kết CRM (mỗi tài khoản Auth ứng với 1 nhân sự CRM), xem/sửa chi tiết 1 tài khoản.

### 3. `permissions` — Phân quyền sử dụng
File: `frontend/src/components/permissions/PermissionsTab.tsx` + `StaffPickerModal.tsx`, `OverrideDrawer.tsx`

| Điểm chèn | Vị trí | Đề xuất topic |
|---|---|---|
| Tab "Theo nhóm" — ma trận quyền theo phòng ban (dòng ~258) | | `tong-quan` |
| `pm-override-header` — "Override cá nhân" + nút mở StaffPickerModal (dòng ~457) | | `override-ca-nhan` |
| `StaffPickerModal.tsx` + `OverrideDrawer.tsx` (cùng luồng override) | | `override-ca-nhan` |

**Bài cần viết (2):** tổng quan ma trận quyền theo nhóm (bấm ô để đổi cấp quyền), override quyền cá nhân (chọn nhân sự → mở drawer chỉnh quyền riêng, khác với quyền nhóm mặc định).

### 4-6. Zalo OA (3 tab)
Files: `frontend/src/components/admin/ZaloConfigTab.tsx`, `ZaloGroupsTab.tsx`, `ZaloOutboxTab.tsx`

| Module | Điểm chèn | Vị trí | Topic |
|---|---|---|---|
| `zaloConfig` | h2 "Cấu Hình Zalo OA" (dòng 133) | | `tong-quan` |
| `zaloConfig` | h3 "Trạng thái Token" + "Cập nhật Credentials" (dòng 147, 155) | | `trang-thai-token` |
| `zaloConfig` | h3 "Kiểm tra kết nối" (dòng 231) | | `kiem-tra-ket-noi` |
| `zaloGroups` | Toolbar "+ Thêm mới" (dòng ~139) + danh sách nhóm | | `tong-quan` |
| `zaloOutbox` | Bảng outbox 50 tin gần nhất, retry/cancel | | `tong-quan` |

**Bài cần viết (4):** `zaloConfig/tong-quan.md`, `zaloConfig/trang-thai-token.md` (token sống ~25h, tự refresh khi còn ≤6h, xem CLAUDE.md admin), `zaloConfig/kiem-tra-ket-noi.md` (test-send), `zaloGroups/tong-quan.md` (mapping team_code → group_id Zalo GMF), `zaloOutbox/tong-quan.md` (retry delay 30s/2m/5m/15m, dead-letter khi hết retry).

Domain context (đọc `frontend/src/components/admin/CLAUDE.md`): token ưu tiên DB hơn env var, event tự động `payment_paid` (KHÔNG còn `bill_uploaded`, đã tắt 17/07).

### 7-9. DingTalk (3 tab)
Files: `frontend/src/components/admin/DingTalkConfigTab.tsx`, `DingTalkGroupsTab.tsx`, `DingTalkOutboxTab.tsx`

| Module | Điểm chèn | Vị trí | Topic |
|---|---|---|---|
| `dingtalkConfig` | h2 + h3 "Kiểm tra kết nối" (dòng 60, 76) | | `tong-quan` |
| `dingtalkGroups` | h3 "Thêm nhóm mới" (dòng 96) + "Danh sách nhóm" (dòng 112) | | `tong-quan` |
| `dingtalkOutbox` | h2 "Outbox (50 gần nhất)" (dòng 53) | | `tong-quan` |

**Bài cần viết (3):** `dingtalkConfig/tong-quan.md` (test gửi tin, OAuth2 tự refresh), `dingtalkGroups/tong-quan.md` (mapping team_code → openConversationId, chỉ nhóm internal hỗ trợ robot), `dingtalkOutbox/tong-quan.md` (event tự động: `activation_request_created`, `course_activated`, `activation_urgent_reminder`).

**Tổng phần Đức: ~16 bài, ~14 điểm chèn.**

---

## Phần Đạt — 3 module (business/sales-facing)

### 10. `dashboard` — Bảng thông tin
File: `frontend/src/components/DashboardTab.tsx`

Module đọc-only (leaderboard, gamification), không có popup/action — chỉ cần bài tổng quan cho header link.

**Bài cần viết (1):** `dashboard/tong-quan.md` — mô tả các section (vinh danh, xếp hạng doanh thu, nhiệm vụ thưởng tuần, sự kiện nội bộ).

### 11. `module5` — Đồng bộ CRM
File: `frontend/src/components/Module5Tab.tsx`

| Điểm chèn | Vị trí | Topic |
|---|---|---|
| "Trạng thái kết nối CRM" + nút LẤY DỮ LIỆU (dòng ~211, 390-403) | | `tong-quan` |
| "Phát hiện ngày thiếu" — quét 60 ngày, backfill (dòng ~234-267) | | `phat-hien-ngay-thieu` |
| "Incremental sync" — Hôm qua/Hôm nay + đồng bộ 1 ngày (dòng ~345-376) | | `tong-quan` (gộp chung với luồng chính, không cần bài riêng) |

**Bài cần viết (2):** `module5/tong-quan.md` (mở CRM để extension lấy token, bấm LẤY DỮ LIỆU, không cần Export thủ công), `module5/phat-hien-ngay-thieu.md` (quét 60 ngày gần nhất, tự sync ngày chưa có data).

### 12. `module6` — Dashboard Sale
File: `frontend/src/components/Module6Tab.tsx`

| Điểm chèn | Vị trí | Topic |
|---|---|---|
| Filter toolbar (date range tabs, team/sale filter, nút Làm mới) — dòng ~229-274 | | `tong-quan` |

**Bài cần viết (1):** `module6/tong-quan.md` — chọn khoảng ngày (tab nhanh hoặc custom), lọc theo team/sale, ý nghĩa các chỉ số hiệu suất.

**Tổng phần Đạt: ~4 bài, ~4 điểm chèn.**

---

## Sau khi cả 2 xong

1. Xoá đúng slug khỏi `NO_SCREENSHOT_YET` trong `frontend/src/content/help/screenshots.test.ts` cho từng bài đã có ảnh.
2. `npx tsc -b` + `npm run test` xanh.
3. Nghiệm thu tổng — dùng `grep -rn "<HdsdLink" frontend/src` liệt kê toàn bộ điểm chèn (lúc đó sẽ là 36 cũ + ~18 mới ≈ 54 điểm), click từng chỗ xác nhận đúng URL `/docs/<module>/<topic>`, ảnh hiện đúng, không vỡ layout.
4. Cập nhật `MODULES.md` §12 với số bài/module cuối cùng.

## Nợ ảnh cũ (21 bài — cập nhật 28/07/2026: XONG 19/21)

Đã dọn 9/21 hôm 27/07 bằng thao tác THUẦN ĐỌC: `module3/tong-quan`, `module4/tong-quan`, `paymentRequests/tong-quan`, `paymentRequests/tao-lan-tt-chuan`, `paymentRequests/xem-lich-su-pr`, `paymentRequests/xem-qr-thanh-toan`, `paymentRequests/thieu-anh-bill`, `reconciliation/tong-quan`, `revenueLedger/tong-quan`.

Đã dọn thêm 10/21 hôm 28/07 bằng phương án "tự mutate trên sandbox (PR/AR/dòng sổ doanh thu test riêng, `is_test=true`), revert ngay sau khi chụp":

- `paymentRequests/huy-pr`, `paymentRequests/chuyen-giao-pr` — PR test huỷ/chuyển giao xong, không cần revert thêm (Huỷ là hành động an toàn sẵn có).
- `paymentRequests/pr-du-tien` — PR test trả dư tiền, đã chụp cảnh báo.
- `module3/bao-don-kich-hoat`, `module3/order-id-va-hold`, `module3/them-uid-them-goi` — dùng chung 1 PR test ("HDSD TEST FULL") xuyên suốt B3.
- `module3/cong-buoi-gioi-thieu` — PR test riêng nguồn KH "Giới thiệu" + gói REFER, điền đủ UID người giới thiệu + số buổi, chụp panel tick "Đã cộng buổi" (chưa tick, đúng trạng thái mặc định).
- `module4/xuat-hoa-don-theo-course-code` — dùng lại "HDSD TEST FULL" sau khi bổ sung địa chỉ + Yêu cầu xuất; chỉ xuất **yêu cầu**, không bấm nút "Xuất hoá đơn" thật (không phát sinh INV thật).
- `reconciliation/ghep-giao-dich` — PR test tiền mặt, chụp tab Chuyển khoản ở trạng thái "Chờ xác nhận" (đủ minh hoạ nút Xác nhận/Từ chối), rồi xác nhận.
- `revenueLedger/tao-sua-dong-so` — tạo 1 dòng test qua "+ Thêm dòng", chụp form đã điền, **xoá dòng ngay sau khi chụp** (tính năng xoá dòng tay có sẵn trong UI).

**Phát hiện phụ khi làm `xuat-hoa-don-theo-course-code`**: bug thật trong `PaymentRequestDetailDrawer.tsx` khiến chọn Tỉnh/Thành lần đầu trong form Sửa (B1) bị mất ngay — đã fix (xem ghi chú đầu file), không phải lỗi thao tác Playwright.

Còn đúng 2/21 **cố tình không chụp** — không khả thi qua UI thuần, không phải do thiếu thời gian:

- `reconciliation/so-tien-khong-khop` — cần 1 giao dịch CK ngoài (SePay bank feed) hoặc thẻ mPOS/Payoo lệch số tiền so với lần thanh toán. Cả 2 nguồn dữ liệu này chỉ đổ vào hệ thống qua sync tự động thật (SePay webhook / extension mPOS-Payoo) — không có nút "tạo tay giao dịch test" nào trong UI để giả lập, nên không dựng được trạng thái này an toàn qua Playwright/UI thuần. Cần một giao dịch lệch tiền THẬT xuất hiện tự nhiên trong sandbox mới chụp được.
- `revenueLedger/quy-doi-ty-gia` — `ExchangeRatesPanel.tsx` xác nhận: thêm tỷ giá là **vĩnh viễn**, BE chưa hỗ trợ sửa/xoá (chỉ upsert đè cùng ngày hiệu lực). User đã quyết định bỏ qua mục này thay vì thêm 1 dòng test không xoá được vào bảng lịch sử tỷ giá dùng chung.

## Dọn dẹp data test (28/07/2026)

Trong lúc chụp phát sinh ~15 PR test (`HDSD TEST HUY/FULL/REFER/RECON`) do vài lần thử-sai (đặc biệt vòng debug `cong-buoi-gioi-thieu` tốn nhiều lượt vì bug closure ở trên). Đã huỷ 4 PR chưa từng thanh toán (đủ điều kiện `canCancel`: `doneCount===0 && !activeRequestId`) qua tính năng Huỷ Payment Request có sẵn: PR-2026-9157, 9158, 9160, 9162.

Còn lại ~10 PR test (đã có lần thanh toán xác nhận + hầu hết đã tạo AR) — **không huỷ được qua UI** vì điều kiện `canCancel` yêu cầu `doneCount===0`, không có ngoại lệ cho PR test. Đây là data rõ ràng gắn cờ test (`is_test=true`, tên "HDSD TEST ...", ẩn khỏi list khi tick "Ẩn data test"), không ảnh hưởng số liệu thật — chấp nhận để lại, không dùng script xoá hàng loạt (`clean_test_data.py`) vì ảnh hưởng cả data test của người khác.
