# HANDOFF — Đạt · Hệ thống Docs hướng dẫn người dùng (HDSD)

> Task anh Minh giao trực tiếp, Đức + Đạt tự chủ trương lên kế hoạch và triển khai — không có ai khác tham gia. Deadline: **trước thứ 3 tuần sau**.
> **✅ ĐÃ DUYỆT bởi anh Minh** (review lần 2) — kèm 2 sửa kỹ thuật bắt buộc trước khi gõ dòng code đầu tiên (xem `⚠️ Sửa bắt buộc` ở mục Kiến trúc §1) + 1 khuyến nghị lazy-load (không bắt buộc) + nâng chuẩn nghiệm thu lên đủ 23/23 điểm chèn (mục Kiểm thử). Bản trước đó dùng route `/help/:slug` riêng trong app — anh Minh không duyệt bản đó, đã đổi sang cơ chế dropdown ngay trong sidebar (giữ nguyên trong bản này).
> Đây KHÔNG phải mobile fix pass — task hoàn toàn mới, không đụng gì tới nhánh mobile trước đó.

## Bối cảnh

Anh Minh cần 1 hệ thống tài liệu hướng dẫn NGƯỜI DÙNG CUỐI (khác `docs/` hiện tại — tài liệu dev/handoff nội bộ, không dành cho sale/kế toán đọc). Yêu cầu cuối cùng (đã chốt qua 2 vòng trao đổi với anh Minh):

1. Thêm 1 mục **"Hướng dẫn sử dụng" (HDSD)** ở sidebar — bấm vào **dropdown ngay trong sidebar** hiện tất cả module lớn.
2. Bấm 1 module lớn → dropdown mở rộng hiện tất cả submodule của module đó (**vẫn trong sidebar**).
3. Bấm 1 submodule cụ thể → **màn hình chính** (chỗ vẫn hiện nội dung các module lớn) đổi sang trang docs chứa flow của submodule đó.
4. Nút **"HDSD"** (chữ, không phải icon) đặt cạnh header của **MỌI module lớn** VÀ **MỌI submodule** — kể cả submodule chỉ xuất hiện dạng popup/modal/drawer khi bấm 1 nút nào đó.
5. Hành vi nút HDSD: ở header module lớn → mở dropdown sidebar tới đúng module đó. Ở header submodule (kể cả popup) → nhảy thẳng tới đúng trang docs của submodule đó.

**Ưu tiên phạm vi (đã chốt với anh Minh):** gắn HDSD đầy đủ — kể cả mọi popup/modal/drawer — cho 6 module nghiệp vụ cốt lõi: **Quản lý thanh toán, Đối soát giao dịch, Kích hoạt khóa học, Xuất hóa đơn, Sổ doanh thu, Báo cáo (BC01-03)** — vì đây là mục đích tối thượng của app (hỗ trợ vận hành nghiệp vụ chính). Các module khác (Dashboard, CRM sync, Dashboard Sale, Đồng bộ mPOS/Payoo, Zalo, DingTalk, Auth Accounts, Phân quyền) chỉ cần HDSD ở header module lớn — rẻ, đi chung cơ chế trung tâm — popup của chúng làm sau (fast-follow).

## Khảo sát nền tảng (đọc trước khi code)

