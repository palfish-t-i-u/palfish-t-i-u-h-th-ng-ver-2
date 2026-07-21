# HANDOFF — Đạt · Mobile Fix Pass (Auth + Permissions + BC02)

> Nguồn kế hoạch tổng: `docs/plans/PLAN_MOBILE_FIX_PASS_2026-07-21.md` (đọc mục Guardrails chung GC1–GC7 trước).
> **Theme của bạn:** rule `@media(max-width:767px)` scoped trong file `.css` + Tailwind responsive prefix. Đức làm nhánh `.tsx` — file KHÔNG trùng bạn, cứ chạy song song.

## Đọc trước (bắt buộc, ~10')
- `docs/learnings/mobile-reflow-not-just-width.md`
- `docs/learnings/flex-basis-vs-width-mobile.md` ← **quan trọng nhất với bạn** (footer/legend/picker dùng `flex:1 1 100%`, KHÔNG `width:100%`).
- `MODULES.md` mục 9 (RBAC + Auth), 7 (BC02).

## Branch & quy tắc
- Branch từ `sandbox`: `mobile-fix-admin-dat`.
- `git add` **file cụ thể**, cấm `-A`/`.`. Commit **từng module**.
- **DoD mỗi module (GC6):** `npx tsc -b` + `npm run test` + spec liên quan XANH, dán số pass, rồi commit.
- **Desktop delta = 0 (GC1):** mọi CSS mới **append cuối `@media(max-width:767px)` sẵn có**, KHÔNG sửa dòng cũ, KHÔNG format lại file.
- **KHÔNG sửa (GC2):** `ui/Modal.tsx` (bottom-sheet đã xong), `ui/Table.tsx`, `ui/Button.tsx`, `ui/Input.tsx`, `e2e/helpers/mobile.ts` (chỉ import).
- **GC3 (bẫy chính của bạn):** phần tử flex muốn chiếm trọn dòng → `flex:1 1 100%`, KHÔNG `width:100%` (bị nuốt).

## Prereq bạn sở hữu (làm sớm, chặn test Perms)
Provision **session System-admin** cho e2e (storageState admin). Không có nó, spec Perms vô nghĩa — account test thường chỉ thấy warn box "Chỉ Admin có quyền" (`PermissionsTab.tsx:158`), không render ma trận. Nếu không kịp → assert Perms phải `test.skip` **tường minh**, KHÔNG để pass giả trên warn box.

---

## Task 1 — BC02 Key data report (0.5h) · polish (làm trước cho nóng máy)

**File:** `frontend/src/components/reports/BC02KeyDataReport.tsx` (CHỈ file này, không @media)

BC02 **đã đúng pattern** — table `min-w-[1200px]` scroll trong `TableScrollWrap`, cột Ngày freeze trái (dd/mm/yyyy 104px, không truncate), cell còn lại toàn số. **KHÔNG đổi thành cards, KHÔNG giảm min-width.** Chỉ 1 rủi ro: `<select>` Team (`:96`) rộng theo nội dung → nhãn team dài clip mép.

**Làm:** thêm `w-full min-w-0 max-w-full` vào className select Team (hoặc đổi sang `<Select>` chung từ `ui/Input` đã có `w-full min-w-0`), **giữ `min-h-10`** (tap 44px). Xong.

**Test:** assert select mang class shrink-safe (`min-w-0`/`gmv-field`).

**Guard:** không đụng table/sticky/Table.tsx; giữ `overflow-x-hidden` ngoài + `min-w-[1200px]` trong.

---

## Task 2 — Auth Accounts drawer + 3 modal (5h) · reflow-css

**File:** `frontend/src/components/auth/auth-accounts.css` + `frontend/src/components/auth/CreateAccountModal.tsx`

**Vấn đề:** list đã DONE. **Body drawer** (`AccountDetailDrawer`) + modal chưa reflow (screenshot 1 — footer tràn, info chật). Toàn desktop grid/flex nhồi 375px.

**Làm — append vào block `@media(max-width:767px)` sẵn có trong `auth-accounts.css` (sau `:1020`):**
1. `.aa-summary-bar{grid-template-columns:1fr 1fr}` (từ `repeat(4,1fr)`) + sửa divider 2×2: `.aa-summary-cell{border-bottom:1px solid var(--gmv-border)} .aa-summary-cell:nth-child(2n){border-right:none} .aa-summary-cell:nth-child(n+3){border-bottom:none}` (đặt SAU rule gốc `:507-515` để thắng cascade).
2. `.aa-info-grid{grid-template-columns:1fr}` — stack key-value + control edit-mode full-width (hết email tràn).
3. `.aa-role-cards{grid-template-columns:1fr}` — 4 card role stack.
4. Footer (GC3): `.aa-drawer-footer{flex-wrap:wrap;gap:8px} .aa-drawer-footer-spacer{display:none} .aa-drawer-footer>button{flex:1 1 auto} .aa-drawer-footer>button:last-child{flex:1 1 100%}` → hàng 1 [Sao chép mã][Kích hoạt], hàng 2 [Lưu thay đổi] full-width.
5. `.aa-section-header{flex-wrap:wrap;gap:8px}` — nhóm 2 nút CRM xuống dưới title.
6. `.aa-drawer-badges .aa-status{display:none}` — bỏ badge status trùng (đã có ở summary bar), nhường chỗ tên. Giữ role badge + close.
7. CRM picker filter: `.aa-crm-modal-filters{flex-wrap:wrap} .aa-crm-modal-filters .aa-search{flex:1 1 100%}` + `.aa-crm-modal-footer{flex-wrap:wrap;gap:10px}`.
8. CRM picker table (chống **tràn trang**): `.aa-crm-table-wrap{overflow-x:auto}` + ẩn 2 cột phụ — `.aa-crm-table th:nth-child(4),.aa-crm-table td:nth-child(4),.aa-crm-table th:nth-child(6),.aa-crm-table td:nth-child(6){display:none}` (4=Sub-team, 6=Mã yêu cầu — **kèm comment tên cột**; đổi thứ tự cột phải cập nhật).
9. (tùy chọn thấp) `.aa-delete-col-crm{display:none}` cho DeleteAccountsModal.

