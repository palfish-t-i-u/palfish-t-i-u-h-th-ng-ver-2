# PLAN M4 FE — Module "Phiếu lương" (Milestone B frontend) — 17/08/2026

> **Chạy được ngay, không chờ ai.** Backend + migration + RBAC + 15 test XONG trên branch `feat/payslip-m4-be`. Đây là plan FE self-contained cho Sonnet/Opus execute không cần hỏi lại. Mọi path:line + key byte-exact + const đã chốt trong file này.

**Branch:** `feat/payslip-m4-be` (tiếp tục, KHÔNG tạo branch mới) · **Env:** sandbox-first
**Nguồn spec (KHÔNG thiết kế lại):** `docs/PHIEU_LUONG_CONTRACT.md` · `docs/plans/PLAN_M4_MODULE_PHIEU_LUONG_2026-08-14.md`
**Nguyên tắc:** App = tầng HIỂN THỊ THUẦN. Không tính lại. Đọc `payslips`, render 6 block, 2 nút xác nhận.

---

## 0. Trạng thái

**XONG (BE):** `backend/payroll_routes.py` — `POST /receive`, `GET /payslips` (RBAC), `GET /payslips/{id}` (detail+audit), `PATCH /{id}/confirm`, `PATCH /{id}/review` (auto-khóa mùng 4). Bảng `payslips` + `payslip_views` + cột `nhan_su_sale.ma_nv` áp sandbox `pxgy`. `GATE_TOKEN` set Render sandbox. 15 test pass.

**CÒN (FE + data):** đăng ký RBAC (BE+FE) · API layer · types · PayslipTab + render 6 block · re-auth · 2 nút · mobile · backfill `ma_nv` · update MODULES.md.

---

## Milestone B-FE — Task list

### F1 · Đăng ký module `payslip` vào phân quyền (BE + FE — 4 file)
> ⚠ **BẪY LỚN:** phân quyền có bản BE. Nếu chỉ sửa FE, `/me` trả `payslip:"none"` → tab ẩn cho MỌI người. **PHẢI sửa cả 4 chỗ.** Cấp `"full"` cho cả 4 phòng ban (self-view all-group; BE RBAC `visible_payslip_codes` mới là tầng giới hạn thật theo `ma_nv`).

1. **`backend/admin_routes.py:159`** — thêm `"payslip",` vào `MODULE_LIST` (trước `"authAccounts"` hoặc cuối, miễn có mặt).
2. **`backend/admin_routes.py:166-199`** — thêm `"payslip": "full",` vào **cả 4** dict (`sale`/`hr`/`marketing`/`cs`) trong `DEFAULT_DEPT_PERMISSIONS`.
3. **`frontend/src/types/permissions.ts:44-67`** — thêm vào `MODULE_LIST`: `{ key: "payslip", label: "Phiếu lương", description: "Xem phiếu lương cá nhân — xác nhận trước & sau thuế", section: "Nhân sự" }`.
4. **`frontend/src/types/permissions.ts:81-114`** — thêm `payslip: "full",` vào **cả 4** dict trong `DEFAULT_PERMISSIONS`.

**Verify F1:** login → `/me` response chứa `"permissions":{...,"payslip":"full"}`; tab "Phiếu lương" hiện ở `PermissionsTab` matrix (tự đọc `MODULE_LIST`, không cần sửa thêm).

### F2 · Types (`frontend/src/types/payroll.ts` — mới)
- `PayslipStage = "truoc_thue" | "sau_thue"`
- `PayslipListItem`: `id, code, name, ky_luong, stage, review_status, confirm_status, reviewed_at, confirmed_at, received_at, updated_at` (mirror `_serialize_payslip` BE — [payroll_routes.py:72-88](backend/payroll_routes.py:72)).
- `PayslipDetail extends PayslipListItem { phieu: Record<string, unknown> }`.
- `review_status ∈ "none"|"requested"` · `confirm_status ∈ "none"|"confirmed"`.

