# Kế hoạch cải thiện UX HDSD + Audit tổng thể (26/07/2026)

> **SUPERSEDED 2026-07-27** — anh Minh đảo ngược quyết định "làm in-app", xem `HANDOFF_HDSD_DOCS_ROUTE_PIVOT_2026-07-27.md` cho kiến trúc mới (route `/docs/*`, HDSD mở tab mới, phạm vi mở rộng toàn app).

> Bối cảnh: sau khi Task 1-4 xong và merge vào `sandbox` (commit `d4337e8`), anh Đạt bấm thử thấy nút HDSD "không phản ứng gì". Điều tra qua browser thật + đọc code cho thấy: **cơ chế cốt lõi hoạt động đúng**, nhưng có 3 khoảng trống UX thật khiến việc bấm HDSD *cảm giác* như không có gì xảy ra — đặc biệt khi cuộn sâu trong 1 trang dài, hoặc dùng trên mobile. File này gồm 2 phần: (A) audit hiện trạng theo đúng câu hỏi của Đạt, (B) kế hoạch sửa.

---

## Phần A — Audit hiện trạng

### A1. Vị trí nút HDSD đã đúng chưa?

Đã live-verify 19/23 điểm chèn bằng thao tác thật trên `https://palfish-gmv-manager-sandbox.vercel.app/` (chi tiết đầy đủ trong [`QA_HDSD_NGHIEM_THU_2026-07-26.md`](QA_HDSD_NGHIEM_THU_2026-07-26.md)). Kết luận: **không có điểm nào vỡ layout hay đè nút đóng.** 4 điểm còn lại (nhắc xuất HĐ fail-case, số tiền không khớp ở CK ngoài, bill viewer, bỏ xác nhận cộng buổi) chưa live-verify được do giới hạn dữ liệu test, không phải do phát hiện lỗi.

**Kết luận: vị trí đã ổn**, không cần sửa gì thêm ở phần này.

### A2. Nội dung docs đã chuẩn chưa?

Đã đọc lại toàn bộ 29 file `.md` hiện có trên `sandbox` (26 bài gốc của Đạt + 3 bài Đức viết thêm cho BC01-03 + các bài Đức tự viết cho `module3`/`module4`/`reconciliation`/`reconCard`). Đối chiếu với UI thật đã xác nhận:

- Nội dung chính xác, bám sát nhãn nút thật.
- 1 chỗ lỗi thời đã tự phát hiện và sửa: `paymentRequests/tao-lan-tt-chuan.md` — cảnh báo cũ nói "Tên con chỉ lưu 1 tên" trong khi multi-child đã hoạt động — **đã sửa** (đang chờ commit).
- Các bài Đức tự viết (`module3/tao-active-request.md`, `module3/bao-don-kich-hoat.md`, `module3/bao-don-bo-sung.md`, `module3/nhac-kich-hoat-gap.md`, `module4/nhac-xuat-hoa-don.md`, `reconciliation/ghep-giao-dich.md`, `reconciliation/so-tien-khong-khop.md`, `reconCard/ghep-giao-dich-the.md`, 3 bài BC01-03) — chất lượng tốt, đúng giọng văn, có chi tiết thật từ code (VD: BC01 lọc theo Pay Time chứ không phải ngày chốt đơn).

**Kết luận: nội dung đã chuẩn**, không cần sửa gì thêm ngoài 1 chỗ đã sửa ở trên.

### A3. Docs đã đủ chưa?

29 bài phủ đủ toàn bộ 23 điểm chèn (nhiều điểm chèn dùng chung 1 bài theo đúng thiết kế "nhiều-điểm-chèn → một-bài"). Không phát hiện điểm chèn nào trỏ tới bài không tồn tại.

**Khoảng trống nhỏ, không chặn:**
- `reconciliation/so-tien-khong-khop.md` viết tương đối chung chung (không có ví dụ số cụ thể) — có thể bổ sung sau, không cấp thiết.
- Chưa có bài riêng cho "Bỏ xác nhận cộng buổi" (module-level, ít dùng) — chấp nhận được vì đây chỉ là module-level HDSD (dẫn vào mục lục chung của module3, không cần bài riêng).

**Kết luận: docs đủ** cho phạm vi 6 module ưu tiên đã chốt.

---

## Phần B — Vấn đề UX thật + kế hoạch sửa

### B1. Vấn đề: bấm HDSD xong, người dùng không biết là đã "nhảy" sang đâu

**Nguyên nhân gốc (đã xác nhận bằng code + test):**