- **Sidebar hiện chỉ hỗ trợ đúng 2 cấp**, hard-cap ở kiểu dữ liệu: `NavChildItem` (`frontend/src/layouts/AppShell.tsx:7-12`) **không có field `children`** — không tự đệ quy. Muốn "Hướng dẫn sử dụng" có 3 cấp (mục top-level → module → submodule) thì **không generalize `NavItem`/`NavChildItem`** (đụng logic dùng chung cho mọi mục khác, rủi ro) — mà bọc riêng: trong vòng lặp render items (`AppShell.tsx:211-264`), thêm nhánh đặc biệt `if (it.id === "help") return <HelpNavTree .../>`, độc lập hoàn toàn với `expandedIds`/`toggleExpand`/`NavButton` đang dùng chung. Áp dụng y hệt cho `frontend/src/layouts/MobileNavSheet.tsx`.
- **Không có route/URL riêng theo module** — mọi điều hướng là `activeView` state (`frontend/src/pages/MainPage.tsx:257`). Docs đi theo cơ chế này: `ViewId` thêm `"help"`, `renderActiveView()` thêm case render docs. **Hệ quả: không có URL share/bookmark được cho từng bài** — chấp nhận đánh đổi, đúng mô tả UX mới của anh Minh (hiện ngay màn hình chính, không phải tab/trang riêng).
- **Cơ chế điều hướng xuyên-component có sẵn để tham khảo (không dùng lại được trực tiếp):** `frontend/src/contexts/PaymentFlowContext.tsx` (`navigate(view, extra)`, dùng bởi `PaymentRequestsTab`/`ReconciliationTab`/`ActivationTab`/`InvoiceRequestTab`) — nhưng scope riêng cho payment-flow (`PaymentFlowView` chỉ 5 giá trị cố định), không cover `SoDoanhThuTab`/`ReportBC03Tab` nằm ngoài `PaymentFlowProvider`. → Cần 1 context MỚI, app-wide, cùng mô hình nhưng độc lập: `HelpNavContext`.
- 2 kiểu markup header khác nhau tồn tại song song trong app: `frontend/src/components/ui/Modal.tsx`'s `<h2 id="gmv-modal-title">` (có prop `title`) vs. pattern tự viết tay `<h3>` trong class `modal-head`/`drawer-head` (phổ biến hơn ở nhóm payment-request/activation). `HdsdLink` không quan tâm cái này — chỉ là 1 component nhỏ nhét cạnh bất kỳ header nào — nhưng phải tự tìm đúng vị trí ở mỗi file.
- ⚠️ `module4` — component thật đang mount là **`InvoiceRequestTab.tsx`** (`MainPage.tsx:37,51`), KHÔNG PHẢI `Module4Tab.tsx` (file legacy, đã orphan). Gắn nhầm sẽ vô nghĩa.

## Kiến trúc

**1. Nội dung** — `frontend/src/content/help/<module-slug>/<topic-slug>.md`, loader `frontend/src/content/help/index.ts` dùng `import.meta.glob`. Cấu trúc thư mục này tự nhiên đúng cây 2 cấp cần cho sidebar (module = tên thư mục, submodule/topic = từng file `.md`). Lưu ý "submodule" trong cây docs là khái niệm NỘI DUNG, không nhất thiết khớp 1-1 UI thật — vd. B1→B4 của Payment Requests không phải 4 tab UI riêng biệt (đã xác nhận `PaymentRequestsTab.tsx` không có step-switcher), vẫn viết 4 file `.md` riêng, chỉ là HDSD ở UI thật của `PaymentRequestsTab` là 1 nút duy nhất.

**⚠️ Sửa bắt buộc theo review của anh Minh — 2 bom kỹ thuật, sửa trước khi code:**
1. **Syntax `import.meta.glob` cho Vite 8** (repo `vite ^8.0.12`, đã verify `package.json`) — `{ as: "raw" }` đã bị xóa từ Vite 6, dùng đúng:
   ```ts
   const files = import.meta.glob("./**/*.md", { query: "?raw", import: "default", eager: true });
   ```
2. **Bỏ hẳn `gray-matter`** — gọi `Buffer` (Node global), `vite.config.ts` không polyfill (đã verify — chỉ có `@vitejs/plugin-react`) → crash trắng trang lúc runtime ("Buffer is not defined"), bẫy nổi tiếng, debug mất nửa ngày. Frontmatter chỉ 3 field cố định (`title`, `order`, `audience`) → tự viết parser regex ~15-20 dòng ngay trong `content/help/index.ts`:
   ```ts
   function parseFrontmatter(raw: string): { title: string; order: number; audience: string[]; body: string } {
     const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
     if (!m) return { title: "", order: 0, audience: [], body: raw };
     const [, fm, body] = m;
     const data: Record<string, string> = {};
     for (const line of fm.split(/\r?\n/)) {
       const lm = line.match(/^(\w+):\s*(.*)$/);
       if (lm) data[lm[1]] = lm[2].trim();
     }
     const audience = (data.audience ?? "")
       .replace(/^\[|\]$/g, "")
       .split(",")
       .map((s) => s.trim().replace(/^["']|["']$/g, ""))
       .filter(Boolean);
     return {
       title: (data.title ?? "").replace(/^["']|["']$/g, ""),
       order: Number(data.order) || 0,
       audience,
       body,
     };
   }
   ```
   Dependency chỉ còn `react-markdown` + `remark-gfm` — KHÔNG cài `gray-matter`.

