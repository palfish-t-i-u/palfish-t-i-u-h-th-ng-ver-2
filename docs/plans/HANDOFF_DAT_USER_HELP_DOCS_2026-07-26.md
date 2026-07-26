# HANDOFF — Đạt · Hệ thống Docs hướng dẫn người dùng (Sale/Kế toán/...)

> Task anh Minh giao trực tiếp, Đức + Đạt tự chủ trương lên kế hoạch và triển khai — không có ai khác tham gia. Deadline: **trước thứ 3 tuần sau**.
> Đây KHÔNG phải mobile fix pass — task hoàn toàn mới, không đụng gì tới nhánh mobile trước đó.

## Bối cảnh

Anh Minh cần 1 hệ thống tài liệu hướng dẫn NGƯỜI DÙNG CUỐI (khác với `docs/` hiện tại — vốn là tài liệu dev/handoff nội bộ, không dành cho sale/kế toán đọc). Yêu cầu gốc của Minh:

> "Mình cần làm 1 hệ thống docs để hướng dẫn người dùng cách sử dụng các tính năng, ví dụ như sale thì cần biết cách tạo lần TT như thế nào cho chuẩn, kế toán thao tác ghép giao dịch ra sao. Về căn bản là cần 1 trang docs, phân tách nhỏ lẻ ra thành các trang nhỏ, mỗi trang hướng dẫn về 1 thao tác/bước. Sau đó là dẫn vào app thông qua hyperlink hoặc 1 nút nào đó trên từng module/submodule để người dùng có thể xem hướng dẫn của từng tính năng."

Hai yêu cầu cứng: (1) chia nhỏ theo từng thao tác/bước, không phải 1 trang dài, (2) phải dẫn được vào từ TRONG APP qua hyperlink/nút theo từng module.

## Khảo sát nền tảng hiện có (đọc trước khi code — quyết định kiến trúc dựa trên đây)

- App **không có URL riêng cho từng module** — điều hướng hiện tại 100% là `activeView` state trong `frontend/src/pages/MainPage.tsx:257`. react-router-dom chỉ phục vụ `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/` (`frontend/src/App.tsx:72-113`). Muốn "hyperlink" share/bookmark được → **bắt buộc thêm route mới**, không thể chỉ dùng modal/state như `GatewaySyncTab`'s onboarding hiện tại.
- Chưa có markdown renderer nào trong frontend (0 kết quả `react-markdown`/`remark`/`marked`). Phải thêm mới.
- Chưa có icon library — icon toàn bộ SVG viết tay (`viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"`), có factory sẵn `frontend/src/components/payment-request/Icons.tsx` (`makeIcon(paths)`).
- `AppShell.tsx` header (`frontend/src/layouts/AppShell.tsx:284-328`) có sẵn slot `headerExtras` (đang dùng cho `NotificationBell`) — điểm chèn nút help rẻ nhất, chỉ cần sửa 2 file thay vì chọc vào 10+ file tab module.
- `MainPage.tsx` có map `TITLES: Record<ViewId, {title, subtitle}>` (dòng 173-238) — danh sách đầy đủ mọi module/submodule ID thật: `paymentRequests`, `reconciliation`, `reconCard`, `module3`, `module4`, `revenueLedger`, `bc01`, `bc02`, `bc03`, `module5`, `module6`, `gatewaySync`, `zaloConfig/Groups/Outbox`, `dingtalkConfig/Groups/Outbox`, `authAccounts`, `permissions`, `profile`. Đây chính là slug list cho docs — khỏi map lại lần 2.
- **Không có department "kế toán" riêng.** Hệ thống phân 2 trục: **role** (`sale/leader/manager/system`, xếp hạng theo `backend/rbac.py:14`) và **department** (`sale/hr/marketing/cs`, gán quyền module theo `backend/admin_routes.py:162-220`). "Kế toán ghép giao dịch" thực chất map vào role `system`/`ops` (người xác nhận thanh toán) + department `hr` (đang có full quyền `reconciliation`). → **Docs KHÔNG gate theo quyền** (ai đăng nhập cũng đọc được — tài liệu tham khảo, nhân viên mới nên đọc được trước khi được cấp quyền), chỉ dùng nhãn phòng ban có sẵn (`frontend/src/types/permissions.ts:73-78`: Bán hàng/Nhân sự & Quản trị/Marketing/CS) để GOM NHÓM mục lục cho dễ tìm, không phải để chặn.
- Có sẵn 1 pattern onboarding tốt để tham khảo (không đụng, không thay): `GatewaySyncTab.tsx` — modal `ONBOARDING_STEPS` + cờ `localStorage` "đã xem lần đầu" + nút "Xem lại hướng dẫn". Hệ thống mới là 1 lớp bổ sung, tổng quát hơn, share-link được — độc lập với pattern này.
- **Ảnh trong nội dung:** engineering để hỗ trợ ảnh gần như miễn phí (`react-markdown` tự render `![alt](src)`, ảnh để trong `public/help-images/`, không cần Vite config thêm). Cái tốn thời gian thật là CHỤP + CHÚ THÍCH ảnh — chi phí nội dung, nhân theo số trang. Quyết định: **build hỗ trợ ảnh ngay từ đầu (rẻ), nhưng ưu tiên viết nội dung TEXT THUẦN phủ rộng trước** để kịp deadline, chèn ảnh dần cho trang quan trọng nếu còn thời gian.