1. **Không có scroll-to-top khi đổi view.** `<main>` trong `AppShell.tsx:349` là 1 container cuộn riêng (`overflow-auto`). Khi bấm HDSD kiểu `topic` từ 1 popup đang mở sâu trong lúc trang đã cuộn xuống, `activeView` đổi sang `"help"` nhưng **không có đoạn code nào reset `scrollTop` về 0** (đã `grep` xác nhận `MainPage.tsx` không có `useEffect` nào làm việc này). Nếu bài viết mới ngắn hơn vị trí cuộn cũ, người dùng có thể vẫn thấy đúng đầu bài (may mắn) — nhưng nếu không, họ có thể rơi vào giữa bài, hoặc tệ hơn là cảm giác "không có gì đổi".
2. **Không có tín hiệu trực quan xác nhận "bạn vừa chuyển trang".** Modal đóng lại, `activeView` đổi, nhưng không có toast/breadcrumb/animation nào báo hiệu — chỉ có tiêu đề trang (`<h1>`) đổi thành tên bài viết, dễ bị bỏ qua nếu mắt đang nhìn chỗ khác (vừa bấm nút trong modal).
3. **Trên mobile, nút HDSD kiểu `module` (ở header, không có `topicSlug`) là no-op hoàn toàn.** `goToModule()` chỉ set `helpExpandedModuleId` để mở cây trong sidebar — nhưng `MobileNavSheet.tsx` **không hề import `HelpNavTree`/`HdsdLink`** (đã `grep` xác nhận). Trên mobile không tồn tại sidebar cây để mở → bấm nút này trên mobile **thực sự không có gì xảy ra**, không phải cảm giác, mà là bug thật.
4. **Text hướng dẫn sai ngữ cảnh trên mobile.** `HelpLanding.tsx:13` viết cứng: *"Chọn 1 module ở sidebar bên trái..."* — trên mobile không có sidebar bên trái (layout dùng bottom-nav), nên câu này gây hiểu lầm ngay cả khi luồng thực tế (bấm vào danh sách nút module ngay trong nội dung) vẫn hoạt động bình thường.

### B2. Đề xuất sửa — theo mức ưu tiên (đã soi kỹ từng việc, xem B3-B7)

| # | Việc | File cần sửa | Trạng thái |
|---|---|---|---|
| 1 | Reset scroll về đầu `<main>` khi vào/rời `"help"` | `MainPage.tsx` | Cần làm |
| 2 | Sửa text `HelpLanding.tsx` không nhắc "sidebar bên trái" | `HelpLanding.tsx` | ✅ **Đức đã tự sửa xong** (commit `f600939`) — copy hiện tại: "Chọn 1 module bên dưới (hoặc ở sidebar)..." |
| 3 | Mobile: `HdsdLink mode="module"` dùng `goToModuleIndex` thay vì no-op | `HdsdLink.tsx` | Cần làm — có đánh đổi phải nói rõ, xem B5 |
| 4 | Breadcrumb nhỏ đầu `HelpArticle`/`HelpModuleIndex` | `HelpArticle.tsx`, `HelpModuleIndex.tsx` | Cần làm |
| 5 | Highlight/pulse nhẹ khi vừa điều hướng tới bài mới | `HelpArticle.tsx` | Cần làm — có 1 chi tiết kỹ thuật, xem B6 |
| 6 | ~~Nút "← Quay lại nơi vừa thao tác"~~ | — | ❌ **Bỏ hẳn** — xem B7 |

Ngoài ra Đức vừa tự fix xong điểm chèn cuối cùng (22/22): rewire "Bỏ xác nhận cộng buổi" từ `mode="module"` sang `mode="topic"` trỏ bài `module3/cong-buoi-gioi-thieu.md` mới viết. Không còn điểm chèn nào thiếu bài.

### B3. Việc 1 (scroll-to-top) — soi lại thấy phức tạp hơn "~5 dòng"

`MainPage.tsx` **không có ref tới `<main>`** — nó nằm trong `AppShell.tsx`. Hai cách:
- Sửa `AppShell.tsx` forward ref ra ngoài — đụng signature 1 layout dùng chung.
- `document.querySelector('main')?.scrollTo(0,0)` — né sửa AppShell, không đúng chuẩn React nhưng an toàn vì chỉ có đúng 1 `<main>` trong layout.

**Chọn cách 2** (ít đụng chạm nhất). Và **chỉ áp dụng effect này khi `activeView === "help"` đổi** (không áp dụng cho mọi lần chuyển tab khác) — để không vô tình phá scroll-restore nếu tab nào đó đang tự làm việc đó.

### B4. Việc 2 — đã xong, không cần làm

Xác nhận lại: đây là 1 chuỗi tĩnh dùng chung, không cần rẽ nhánh mobile/desktop. Đức đã sửa đúng hướng.

### B5. Việc 3 (mobile module-mode) — có đánh đổi thật, không phải free fix

Trên desktop, `mode="module"` được thiết kế **cố ý an toàn — không đổi `activeView`, không mất state** (ghi rõ trong comment `HdsdLink.tsx`). Sửa cho mobile gọi `goToModuleIndex()` nghĩa là nút này **trên mobile sẽ đổi `activeView` và mất state y hệt `mode="topic"`** — vì mobile không có sidebar để "mở an toàn" nữa.