**`CreateAccountModal.tsx`:** 4 block `grid grid-cols-2 gap-3` (`:135,164,190,244`) → `grid grid-cols-1 sm:grid-cols-2 gap-3`. **Cân nhắc `md:grid-cols-2`** thay `sm:` để khớp mốc 767 của bottom-sheet (audit: 640–767px sheet vẫn 2 cột nếu dùng `sm:`).

**Test:** spec mới `frontend/e2e/mobile-auth.spec.ts` (375px) — mở drawer user đã-liên-kết-đã-kích-hoạt: `assertNoHorizontalOverflow` + `assertNoColumnCrush` (import từ `helpers/mobile.ts`); mở `CrmLinkModal` → không tràn ngang. Runtime assert: `getComputedStyle('.aa-drawer-footer > button:last-child').flexBasis==='100%'` và `'.aa-crm-modal-filters .aa-search'.flexBasis==='100%'`.

**Guard:** mọi CSS trong `@media`, append-only (không sửa `:1-1006`, không đụng `.aa-drawer` width `:1009` / `.aa-search`/`.aa-tabs` `:1016`); footer/filter dùng `flex-basis` (GC3); nth-child ẩn cột kèm comment.

---

## Task 3 — Perms Ma trận phân quyền (4h) · freeze-col + reflow-css

**File:** `frontend/src/components/permissions/permissions.css` (CHỈ file này — **không đụng .tsx**)

**Vấn đề:** chỉ 1 block mobile (`:643` kpis+tabs). Ma trận scroll ngang trong `TableWrap` nhưng cột Module **không freeze** → cuộn phải mất nhãn hàng. `.pm-legend` flex nowrap ~500px → **tràn trang**. `.pm-drawer-module`/`.pm-picker-row` `space-between`/nowrap → crush.

**Làm — append vào block `@media(max-width:767px)` sẵn có (`:643`):**
1. **Freeze cột Module:** `.pm-matrix thead th:first-child{position:sticky;left:0;z-index:3;min-width:150px;background:var(--gmv-table-head)}` + `.pm-matrix .pm-module-row td:first-child{position:sticky;left:0;z-index:2;background:var(--gmv-canvas)}`. **Nền đục bắt buộc** (cell hiện trong suốt → content cuộn sẽ xuyên qua). z-index: corner z:3 > body z:2 > dept cell.
2. **Chống nhãn module dài bleed (GC5):** cell freeze body thêm `.pm-matrix .pm-module-row td:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` **HOẶC** cho wrap — tên module không được đè cột dept khi cuộn. (Header đã nowrap ở bước 3.)
3. `.pm-matrix thead th{white-space:nowrap;padding:10px 8px}` + `.pm-access-badge{white-space:nowrap;padding:4px 10px}` — dept header + "Không có quyền" hết wrap.
4. **Fix legend tràn (giữ pageOverflow≤0):** `.pm-legend{flex-wrap:wrap;gap:8px 12px}` + `.pm-legend-hint{margin-left:0;flex-basis:100%}` (reset `margin-left:auto` `:108`).
5. Override drawer row: `.pm-drawer-module{flex-wrap:wrap}` + `.pm-drawer-module-info{flex:1 1 100%}` (GC3, KHÔNG width) + `.pm-drawer-module-actions{flex-shrink:1;margin-top:6px}`.
6. Staff picker row: `.pm-picker-row{flex-wrap:wrap;row-gap:4px}` + `.pm-picker-email{min-width:0;flex:1 1 100%}` (bỏ `min-width:200px` `:552`) + `.pm-picker-name{flex:1 1 100%}`.
7. (minor) `.pm-override-header{flex-wrap:wrap;gap:10px}` + `.pm-drawer-foot{flex-wrap:wrap}`.

**Test:** mở rộng `frontend/e2e/mobile-admin.spec.ts` (375px) — sau khi mở Phân quyền, assert `assertNoHorizontalOverflow` SAU khi mở OverrideDrawer ("Chỉnh sửa" 1 hàng) + StaffPickerModal ("+ Thêm override"). **Cần System-admin session** (prereq trên) — thiếu thì `test.skip` tường minh.

**Guard:** rule chỉ target `.pm-*` trong `@media`; z-index sticky-left load-bearing + nền đục bắt buộc; dùng `flex:1 1 100%` (GC3); không refactor sang RowCard/useIsMobile (ma trận 2D — cards 64 dòng là over-engineer, đã loại).

---

## Xong việc
- Nghiệm thu **điện thoại thật** (sandbox) — Auth nhờ **admin**, Perms nhờ **admin/kế toán** duyệt.
- `npm run e2e` battery desktop (crm-sync, admin-smoke, dashboard-sales…) xanh nguyên trạng.
- Cập nhật `MODULES.md` nếu thêm `e2e/mobile-auth.spec.ts`.
- Trap mới (breakpoint sm vs max-md mismatch, sticky-left z-index…) → `extract-approach`.
