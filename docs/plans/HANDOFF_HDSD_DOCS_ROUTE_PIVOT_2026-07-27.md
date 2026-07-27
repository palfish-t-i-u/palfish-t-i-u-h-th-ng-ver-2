# HANDOFF — HDSD pivot sang trang docs riêng (`/docs`) + mở rộng phạm vi (27/07/2026)

> Thay thế kiến trúc trong 4 doc trước: `HANDOFF_DAT_USER_HELP_DOCS_2026-07-26.md`, `PLAN_DAT_USER_HELP_DOCS_2026-07-26.md`, `PLAN_HDSD_UX_CAI_THIEN_2026-07-26.md`, `QA_HDSD_NGHIEM_THU_2026-07-26.md` (đã đánh dấu SUPERSEDED).

## Bối cảnh

Hệ thống HDSD in-app (sidebar dropdown 3 cấp + `activeView="help"` trong `MainPage.tsx`) đã build xong, wire 24 điểm chèn cho 6 module ưu tiên, viết 30 bài nội dung, và vừa fix xong 2 lượt bug UX (scroll + flash sidebar). Anh Minh feedback mới (qua Đức), đảo ngược 1 phần quyết định trước đó:

1. **Không làm in-app nữa** — sợ càng thêm module + ảnh minh họa càng làm app CHÍNH nặng lên, giảm hiệu suất theo thời gian. Yêu cầu: tách ra 1 trang riêng, tham khảo phong cách GitBook.
2. **Nút HDSD phải có ở MỌI ô/card có từ 1 nút thao tác trở lên** — không chỉ 6 module ưu tiên như trước, mà toàn bộ ~22 module/tab trong app.
3. **Bắt buộc có ít nhất 1 ảnh minh họa** trong mỗi bài — trước đó 0/30 bài có ảnh.

Đã chốt 2 quyết định kiến trúc với Đức trước khi code:
- "Trang riêng" = tự build route `/docs/*` **ngay trong app hiện tại** (KHÔNG dùng gitbook.com thật) — tái dùng ~90% code/nội dung đã có.
- Nút HDSD mở bài viết ở **tab mới** (`target="_blank"`) — giải quyết luôn vấn đề "mất state đang thao tác dở" của bản in-app cũ.

## Đảm bảo cô lập bundle (trả lời trực tiếp mối lo của anh Minh)

Bản thiết kế đầu có 1 lỗ hổng thật: `MainPage.tsx` (load ở MỌI trang) import `hasHelpModule` từ `content/help/index.ts`, mà loader đó dùng `import.meta.glob(eager:true)` — sẽ nhúng thẳng toàn bộ text markdown của MỌI bài vào chunk chính, đúng điều anh Minh lo. Đã sửa: bỏ hẳn check `hasHelpModule()` ở header, header luôn hiện nút HDSD không điều kiện (module chưa có bài → `/docs` tự hiện "Chưa có hướng dẫn", không crash). Nhờ vậy không còn import nào từ `content/help/*` trong bundle chính.

**Verify thật (không chỉ đọc code):** `cd frontend && npm run build && grep -l "khách đã chốt gói học" dist/assets/index-*.js` → không có match (đúng); cùng string có trong `dist/assets/DocsLayout-*.js` (đúng). Ảnh minh họa hoàn toàn không nằm trong JS bundle ở bất kỳ kịch bản nào (lưu `public/docs-images/`, browser fetch qua network khi trang render, giống `app-logo.png`).

Xem thêm `docs/learnings/vite-eager-glob-bundle-leak.md`.

## Kiến trúc mới

