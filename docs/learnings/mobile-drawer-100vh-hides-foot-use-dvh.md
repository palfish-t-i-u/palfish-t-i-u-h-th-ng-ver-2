# Mobile drawer full-screen: `100vh` giấu footer sau thanh địa chỉ → dùng `100dvh`

**Related files:** `frontend/src/styles/prototype-payments.css`, `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`

**Problem:** Trên điện thoại (Chrome), mở link PR → drawer chi tiết, nút "Yêu cầu kích hoạt" (trong `.drawer-foot`) nằm tít dưới cùng, khuất khỏi màn hình và KHÔNG cuộn tới được. Sale báo (Ms Tina 23/7) sau đợt mobile UI drawer.

**Trap:** (1) Đổ lỗi cho commit "hôm qua" — `git log -- PaymentRequestDetailDrawer.tsx` và `-- prototype-payments.css` cho thấy merge gần nhất KHÔNG chạm 2 file này; bug là latent từ đợt rework drawer mobile trước đó (full-screen `100vw` + header 2 dòng cao hơn), chỉ lộ ra trên máy Tina. Đừng tin lời kể timeline, đọc git. (2) Tưởng lỗi cuộn của `.drawer-body` → sai: `.drawer-foot` là **sibling** của `.drawer-body`, nằm ngoài vùng cuộn, ghim ở đáy cột flex. (3) Nghĩ headless/preview lặp lại được → KHÔNG: viewport cố định không có thanh địa chỉ động, `100dvh`==`100vh`, foot luôn vừa khung → xanh giả (cùng bẫy [[ios-webkit-sticky-header-sibling-scroll-gap]]).

**Insight:** `.drawer` (side sheet) là `position:fixed; height:100vh`, flex-column = head + `.drawer-body`(flex:1, overflow-auto) + `.drawer-foot`(ghim đáy). Trên mobile, `100vh` = chiều cao KHI thanh địa chỉ ẩn (lớn nhất). Lúc thanh địa chỉ Chrome còn hiện, drawer cao hơn vùng nhìn thực → đáy cột (chứa `.drawer-foot`) rớt xuống dưới mép. `document.body.overflow="hidden"` khóa cuộn trang + drawer `fixed` không cuộn theo → không cách nào kéo foot lên. Chính file này ĐÃ fix đúng cho biến thể `.drawer-center` (mPOS/Payoo) bằng `100dvh` (commit c619cc2, 12/7) nhưng QUÊN `.drawer` gốc → side drawer giữ `100vh`. `.ar-drawer`/`.invoice-drawer`/`.recon-drawer` đều kế thừa `.drawer` nên dính cùng bug; sửa 1 rule ở `.drawer` mobile là cascade hết.

**Rule:** Bất kỳ drawer/bottom-sheet `position:fixed` full-screen trên mobile PHẢI dùng `height/max-height: 100dvh` (không `100vh`) khi footer là sibling ghim đáy — nếu không foot khuất sau thanh địa chỉ. Khi fix viewport-height cho MỘT biến thể drawer, grep tất cả biến thể cùng base class và fix ở base. Đừng verify bằng headless/Playwright viewport cố định (giấu lỗi) — nghiệm thu trên điện thoại thật (thanh địa chỉ hiện).

**Verify:** `grep -n "height: 100dvh" frontend/src/styles/prototype-payments.css` — phải thấy rule trong block `.drawer` mobile (comment "Mobile: drawer chiếm toàn màn hình"), KHÔNG chỉ ở `.drawer-center`.
