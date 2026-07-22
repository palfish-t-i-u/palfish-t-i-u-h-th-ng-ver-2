# Egress: gate visibility trước, slim payload sau

**Related files:** `frontend/src/hooks/useRealtimeTable.ts`, `frontend/src/hooks/useVisiblePoll.ts`, `frontend/src/contexts/PaymentFlowContext.tsx`, `frontend/src/hooks/useNotifications.ts`, `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`

**Problem:** Render prod egress vượt 5GB/tháng (100→700MB/ngày trong 2.5 tuần). Realtime event trên `payment_requests`/`payment_lines`/`active_requests` khiến MỌI tab đang mở — kể cả tab ẩn cả ngày — refetch nguyên list ~500 PR full payload.

**Trap:** Hai cái bẫy. (1) Nhào vào slim/paginate payload trước — đúng nhưng đắt (đụng BE + FE + index) và bỏ sót nhân tố lớn hơn: số tab ẩn refetch vô ích. (2) Để "chặn tab ẩn", unsubscribe websocket khi `document.hidden`. Cái này đẻ ra class bug mới: miss event sau khi rejoin, và message Supabase (rejoin) không phải hóa đơn đang cháy — hóa đơn là egress Render (cái FETCH).

**Insight:** egress = **payload size × refetch frequency × số tab**. Gate visibility cắt `frequency × tabs` — FE-only, 0 BE, rẻ nhất — nên làm TRƯỚC; slim payload (cắt `size`) làm SAU. Và phải gate đúng lớp: gate cái **FETCH**, KHÔNG gate **subscription**. Websocket vẫn subscribe khi ẩn; chỉ hoãn fetch. Check `document.hidden` tại **thời điểm timer debounce nổ** (không phải lúc event đến) — event đến lúc visible nhưng user ẩn tab trong cửa sổ debounce 5s vẫn phải ghi nợ. Ghi nợ khi ẩn → trả đúng 1 lần khi quay lại (qua `debouncedChange()`, không gọi thẳng `onChange` — để gộp với `useRefetchOnFocus` qua single-flight, tránh double-fetch).

**Rule:** Trước khi tối ưu payload cho vấn đề egress/tải, hỏi "nhân tố nào lớn nhất trong size × frequency × tabs?" — thường là tabs ẩn refetch, và fix nó là FE-only. Khi gate theo visibility: gate FETCH không gate SUBSCRIPTION; check `document.hidden` lúc timer nổ; nợ trả đúng 1 lần. Poll định kỳ (30s) dùng `useVisiblePoll` (nuốt tick khi ẩn, chạy bù 1 lần khi về), KHÔNG `setInterval` trần.

**Verify:** `grep -c "document.hidden" frontend/src/hooks/useRealtimeTable.ts frontend/src/hooks/useVisiblePoll.ts` — mỗi file ≥1; và `grep -rL "setInterval" frontend/src/hooks/useNotifications.ts frontend/src/contexts/PaymentFlowContext.tsx` xác nhận 2 call site poll đã chuyển sang `useVisiblePoll` (không còn `setInterval` trần).