- **Route**: `App.tsx` có `<Route path="/docs/*">` (dùng chung `ProtectedRoute` với `/` — vẫn cần login). `DocsLayout` lazy-load qua `lazyRetry` (đã tách ra `frontend/src/lib/lazyRetry.ts` dùng chung với `MainPage.tsx`).
- **`frontend/src/pages/docs/DocsLayout.tsx`**: shell 2 cột (sidebar trái + content phải), tự có `<Routes>` con: `index` → `HelpLanding`, `:moduleSlug` → `HelpModuleIndex`, `:moduleSlug/:topicSlug` → `HelpArticle`. Có sandbox banner + mobile toggle (sidebar ẩn dạng overlay dưới `md`).
- **`frontend/src/pages/docs/DocsSidebar.tsx`** (thay `HelpNavTree.tsx` đã xoá): cây module→topic từ `listHelpModules()`. **Lưu ý kỹ thuật**: dùng `useLocation()` parse `pathname` để lấy `moduleSlug`/`topicSlug`, KHÔNG dùng `useParams()` — sidebar là sibling của `<Routes>` lồng bên trong `DocsLayout`, không phải con của route đã khớp nên `useParams()` không thấy được params (xem `docs/learnings/react-router-useparams-sibling-scope.md`).
- **`HelpLanding.tsx`/`HelpModuleIndex.tsx`/`HelpBreadcrumb.tsx`**: đổi từ `useHelpNav()` context sang `<Link to="/docs/...">`. `HelpArticle.tsx` không đổi gì (đã prop-driven từ trước).
- **`HdsdLink.tsx`** viết lại hoàn toàn đơn giản: `{moduleSlug: string; topicSlug?: string; className?: string}` → `<a href="/docs/..." target="_blank" rel="noopener noreferrer">HDSD</a>`. Bỏ hẳn `mode`, `useHelpNavOptional`, `useIsMobile` (không còn phân biệt desktop/mobile — mở tab mới luôn an toàn, không mất state).
- **Xoá hẳn**: `frontend/src/contexts/HelpNavContext.tsx`, `frontend/src/layouts/HelpNavTree.tsx` (+ test tương ứng). `MainPage.tsx` bỏ `"help"` ViewId, `HelpNavProvider`/ref-forwarding, nav-item "Hỗ trợ". `AppShell.tsx` bỏ nhánh `it.id==="help"`, thêm 1 link tĩnh `<a href="/docs" target="_blank">Hướng dẫn sử dụng</a>` ở cuối sidebar (không cần đụng `NavItem`/`NavChildItem`).
- **Ảnh minh họa**: `frontend/public/docs-images/<moduleSlug>/<topicSlug>-N.png`, nhúng `![alt](/docs-images/...)` trong markdown. Enforcement: `frontend/src/content/help/screenshots.test.ts` — mỗi bài phải có ≥1 ảnh markdown trỏ tới file thật tồn tại, trừ khi nằm trong mảng `NO_SCREENSHOT_YET` (danh sách 30 bài cũ, tự dọn dần khi bổ sung ảnh — bài MỚI không được thêm vào danh sách này).

## Kết quả kiểm thử (27/07/2026)

- `npx tsc -b` sạch.
- `npm run test`: 64 file / 635 test pass.
- Playwright thủ công: bấm HDSD từ modal → mở đúng tab mới, đúng URL `/docs/<module>/<topic>`, sidebar tự expand + highlight đúng module/topic; cold hard-refresh 1 URL `/docs` sâu → chạy được (SPA rewrite); tab gốc giữ nguyên modal đang mở, không mất gì.
- Cô lập bundle: verify bằng `npm run build` + grep string thật trong `dist/assets/*.js` (xem mục trên) — pass.

## Chia việc tiếp theo

Đạt không rảnh tới tối mai. Đã chốt:
- **Hôm nay (Đức 1 mình)**: kiến trúc nền tảng (xong, xem mục trên) + gắn `HdsdLink` vào ~13 chỗ hổng NGAY TRONG 6 module ưu tiên cũ (nội dung đã có sẵn) + bổ sung ảnh cho ~11 bài Đức tự viết (`module3` 5 bài, `module4/nhac-xuat-hoa-don`, `reconciliation` 2 bài, `reconCard`, `bc01/02/03`).
- **Từ tối mai (Đức + Đạt), chia theo module**:
  - **Đức**: `gatewaySync`, `authAccounts`, `permissions`, `zaloConfig/Groups/Outbox`, `dingtalkConfig/Groups/Outbox`.
  - **Đạt**: `dashboard`, `module6` (Dashboard Sale), `module5` (CRM Sync), + phần hổng còn lại ở `PaymentRequestsTab.tsx` toolbar chính + `SoDoanhThuTab`/`LedgerFormModal`.
- Mỗi bài mới viết xong chụp ảnh ngay, tự xoá khỏi `NO_SCREENSHOT_YET`.
- Hoàn thành khi: exclusion list rỗng + nghiệm thu lại toàn bộ điểm chèn (dùng `grep -rn "<HdsdLink" frontend/src` làm nguồn sự thật) giống cách đã làm ở vòng QA trước.
