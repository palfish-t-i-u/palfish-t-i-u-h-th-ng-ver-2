# PLAN — Mobile Fix Pass (đợt sửa nốt module partial/chưa làm)

> Ngày: 2026-07-21 · Trạng thái: **CHỜ DUYỆT — chưa code**. Sau khi duyệt, mỗi dev cầm handoff riêng.
> Chia theo **cơ chế sửa** để 2 dev (Đức / Đạt) có tập file **rời nhau tuyệt đối** → không chặn nhau.
> Nguồn: audit 7 agent (workflow `mobile-fix-audit`) + 3 screenshot iPhone 375px của anh Hiếu.

## Mục tiêu

Sửa nốt các màn còn "vỡ/chật/truncate" trên mobile 375px cho các module **partial** và **chưa tối ưu**. 8 module core (B1–B4, đối soát thẻ, sổ doanh thu, admin Zalo/DingTalk, nav) đã DONE — **không đụng**.

## 4 tiêu chí (bắt buộc, mọi task)

1. **Triệt để** — sửa gốc reflow (table→cards / collapse grid / flex-wrap + `flex-basis:100%` / freeze-first-col), KHÔNG vá bề rộng lẻ. **Không truncate cột định danh** (tên sale / tên team / email) — đây là lỗi anh Hiếu chỉ đích danh ("Bu…", "Ca…").
2. **Không lỗi con** — desktop delta = 0 (mọi rule mới nằm trong `@media(max-width:767px)` hoặc nhánh `isMobile`/`max-md:`); không phá 15+ modal/component dùng chung; test cũ pass nguyên trạng.
3. **Không tăng gánh nặng hạ tầng** — CSS-only + className; KHÔNG thêm dep, listener, JS-layout, call API; tái dùng `useIsMobile` / `RowCard` / helper e2e sẵn có.
4. **Tối ưu token** — đọc `MODULES.md` + 2 learnings thay vì quét lại; 2 dev chạy song song, không họp đồng bộ giữa chừng.

**Đọc TRƯỚC khi code (cả 2 dev):**
- `docs/learnings/mobile-reflow-not-just-width.md` — 4 thủ phạm reflow, "pageOverflow==0 là điều kiện cần không đủ".
- `docs/learnings/flex-basis-vs-width-mobile.md` — flex item full-row phải dùng `flex:1 1 100%`, KHÔNG `width:100%`.

---

## Phạm vi & phân công (file rời nhau — zero collision)

| Module | Dev | Cơ chế | File ghi (`files_touched`) | Effort |
|---|---|---|---|---|
| **BC01** Sales performance | Đức | table→cards | `reports/BC01SalesPerformance.tsx` + `.test.tsx` | 4h |
| **BC03** Báo cáo tổng bộ | Đức | freeze-col retune + gate JSX | `ReportBC03Tab.tsx` + `.test.tsx` | 3h |
| **M1** Dashboard gamification | Đức | reflow `max-md:` | `DashboardTab.tsx` | 2.5h |
| **M6** Dashboard Sale | Đức | **verify-only** (đã responsive) | `Module6Tab.tsx` (0 sửa dự kiến) | 0.5h |
| **BC02** Key data report | Đạt | keep-scroll + polish select | `reports/BC02KeyDataReport.tsx` | 0.5h |
| **Auth** Accounts drawer + modals | Đạt | reflow-css `@media` | `auth/auth-accounts.css` + `auth/CreateAccountModal.tsx` | 5h |
| **Perms** Ma trận phân quyền | Đạt | freeze-col + reflow-css | `permissions/permissions.css` | 4h |

**Cân bằng:** Đức ≈ 9.5–10h · Đạt ≈ 9.5h. Đều < trần 24h/dev (3 ngày).
**Theme mỗi dev:** Đức = nhánh React `isMobile`/cards/`max-md:` (.tsx). Đạt = rule `@media(max-width:767px)` scoped (.css) + Tailwind responsive prefix.
**Chứng minh disjoint:** không path nào xuất hiện ở cả 2 cột. Primitive dùng chung (`ui/Table.tsx`, `ui/Modal.tsx`, `ui/Button.tsx`, `ui/RowCard.tsx`, `hooks/useIsMobile.ts`) = **READ-ONLY cho cả 2 dev** (mọi spec cấm sửa).