## Kiến trúc

**1. Nội dung — markdown file trong repo, bundle lúc build (không CMS/DB):**
- `frontend/src/content/help/<module-slug>/<topic-slug>.md`, `module-slug` = đúng `ViewId` trong `MainPage.tsx`. Mỗi file = 1 trang = 1 thao tác/bước.
- Frontmatter (`gray-matter` parse): `title`, `order`, `audience` (mảng department: `["sale"]`, `["hr"]`...).
- Ảnh: `public/help-images/<module-slug>/...`, reference bằng path tuyệt đối `/help-images/...`.
- Lý do không CMS: 2 người, review qua PR như mọi thứ khác trong repo, không cần xây UI editor riêng, không tốn bảng DB/route backend mới.

**2. Rendering:** thêm dependency `react-markdown` + `remark-gfm` + `gray-matter`. 1 loader `frontend/src/content/help/index.ts` dùng `import.meta.glob("./**/*.md", { as: "raw", eager: true })` — thả file `.md` mới vào đúng thư mục là tự nhận, không cần sửa code.

**3. Route mới:** `/help` và `/help/:moduleSlug/:topicSlug?` trong `App.tsx`, bọc trong `ProtectedRoute` đã có sẵn (dòng 11-40, không cần viết guard mới). Layout riêng (`HelpPage.tsx`), KHÔNG lồng vào `AppShell`/`MainPage`'s `activeView` switch (AppShell gắn chặt permission-gated nav-item logic, nhồi vào sẽ rối). Component mới: `HelpPage.tsx` (layout sidebar+content), `HelpArticle.tsx` (render 1 bài qua react-markdown), `HelpIndex.tsx` (mục lục `/help`, group theo audience).

**4. Điểm vào từ app — 1 chỗ, không phải 10+ chỗ:** map `MODULE_HELP_SLUGS: Partial<Record<ViewId, string>>` cạnh `TITLES` trong `MainPage.tsx` (module chưa có bài thì không hiện nút — tự nhiên hỗ trợ rollout dần). `AppShell` nhận thêm prop `helpHref?: string`, render nút "?" trong header (theo convention icon-button của `NotificationBell.tsx`), là `<a href={helpHref} target="_blank" rel="noopener">` — vừa là nút vừa là hyperlink, mở TAB MỚI để không mất state đang thao tác dở trong app.

**5. Không gate theo quyền** — chỉ cần đăng nhập, mục lục gom nhóm theo nhãn phòng ban chỉ để dễ tìm.

## File thay đổi cụ thể

