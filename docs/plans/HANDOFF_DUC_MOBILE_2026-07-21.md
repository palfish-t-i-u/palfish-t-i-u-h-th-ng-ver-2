# HANDOFF — Đức · Mobile Fix Pass (Reports + Dashboards)

> Nguồn kế hoạch tổng: `docs/plans/PLAN_MOBILE_FIX_PASS_2026-07-21.md` (đọc mục Guardrails chung GC1–GC7 trước).
> **Theme của bạn:** nhánh React `isMobile` / `RowCard` / `max-md:` trong file `.tsx`. Đạt làm CSS `@media` — file KHÔNG trùng bạn, cứ chạy song song.

## Đọc trước (bắt buộc, ~10')
- `docs/learnings/mobile-reflow-not-just-width.md`
- `docs/learnings/flex-basis-vs-width-mobile.md`
- `MODULES.md` mục 1, 2, 7 (Dashboard + Reports)

## Branch & quy tắc
- Branch từ `sandbox`: `mobile-fix-reports-duc`.
- `git add` **file cụ thể**, cấm `-A`/`.`. Commit **từng module**.
- **DoD mỗi module (GC6):** `npx tsc -b` + `npm run test` + spec liên quan XANH, dán số pass, rồi commit.
- **Desktop delta = 0 (GC1):** mọi thứ mới nằm trong nhánh `isMobile` / `max-md:` / `md:`. `git diff` không được đổi dòng desktop nào.
- **KHÔNG sửa (GC2):** `ui/Table.tsx`, `ui/RowCard.tsx`, `hooks/useIsMobile.ts`, `DashboardTab.utils.ts`, `e2e/helpers/mobile.ts` (chỉ import).

## Prereq bạn tự làm trước (dùng lại cho BC01 + BC03)
Tạo `frontend/src/test/mobileMatchMedia.ts` — helper stub `window.matchMedia` cho jsdom (jsdom không có sẵn; `useIsMobile` đọc `matchMedia(query).matches`). Export `stubMobile()` / `restoreMatchMedia()` để `beforeEach`/`afterEach`. **Bắt buộc restore trong `afterEach`** kẻo `isMobile=true` leak sang các suite desktop khác. Cập nhật `MODULES.md` mục 10 (thêm file test util).

---

## Task 1 — BC01 Sales performance (4h) · table→cards

**File:** `frontend/src/components/reports/BC01SalesPerformance.tsx` + `.test.tsx`

**Vấn đề:** `:154` table `min-w-[900px]`; sticky Team(112px)+Sale(160px) trái + Total(88px) phải nuốt hết 375px → cột tháng ẩn, tên sale kẹp thành "Bu…/Ca…". `useIsMobile` (`:72`) hiện chỉ ẩn mô tả (`:109-115`).

**Làm:**
1. Import `import { RowCard, RowCardList } from "../ui/RowCard";`
2. Giữ **ngoài nhánh**: outer `div`, mô tả desktop (`:109-115`), filter bar (`:117-143`), error (`:145`), "Tổng GMV (RMB)" (`:147-151`).
3. Thay riêng block `<TableScrollWrap>…</TableScrollWrap>` (`:153-257`) bằng `{isMobile ? (<cards>) : (<nguyên block table cũ>)}`. **Bê nguyên JSX table vào nhánh `!isMobile`, không sửa 1 ký tự** (giữ constant sticky `:37-69`).
4. Nhánh `isMobile` = `<div className="space-y-3">`:
   - loading: `<p className="text-sm text-gmv-muted">Đang tải…</p>` khi `loading && !data`.
   - card grand total (nếu `showGrandTotalHeader`): `<RowCard title="Tổng cộng" value={fmtRmb(data.grandTotal)} meta={months.map(m => ({label:m, value:fmtRmb(data.grandTotalRow[m] ?? 0)}))} />` (className nền nhấn).
   - mỗi team → `<section>` với header tên team (+ "Tổng: …" nếu `showTeamSubtotals`) rồi `<RowCardList>` các `<RowCard title={sale.sale} value={fmtRmb(sale.total)} meta={months.map(...)} />`.
   - empty: `<RowCardList empty="Chưa có dữ liệu trong khoảng ngày đã chọn.">{null}</RowCardList>`.
   - **KHÔNG** dùng `GmvDataBarCell` (math cột desktop) — số trần `fmtRmb`.
5. ⚠️ Xác minh tên field thật của cell theo tháng khi đọc code (`sale.cells[m]` / `sale[m]` — dùng đúng theo type `RevenuePivotResponse`).

**Test:** `describe('mobile')` + `stubMobile()`/`restoreMatchMedia()` — assert: `getByText("<tên sale đầy đủ>")` (không "…"), 1 giá trị tháng hiện, `document.querySelector('table')===null`, `getByText("Tổng cộng")`. **13 test desktop cũ giữ nguyên** (chạy không stub → desktop).

**Guard:** chuỗi text byte-identical 2 mode (tên sale, "Tổng cộng", "Tổng", empty/loading, format `fmtRmb`); RowCard title tự `break-words` — đừng thêm `truncate`/`nowrap` (GC5).

---

## Task 2 — BC03 Báo cáo tổng bộ (3h) · freeze-col retune + gate JSX

**File:** `frontend/src/components/ReportBC03Tab.tsx` + `.test.tsx`

**Vấn đề:** `:158` `REV_COL_W`/`TRI_COL_W` pixel cứng, không bản mobile → Team(112)+Nhân sự(144)=256px chiếm ~75% màn, còn ~87px cho cột ngày. Hint bàn phím (`:1583`) + nút `⌨ ← →` (`:1596`) vô nghĩa touch; nút cuộn `← →` (`:1588`) ~24px.

