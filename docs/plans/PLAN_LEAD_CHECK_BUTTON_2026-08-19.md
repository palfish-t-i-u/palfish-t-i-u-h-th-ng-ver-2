# PLAN — Nút "Check" (icon kính lúp) tra lead thay thao tác blur

**Ngày:** 2026-08-19 · **Người thực thi:** Sonnet 4.6 · **Loại:** FE-only, không đụng backend/DB/API.

## 0. Bối cảnh & mục tiêu

Tính năng đối soát lead (LIVE prod 18/8) hiện **kích hoạt tra cứu bằng blur** (bấm chuột ra ngoài ô SĐT / ô SĐT gốc). Thao tác này kém trực quan, sale hay quên → không tra. **Mục tiêu:** thêm **nút Check icon kính lúp** (không chữ, hover ra tooltip) ở 3 vị trí để bấm là tra ngay. **Giữ nguyên** trigger blur cũ (không regression) — nút là đường trực quan bổ sung.

**Tái dùng 100% logic có sẵn** — nút chỉ gọi `lead.runCheck(...)` / `lead.runCheckSdtGoc(...)` đã có. KHÔNG thêm endpoint, KHÔNG thêm state, KHÔNG đụng backend/BQ/Supabase.

### 3 vị trí (theo yêu cầu Hiếu/Minh)
| # | Màn | Chỗ đặt nút | Hành động khi bấm |
|---|---|---|---|
| V1 | Modal Tạo PR | cuối `.phone-row` (sau ô số, ngay trước cột Tên KH) | tra lead theo SĐT chính |
| V2 | Bảng check lead (vàng) | cạnh ô "SĐT khách dùng lúc đăng ký" (ô co lại `flex:1`) | tra lead theo số gốc |
| V3 | Drawer Sửa PR | cuối flex-row ô SĐT (ô số `flex:1` tự co) | tra lead theo SĐT chính |

---

## 1. Milestones & tasks

### G1 — Component nút dùng chung
- **G1-T1 · Tạo `LeadCheckButton.tsx`** — nút icon-only tái dùng cho cả 3 vị trí.

### G2 — Gắn 3 vị trí
- **G2-T1 · V1 modal** — chèn nút vào `.phone-row` của `CreatePaymentRequestModal.tsx`.
- **G2-T2 · V2 bảng** — bọc ô SĐT-gốc + nút thành flex-row trong `LeadCheckBlock.tsx`.
- **G2-T3 · V3 drawer** — chèn nút vào flex-row ô SĐT (edit mode) của `PaymentRequestDetailDrawer.tsx`.

### G3 — Test & guardrail
- **G3-T1 · Unit** — test `LeadCheckButton` + test nút trong `LeadCheckBlock` gọi đúng handler.
- **G3-T2 · E2E** — cập nhật `docs-screenshots.spec.ts` bấm nút thay blur; thêm case reason-lock mở sau khi bấm Check.
- **G3-T3 · Verify** — `tsc -b` + full unit + e2e sandbox + mobile 375px không tràn ngang.

### G4 — Docs & truyền thông (triệt để)
- **G4-T1 · Re-capture ảnh** — chụp lại 4 ảnh HDSD (bảng giờ có nút 🔍).
- **G4-T2 · Sửa HDSD** — trang `doi-soat-lead.md`: đổi "bấm chuột ra ngoài ô" → "bấm nút 🔍 Check".
- **G4-T3 · Sửa tin nhắn sale** — cập nhật câu hướng dẫn bấm nút thay blur (đưa Minh duyệt).

---

## 2. Chi tiết kỹ thuật (self-contained)

### G1-T1 — `frontend/src/components/payment-request/LeadCheckButton.tsx` (MỚI)

