# Spread parent sống + uids từ draft cũ → vô hiệu `expected_updated_at`, draft xoá gói vừa append

**Related files:** `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` (`save()` → `flushed` trong `ActiveRequestMiniCardV2`, `toggleHold`), `frontend/src/lib/arConcurrency.ts` (`withExpectedUpdatedAt`), `frontend/src/contexts/PaymentFlowContext.tsx` (`saveActiveRequest`, `parseArConflict`)

**Problem:** Với draft cục bộ, `flushed = { ...ar, uids: view.uids }` (spread `ar` global để giữ `holdActivation` vừa persist). Reviewer chỉ ra: nếu trong lúc đang sửa, cùng trình duyệt bấm "Báo đơn bổ sung" (append gói mới, đã bắn DingTalk) thì `ar.updatedAt` là bản MỚI còn `view.uids` là snapshot CŨ → `expected_updated_at` khớp server → BE chấp nhận → gói vừa append bị xoá âm thầm.

**Trap:** Nghĩ optimistic concurrency (`withExpectedUpdatedAt` đọc `currentAr.updatedAt`) tự bảo vệ mọi ghi đè. Nó chỉ bảo vệ khi `updatedAt` gửi lên là của BẢN NỀN mà payload được dựng từ. Trộn field từ 2 bản (parent sống + child cũ) là tự tay "làm mới" token trong khi nội dung vẫn cũ → guard thành vô dụng ở đúng ca cần nó (cùng trình duyệt; khác trình duyệt vẫn 409 bình thường).

**Insight:** Token concurrency phải đi cùng NỀN của dữ liệu ghi: `updatedAt: view.updatedAt` (snapshot lúc bấm Sửa) — mọi thay đổi khác lên AR trong lúc sửa → 409 → `saveActiveRequest` rollback + `AR_CONFLICT_MESSAGE`, không mất dữ liệu server. Hệ quả: thao tác server-immediate ngoài form (`toggleHold`) BE cũng bump `updated_at` → phải merge `updatedAt` từ response vào CẢ context lẫn draft (`fromApiActiveRequest(res.data).updatedAt`), kẻo Lưu ngay sau đó 409 mất trắng draft.

**Rule:** Khi payload ghi được dựng từ draft/snapshot, `expected_updated_at` (hay bất kỳ version token nào) PHẢI lấy từ snapshot đó, không lấy từ prop/context sống. Mọi mutation ngoài-form trên cùng entity trong lúc đang sửa phải cập nhật token vào draft. Test: rerender với `ar` mới (`updatedAt` khác) giữa lúc sửa → assert payload giữ `updatedAt` cũ.

**Verify:** `grep -n "updatedAt: view.updatedAt" frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` — 1 hit; `grep -n "expect(arg.updatedAt).toBe(NOW)" frontend/src/components/payment-request/ActiveRequestMiniCardV2.test.tsx` — 1 hit.