→ Giữa "im lặng hoàn toàn" (bug hiện tại) và "điều hướng đi, mất state" (bản sửa), bản sửa rõ ràng tốt hơn — nhưng **phá vỡ tính nhất quán hành vi giữa desktop và mobile cho cùng 1 nút**. Cần nói rõ điều này khi merge, không lặng lẽ đổi hành vi: *"trên mobile, mọi nút HDSD từ giờ đều điều hướng đi — không còn khái niệm nút an toàn module-level nữa, vì mobile không có sidebar."*

```tsx
// HdsdLink.tsx
import useIsMobile from "../../hooks/useIsMobile";

export function HdsdLink(props: Props) {
  const ctx = useHelpNavOptional();
  const isMobile = useIsMobile();
  if (!ctx) return null;
  const { goToModule, goToModuleIndex, goToTopic } = ctx;

  const handleClick = () => {
    if (props.mode === "topic") return goToTopic(props.moduleSlug, props.topicSlug);
    return isMobile ? goToModuleIndex(props.moduleSlug) : goToModule(props.moduleSlug);
  };
  // ...
}
```

`goToModuleIndex` đã có sẵn trong `HelpNavContext.tsx` — tái dùng, không cần hàm mới.

### B6. Việc 5 — cần key/effect để hiệu ứng chạy lại mỗi lần đổi bài

Nếu chỉ gắn class `animate-pulse` tĩnh, hiệu ứng **không tự replay** khi bấm từ bài này sang bài khác (component không unmount, chỉ đổi nội dung). Cần `key={helpTopic}` trên phần tử tiêu đề để ép remount, hoặc 1 `useEffect` theo dõi `helpTopic` để bật/tắt class thủ công. Vẫn là việc nhỏ, chỉ cần thêm đúng chi tiết này.

### B7. Việc 6 — lý do bỏ hẳn

1. **Hứa hẹn nhiều hơn làm được**: `activeView` chỉ là 1 chuỗi ở `MainPage`, còn state thật (PR/AR/popup nào đang mở, form đang gõ dở) sống ở state cục bộ trong từng tab con. Nút "Quay lại" chỉ đưa được về **danh sách**, không về đúng drawer/popup đang dở — component con mount lại từ đầu.
2. **Tạo cảm giác an toàn giả, có thể hại hơn không có gì**: hiện tại không có nút này nên người dùng tự dè dặt trước khi bấm HDSD giữa lúc gõ dở form. Có nút mà không khôi phục thật → người dùng bấm thoải mái hơn (tưởng an toàn) → mất dữ liệu đang nhập.
3. **Độ phức tạp thật cao hơn "Trung bình"**: làm đúng nghĩa cần nâng toàn bộ state lên `MainPage` (refactor lớn) hoặc giữ component cũ mounted ẩn (`display:none` — phát sinh vấn đề hiệu năng giống các bug `useVisiblePoll`/gate-theo-visibility đã từng gặp), cộng thêm 1 stack lịch sử thật nếu muốn quay lại nhiều lần — tức là xây 1 mini-router trong khi cả app đang **chủ đích không dùng URL/router** (đánh đổi đã anh Minh duyệt).

→ Đây không phải thiếu sót kỹ thuật mà là trade-off đã chốt có chủ đích. Không làm nửa vời; nếu sau này thực sự cần, đặt lại thành 1 quyết định kiến trúc mới với anh Minh, không lồng vào plan UX nhỏ này.

---

## Việc cần làm tiếp theo

1. Code việc 1, 3, 4, 5 (việc 2 đã xong, việc 6 đã bỏ).
2. Nghiệm thu lại đúng kịch bản gây nhầm lẫn ban đầu: cuộn sâu 1 trang dài → mở popup → bấm HDSD → xác nhận thấy ngay bài viết ở đầu trang, có breadcrumb + hiệu ứng.
3. Test riêng trên mobile viewport: mọi nút HDSD (kể cả module-level) phải phản ứng được, không còn no-op nào.
4. `tsc -b` + `npm run test` xanh trước khi push.

## Trạng thái

- [x] Việc 1 — scroll-to-top (`MainPage.tsx`, chỉ áp dụng khi vào/đổi bài trong `"help"`)
- [x] Việc 2 — sửa text HelpLanding (Đức đã làm, commit `f600939`)
- [x] Việc 3 — mobile module-mode dùng `goToModuleIndex` (`HdsdLink.tsx` + test mới cho cả 2 nhánh mobile/desktop)
- [x] Việc 4 — breadcrumb (`HelpBreadcrumb.tsx` mới, gắn vào `HelpArticle`/`HelpModuleIndex`, dùng `useHelpNavOptional` để không vỡ test cũ)
- [x] Việc 5 — highlight (`help.css` + `key={topicSlug}` để hiệu ứng replay mỗi lần đổi bài, tắt khi `prefers-reduced-motion`)
- [x] ~~Việc 6~~ — bỏ hẳn, xem B7

`npx tsc -b` sạch, `npm run test` 612/612 pass (610 cũ + 2 test mới cho hành vi mobile/breadcrumb). Đang chờ push lên `sandbox` + verify live trên Vercel.
