# Toolbar search/filter dùng chung nhưng tab render list riêng → control chết câm trên tab đó

**Date:** 2026-07-20
**File:** `frontend/src/components/ReconciliationTab.tsx`, `frontend/src/components/payment-flow/paymentFlowUtils.ts`

## Problem

Kế toán báo: ô tìm kiếm + bộ lọc ngày trên tab "CK ngoài chờ ghép" (Đối soát giao dịch) "vô dụng" — gõ "gia han" vẫn ra dòng khác, chọn 06/07→20/07 vẫn hiện dòng 04/07, 05/07.

## Trap

Nhìn thấy ô search có `value={search}` + `onChange={setSearch}` và `<DateRangeFilter value={dateRange} .../>` render đầy đủ → tưởng đã nối. Thực ra state cập nhật bình thường, nhưng **không nhánh nào của tab đó đọc state để lọc**.

Toolbar (search + date) dùng CHUNG cho mọi tab, nhưng mỗi tab tự dựng list riêng:
- Các tab payment-lines dùng memo `filtered` — CÓ áp `search` + `inDateRange(dateRange)`.
- Tab `ckOutside` dùng thẳng `bankPendingTxns` (chỉ lọc `match_status`) — bỏ qua cả `search` lẫn `dateRange`.

Control "hiện ra" ≠ control "được nối". Cái nút vẫn gõ được, chỉ là không ai nghe.

## Insight

Khi 1 toolbar filter (search/date/method) **shared** giữa nhiều tab mà mỗi tab build danh sách bằng memo/nguồn riêng, thì **mỗi danh sách phải tự tiêu thụ toàn bộ filter state**. Sót 1 nhánh = control chết câm đúng trên tab đó, không lỗi TS, không cảnh báo runtime — chỉ user phát hiện.

Bonus nghiệp vụ: bản ghi `bank_transactions` thô (chưa ghép PR) KHÔNG có tên khách/tên bé — chỉ có `transfer_content`/`content`/`amount`/`account_number`. Nên search trên tab này tối đa chỉ tới nội dung CK + số tiền + TK; "tìm theo tên bé" là bất khả về mặt dữ liệu (chưa gắn PR). May là tên người gửi thường nằm trong `transfer_content` → normVi("gia han") vẫn khớp "...Han Gia Han...".

## Rule

Khi thêm/sửa một tab trong bảng có toolbar filter dùng chung: grep mọi state của toolbar (`search`, `dateRange`, `methodFilter`…) và xác nhận **nhánh render của tab MỚI cũng đọc đủ** — không chỉ tab cũ. Với multi-tab table, mỗi memo danh sách phải include cùng bộ filter (hoặc chủ động quyết định bỏ + đổi placeholder cho rõ). Search tên tiếng Việt dùng `normVi()` (xem [search-normalize-vi](2026-07-11-search-normalize-vi.md)); tách predicate thành pure fn (`bankTxnMatchesSearch`) để unit-test thay vì memo inline.

**Verify:** `grep -n "search\|dateRange\|methodFilter" ReconciliationTab.tsx` — mỗi memo build list (`filtered`, `filteredBankPending`) phải tham chiếu các state này trong deps VÀ trong thân filter.
