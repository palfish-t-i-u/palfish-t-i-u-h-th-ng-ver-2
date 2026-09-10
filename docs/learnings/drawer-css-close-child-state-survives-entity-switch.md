# Drawer đóng bằng CSS + child không `key` → state cục bộ/ref sống qua đóng và đổi entity

**Related files:** `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` (mount `ActiveRequestMiniCardV2`, `<aside className="drawer ${open ? "open" : ""}">`), `frontend/src/components/PaymentRequestsTab.tsx` (`handleSelect`, `setDrawerOpen(false)` khi đóng), `frontend/src/contexts/PaymentFlowContext.tsx` (`editingArIdRef`)

**Problem:** Sau khi thêm draft cục bộ + gate refetch cho card sửa AR (9/9/2026), reviewer tìm ra 2 bug 🔴: đóng drawer giữa chừng rồi mở PR khác → card vẫn `editing=true` với `draftAr` của AR cũ → Lưu ghi uids AR cũ lên AR mới; và `editingArIdRef` không bao giờ clear → toàn bộ refetch nền (poll/realtime/focus) đóng băng tới khi Lưu/đổi tab.

**Trap:** Coi "đóng drawer" = unmount. Thực tế `PaymentRequestDetailDrawer` chỉ toggle class `open` (CSS), `selectedId` giữ nguyên, và `handleSelect` đổi PR mà không đóng drawer → mọi `useState`/`useRef`/effect-cleanup trong card KHÔNG chạy lại. Trước đây bug chỉ là "cờ editing sót" vô hại (uids vẫn đọc từ prop global); khi state cục bộ bắt đầu MANG DỮ LIỆU (draft) và một ref toàn cục phụ thuộc vào lifecycle của nó, cùng thói quen đó thành mất dữ liệu.

**Insight:** Bất kỳ state cục bộ nào gắn với 1 entity (draft, editing, ref báo "đang sửa") phải có vòng đời = vòng đời hiển thị entity đó. Với overlay ẩn bằng CSS, cách rẻ và chắc nhất là `open && ... && <Child key={entity.id} />`: `open &&` unmount khi đóng (cleanup clear ref), `key` remount khi đổi entity mà drawer vẫn mở.

**Rule:** Khi thêm state cục bộ có dữ liệu hoặc effect ghi ref/global vào một component nằm trong overlay đóng-bằng-CSS: (1) grep cách overlay đóng (`className=\`... ${open ? "open" : ""}\``) — nếu là CSS thì mount con bằng `open &&`; (2) nếu overlay có thể đổi entity mà không đóng (`setSelectedId` không kèm `setDrawerOpen(false)`) thì thêm `key={entity.id}`. Xem thêm `2026-07-29-invisible-centered-modal-eats-clicks.md` — cùng họ bug "overlay ẩn bằng CSS còn sống".

**Verify:** `grep -n "bodyReady && hasActiveRequest && activeRequest" frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` — 1 hit, dòng kế có `key={activeRequest.id}`. (Gate đổi `open &&`→`bodyReady &&` 2026-09-10 khi thêm defer-render body cho fix lag bấm mở PR; `bodyReady` reset `false` trong cleanup effect `[open]` nên vẫn unmount card khi đóng — invariant unmount giữ nguyên.)