### F3 · API layer (`frontend/src/lib/api/payroll.ts` — mới, KHÔNG nhồi `api.ts`)
> Pattern = `frontend/src/lib/api/zaloAdmin.ts`. Dòng đầu: `import { api } from "../api";` (axios instance đã có interceptor gắn `Bearer` token tại [api.ts:53-58](frontend/src/lib/api.ts:53)). Lỗi hiển thị qua `formatApiError(err, fallback)` từ `frontend/src/lib/apiErrors.ts`.

- `listPayslips(kyLuong?: string): Promise<PayslipListItem[]>` → `GET /api/payroll/payslips` (query `ky_luong`), trả `res.data.payslips`.
- `getPayslip(id: string): Promise<PayslipDetail>` → `GET /api/payroll/payslips/${id}`, trả `res.data.payslip`.
- `confirmPayslip(id): Promise<PayslipListItem>` → `PATCH /api/payroll/payslips/${id}/confirm`, trả `res.data.payslip`.
- `requestReview(id): Promise<PayslipListItem>` → `PATCH /api/payroll/payslips/${id}/review`, trả `res.data.payslip`.

### F4 · Icon + wiring MainPage (`frontend/src/pages/MainPage.tsx` — 8 chỗ)
> Template wiring = cách `revenueLedger`/`module6` được nối. `AppShell`/`MobileNavSheet`/`NotificationBell` **generic, KHÔNG cần sửa**.

1. **`:17-32`** — `const PayslipTab = lazyRetry(() => import("../components/payslip/PayslipTab"));`
2. **`:34-45`** — thêm `payslip: () => import("../components/payslip/PayslipTab"),` vào `PRELOAD_MAP`.
3. **`:47-69`** — thêm `| "payslip"` vào union `ViewId`.
4. **`:87-159`** — thêm `payslip:` vào object `I` (SVG receipt/tờ lương, style giống 10 icon hiện có: `18×18 viewBox 0 0 24 24 stroke currentColor strokeWidth 2`). Gợi ý paths: `<rect x=5 y=3 w=14 h=18 rx=1/> <line 9,7→15,7/> <line 9,11→15,11/> <line 9,15→13,15/>`.
5. **`:161-226`** — thêm `TITLES` entry: `payslip: { title: "Phiếu lương", subtitle: "Xem phiếu trước thuế & sau thuế — xác nhận hàng tháng" },`
6. **`:275-360` (items useMemo)** — section MỚI `"Nhân sự"` (đặt sau khối DingTalk, trước "Tài khoản & Quyền"): `if (can("payslip")) list.push({ id: "payslip", label: "Phiếu lương", icon: I.payslip, section: "Nhân sự" });`
7. **`:363-379` (wideContent)** — **KHÔNG** thêm `payslip` (phiếu là layout hẹp, đọc dọc — để mặc định `max-w-[1400px]`). *(chủ ý; đừng quên rằng đây là quyết định, không phải bỏ sót.)*
8. **`:381-408` (renderActiveView switch)** — `case "payslip": return <PayslipTab />;`
- `can()` [:254-259]: **KHÔNG cần mapping**, key `"payslip"` dùng trực tiếp.
- Redirect tab ẩn [:270-273]: tự động xử lý, không cần sửa.

### F5 · Re-auth mật khẩu (`frontend/src/components/payslip/PayslipReauthModal.tsx` — mới)
> **AN TOÀN đã xác minh:** gọi lại `signInWithPassword` cho CHÍNH user đang đăng nhập KHÔNG logout/redirect (`onAuthStateChange` chỉ phản ứng `PASSWORD_RECOVERY`, dùng identity-check giữ nguyên state — [useAuth.tsx:82-88](frontend/src/hooks/useAuth.tsx:82)). Supabase client default config.