**Khuyến nghị (nên làm, không bắt buộc):** bọc `React.lazy` quanh `HelpArticle`/`HelpModuleIndex`/`HelpLanding` để `react-markdown` (~40KB gzip) không nạp cho user chưa từng mở Docs. `HelpNavTree`/`HdsdLink` vẫn eager (nhẹ, cần hiện ngay trong sidebar/header).

**2. `HelpNavContext`** (`frontend/src/contexts/HelpNavContext.tsx`, mô hình giống `PaymentFlowContext` nhưng app-wide):
```ts
type HelpNavContextValue = {
  goToModule: (moduleSlug: string) => void;
  goToTopic: (moduleSlug: string, topicSlug: string) => void;
};
```
State thật (`activeView`, `helpModule`, `helpTopic`, `helpExpandedModuleId`) sống trong `MainPage.tsx`. Nhờ Context, `HdsdLink` đặt ở bất kỳ file nào (kể cả sâu trong `LedgerFormModal.tsx`, `PaymentRequestDetailDrawer.tsx`) gọi được mà không cần prop-drilling.

**Tách rõ 2 hành vi để giảm mất state:**
- `goToModule(slug)` — **CHỈ expand cây trong sidebar** tới module đó, **KHÔNG đổi `activeView`**. Người dùng đang thao tác gì ở module hiện tại vẫn giữ nguyên.
- `goToTopic(module, topic)` — mới thật sự đổi `activeView="help"` + hiện bài viết ở màn hình chính. Chỉ xảy ra khi bấm thẳng 1 submodule cụ thể.

**3. `HelpNavTree`** (`frontend/src/layouts/HelpNavTree.tsx`) — cây dropdown 2 cấp, nhánh render riêng chèn vào `AppShell.tsx` items-map (`:211`), bản tương tự cho `MobileNavSheet.tsx`. Cấp 1 = module có docs (từ `content/help/index.ts`), bấm chỉ toggle expand. Cấp 2 = topic của module đang expand, bấm mới đổi `activeView` + hiện bài viết.

**4. `ViewId` thêm `"help"`** — `MainPage.tsx`: `can("help")` luôn `true` (không gate quyền, tài liệu tham khảo). `renderActiveView()` case `"help"`: có `helpTopic` → `<HelpArticle/>`, có `helpModule` chưa chọn topic → `<HelpModuleIndex/>`, không có gì → `<HelpLanding/>`.

**5. `HdsdLink`** (`frontend/src/components/help/HdsdLink.tsx`):
```tsx
type Props =
  | { mode: "module"; moduleSlug: string }
  | { mode: "topic"; moduleSlug: string; topicSlug: string };
```
Link chữ "HDSD", gọi `useHelpNav().goToModule(...)` hoặc `.goToTopic(...)`. Gắn vào:
- **Header mọi module lớn + mọi submodule nav-reachable** (reconciliation/reconCard, bc01/02/03, zaloConfig/Groups/Outbox, dingtalkConfig/Groups/Outbox) — **1 chỗ duy nhất**: `AppShell.tsx` header (`:284-328`), cạnh `<h1>{title}</h1>`. `MainPage.tsx` truyền `helpModuleSlug`/`helpTopicSlug` theo `MODULE_HELP_SLUGS[activeView]` xuống `AppShell`. Rẻ — không đụng file tab nào vì mọi ViewId đều render qua CÙNG header này.
- **Header popup/modal/drawer của 6 module ưu tiên** — phải chèn tay từng file (không có điểm chèn trung tâm).

