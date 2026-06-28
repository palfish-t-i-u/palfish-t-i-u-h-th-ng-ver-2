# Migration: Vietnam Provinces Dropdown — External API → Static JSON

**Ngày**: 2026-06-28
**Tác giả**: AI brainstorm với anh Minh
**Trạng thái**: Design approved — chờ writing-plans
**Liên quan**: [[address-dropdown-provinces-api]], [[invoice-address-required-rule]]

## Bối cảnh

App GMV đang dùng external API `provinces.open-api.vn/api/v2` để load danh sách tỉnh + phường/xã cho form tạo / sửa Payment Request. Mỗi lần mở form: 1 fetch list 34 tỉnh, mỗi lần chọn tỉnh: 1 fetch list phường (~50-200 phường/tỉnh).

**Vấn đề hiện tại**:
1. Dependency external API — nếu API chết → user không điền địa chỉ được → block flow tạo PR (vì address là field required theo [[invoice-address-required-rule]]).
2. Không rõ API update theo nghị quyết nào — risk dữ liệu lệch sau sáp nhập 2025.
3. Tốc độ dropdown: 200-500ms/fetch.

**Phát hiện**: Repo `thanglequoc/vietnamese-provinces-database` release v4.0.0 (21/6/2026) chứa data 2 cấp đã cập nhật tới nghị quyết 30/2026/QH16 — 34 tỉnh, 3.321 phường/xã. Phát hành dưới dạng SQL/JSON/MongoDB, không có API.

## Mục tiêu

Migrate nguồn data từ external API sang static JSON bundled vào FE.

**Pass cả 3 tiêu chí** ([[feedback-3-criteria-for-solutions]]):
1. **Triệt để**: Bỏ hoàn toàn dependency external API
2. **Không lỗi con**: Combobox fallback sẵn cho legacy values; props component giữ nguyên → 2 caller không touch
3. **Không tăng gánh nặng**: Vercel +15KB/visit gzip (~0.05% free tier); Render+Supabase zero impact; **hiệu năng tăng** (bỏ 2 fetch 200-500ms → dropdown instant)

## Phạm vi

**Trong scope**:
- Tạo data file static + script lọc data
- Refactor `useProvinceWardSelect` hook trong `VietnamAddressFields.tsx` để dùng data tĩnh
- Xóa dead code `useVietnamAddress.ts` (không có import)
- Unit test data file + component
- E2E test happy path

**Out of scope**:
- Sửa BE (Render/Supabase) — migration FE-only
- Refactor `Combobox.tsx` (giữ nguyên fallback behavior)
- Fix bug Combobox onChange không fire khi free text không match (bug có sẵn, không phải do migration)
- Auto-update mechanism (GitHub Actions) — chốt manual update khi có nghị quyết mới

## Quyết định đã chốt

1. **Legacy values** (PR cũ có tên tỉnh trước sáp nhập như "Tỉnh Hà Tây"): preserve as-is. App đã hoạt động vậy sẵn — `Combobox.tsx:109` fallback hiển thị raw value khi không match options.
2. **JSON variant**: Custom minimal (~50KB raw). Tải bản full v4.0.0 → tự lọc bỏ tiếng Anh + slug + ID nội bộ → chỉ giữ `{provinces: [{code, name}], wardsByProvinceCode: {[code]: string[]}}` — khớp 100% data shape hiện tại của hook.
3. **Update mechanism**: Manual. Khi có nghị quyết mới → tải release mới → chạy lại script → commit.
4. **Approach**: Drop-in static module (Cách 1). Không lazy load, không hybrid API fallback.

## Kiến trúc

### Cấu trúc file

```
frontend/
├── src/
│   ├── data/
│   │   └── vnProvinces.ts          [MỚI] data tĩnh + version metadata
│   ├── components/
│   │   └── payment-request/
│   │       └── VietnamAddressFields.tsx   [SỬA] bỏ fetch, import data
│   └── hooks/
│       └── useVietnamAddress.ts    [XÓA] dead code (zero import từ .ts/.tsx)
└── scripts/
    └── build-vn-provinces.mjs      [MỚI] script lọc JSON v4.0.0 → vnProvinces.ts
```

**Convention**:
- `src/data/` — folder mới cho static data trong app
- `scripts/` — đã có (`deploy.sh`); thêm `.mjs` cạnh
- Data file ở `src/` → Vite tree-shake + minify vào bundle (không phải `public/` rời)

**Touch points không thay đổi**:
- `CreatePaymentRequestModal.tsx:293` (caller 1)
- `PaymentRequestDetailDrawer.tsx:2205` (caller 2)
- `Combobox.tsx` (giữ fallback logic raw value)

