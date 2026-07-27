> ✅ **HOÀN THÀNH 27/07/2026** — Đạt làm toàn bộ 9 module (phần Đức) + 3 module còn lại của mình luôn (theo yêu cầu "xử lý hết toàn bộ phần còn lại"). 17 bài mới, 17 điểm chèn `HdsdLink` (9 module), `tsc -b`/`npm run test`/`npm run build`/bundle-leak check đều xanh, ảnh chụp thật qua Playwright trên sandbox. Tiện thể dọn thêm 9/21 bài nợ ảnh cũ (chỉ phần chụp thuần đọc, không mutate dữ liệu — xem cuối file). MODULES.md §12 đã cập nhật số liệu cuối cùng.

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

## Còn treo từ trước (không thuộc phần việc tối nay, làm khi có điều kiện)

- `module3/bao-don-kich-hoat` — cần 1 PR "sẵn sàng kích hoạt" nhưng CHƯA từng báo đơn (data sandbox hiện tại không có sẵn).
- `reconciliation/so-tien-khong-khop` — cần 1 giao dịch lệch tiền so với lần thanh toán.

## Nợ ảnh cũ (21 bài, cập nhật 27/07/2026)

Đã dọn 9/21 — chỉ những bài chụp được bằng thao tác THUẦN ĐỌC (mở trang/modal xem, không submit): `module3/tong-quan`, `module4/tong-quan`, `paymentRequests/tong-quan`, `paymentRequests/tao-lan-tt-chuan` (mở modal Tạo PR, không bấm submit), `paymentRequests/xem-lich-su-pr`, `paymentRequests/xem-qr-thanh-toan`, `paymentRequests/thieu-anh-bill` (mở modal upload, không tải ảnh thật), `reconciliation/tong-quan`, `revenueLedger/tong-quan`.

Còn 12 bài chưa chụp — **cố tình dừng lại** vì thao tác chụp sẽ mutate dữ liệu sandbox dùng chung cả team, hoặc cần trạng thái nghiệp vụ đặc thù khó dựng lại:

- Mutate PR/AR thật: `paymentRequests/huy-pr` (huỷ PR), `paymentRequests/chuyen-giao-pr` (chuyển chủ sở hữu PR), `paymentRequests/pr-du-tien`.
- Mutate Active Request thật: `module3/cong-buoi-gioi-thieu` (tick cộng buổi — ghi audit log), `module3/order-id-va-hold` (điền Order ID thật), `module3/them-uid-them-goi` (thêm UID thật).
- Mutate hoá đơn/đối soát/sổ doanh thu thật: `module4/xuat-hoa-don-theo-course-code` (xuất INV thật), `reconciliation/ghep-giao-dich` (xác nhận khớp giao dịch thật), `revenueLedger/tao-sua-dong-so` (tạo/sửa dòng doanh thu thật), `revenueLedger/quy-doi-ty-gia` (thêm mốc tỷ giá thật, ảnh hưởng báo cáo).
- Cần trạng thái nghiệp vụ đặc thù: `module3/bao-don-kich-hoat`, `reconciliation/so-tien-khong-khop` (đã treo từ trước, xem trên).

Trước khi chụp 12 bài này, cần: (a) quyết định dùng bản ghi test disposable riêng thay vì data thật, hoặc (b) leader/người phụ trách xác nhận việc mutate tạm thời rồi revert là chấp nhận được.