## File thay đổi cụ thể

| File | Thay đổi |
|---|---|
| `frontend/package.json` | + `react-markdown`, `remark-gfm` (KHÔNG `gray-matter` — xem Kiến trúc §1) |
| `frontend/src/content/help/index.ts` | MỚI — loader glob (`{query:"?raw",import:"default",eager:true}`) + `parseFrontmatter()` tự viết, export cây module→topic |
| `frontend/src/content/help/<module>/<topic>.md` | MỚI — nội dung (danh sách bài ở mục dưới) |
| `frontend/src/contexts/HelpNavContext.tsx` | MỚI — `goToModule`/`goToTopic` |
| `frontend/src/components/help/HdsdLink.tsx` | MỚI — link "HDSD", 2 mode |
| `frontend/src/components/help/HelpArticle.tsx` | MỚI — render markdown 1 bài |
| `frontend/src/components/help/HelpModuleIndex.tsx` | MỚI — danh sách topic của 1 module |
| `frontend/src/components/help/HelpLanding.tsx` | MỚI — màn hình mặc định khi chưa chọn module |
| `frontend/src/layouts/HelpNavTree.tsx` | MỚI — cây dropdown 2 cấp, chèn vào `AppShell.tsx` |
| `frontend/src/layouts/AppShell.tsx` | + nhánh render `HelpNavTree` trong items-map (`:211`), + `HdsdLink` trong header (`:284-328`) |
| `frontend/src/layouts/MobileNavSheet.tsx` | + nhánh render tương tự cho mobile |
| `frontend/src/pages/MainPage.tsx` | + `"help"` vào `ViewId`, state help*, `HelpNavContext.Provider`, case `renderActiveView()`, map `MODULE_HELP_SLUGS` |
| **6 module ưu tiên** (bảng dưới) | + `HdsdLink` cạnh từng header popup/modal/drawer |
| `MODULES.md` | + 1 dòng trỏ hệ thống docs mới |

### Popup/modal/drawer của 6 module ưu tiên (đã khảo sát cụ thể)

| Module | File cần gắn HdsdLink | Header hiện có |
|---|---|---|
| **Quản lý thanh toán** | `CancelPrModal.tsx:30-36`, `TransferSaleModal.tsx:98-100`, `CreatePaymentRequestModal.tsx:162-164`, `PrHistoryModal.tsx:23-25`, `QrViewModal.tsx:210-212` | `<h3>` tự viết |
| | `PaymentRequestDetailDrawer.tsx` — drawer chính (`:1816`) + 5 popup con: Báo đơn/Báo đơn bổ sung (`:2722-2724`), Thiếu ảnh bill (`:3042-3044`), invoice-remind fail (`:3085-3087`), Nhắc kích hoạt gấp (`:3129-3130`), activation-remind fail (`:3172-3173`), PR đủ tiền (`:3198-3200`) | `<h3>`/`drawer-head`/`modal-head` (6 điểm chèn) |
| **Đối soát giao dịch** | `ReconciliationTab.tsx` — "Ghép CK ngoài", "Số tiền không khớp", bill viewer (~3 `modal-head`) | `modal-head` |
| | `CardReconciliationTab.tsx` (1 `modal-head`) | `modal-head` |
| **Kích hoạt khóa học** | `ActivationTab.tsx` (4 `modal-head` — luồng xác nhận kích hoạt) | `modal-head` |
| **Xuất hóa đơn** | `InvoiceRequestTab.tsx` — `InvoiceDetailDrawer` nội bộ (`:63`, mount `:792`) | `drawer-head` (`:95`) |
| **Sổ doanh thu** | `LedgerFormModal.tsx` (qua `Modal.tsx`, có `title`) | `<h2 id="gmv-modal-title">` |
| | `SoDoanhThuTab.tsx:633` panel tỷ giá — hiện chưa có `title`, cần thêm title trước khi gắn | `<Modal>` (chưa title) |
| **Báo cáo (BC01-03)** | Không có popup — chỉ header module/submodule, đã cover bởi cơ chế trung tâm | — |