### Ngoài phạm vi (KHÔNG làm đợt này)
- **CRM (M5)** + **GatewaySyncTab** — workflow là Chrome extension desktop; chủ đích không mobile-hóa.
- **ReportsHub** — chỉ là trang hub link tới BC01/02/03, không có bảng/drawer.

---

## Guardrails chung (cả 2 dev — dán đầu mỗi commit)

| # | Guardrail |
|---|---|
| GC1 | **Zero-desktop-delta.** Mọi rule/nhánh mới nằm trong `@media(max-width:767px)`, `isMobile`, hoặc `max-md:`/`md:`. `git diff` phải cho thấy 0 dòng rule desktop (unprefixed) bị đổi. Với CSS: **append cuối file**, không format lại, không sửa dòng cũ. |
| GC2 | **Read-only primitives.** KHÔNG sửa `ui/Table.tsx`, `ui/Modal.tsx`, `ui/Button.tsx`, `ui/Input.tsx`, `ui/RowCard.tsx`, `hooks/useIsMobile.ts`, `tailwind.config`. Nếu thật sự cần đổi → dừng, báo, biến thành task upfront 1 người làm trước. |
| GC3 | **Flex-basis không phải width.** Item flex muốn chiếm trọn dòng trong container `flex-wrap` → `flex:1 1 100%`, KHÔNG `width:100%` (bị nuốt — bài học `flex-basis-vs-width-mobile.md`). |
| GC4 | **Reflow không chỉ width.** Quét đủ 4 pattern trước khi coi là xong: grid nhiều cột → collapse; `space-between`/`nowrap` flex → wrap; free-text (tên/email) trong flex header → `break-words`/full-row; hover/keyboard-only → ẩn trên touch. |
| GC5 | **Không truncate định danh.** Tên sale/team/email/nhân sự KHÔNG được cắt "…". Nếu cột định danh không đủ chỗ → đổi layout (cards / fold sub-line / freeze), không ép ellipsis. |
| GC6 | **DoD gate mỗi màn:** `npx tsc -b` + `npm run test` (vitest) + spec mobile liên quan XANH, **dán số pass**, rồi mới `git commit`. Commit **từng module** (cấm `git add -A`/`.` — chỉ `git add` file cụ thể). |
| GC7 | **Verify có DATA thật ở 375px.** `pageOverflow==0` là điều kiện cần, KHÔNG đủ. Mở drawer/màn thật (có data) đo mắt: không cột nào < ~120px, không text đè nhau. Dùng `assertNoColumnCrush` / `assertNoHorizontalOverflow` sẵn có trong `e2e/helpers/mobile.ts`. |

**Battery desktop giữ nguyên** (trước khi merge main): `npm run e2e` (payment-lifecycle, reconciliation-flow, qr-capture, payment-tvts-filter, crm-sync, dashboard-sales) phải xanh nguyên trạng.

---

## Chi tiết fix từng module

### BC01 — Sales performance (Đức · table→cards · 4h)