**Làm:**
1. Thêm `const REV_COL_W_MOBILE = [92,128,...]` và `TRI_COL_W_MOBILE = [92,128,72]` cạnh hằng gốc (`:158-159`) — Team 112→92, Nhân sự 144→128.
2. Sau `const isMobile = useIsMobile();` (`:517`): `const revColW = isMobile ? REV_COL_W_MOBILE : REV_COL_W;` + `triColW` tương tự.
3. **Thay TẤT CẢ** `REV_COL_W`→`revColW` ở head (`:1194,1197,1201,1206,1209,1212,1215`) + body (`:1263,1273,1287,1299,1310,1314,1324`); `TRI_COL_W`→`triColW` ở trial (head `:1376,1379,1382` body `:1420,1430,1440`) + referral (head `:1477,1480,1483` body `:1521,1531,1541`). **All-or-nothing từng bảng** — `bc03StickyCol` cộng dồn width tính `left`; lệch head/body → cột đông cứng lệch. Sau sửa `grep -n "REV_COL_W\|TRI_COL_W" ReportBC03Tab.tsx` chỉ còn 4 hằng gốc + 2 `_MOBILE`.
4. Gate `{!isMobile && (…)}` cho hint bàn phím (`:1583-1585`) + nút `⌨` (`:1596-1603`).
5. Nút `← →` (`:1588-1611`): `px-2 py-1` → thêm `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0`.

**⚠️ Quyết định định danh (GC5 — báo lại kết quả):** cột **Team** mobile KHÔNG được "Linh D…". Chọn (a) giữ Team đủ rộng cho nhãn dài nhất, HOẶC (b) fold Team thành sub-line dưới tên nhân sự (bỏ Team khỏi freeze). Ellipsis+`title` chỉ là fallback yếu, không tính đạt. Nếu chọn (b) mà phải đổi `BC03_FREEZE_COLS`/reindex → cân nhắc rủi ro, ưu tiên (a) nếu nhãn thực tế đủ ngắn.

**Test:** `describe('mobile')` (stubMobile): lock `minWidth` cột "Nhân sự" = `128px` (mobile) vs `144px` (desktop control); assert nút `⌨` ẩn khi mobile. **Thêm** `assertNoColumnCrush` mở cả 3 tab (Doanh thu/Trial/Referral) bắt Team bleed vào Total.

**Guard:** không đụng `.gmv-table-scroll` (gmv-theme.css dùng chung); desktop byte-identical (mảng gốc + size nút desktop nguyên).

---

## Task 3 — M1 Dashboard gamification (2.5h) · reflow `max-md:`

**File:** `frontend/src/components/DashboardTab.tsx` (CHỈ file này)

**Vấn đề:** đã reflow `max-md:` (grid collapse, ẩn Team/Subteam, fold sub-line), 0 overflow. Còn crush trong khung: doanh thu 78px tràn ("1.234,56 tr"), header "Đơn b.động" wrap trong 60px, WeeklyRewards title bị bóp còn ~150px.

**Làm:**
1. Cell doanh thu MonthRanking (`:460`): span-toggle — `<span className="md:hidden">{formatVndCompact(row.gmv_vnd)}</span><span className="hidden md:inline">{formatRevenueMillions(row.gmv_vnd)}</span>`. Cả 2 helper đã import (`:16-24`). **KHÔNG sửa `DashboardTab.utils.ts`.**
2. Grid mobile: `max-md:grid-cols-[36px_minmax(0,1fr)_78px_60px]` → `max-md:grid-cols-[32px_minmax(0,1fr)_70px_46px]` ở **cả header `:415` và row `:430-431`** (phải giống hệt nhau).
3. Header đơn (`:421`): `<span className="text-right whitespace-nowrap"><span className="md:hidden">Đơn</span><span className="hidden md:inline">Đơn b.động</span></span>`.
4. WeeklyRewards: `:490` `gap-4`→`gap-4 max-md:gap-3`; reward `:513` `text-lg`→`text-lg max-md:text-base`.

**Test:** thêm test 375px vào `frontend/e2e/dashboard-sales.spec.ts` — `setViewportSize({width:375,height:812})`, import `assertNoHorizontalOverflow` từ `helpers/mobile.ts`, assert doanh thu khớp `/(tr|tỷ)$/` + header đơn = "Đơn". Ngoài scope → tối thiểu `tsc -b`.

**Guard:** tất cả sau `max-md:`/`md:` (desktop nguyên); 2 template grid phải khớp ký tự; giữ sub-line team·subteam + `max-md:overflow-visible`. **QA GC5:** tên sale đọc được ≥~15 ký tự trước "…".

---

## Task 4 — M6 Dashboard Sale (0.5h) · VERIFY-ONLY

**File:** `frontend/src/components/Module6Tab.tsx` — **mặc định 0 sửa.**

Đã responsive (KPI `auto-fill,minmax(148px,1fr)` 2-up, chart `grid-cols-1 lg:grid-cols-N`, bảng chi tiết đã `isMobile`→`SaleDetailCards`). Mở 375px xác nhận filter bar + KPI + chart không tràn/crush. Lỗi thật → ghi nhận + mở task nhỏ, đừng nhét vào đợt này.

---

## Xong việc
- Nghiệm thu **điện thoại thật** (sandbox) toàn bộ 4 màn trước khi xin merge main.
- `npm run e2e` battery desktop (payment-lifecycle, dashboard-sales, qr-capture…) xanh nguyên trạng.
- Cập nhật `MODULES.md` nếu thêm `src/test/mobileMatchMedia.ts`.
- Trap mới (freeze-col truncation…) → `extract-approach`.
