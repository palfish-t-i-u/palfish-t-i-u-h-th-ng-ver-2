# Drawer 40+ state vars: memo children + lazy-mount modals + useMemo derived

**Related files:** `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`, `frontend/src/components/payment-request/TransferSaleModal.tsx`, `frontend/src/components/payment-request/PrHistoryModal.tsx`

**Problem:** Drawer QLTT có ~40 state variables; bất kỳ setState nào (gõ edit form, toggle modal, showAdd…) đều re-render toàn bộ body kể cả children không liên quan (QrRow, AddPaymentForm, ActiveRequestMiniCardV2) và mount lại 2 modal luôn gắn sẵn với `pr={null}`.

**Trap:** Tưởng `React.memo` đủ cho mọi child — nhưng child nhận prop đổi identity mỗi render (object/callback tạo inline) thì memo vô ích; phải kết hợp `useCallback`/`useMemo` ổn định prop. Ngược lại, tưởng phải memo TẤT CẢ — thực tế chỉ cần memo children NẶNG (nhiều JSX / gọi hàm đắt), child nhẹ memo thêm overhead không đáng. Ngoài ra, modal luôn mount với `pr={null}` + guard `if (!pr) return null` tưởng rẻ nhưng vẫn chạy toàn bộ hooks của modal mỗi parent render.

**Insight:** Ba tầng tối ưu độc lập, mỗi tầng chặn một loại chi phí khác nhau: (1) `React.memo` child nặng — chặn re-render JSX tree lớn khi prop không đổi; (2) lazy-mount modal (`{open && <Modal/>}`) — chặn chạy hooks + reconcile VDOM của component chưa cần; (3) `useMemo` derived values (`activationSummary`, `reportButtonState`) — chặn tính toán đắt lặp lại khi input không đổi. Ba tầng cộng hưởng: memo child cần prop stable (từ useMemo/useCallback), lazy-mount cần điều kiện rõ ràng (boolean state), useMemo cần dependency chính xác.

**Rule:** Component cha >20 state vars + child nặng (>50 JSX lines hoặc gọi utility function): (a) wrap child bằng `React.memo` (named function, không anonymous); (b) ổn định prop bằng `useCallback`/`useMemo` cho ref callback và derived object; (c) modal/dialog chỉ mount khi `open` state = true, KHÔNG mount sẵn với null guard; (d) derived value gọi function (không phải simple property access) phải `useMemo` với deps chính xác. Verify: React DevTools Profiler "Why did this render?" phải trống cho child không liên quan khi toggle state khác.

**Verify:** `grep -c "React.memo\|= memo(" frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` — expect ≥3 (QrRow, AddPaymentForm, ActiveRequestMiniCardV2); `grep -c "transferOpen &&\|historyOpen &&" frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` — expect ≥2 (lazy-mount guards).