**Gốc:** `BC01SalesPerformance.tsx:154` table `min-w-[900px]`; 2 cột sticky trái Team(112px)+Sale(160px) + Total sticky phải(88px) = 272+88 nuốt hết 375px → chỉ ~15px cho cột tháng, tên sale bị kẹp → "Bu…/Ca…". `useIsMobile` hiện chỉ ẩn mô tả (`:109`).
**Cách:** desktop giữ nguyên table byte-for-byte; nhánh `isMobile` render `RowCard`/`RowCardList` — 1 card/sale: title = tên đầy đủ (RowCard tự `break-words`), value = `fmtRmb(sale.total)`, meta = mỗi tháng 1 dòng label/value. Card "Tổng cộng" (grand total) trên cùng, mỗi team 1 section header.
**Bước:** wrap toàn bộ block table hiện tại (`:153-257`) vào nhánh `!isMobile`; giữ chrome chung (filter bar, error, "Tổng GMV") ngoài nhánh; nhánh `isMobile` dựng cards; KHÔNG render `GmvDataBarCell` trên mobile (số trần).
**Test:** `BC01SalesPerformance.test.tsx` thêm `describe('mobile')` — stub `window.matchMedia({matches:true})` (jsdom thiếu), assert: tên sale đầy đủ hiện đủ, 1 giá trị tháng hiện, `document.querySelector('table')===null`, card "Tổng cộng" hiện. 13 test desktop cũ giữ nguyên (chạy với matchMedia unstubbed → desktop).
**Guard riêng:** không sửa constant sticky (`:37-69`) hay JSX table; giữ chuỗi text byte-identical 2 mode; `afterEach` restore matchMedia (tránh leak `isMobile=true` sang suite khác).

### BC03 — Báo cáo tổng bộ (Đức · freeze-col retune + gate JSX · 3h)

**Gốc:** `ReportBC03Tab.tsx:158` `REV_COL_W`/`TRI_COL_W` pixel cứng, không có bản mobile → 2 cột đông cứng Team(112)+Nhân sự(144)=256px chiếm ~75% màn, chỉ ~87px cho cột ngày. Keyboard hint + nút `⌨ ← →` (`:1583,:1596`) vô nghĩa trên touch; nút cuộn `← →` (`:1588`) chỉ ~24px.
**Cách:** giữ table + freeze-col (bảng ngày×sale có KPI sửa inline → KHÔNG card được). Thêm mảng width mobile, gate bằng `isMobile`; ẩn affordance bàn phím; nút cuộn ≥44px trên touch.
**Bước:** thêm `REV_COL_W_MOBILE`/`TRI_COL_W_MOBILE` (Team 112→92, Nhân sự 144→128); `const revColW = isMobile ? …` rồi **thay TẤT CẢ** `REV_COL_W`→`revColW` ở head (`:1194…1215`) và body (`:1263…1324`), tương tự `TRI_COL_W`→`triColW` (trial + referral) — **all-or-nothing** vì `bc03StickyCol` cộng dồn width để tính `left`, lệch head/body → cột đông cứng lệch nhau. Gate `!isMobile` cho hint + nút bàn phím. Nút `← →` thêm `min-h-[44px] min-w-[44px] md:min-h-0`.
**⚠️ Quyết định GC5 (bắt buộc):** cột **Team** trên mobile KHÔNG được thành "Linh D…" (audit đã cảnh báo đây đúng là lỗi "Bu…/Ca…"). 2 lựa chọn — Đức chọn khi làm & báo lại:
 - (a) giữ Team đủ rộng cho nhãn dài nhất ("Linh Dam (Store)"), HOẶC
 - (b) fold Team thành sub-line dưới tên nhân sự (kiểu M1), bỏ Team khỏi cột đông cứng.
 Ellipsis + `title` (long-press) **không** được coi là đạt — chỉ là fallback yếu.
**Test:** `ReportBC03Tab.test.tsx` `describe('mobile')` — lock `minWidth` cột Nhân sự (128px mobile vs 144px desktop), assert nút bàn phím ẩn khi mobile; **thêm** `assertNoColumnCrush` trên cả 3 tab (Doanh thu/Trial/Referral) để bắt Team bleed vào cột Total.
**Guard riêng:** grep sạch `REV_COL_W`/`TRI_COL_W` trần trong JSX sau sửa (chỉ còn 4 hằng gốc + `_MOBILE`); giữ `BC03_FREEZE_COLS=2`; không đụng `.gmv-table-scroll` (gmv-theme.css, dùng chung).

### M1 — Dashboard gamification (Đức · reflow `max-md:` · 2.5h)