### Data file `frontend/src/data/vnProvinces.ts`

```ts
// Generated from vietnamese-provinces-database v4.0.0
// Source decree: 30/2026/QH16 (cập nhật cuối: 2026-04)
// Generated at: 2026-06-28T...
// DO NOT EDIT MANUALLY — run: node scripts/build-vn-provinces.mjs

export const VN_PROVINCES_VERSION = "v4.0.0";

export interface Province {
  code: number;
  name: string;
}

export const provinces: ReadonlyArray<Province> = [
  { code: 1, name: "Thành phố Hà Nội" },
  // ... 34 provinces, sorted theo locale "vi" bỏ prefix "Tỉnh"/"Thành phố"
];

export const wardsByProvinceCode: Readonly<Record<number, ReadonlyArray<string>>> = {
  1: ["Phường Ba Đình", "Phường Cầu Giấy", /* ... */],
  // ... 34 keys, mỗi key: array wards sorted locale "vi"
};
```

### Script `scripts/build-vn-provinces.mjs`

**Input**: JSON full từ release v4.0.0
- URL: `https://github.com/thanglequoc/vietnamese-provinces-database/releases/download/v4.0.0/vietnamese_provinces_database_v4.0.0_json.zip`
- Sau extract: `vietnamese_provinces_database.json` (~200KB raw)

**Pipeline**:
1. Download zip → extract JSON dùng `adm-zip` (thêm vào `devDependencies`, không vào FE bundle)
2. Parse JSON → array provinces, mỗi province có array wards
3. Transform → 2 cấu trúc đúng shape data file
4. Sort:
   - provinces theo `name` (locale "vi", bỏ prefix "Tỉnh"/"Thành phố")
   - wards theo `name` (locale "vi")
5. Emit TS file với header metadata + version
6. Sanity check:
   - Assert `provinces.length === 34`
   - Assert tổng wards ≥ 3.000
   - Fail → exit code 1, không ghi file
7. Log success: `✓ 34 provinces, 3.321 wards → vnProvinces.ts (52KB)`

**Cách chạy**:
```bash
node scripts/build-vn-provinces.mjs
# Hoặc thêm vào package.json:
npm run build:vn-provinces
```

**Khi nào chạy**: setup lần đầu; khi có nghị quyết sáp nhập mới (đổi URL release → chạy lại → commit).

**Dependencies**: Node built-in (`fs`, `path`, `https`) + `adm-zip` (devDependency).

### Refactor `VietnamAddressFields.tsx`

**Trước** (lines 1-47):

```ts
import { useEffect, useMemo, useState } from "react";
import Combobox from "../ui/Combobox";

interface Province { code: number; name: string; }

export function useProvinceWardSelect(province: string) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<string[]>([]);
  const [loadingWards, setLoadingWards] = useState(false);

  useEffect(() => {
    fetch("https://provinces.open-api.vn/api/v2/p/")
      .then((r) => r.json())
      .then((data: Province[]) => setProvinces(data))
      .catch(() => setProvinces([]));
  }, []);

  useEffect(() => {
    if (!province) { setWards([]); return; }
    const p = provinces.find((x) => x.name === province);
    if (!p) return;
    setLoadingWards(true);
    fetch(`https://provinces.open-api.vn/api/v2/p/${p.code}?depth=2`)
      .then((r) => r.json())
      .then((data: { wards?: { name: string }[] }) => {
        const names = (data.wards || []).map((w) => w.name);
        names.sort((a, b) => a.localeCompare(b, "vi"));
        setWards(names);
      })
      .catch(() => setWards([]))
      .finally(() => setLoadingWards(false));
  }, [province, provinces]);

  return { provinces, wards, loadingWards };
}
```

**Sau**:

```ts
import { useMemo } from "react";
import Combobox from "../ui/Combobox";
import { provinces, wardsByProvinceCode } from "../../data/vnProvinces";