```tsx
import Tooltip from "../ui/Tooltip";
import { Icons } from "./Icons";

interface Props {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;          // mặc định "Tra cứu lead trên hệ thống"
}

export default function LeadCheckButton({ onClick, disabled, loading, tooltip = "Tra cứu lead trên hệ thống" }: Props) {
  const off = disabled || loading;
  return (
    <Tooltip content={tooltip}>
      <button
        type="button"                                   // GUARDRAIL: không submit form
        onClick={onClick}
        disabled={off}
        aria-label={tooltip}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, flex: "0 0 auto",
          border: "1px solid var(--border)", borderRadius: 8,
          background: off ? "var(--gmv-bg, #f3f4f6)" : "var(--surface, #fff)",
          cursor: off ? "not-allowed" : "pointer",
          opacity: off ? 0.6 : 1,
        }}
      >
        <Icons.Search size={16} />
      </button>
    </Tooltip>
  );
}
```
- Icon = **`Icons.Search`** (kính lúp) — file `payment-request/Icons.tsx`. KHÔNG dùng `Icons.Check` (dấu ✓).
- Tooltip = shared `components/ui/Tooltip.tsx` (default export, portal) — hover hiện mô tả.
- `loading` → disable + mờ (đơn giản, khỏi spinner). Tuỳ chọn: đổi icon sang `Icons.RefreshCw` + CSS spin.
- Kiểm tra prop `size` của `Icons.*` — nếu `makeIcon` không nhận `size`, dùng wrapper `width/height` hoặc bỏ prop (đọc `Icons.tsx` xác nhận trước).
- Xác nhận `<Tooltip>` bọc được 1 child là `<button>` (đọc `ui/Tooltip.tsx` — prop `children`). Tooltip đặt trên WRAPPER (không phải trên button) → hover vẫn hiện được cả khi button `disabled` (button disabled có thể `pointer-events:none`).
- **Chốt tooltip:** mặc định `"Tra cứu lead trên hệ thống"`. Khi nút mờ (disabled), parent truyền tooltip giải thích lý do (xem V1/V3).

### G2-T1 — V1 modal `CreatePaymentRequestModal.tsx`
**Anchor:** `.phone-row` mở tại **dòng 227** (trong `.field-row` 222-278). Bên trong đã có `<CountryCombo>` + `<input className="phone-input">`.
- Chèn `<LeadCheckButton>` **ngay sau** `<input className="phone-input">` (vẫn trong `.phone-row`).
- `onClick`: dùng ĐÚNG call đã có ở dòng 246/308:
  ```tsx
  onClick={() => lead.runCheck(crmPhoneFormat(form.phone, findCountry(form.country)), form.uid)}
  ```
- `disabled`: `!isNewSource || form.phone.replace(/\D/g,"").length < 9` — (biến `isNewSource` có sẵn dòng 123). → nút mờ khi chưa chọn nguồn marketing hoặc SĐT chưa đủ 9 số.
- `tooltip`: enabled → `"Tra cứu lead trên hệ thống"`; disabled → `"Chọn nguồn Quảng cáo/Offline/KOC/Khác & nhập đủ SĐT"`.
- `loading`: `lead.leadCheck.status === "loading"`.
- **CSS guardrail:** đọc class `.phone-row` / `.phone-input` (grep trong `frontend/src`). Đảm bảo `.phone-input` có `flex:1` (hoặc thêm) để ô số tự co nhường nút, KHÔNG tràn ngang — nhất là mobile 375px.

### G2-T2 — V2 bảng `LeadCheckBlock.tsx`
**Anchor:** khối vàng "none", ô SĐT-gốc **dòng 91-98**. Hiện là `<label flex column>` chứa `<span>` + `<input>` full-width.
- Đổi cấu trúc: giữ `<span>` label; bọc `<input>` + `<LeadCheckButton>` trong 1 `<div style={{display:"flex", gap:6}}>`; cho `<input style={{...cũ, flex:1}}>`.
- `onClick` nút: `() => onSdtGocBlur(state.sdtGoc)` — tái dùng prop `onSdtGocBlur` (parent đã wire tới `runCheckSdtGoc`). KHÔNG cần thêm prop mới.
- `disabled`: `state.sdtGoc.replace(/\D/g,"").length < 9`.
- `loading`: `state.status === "loading"`.
- tooltip: `"Tra cứu lead trên hệ thống"` (thống nhất cả 3 vị trí).
- **GUARDRAIL reason-lock:** nút này gọi `runCheckSdtGoc` → set `sdtGocNotFound` → mở khoá dropdown lý do. Phải test: bấm Check số-gốc-không-có → dropdown lý do bật (giữ đúng chốt chặn Hiếu). Chi tiết lock: `sdtGocNotFound` + `reasonUnlocked` (dòng 84).