**Gốc:** đã reflow `max-md:` sẵn (grid collapse + ẩn Team/Subteam → fold sub-line), 0 overflow ngang. Còn 2 chỗ crush trong khung: (1) cột doanh thu 78px hiển thị `formatRevenueMillions` "1.234,56 tr" tràn sang cột đơn; (2) header "Đơn b.động" wrap trong 60px; (3) WeeklyRewards `gap-4` + reward `text-lg` bóp cột title còn ~150px.
**Bước:** cột doanh thu mobile dùng `formatVndCompact` ("500 tr"/"1,2 tỷ") qua span-toggle `md:hidden`/`hidden md:inline` (đừng sửa helper — dùng lại); grid mobile `max-md:grid-cols-[36px_1fr_78px_60px]`→`[32px_1fr_70px_46px]` (đổi **cả header `:415` và row `:430-431` — phải giống hệt**); header đơn hàng `md:hidden`"Đơn"/`hidden md:inline`"Đơn b.động"; WeeklyRewards `gap-4 max-md:gap-3` + reward `text-lg max-md:text-base`.
**Test:** thêm test 375px vào `e2e/dashboard-sales.spec.ts` — `setViewportSize({375,812})`, `assertNoHorizontalOverflow`, doanh thu khớp `/(tr|tỷ)$/`, header đơn = "Đơn". Nếu ngoài scope → tối thiểu `tsc -b`.
**Guard riêng:** KHÔNG sửa `DashboardTab.utils.ts` (helper dùng chung); giữ sub-line team·subteam; giữ `max-md:overflow-visible`/`h-auto`. **QA GC5:** tên sale phải đọc được ≥~15 ký tự trước "…".

### M6 — Dashboard Sale (Đức · verify-only · 0.5h)

Đã responsive: KPI `grid-cols-[repeat(auto-fill,minmax(148px,1fr))]` (2-up ở 375px), chart rows `grid-cols-1 lg:grid-cols-N`, ResponsiveContainer 100%, bảng chi tiết đã `isMobile`→`SaleDetailCards`. **Việc:** mở ở 375px xác nhận filter bar + KPI + chart không tràn/crush. Nếu phát hiện lỗi thật → ghi nhận, mở task nhỏ; **mặc định 0 sửa**.

### BC02 — Key data report (Đạt · polish · 0.5h)

**Gốc:** đã đúng pattern — table `min-w-[1200px]` scroll trong `TableScrollWrap`, cột Ngày freeze trái (dd/mm/yyyy 104px, không truncate), cell còn lại toàn số `tabular-nums`. **KHÔNG** đổi thành cards (audit khẳng định). Chỉ 1 rủi ro: `<select>` Team (`:96`) width theo nội dung → nhãn team dài có thể clip mép.
**Bước:** thêm `w-full min-w-0 max-w-full` vào className select Team (hoặc đổi sang `<Select>` chung đã có `w-full min-w-0`), giữ `min-h-10` (tap 44px). Hết. Không @media, không đụng Table.tsx.
**Test:** assert select mang class shrink-safe (`min-w-0`). Có thể đóng ở effort 0 nếu team muốn dồn budget sang Auth/BC01 — nhưng làm cho chắc.

### Auth — Accounts drawer + 3 modal (Đạt · reflow-css · 5h)