- Hook: `const { signInWithPassword, session } = useAuth();` → gọi `signInWithPassword(session.user.email, password)`.
- Lỗi sai mật khẩu: dùng lại regex [LoginPage.tsx:28](frontend/src/pages/LoginPage.tsx:28): `/invalid.*credential|invalid.*password/i` → hiện `"Mật khẩu không đúng."`.
- **Cache pass:** `sessionStorage["payslip_reauth"]` = `${Date.now()}`; TTL **15 phút**. Modal chỉ hiện khi flag thiếu/hết hạn. Verify pass 1 lần/phiên là đủ cho toàn tab (không phải mỗi phiếu).
- UI: `Modal` (`frontend/src/components/ui/Modal.tsx` — props `open/onClose/title`), 1 input password + `Button variant="primary"`.
- Gate: PayslipTab render danh sách bình thường; chỉ chặn `getPayslip(id)` (mở chi tiết) sau re-auth. *(Danh sách chỉ có tên+trạng thái, không lộ số tiền → re-auth ở tầng mở chi tiết là đủ.)*

### F6 · PayslipTab — list (`frontend/src/components/payslip/PayslipTab.tsx` — mới)
> Template cấu trúc = `frontend/src/components/SoDoanhThuTab.tsx`. Đầu component: `const { canView, loading } = usePermission("payslip");` + `const isMobile = useIsMobile();`.

- **Chọn kỳ:** dropdown `ky_luong` (mặc định = kỳ mới nhất trong data). Gọi `listPayslips(kyLuong)`.
- **Gom theo `code`:** mỗi NV có tối đa 2 dòng (trước/sau thuế) cùng kỳ → gom 1 card, 2 badge stage.
- **Desktop:** bảng (`ui/Table` + `TableScrollWrap`); cột: Tên (code), Kỳ, Trạng thái trước thuế, Trạng thái sau thuế, hành động Xem.
- **Mobile:** `PayslipRowCards.tsx` (pattern `frontend/src/components/LedgerRowCards.tsx` — `RowCard`/`RowCardList`, `meta: [{label,value}]`).
- **Badge trạng thái:** `confirmed`→`<Badge tone="ok">Đã xác nhận</Badge>` · `requested`→`tone="warn"` "Yêu cầu xem lại" · `none`→`tone="neutral"` "Chờ xác nhận".
- **Empty state (BẮT BUỘC, xem F9):** `[] `→ nếu là sale chưa có `ma_nv` hiện `"Chưa được gán mã nhân viên — liên hệ HR."`; khác → `"Chưa có phiếu lương kỳ này."`
- Click Xem → (re-auth nếu chưa) → `getPayslip(id)` → mở `PayslipDetail`.

### F7 · PayslipDetail — render 6 block (`frontend/src/components/payslip/PayslipDetail.tsx` — mới)
> **BYTE-EXACT keys** (Gate emit nhãn tiếng Việt của chị Trang verbatim, trừ 5 cột status). Render bằng **mapping declarative + fallback "Khác"** — KHÔNG hardcode-ẩn, mọi key lạ (Team, Số người phụ thuộc, cột Chung append sau) rơi vào "Khác", không bao giờ mất/crash.

**Header phiếu (không vào block):** `STT`, `Name`, `Chức danh` + `code`, `ky_luong`, `stage`.

**Const `PAYSLIP_BLOCKS` (đặt trong file, copy nguyên văn — chú ý glyph `≥` = U+2265):**
```ts
export const PAYSLIP_BLOCKS: { title: string; keys: string[] }[] = [
  { title: "Lương cơ bản", keys: ["Lương cơ bản", "Công", "LCB theo ngày công"] },
  { title: "Thưởng + COM",  keys: ["Thưởng COM", "GMV", "GMV bán mới", "GMV giới thiệu", "GMV tái ký", "KPI", "Tỉ lệ đạt KPI", "% Com ≥100%"] },
  { title: "Phụ cấp",       keys: ["Hỗ trợ ăn trưa", "Tiền hỗ trợ máy tính", "Hỗ trợ tiền xe + PC trách nhiệm"] },
  { title: "Bảo hiểm",      keys: ["Bảo hiểm + note", "Bảo hiểm"] },   // sheet có thể là "Bảo hiểm" trơn → chấp cả 2
  { title: "Thuế + Bù tiền", keys: ["Khấu trừ thuế", "Thue_TNCN", "Thu_nhap_tinh_thue", "Giam_tru_ban_than", "Giam_tru_NPT", "Tong_thu_nhap", "Bù tiền", "Note"] },
  { title: "Tổng tiền",     keys: ["Tổng lương + thưởng", "Tổng lương", "Luong_thanh_toan (Net)"] },
];
const HEADER_KEYS = ["STT", "Name", "Chức danh"];
```