**Không đụng trong V1** (chỉ HDSD header module lớn, popup fast-follow sau): `GatewaySyncTab.tsx`, `Module5Tab.tsx` (CRM sync), Dashboard Sale, Zalo/DingTalk popup con, `auth/` (`CreateAccountModal.tsx`...), `permissions/OverrideDrawer.tsx`, `StaffPickerModal.tsx`.

## Nội dung ưu tiên viết trước deadline

Ưu tiên PHỦ RỘNG bằng text thuần trước — kể cả nếu chưa kịp viết đủ nội dung cho mọi HDSD của 6 module ưu tiên thì **vẫn nối dây HDSD trước** (trỏ tới bài placeholder "Nội dung đang cập nhật") — không để việc chờ viết nội dung chặn hoàn thiện UI/wiring trước deadline. Viết nội dung thật dần sau, không đổi kiến trúc.

Danh sách bài tối thiểu (mỗi dòng = 1 file `.md`): tạo lần TT chuẩn, huỷ PR, chuyển giao PR, xem lịch sử PR, xem QR thanh toán, báo đơn/báo đơn bổ sung, xử lý thiếu ảnh bill, PR đủ tiền — ghép CK ngoài, số tiền không khớp — kích hoạt khoá học (4 luồng) — xuất hoá đơn — tạo/sửa dòng sổ doanh thu, quy đổi tỷ giá — BC01/BC02/BC03 tổng quan.

---

## Task 1 — Đức: dựng khung hệ thống (Ngày 1, song song Task 2)

Cài dependency (`react-markdown`, `remark-gfm` — KHÔNG `gray-matter`), viết `content/help/index.ts` loader (đúng syntax `import.meta.glob` cho Vite 8 + `parseFrontmatter()` tự viết), `HelpNavContext`, `HdsdLink`, `HelpArticle`/`HelpModuleIndex`/`HelpLanding` (khuyến nghị bọc `React.lazy`), `HelpNavTree` (desktop + mobile), sửa `AppShell.tsx`/`MainPage.tsx`/`MobileNavSheet.tsx`. Test bằng markdown giả trước khi có nội dung thật.

**DoD:** `npx tsc -b` + `npm run test` xanh. Bấm "Hướng dẫn sử dụng" ở sidebar → dropdown mở đúng. Bấm HDSD ở header 1 module lớn → sidebar expand đúng module, KHÔNG đổi màn hình chính. Bấm 1 submodule trong cây → màn hình chính hiện đúng bài.

## Task 2 — Đạt: viết nội dung pilot (Ngày 1, song song Task 1)

2-3 bài đầu của Quản lý thanh toán (`paymentRequests`) + Đối soát giao dịch (`reconciliation`) — đúng ví dụ Minh đưa ra: "Tạo lần TT chuẩn" (sale), "Ghép giao dịch" (kế toán). Text thuần, theo template:
```md
---
title: "Tạo lần thanh toán (TT) chuẩn"
order: 1
audience: ["sale"]
---
Áp dụng khi: khách đã chốt gói học, cần tạo Payment Request mới.

## Các bước

1. Vào **Quản lý thanh toán** → bấm **+ Tạo mới**.
2. Điền đúng UID, tên khách, số điện thoại theo CRM.
3. Chọn **Target** (số tiền cần thu) — không để trống.
4. Bấm **Lưu** → hệ thống tự sinh mã QR chuyển khoản.

> ⚠️ Lưu ý: không sửa Target sau khi khách đã bắt đầu chuyển khoản — tạo lần TT mới thay vì sửa.
```
Không cần chờ Task 1 xong khung mới viết được — file `.md` độc lập.

## Task 3 — Đức: gắn HDSD vào popup 6 module ưu tiên (Ngày 2)

Theo đúng bảng "Popup/modal/drawer của 6 module ưu tiên" ở trên — 13 file, ~23 điểm chèn. Đạt tiếp tục viết nội dung song song, review chéo.

## Task 4 — Cả hai: hoàn thiện nội dung + kiểm thử (Ngày 3 → deadline)