### G2-T3 — V3 drawer `PaymentRequestDetailDrawer.tsx`
**Anchor:** ô SĐT edit mode **dòng 2211-2247**, flex-row `<div style={{display:"flex", gap:8}}>` (dòng 2213) chứa `<CountryCombo>` + `<input style={{flex:1,...}}>`.
- Chèn `<LeadCheckButton>` **ngay sau** `<input>` (trong flex-row). Vì input đã `flex:1`, nút chèn vào là ô số **tự co** — KHÔNG cần thu nhỏ `CountryCombo` (nó là component dùng chung, đụng vào ảnh hưởng cả modal).
- `onClick`: call đã có ở dòng 2231/2376:
  ```tsx
  onClick={() => { lead.runCheck(crmPhoneFormat(draft.phone, findCountry(draft.country)), draft.uid ?? undefined); setLeadTouched(true); }}
  ```
  ⚠️ Nhớ `setLeadTouched(true)` (khớp guard leadTouched khi lưu).
- `disabled`: `!NEW_CHECK_SOURCES.has(draft.leadSource ?? "") || draft.phone.replace(/\D/g,"").length < 9`.
- `loading`: `lead.leadCheck.status === "loading"`.

---

## 3. Guardrails (bắt buộc)

1. **`type="button"`** trên nút — KHÔNG submit modal/drawer (bug kinh điển). Đã set trong G1-T1.
2. **Giữ nguyên blur** ở cả 3 chỗ — nút là bổ sung, không xoá `onBlur`/`onChange` cũ → không regression, E2E cũ không vỡ.
3. **KHÔNG sửa `CountryCombo`** — dùng chung modal+drawer; ô số `flex:1` tự co là đủ.
4. **KHÔNG thêm API / state / backend** — chỉ gọi `runCheck`/`runCheckSdtGoc` có sẵn (đúng tiêu chí "không tăng gánh nặng hạ tầng").
5. **Reason-lock còn nguyên** — nút V2 phải mở khoá dropdown lý do đúng như blur (test G3-T1/T2).
6. **Chống double-fire / dead click** — `disabled` khi SĐT <9 số / không phải new-source / đang `loading`.
7. **Accessibility** — `aria-label` trên nút icon-only (có trong G1-T1).
8. **Mobile 375px** — flex-row ô SĐT + nút KHÔNG tràn ngang (verify bằng mobile E2E có sẵn).
9. **Icon đúng** — `Icons.Search` (kính lúp), KHÔNG `Icons.Check`.

---

## 4. Test (G3)

### G3-T1 — Unit (Vitest + RTL)
- **`LeadCheckButton.test.tsx` (MỚI):** render → có `<button aria-label>` + icon; `disabled`/`loading` → `button.disabled=true`; click khi enabled → `onClick` gọi 1 lần; `type="button"` (không submit).
- **`LeadCheckBlock` test (thêm, hiện chưa có test component cho block):** ở trạng thái "none", render `<LeadCheckBlock state={...none...}>`, bấm nút Check → `onSdtGocBlur` được gọi với `state.sdtGoc`. (Mock props.)
- **`useLeadCheck.test.ts`** — KHÔNG đổi (vẫn gọi thẳng `runCheck`; vẫn xanh).
- Mock endpoint theo pattern có sẵn: `const lookup = vi.hoisted(() => vi.fn()); vi.mock("../../lib/api", () => ({ endpoints: { leads: { lookup } } }));`