**Thuật toán render (không mất key):**
1. Với mỗi block: lọc `keys` có mặt trong `phieu` (skip undefined/rỗng) → render hàng `nhãn : giá trị`.
2. Sau 6 block: mọi key trong `phieu` KHÔNG thuộc `HEADER_KEYS` và KHÔNG thuộc bất kỳ block nào → gom vào block **"Khác"** (style xám). Đảm bảo 0 key thất lạc.
3. **Format tiền:** value là số → `formatVndNumber(n)` (`frontend/src/lib/vndFormat.ts`). Chuỗi/tỉ lệ → in thẳng.
4. **2 tầng:** nếu cả `truoc_thue` + `sau_thue` tồn tại cho code → tab/segmented 2 tầng; cột thuế append (snake_case) chỉ xuất hiện ở `sau_thue` — không lỗi khi vắng ở `truoc_thue`.
- UI block: `Card`/`CardHeader`/`CardBody` từ `frontend/src/components/ui/Card.tsx`.

### F8 · 2 nút hành động
- **Xác nhận** → `confirmPayslip(id)`; disable sau khi `confirm_status==="confirmed"`.
- **Yêu cầu xem xét lại** → `requestReview(id)`; **auto-disable từ mùng 4** tháng trả lương (tháng sau kỳ). FE tính giống BE `_review_locked` ([payroll_routes.py:58-69](backend/payroll_routes.py:58)): kỳ `YYYY-MM` → khóa khi `today (VN, UTC+7) >= mùng 4 tháng kế`. BE cũng chặn (409) — FE chỉ disable để UX, hiện tooltip "Đã qua hạn (khóa từ mùng 4)".
- Chỉ chủ phiếu thao tác được (BE `_require_owner` 403). FE: chỉ hiện 2 nút khi `payslip.code === profile.ma_nv` (nếu `profile` có `ma_nv`; nếu không có field, cứ hiện — BE là chốt chặn cuối).
- Sau mỗi action: cập nhật state từ `res` trả về (không refetch cả list).

### F9 · Empty/error/RBAC contract (xử lý đúng theo BE)
| Case | BE hành vi | FE |
|---|---|---|
| Sale chưa có `ma_nv` | `visible_payslip_codes` → `[]` → list rỗng | empty "Chưa được gán mã NV — liên hệ HR" |
| Không có phiếu kỳ này | list rỗng | empty "Chưa có phiếu kỳ này" |
| Mở phiếu ngoài quyền | `GET /{id}` → **403** (không phải 404) | banner "Không có quyền xem phiếu này" |
| Token hết hạn | 401 | interceptor/redirect login (đã có) |
- `resolve_actor` trả `Actor{email,user_id,role,staff,department,is_activated}`. `role∈sale/ops/leader/manager/system`. `ops`+`system` → xem hết (`None`).

---

## Data task (song song, KHÔNG chặn FE code)

### N2 · Backfill `nhan_su_sale.ma_nv`
- Auto-match email → mã NV từ BQ `C_raw_staff_info_merged` (có sẵn email↔code). Script/SQL update `nhan_su_sale.ma_nv WHERE email = ...`.
- **Để verify FE:** chỉ cần set `ma_nv` cho 1 user test (vd email test → `"HN0001"`) rồi seed phiếu code `"HN0001"`. Backfill toàn bộ có thể làm sau.

---

## Seed + Verify (sandbox)

**Base:** `https://palfish-gmv-api-sandbox.onrender.com` · **Token:** lấy `GATE_TOKEN` từ Render sandbox (Settings → Environment).