**Cập nhật:** Task 1-3 đã xong (nhánh `hdsd-help-docs-duc`, commit `b07c1256`/`112f304d`). Phần Task 4 KHÔNG cần Đạt đã làm xong:
- ✅ Viết luôn nội dung thật (không phải placeholder) cho toàn bộ 16 topic đã gắn HDSD ở Task 3 + 2 pilot ở Task 2 — không còn khoảng trống "Nội dung đang cập nhật" nào trong 6 module ưu tiên.
- ✅ Viết thêm 3 bài Báo cáo (`bc01/bc02/bc03/tong-quan.md`) — cách đọc từng báo cáo, lọc, các bẫy hay gặp (vd. BC01 lọc theo Pay Time chứ không phải ngày chốt đơn; BC02 team-mapping cũ có thể lệch nếu nhân sự đổi team; BC03 KPI luôn tính theo tháng dù đang xem theo ngày).
- ✅ `npx tsc -b` + `npm run test` — 610/610 pass.
- ⚠️ **Checklist nghiệm thu 22/22 điểm chèn — CHƯA xong đủ**, cần Đạt/Đức tiếp tục: đã live-verify được 2/22 qua Playwright + dev server thật (`CreatePaymentRequestModal`, `LedgerFormModal` — cả 2 pattern kỹ thuật khác nhau đều render đúng, không vỡ layout). 20 điểm còn lại cần trigger đúng STATE nghiệp vụ cụ thể (PR đã đủ tiền, PR đang thiếu ảnh bill, Order ID trùng, chưa gửi được nhắc kích hoạt...) — thử tìm data thật trong sandbox nhưng chưa trigger ổn định qua UI trong thời gian hợp lý. **Việc còn lại: mở từng popup bằng tay với dữ liệu/thao tác thật, tick checklist + chụp màn hình theo đúng bảng ở Task 3.**

---

## Kiểm thử

- Unit test: `HelpArticle`/`HelpModuleIndex` (render đúng, slug không tồn tại → thông báo rõ ràng thay vì crash), `content/help/index.ts` (`parseFrontmatter()` đúng field/kiểu dữ liệu, sort `order`), `HelpNavContext` (`goToModule`/`goToTopic` set đúng state).
- Không cần Playwright e2e riêng cho V1.
- **Nghiệm thu thủ công PHẢI đủ 23/23 điểm chèn** (không phải chỉ vài popup tiêu biểu) — dùng chính bảng "Popup/modal/drawer của 6 module ưu tiên" ở trên làm checklist: mỗi dòng tick + 1 screenshot xác nhận nút HDSD hiện đúng chỗ, không vỡ layout nút đóng (đặc biệt `PaymentRequestDetailDrawer.tsx` — chiếm 6/23 điểm, rủi ro cao nhất). Làm 1 lượt ngay sau khi xong Task 3.
- `npx tsc -b` (KHÔNG `--noEmit`) + `npm run test` xanh trước khi merge.

## Đánh đổi đã biết (đã thông báo anh Minh)
- Không có URL riêng cho từng bài viết — không share/bookmark trực tiếp 1 bài docs.
- Mất state chỉ xảy ra khi bấm HDSD ở 1 submodule/popup cụ thể (đổi `activeView`, đóng popup đang mở). HDSD ở header module lớn không đổi màn hình chính — an toàn.
- Popup của module KHÔNG thuộc nhóm 6 ưu tiên chưa có HDSD trong V1 — fast-follow sau deadline.

## Xong việc
- `npx tsc -b` (không `--noEmit`) + `npm run test` xanh trước khi merge.
- Nghiệm thu thủ công luồng đầy đủ: sidebar dropdown 2 cấp, HDSD module-level (chỉ mở sidebar), HDSD topic-level (đổi màn hình chính), **đủ 23/23 điểm chèn popup** trong nhóm 6 module ưu tiên (checklist + screenshot mỗi điểm).
- Cập nhật `MODULES.md`.
- ✅ Plan đã được anh Minh duyệt (kèm 2 sửa bắt buộc ở trên, đã áp vào bản này) — bắt đầu code.