### G3-T2 — E2E `frontend/e2e/docs-screenshots.spec.ts`
- Ở flow `doi-soat-lead`: sau khi điền SĐT + chọn Quảng cáo, có thể **bấm nút Check** thay vì dựa blur (dòng ~356). Case số-lạ (dòng 371-374): fill số mới → **bấm nút Check** (thay `getByPlaceholder("Họ và tên").click()`). Selector nút: `getByRole("button", { name: "Tra cứu lead trên hệ thống" })` (aria-label) trong khu vực bảng.
- Thêm assert: sau khi bấm Check ô SĐT-gốc với số không có → dropdown "Chọn lý do" **enabled** (reason-lock mở).
- Nếu giữ blur song song thì E2E cũ vẫn chạy được — chỉ cần thêm path bấm nút, không bắt buộc xoá blur-path.

### G3-T3 — Verify (chạy tuần tự, dừng ở lỗi đầu)
```bash
cd frontend && npx tsc -b
cd frontend && npx vitest run src/components/payment-request
cd frontend && npx playwright test e2e/docs-screenshots.spec.ts --config playwright.sandbox.config.ts -g "doi-soat-lead"
```
+ Mobile: `npx playwright test e2e/mobile-payment-drawer.spec.ts --config playwright.sandbox.config.ts` (không tràn ngang).

---

## 5. Docs & truyền thông (G4)
- **G4-T1:** chạy lại capture (script đã có) → 4 ảnh `doi-soat-lead-1..4.png` giờ có nút 🔍. `npx playwright test e2e/docs-screenshots.spec.ts --config playwright.sandbox.config.ts -g "doi-soat-lead"`.
- **G4-T2:** `frontend/src/content/help/paymentRequests/doi-soat-lead.md` — đổi mục "Kết quả VÀNG" bước 2: "bấm chuột ra chỗ trống bên ngoài ô" → "**bấm nút 🔍 (kính lúp) cạnh ô** để tra". Test HDSD phải xanh (`vitest run src/content/help`).
- **G4-T3:** cập nhật tin nhắn thông báo sale (câu bấm-ra-ngoài → bấm nút Check) — đưa Minh duyệt trước khi gửi.

---

## 6. Acceptance checklist
- [ ] 3 vị trí có nút kính lúp, hover ra tooltip, bấm là tra ngay.
- [ ] Blur cũ vẫn hoạt động (không regression).
- [ ] Nút mờ đúng lúc (chưa new-source / SĐT <9 số / loading); không submit form.
- [ ] Reason-lock: bấm Check số-gốc-không-có → dropdown lý do mở.
- [ ] `CountryCombo` không bị đụng; modal/drawer/mobile không tràn ngang.
- [ ] `tsc -b` + unit + e2e sandbox + mobile đều xanh.
- [ ] HDSD + ảnh + tin nhắn cập nhật, test HDSD xanh.

---

## 7. Tự soát theo 5 tiêu chí
1. **Triệt để:** đủ 3 vị trí + docs + ảnh + tin nhắn; giữ reason-lock & blur.
2. **Không lỗi con:** guardrails (type=button, không đụng CountryCombo, mobile, a11y, double-fire) + test bao case.
3. **Không tăng hạ tầng:** FE-only, tái dùng `runCheck`/`runCheckSdtGoc`, 0 API/DB/backend mới.
4. **Tối ưu token:** 1 component dùng chung 3 chỗ; anchor file:line sẵn, Sonnet khỏi dò lại.
5. **Bền qua compact:** plan self-contained (snippet + anchor + call chính xác) — Sonnet đọc là làm được không cần hỏi lại.

## 8. Quyết định đã chốt (Minh, 19/8)
- **Blur:** GIỮ song song với nút (không bỏ). Sau này có feedback thấy nên bỏ thì mới bỏ — khi đó xoá blur-path + cập nhật E2E.
- **Tooltip:** `"Tra cứu lead trên hệ thống"` — thống nhất cả 3 vị trí (khi nút mờ thì hiện câu giải thích lý do disable, xem V1/V3).