**Gốc:** list đã DONE (cards). **Body drawer** (`AccountDetailDrawer`) + modal chưa reflow, nhồi desktop grid/flex vào 375px:
- `.aa-summary-bar` `repeat(4,1fr)` → 4 ô ~80px, "Team"/"Chờ kích hoạt" crush dọc.
- `.aa-info-grid` `1fr 1fr` → email tràn/wrap giữa từ.
- `.aa-role-cards` `repeat(3,1fr)` → 4 card role bóp.
- `.aa-drawer-footer` flex nowrap + spacer `flex:1` → 3 nút "Sao chép mã/Dừng kích hoạt/Lưu thay đổi" tràn mép (screenshot 1).
- `.aa-section-header` `space-between` → title + 2 nút CRM đè nhau.
- `CreateAccountModal` 4 block `grid grid-cols-2` (không responsive) → field bóp.
- `CrmLinkModal` filter + bảng 6 cột không có overflow-x → **tràn trang**.
**Cách:** append rule vào **block `@media(max-width:767px)` sẵn có** trong `auth-accounts.css` (sau `:1020`): collapse các grid về 1 (hoặc 2) cột; footer/section/filter `flex-wrap` + phần tử chính `flex:1 1 100%` (GC3); bảng CrmLink `overflow-x:auto` + ẩn 2 cột phụ (`nth-child(4)` Sub-team, `nth-child(6)` Mã yêu cầu). `CreateAccountModal.tsx`: 4 `grid-cols-2`→`grid-cols-1 sm:grid-cols-2` (cân nhắc `md:` cho khớp mốc 767 của bottom-sheet — xem note dưới). Không cần `useIsMobile`, không sửa `ui/Modal.tsx` (bottom-sheet đã có).
**Test:** thêm/ mở rộng spec Playwright 375px: mở drawer user (đã liên kết + kích hoạt) → `assertNoHorizontalOverflow` + `assertNoColumnCrush`; mở `CrmLinkModal` → không tràn ngang. Runtime assert (theo learning): `getComputedStyle('.aa-drawer-footer > button:last-child').flexBasis==='100%'`, `'.aa-crm-modal-filters .aa-search'.flexBasis==='100%'`.
**Guard riêng:** mọi CSS trong `@media(max-width:767px)`, append-only (không sửa `:1-1006`); footer/filter dùng `flex-basis` (GC3); nth-child ẩn cột kèm comment tên cột (đổi thứ tự cột phải cập nhật); override border 2×2 summary đặt SAU rule gốc `:507-515`.
**Note nhất quán (audit):** bottom-sheet bật ở `max-md`(<768) nhưng form dùng `sm:`(≥640) → 640–767px sheet vẫn 2 cột. Cân nhắc `md:grid-cols-2` để khớp mốc 767. Không phải lỗi tràn, chỉ nhất quán.

### Perms — Ma trận phân quyền (Đạt · freeze-col + reflow-css · 4h)

**Gốc:** chỉ có 1 block mobile (`:643` kpis+tabs). Ma trận 16 module × 4 dept scroll ngang trong `TableWrap` nhưng cột Module **không freeze** → cuộn phải mất nhãn hàng. `.pm-legend` flex nowrap ~500px → **tràn trang**. `.pm-drawer-module`/`.pm-picker-row` `space-between`/nowrap → crush. (E2E hiện xanh giả vì account test không phải System-admin → chỉ thấy warn box.)
**Cách:** giữ ma trận scroll (2D, so sánh dept×module — cards 64 dòng là over-engineer, đã bị loại), **freeze cột Module** + reflow legend/drawer/picker. **Toàn bộ CSS-only**, append vào block `@media(max-width:767px)` sẵn có, không đụng .tsx.
**Bước:** freeze `.pm-matrix thead th:first-child`/`.pm-module-row td:first-child` `position:sticky;left:0` (nền đục, z-index: corner z:3 > body z:2 > dept cell); `min-width:240→150px`; `.pm-matrix thead th{white-space:nowrap}` + badge nowrap; `.pm-legend{flex-wrap:wrap}` + `.pm-legend-hint{margin-left:0;flex-basis:100%}` (đây là fix giữ pageOverflow≤0); `.pm-drawer-module{flex-wrap:wrap}` + info `flex:1 1 100%` + actions xuống dòng; `.pm-picker-row{flex-wrap:wrap}` + email `min-width:0;flex:1 1 100%`.
**⚠️ Bổ sung GC5 (audit):** cell Module freeze 150px phải có **`truncate`+`title`** hoặc wrap để nhãn module dài không bleed dưới cột dept khi cuộn — hiện fix mới nowrap cho header chứ chưa cho body cell freeze.
**Test:** mở rộng `e2e/mobile-admin.spec.ts` (375px): sau khi mở Phân quyền, assert overflowX≤0 SAU khi mở OverrideDrawer + StaffPickerModal. **Cần session System-admin** (xem prereq) — nếu chưa có thì guard/skip rõ ràng, KHÔNG để pass giả trên warn box.
**Guard riêng:** rule chỉ target `.pm-*` trong `@media`; z-index sticky-left vs sticky-top-thead là load-bearing (nền đục bắt buộc); dùng `flex:1 1 100%` (GC3); không refactor sang RowCard.

