# React Router nuốt fragment scroll của trình duyệt

**Related files:** `frontend/src/components/help/HelpArticle.tsx`, `frontend/src/pages/docs/DocsLayout.tsx`

**Problem:** Mục lục anchor (`[text](#heading-id)`) trong bài docs HDSD: bấm link đổi được `location.hash` nhưng trang không cuộn tới heading — kể cả khi element có `id` đúng tồn tại.

**Trap:** Tin rằng `<a href="#id">` thuần (ReactMarkdown render, không phải `<Link>`) sẽ được trình duyệt xử lý scroll-to-fragment native như trang tĩnh. Thực tế trong app BrowserRouter: hash change bắn `popstate` → React Router xử lý location update → smooth scroll native đang chạy bị hủy ngay khi bắt đầu (scrollTop đứng ở 0). `e.defaultPrevented` vẫn là `false` — không phải do preventDefault, nên debug theo hướng "ai chặn click" là ngõ cụt.

**Insight:** Có 2 lỗ hổng riêng biệt: (1) click anchor cùng trang — scroll bị router nuốt; (2) mở thẳng URL kèm `#anchor` — lúc trình duyệt xử lý fragment thì React chưa mount nội dung nên không có element để cuộn. Cả hai đều phải tự xử lý bằng effect: `useLocation().hash` → `document.getElementById(hash)` → `scrollIntoView()`. CSS `motion-safe:scroll-smooth` trên container cuộn (`<main>` trong DocsLayout) làm scrollIntoView mượt mà vẫn tôn trọng reduced-motion.

**Rule:** Bất kỳ trang nào trong app cần anchor link nội bộ (`#...`) phải có effect scroll theo hash — đừng dựa vào hành vi native. Kiểm tra bằng cách click anchor rồi đọc `main.scrollTop` (phải > 0), và mở thẳng URL kèm hash (heading phải nằm đầu viewport).

**Verify:** `grep -n "scrollIntoView" frontend/src/components/help/HelpArticle.tsx` — phải có hit trong useEffect theo `hash`.