export function useProvinceWardSelect(province: string) {
  const wards = useMemo<string[]>(() => {
    if (!province) return [];
    const p = provinces.find((x) => x.name === province);
    if (!p) return [];
    return wardsByProvinceCode[p.code] ?? [];
  }, [province]);

  return { provinces, wards, loadingWards: false as const };
}
```

**Thay đổi**:
- Bỏ `useState` cho provinces/wards/loadingWards
- Bỏ 2 `useEffect` fetch
- Bỏ `interface Province` local (đã export từ data file)
- Thêm import từ `../../data/vnProvinces`
- Đổi sang `useMemo` — wards tính sync từ province
- Giữ shape return `{provinces, wards, loadingWards}` → backward-compat với component caller dùng `loadingWards` ở dòng 72/106

**Component `VietnamAddressFields` (lines 49-119) giữ nguyên 100%**:
- Props giữ nguyên → 2 caller không sửa
- Sort province bằng `stripPrefix` + `localeCompare` (component dòng 74-79) giữ runtime — defensive nếu data file bị edit tay
- Sort wards: không có runtime sort trong component (sort cũ nằm trong hook fetch callback đã bị xóa). Data file pre-sort là nguồn duy nhất — đủ vì script luôn sort khi build

### Xóa dead code

**File xóa**: `frontend/src/hooks/useVietnamAddress.ts`

**Verify**: grep `useVietnamAddress` toàn repo:
- Chỉ có declaration file + 2 doc cũ (`CODEX_PROMPT_PAYMENT_REQUEST_UI.md:109`, `CHANGELOG.md:95`)
- **Không file `.ts/.tsx` nào import** → an toàn xóa

**Doc cũ**: giữ nguyên history, không rewrite.

## Test plan

### Unit test — `frontend/src/data/vnProvinces.test.ts` (mới)

- `provinces.length === 34`
- Mỗi province: `code: number` + `name: string`
- `wardsByProvinceCode` có key cho mọi province code
- Tổng wards ≥ 3.000
- Wards sorted (locale "vi")
- Sample check 3 tỉnh tiêu biểu (Hà Nội, TP.HCM, Đà Nẵng) — số phường khớp public reference

### Component test — `VietnamAddressFields.test.tsx` (sửa/mới)

- Render → 34 options trong province dropdown
- Chọn "Thành phố Hà Nội" → wards dropdown có data ngay (zero loading state)
- Province không tồn tại → wards rỗng, không crash
- Backward-compat: pass `province="Tỉnh Hà Tây"` (legacy) → Combobox hiển thị raw text

### E2E test (Playwright)

- Flow tạo PR mới: mở modal → chọn tỉnh → chọn phường → điền số nhà → save → reload → assert hiển thị đúng
- Flow edit PR cũ: mở drawer 1 PR đã có address → dropdown hiển thị giá trị cũ

### Manual smoke (sau deploy sandbox)

- Login `test.user@dev` (per [[sandbox-url]])
- Tạo PR mới: khách VN + khách OV
- Mở 5 PR cũ random → verify address hiển thị

### Performance verify

- DevTools Network tab → filter `provinces.open-api.vn` → assert **0 request**
- Bundle size diff < 20KB gzip (Vite build report)

## Rollback plan

- Migration đóng gói **1 commit atomic**: `feat(addr): migrate VN provinces to static JSON data`
- Bao gồm: new data file + new script + refactor component + delete dead code + test
- Nếu regression → `git revert <hash>` → push → Vercel auto deploy bản cũ (~2 phút)
- **Không cần feature flag** — code-only, zero DB schema change, zero user state migration

## Risk matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| JSON v4.0.0 thiếu phường mà PR cũ có | Trung | Thấp | Combobox.tsx:109 fallback raw text |
| Data có lỗi typo so với reality | Thấp | Trung | Manual sample check 3 tỉnh trong unit test |
| Script fail khi v4.1.0 release đổi schema | Thấp (≥2027+) | Thấp | Sanity check + defensive log |
| Bundle size lớn hơn ước lượng | Thấp | Thấp | Vite build report verify trước merge |
| Combobox onChange free-text bug trồi lên | Thấp | Thấp | Bug có sẵn, out of scope |

## Pre-merge checklist

1. `npx tsc -b` pass (strict project ref — per [[feedback_tsc_build_mode]])
2. `npm run build` pass (Vercel-identical)
3. `npm run test` pass
4. `npm run e2e` pass
5. Manual sandbox smoke test 15 phút

## Deploy sequence

1. Branch `feat/static-vn-provinces`
2. Push → sandbox auto deploy (per [[vercel-projects]])
3. Manual smoke test 15 phút
4. Merge `main` → production auto deploy
5. Monitor 24h: Sentry/console errors + user report

## Đánh giá tổng theo 3 tiêu chí

| Tiêu chí | Kết quả |
|---|---|
| **Triệt để** | ✅ Bỏ hoàn toàn dependency `provinces.open-api.vn` |
| **Không lỗi con** | ✅ Combobox fallback giữ PR legacy; props component không đổi → 2 caller không touch; dead code xóa zero impact |
| **Hạ tầng + hiệu năng** | ✅ Vercel +15KB/visit (~0.05% free tier); Render+Supabase 0; **hiệu năng tăng** (bỏ 2 fetch 200-500ms → dropdown instant) |

Pass cả 3.