---

## Shared prereq & sở hữu (chống va chạm)

| Prereq | Chủ | Ghi chú |
|---|---|---|
| Stub `window.matchMedia({matches:true})` cho unit test | **Đức** | BC01 + BC03 đều cần (jsdom thiếu). Tách 1 util `frontend/src/test/mobileMatchMedia.ts`, cả 2 spec import — kèm `afterEach` restore chống leak sang 13 test desktop. Cả 2 file đều của Đức → không đụng Đạt. |
| Helper e2e no-overflow / no-crush | **Dùng lại sẵn có** | `e2e/helpers/mobile.ts` đã có `assertNoHorizontalOverflow`, `assertNoColumnCrush`, `assertDrawerHealthy`, `assertClosedDrawerPassthrough`. **Cả 2 dev chỉ IMPORT, không sửa** file này → không collision. |
| Session **System-admin** cho e2e Perms/admin | **Đạt** | Không có admin storageState thì assert Perms là vô nghĩa (chỉ thấy warn box). Provision 1 lần, tái dùng. Nếu không kịp → assert phải `test.skip` tường minh, không pass giả. |
| Read-only primitives | Cả 2 | `ui/Table.tsx`, `ui/Modal.tsx`, `ui/Button.tsx`, `ui/Input.tsx`, `ui/RowCard.tsx`, `hooks/useIsMobile.ts` — KHÔNG ai sửa. |

---

## Test strategy (tổng)

- **Đơn vị (vitest):** BC01 (mobile cards branch), BC03 (width-array + hide keyboard btn), BC02 (class shrink-safe). Dùng stub matchMedia dùng chung.
- **E2E mobile (Playwright 375×812, project `mobile`):** M1 → `dashboard-sales.spec.ts`; Auth → spec mới `mobile-auth.spec.ts` (Đạt); Perms → `mobile-admin.spec.ts`. Tất cả tái dùng helper `mobile.ts`. **Mỗi màn: `assertNoHorizontalOverflow` + `assertNoColumnCrush` trên data thật** (GC7) — không chỉ overflow.
- **Regression desktop:** vitest full + `npm run e2e` xanh nguyên trạng trước merge main.

## Rollout

1. 2 branch song song từ `sandbox`: `mobile-fix-reports-duc`, `mobile-fix-admin-dat`.
2. Mỗi dev: làm → DoD gate (GC6) → commit **từng module** → squash merge vào `sandbox` (Vercel sandbox auto-deploy).
3. **Nghiệm thu điện thoại thật ở sandbox** trước khi lên main: Đức (BC01/BC03/M1/M6), Đạt nhờ **kế toán/admin** duyệt Auth + Perms trên máy thật.
4. `npm run e2e` battery desktop xanh → merge main → deploy prod.
5. Không gộp 2 branch 1 lần merge; module nào xong nghiệm thu module đó.

## Definition of Done (mỗi module)

`npx tsc -b` ✅ + `npm run test` ✅ + spec mobile liên quan ✅ (dán số pass) + mở 375px data thật không tràn/không crush/không truncate định danh (GC5+GC7) + `git diff` desktop delta = 0 (GC1) + commit riêng file cụ thể.

## Sau khi xong (Learning Law)

Chạy `extract-approach` nếu gặp trap mới (đặc biệt: freeze-col identity truncation, breakpoint sm vs max-md mismatch). Cập nhật `MODULES.md` nếu thêm file (`src/test/mobileMatchMedia.ts`, `e2e/mobile-auth.spec.ts`).