| File | Thay đổi |
|---|---|
| `frontend/package.json` | + `react-markdown`, `remark-gfm`, `gray-matter` |
| `frontend/src/content/help/index.ts` | MỚI — loader glob + parse frontmatter |
| `frontend/src/content/help/paymentRequests/tao-lan-tt-chuan.md` | MỚI — bài pilot 1 |
| `frontend/src/content/help/reconciliation/ghep-giao-dich.md` | MỚI — bài pilot 2 |
| `frontend/src/pages/HelpPage.tsx` | MỚI — layout sidebar + content pane |
| `frontend/src/components/help/HelpArticle.tsx` | MỚI — render markdown |
| `frontend/src/components/help/HelpIndex.tsx` | MỚI — trang mục lục `/help` |
| `frontend/src/App.tsx` | + route `/help/*` bọc `ProtectedRoute` (cạnh route `/`) |
| `frontend/src/layouts/AppShell.tsx` | + prop `helpHref`, nút "?" trong header |
| `frontend/src/pages/MainPage.tsx` | + map `MODULE_HELP_SLUGS`, tính `helpHref`, truyền xuống `AppShell` |
| `MODULES.md` | + 1 dòng trỏ hệ thống docs mới |

**Không đụng:** `GatewaySyncTab.tsx` onboarding modal, RBAC backend (`backend/`).

---

## Task 1 — Đức: dựng khung hệ thống (Ngày 1, song song Task 2)

**File:** toàn bộ mục "File thay đổi cụ thể" ở trên trừ 2 file `.md` pilot.

Cài dependency, viết `content/help/index.ts` loader, `HelpPage`/`HelpArticle`/`HelpIndex`, route `/help/*`, nút help trong `AppShell`+`MainPage`. Dùng markdown giả (lorem) để test end-to-end trước khi có nội dung thật từ Task 2.

**DoD:** `npx tsc -b` + `npm run test` xanh, vào `/help` bằng tay thấy mục lục, bấm nút "?" ở module Quản lý thanh toán mở đúng tab mới đúng bài viết.

---

## Task 2 — Đạt: viết nội dung pilot (Ngày 1, song song Task 1)

**File:** `frontend/src/content/help/paymentRequests/tao-lan-tt-chuan.md`, `frontend/src/content/help/reconciliation/ghep-giao-dich.md`

2 bài đúng ví dụ Minh đưa ra — **text thuần** (không cần ảnh ở bản pilot này):
- "Sale — Tạo lần TT chuẩn" (module `paymentRequests`)
- "Kế toán — Ghép giao dịch" (module `reconciliation`)

**Format** (frontmatter + heading + bước đánh số + callout lưu ý):
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

Không cần chờ Task 1 xong khung mới viết được — file `.md` độc lập, viết trước cũng được, Đức tích hợp vào sau (Task 3).

---

## Task 3 — Cả hai: tích hợp + mở rộng nội dung (Ngày 2 → deadline)

1. **Ngày 2:** Đức tích hợp nội dung thật của Đạt vào khung đã dựng, review chéo, sửa lỗi hiển thị/markdown.
2. **Ngày 3 → deadline:** viết thêm bài cho các module còn lại theo độ ưu tiên nghiệp vụ (payment lifecycle B1-B4, reconciliation mPOS/Payoo, đối soát, sổ doanh thu...) — mỗi bài 1 file `.md` độc lập, viết song song không đụng nhau. Chèn ảnh cho bài quan trọng nhất nếu còn thời gian.

**Test:** unit test (Vitest) cho `HelpArticle` (render markdown cơ bản, slug không tồn tại → thông báo "chưa có bài viết" thay vì crash) và `content/help/index.ts` (parse frontmatter đúng, `order` sort đúng). Không cần Playwright e2e riêng cho V1 (tính năng đọc-tài-liệu, rủi ro thấp).

---

## Xong việc
- `npx tsc -b` + `npm run test` xanh trước khi merge (quy ước CLAUDE.md).
- Nghiệm thu thủ công: vào `/help`, bấm nút "?" từ ít nhất 2-3 module khác nhau, xác nhận mở đúng bài, đúng tab mới, không mất state app.
- Cập nhật `MODULES.md`.
- **Ngoài phạm vi V1** (đừng nhét vào đợt này): search trong docs, ảnh cho toàn bộ bài viết, help theo từng field/thao tác con trong toolbar (hiện chỉ theo module), CMS/self-serve editing UI, đồng bộ vào cờ "đã xem" kiểu `GatewaySyncTab`.