**Seed 2 tầng cho 1 code** (thay `<TOKEN>`):
```bash
curl -X POST https://palfish-gmv-api-sandbox.onrender.com/api/payroll/payslips/receive \
  -H "X-Gate-Token: <TOKEN>" -H "Content-Type: application/json" \
  -d '{"meta":{"source":"sheet-gate","version":1,"code":"HN0001","ky_luong":"2026-07","stage":"truoc_thue"},"phieu":{"Name":"Nguyễn Văn A","Chức danh":"Sale IH1","Lương cơ bản":15000000,"Công":24,"LCB theo ngày công":15000000,"Thưởng COM":2000000,"GMV":220000000,"KPI":160000000,"Tỉ lệ đạt KPI":"137%","% Com ≥100%":"6%","Hỗ trợ ăn trưa":660000,"Tiền hỗ trợ máy tính":700000,"Bảo hiểm + note":-1725000,"Tổng lương + thưởng":18295000,"Tổng lương":18295000}}'
```
Lặp lại `stage:"sau_thue"` + thêm keys `Khấu trừ thuế`, `Bù tiền`, `Luong_thanh_toan (Net)`.

**Loop verify:** seed → FE `.env.local` = `VITE_API_BASE_URL=https://palfish-gmv-api-sandbox.onrender.com` (copy `frontend/.env.sandbox.example`) → `cd frontend && npm run dev` → login user có `ma_nv="HN0001"` → mở tab Phiếu lương → thấy card → re-auth → 6 block render đúng → bấm Xác nhận / Yêu cầu xem lại.

---

## Chốt cửa trước push
```bash
cd frontend && npx tsc -b        # PHẢI pass (build mode, stricter)
cd frontend && npm run test      # unit
cd frontend && npm run build     # Vercel-identical
```
- Cập nhật **`MODULES.md`** — thêm section "13. Phiếu lương (M4)": FE `frontend/src/components/payslip/*` + `lib/api/payroll.ts` + `types/payroll.ts`; BE `backend/payroll_routes.py` + `rbac.py`; migration `2026-08-14-payslips-m4*.sql`; Gate `docs/apps-script/PhieuLuongGate.gs`.
- Sau khi xong: chạy skill `extract-approach` (Learning Law).

---

## HOLD — chờ Trang / prod (ngoài scope FE này)
- Nối Gate thật (`appEndpoint`+`gateToken` trong `PhieuLuongGate.gs`) → go-live.
- Ghi ngược app→Sheet cột "NV xác nhận".
- Help docs (`content/help/payslip/`) + `moduleLabels.ts` — hoãn (docs cần ảnh, không block chức năng). **KHÔNG chèn HdsdLink** trong PayslipTab lần này.
- Deploy prod (sau sandbox sạch + đối soát lệch = 0).

---

## Thứ tự + ước lượng
| Task | Phụ thuộc | Ước lượng |
|---|---|---|
| F1 (RBAC 4 file) · F2 types · F3 api | không | 0,5 ngày |
| F4 wiring · F5 re-auth | sau F1-F3 | 0,5 ngày |
| F6 list · F7 6-block · F8 nút | sau F4-F5 | 1 ngày |
| F9 edge + mobile + seed verify | sau F6-F8 | 0,5 ngày |
| N2 backfill (song song) | độc lập | 0,5 ngày |

**~2,5 ngày-dev sandbox.** Go-live chờ Trang bật Gate.

## 5 tiêu chí ✓
Triệt để (chạy độc lập, spec chốt) · Không lỗi con (6 chỗ wiring + RBAC 4 file + fallback "Khác" + 403 vs 404 + auto-khóa mùng 4 + re-auth TTL) · Không tăng hạ tầng (FastAPI+Supabase+axios sẵn) · Tối ưu token (path:line + const inline, trỏ spec 1 chỗ) · Bền qua compact (mỗi task self-contained: file, key byte-exact, shape, verify).

*v1 (17/8) — hardened từ recon 8 investigator: bít gap BE-permission, key byte-exact, re-auth safety, RBAC empty-state, full wiring checklist.*
