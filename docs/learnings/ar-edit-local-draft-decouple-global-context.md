# Sửa 1 entity trong context toàn cục: draft cục bộ + gate refetch, memo không cứu được

**Related files:** `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` (`ActiveRequestMiniCardV2`), `frontend/src/contexts/PaymentFlowContext.tsx` (`silentRefetch`, `loadData`), `frontend/src/components/payment-request/ActiveRequestMiniCardV2.test.tsx`, `frontend/src/contexts/PaymentFlowContext.refetchGate.test.tsx`

**Problem:** Sửa thông tin AR trong drawer PR "rất lag" và bấm Lưu xong phải chờ một lúc mới thấy cập nhật (9/9/2026).

**Trap:** (1) Tưởng lag do gõ phím → đi tối ưu ô input; thực ra ô UID/SĐT/số tiền đã draft+blur, nhưng 3 ô referral (`referrerUid`, `bonusSessions*`) và mọi commit/thêm/xoá đều `mutate` → `setActiveRequests` toàn cục → re-render Table 20 dòng + cả Drawer mỗi thao tác. (2) Định bọc `React.memo` cho Drawer/Table — vô ích: prop `activeRequest`/`arByPrId` đổi identity mỗi commit nên vẫn re-render. (3) Nút Lưu `await onActiveRequestSave` rồi mới `setEditing(false)` trong khi `saveActiveRequest` đã set state lạc quan ĐỒNG BỘ trước khi gọi mạng → form khoá theo round-trip Render vô nghĩa.

**Insight:** Chi phí mỗi-commit có chặn trên (memo `filtered`/`pageSlice` phụ thuộc `requests`, không phải `activeRequests`); cú đơ O(N) thật sự là `loadData` full-refetch chạy nền (poll 30s khi có QR chờ + realtime debounce 5–8s trên 3 bảng toàn hệ + chain trong `finally`) không hề bị chặn khi đang sửa. Chỉ có cách giữ state sửa CỤC BỘ (`draftAr`, `view = editing && draftAr ? draftAr : ar`, `mutate` → `setDraftAr` khi editing) mới ngăn context đổi theo từng thao tác; và gate `if (editingArIdRef.current) return` ở `silentRefetch` + chain `finally` mới chặn refetch nền.

**Rule:** Component sửa 1 entity lấy từ context toàn cục PHẢI: (a) giữ draft cục bộ, chỉ ghi context/API 1 lần khi Lưu; (b) đóng form ngay khi context đã optimistic — KHÔNG `await` mạng trước `setEditing(false)`; (c) mọi đường refetch nền (poll/realtime/focus/chain) phải qua cùng 1 gate có check "đang sửa". Field ngoài form (vd. `holdActivation`) đọc/ghi thẳng `ar` global, không vào draft.

**Verify:** `cd frontend && npx vitest run src/components/payment-request/ActiveRequestMiniCardV2.test.tsx src/contexts/PaymentFlowContext.refetchGate.test.tsx` — 6 pass; `grep -c "editingArIdRef.current" frontend/src/contexts/PaymentFlowContext.tsx` — expect ≥4 (khai báo, merge guard, silentRefetch gate, chain gate).
