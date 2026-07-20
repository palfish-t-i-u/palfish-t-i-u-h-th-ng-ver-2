# SĐT chuẩn "đầu số-đuôi số" toàn app — hiển thị, tìm kiếm, smart input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SĐT hiển thị thống nhất `84-396249966` (format công ty) ở mọi chỗ trong app; tìm kiếm ăn mọi biến thể (`84-x`, `84x`, `0x`, `x`); ô nhập SĐT ở tạo/sửa PR có smart-paste + tự chuẩn hóa như màn kích hoạt (chặn data bẩn kiểu đầu số dính `84` từ gốc).

**Architecture:** 1 util search thuần (`phoneSearchDigits`/`phoneMatchesQuery` — so digits 2 chiều) cắm vào 2 chỗ search; 1 util display (`formatPhoneIntl` — mirror BE `format_phone_intl` nhưng dùng `findCountry` 248 nước) thay toàn bộ chỗ render SĐT; BE chỉ thêm cột `country` vào payload candidates (additive); smart input tái dùng nguyên `phoneUtils.ts` sẵn có (18/7) qua helper chung `applySmartPhoneInput`.

**Tech Stack:** React 19 + TS (Vitest), FastAPI (không thêm endpoint — chỉ mở rộng payload).

**Commit policy:** User preference (feedback_squash_commits) override skill: KHÔNG commit lẻ từng task — 1 commit duy nhất ở Task 7 sau khi mọi gate pass.

---

## Bối cảnh (điều tra 20/7, line numbers tại commit 8e0b902)

| Vấn đề | Vị trí | Hiện trạng |
|---|---|---|
| Card gợi ý ghép hiện đuôi trần `396249966` | `frontend/src/components/ReconciliationTab.tsx:1764` + BE `backend/sepay_routes.py:1016` | BE trả `pr_phone` raw, không kèm country |
| Search tab Quản lý thanh toán trượt `84-x` | `frontend/src/components/payment-request/paymentRequestUtils.ts:18-30` (`paymentRequestMatchesSearch`) | `normVi(...).includes` — dấu `-` + đầu số `84` không khớp đuôi trong DB |
| Search modal ghép trượt `84-x` | `ReconciliationTab.tsx:482-495` (`filteredBankCandidates`) | raw `.toLowerCase().includes` |
| Display lệch format + double đầu số | `PaymentRequestTable.tsx:246`, `PrRowCards.tsx:81`, `PaymentRequestDetailDrawer.tsx:2005`, `ReconciliationTab.tsx:175,1505` | `{dial} {fmtPhone(phone)}` — phone dính sẵn `84` → "+84 8490 476 9355" |
| `formatCoursePhone` sai nước lạ | `paymentRequestUtils.ts:741-746` + `COUNTRY_DIALS:87-99` (11 nước) | Khách DE → fallback +84 SAI |
| BE `_COUNTRY_DIAL_CODE` cũng cụt (10 nước, thiếu DE) | `backend/utils/zalo_message_builder.py:83-86` | → KHÔNG dùng BE format cho card; BE chỉ trả `pr_country`, FE format |
| Ô nhập SĐT tạo PR + sửa PR không smart | `CreatePaymentRequestModal.tsx:162-171`, `PaymentRequestDetailDrawer.tsx:2140-2153` | Chỉ strip ký tự ≠ số → dán `84-352334789` thành `84352334789` dính đầu số (nguồn data bẩn) |
| Đã có sẵn smart logic (18/7) | `phoneUtils.ts` (`smartParsePhonePaste`, `normalizeLocalPhone`, `crmPhoneFormat`) — dùng ở AR rows `PaymentRequestDetailDrawer.tsx:2660-2700` | Tái dùng, KHÔNG viết lại |
| BE scoring "Khớp SĐT" | `sepay_routes.py:142-151` so 9 số cuối | ĐÃ robust — KHÔNG sửa |

## Guardrails (bắt buộc giữ)

1. **G11 (quyết định 18/7, giữ nguyên):** KHÔNG đoán đầu số từ chuỗi digits trần (`84987654321` dán không separator → giữ nguyên + cảnh báo đỏ, KHÔNG tự cắt `84`); cảnh báo KHÔNG chặn submit, KHÔNG sửa hộ ngoài rule bỏ-1-số-0 khớp mẫu của `normalizeLocalPhone`.
2. **Additive API, deploy-order độc lập:** BE chỉ THÊM field `pr_country` (không đổi/xóa field cũ). FE fallback: thiếu `pr_country` → hiển thị `pr_phone` raw như cũ. FE deploy trước hay BE deploy trước đều không vỡ.
3. **Search không phá hành vi cũ:** nhánh `normVi` includes giữ nguyên (mọi test cũ pass), chỉ THÊM nhánh OR số-điện-thoại; nhánh mới chỉ kích hoạt khi query "giống SĐT" (chỉ digits + separator) và ≥ 4 digits — search tên/PR-ID không bị ảnh hưởng.
4. **Display-only, không đổi data:** `formatPhoneIntl` chỉ đổi cách RENDER; DB giữ nguyên. Data bẩn cũ (2 PR dính `84`) hiển thị đúng nhờ util tự bỏ đầu số dính — KHÔNG backfill trong scope này (follow-up SQL riêng nếu cần).
5. **Sync 3 impl:** FE `formatPhoneIntl` mirror BE Python `format_phone_intl` + SQL `public.format_phone_intl` (semantics: strip non-digits → lstrip toàn bộ `0` → cắt dial nếu dính VÀ phần còn lại > 5 ký tự → `{dial}-{đuôi}`). Ghi comment chéo ở cả 3 phía khi sửa.
6. **`tsc -b`** (không phải `--noEmit`) trước mọi push.

---

### Task 1: Util search `phoneMatchesQuery` (TDD)

**Files:**
- Create: `frontend/src/lib/phoneSearch.ts`
- Create: `frontend/src/lib/phoneSearch.test.ts`

- [ ] **Step 1: Viết test fail trước**

```ts
// frontend/src/lib/phoneSearch.test.ts
import { describe, it, expect } from "vitest";
import { phoneMatchesQuery, phoneSearchDigits } from "./phoneSearch";

describe("phoneSearchDigits", () => {
  it("bỏ mọi ký tự ≠ số + toàn bộ số 0 đầu", () => {
    expect(phoneSearchDigits("+84 396-249.966")).toBe("84396249966");
    expect(phoneSearchDigits("0396249966")).toBe("396249966");
    expect(phoneSearchDigits("")).toBe("");
    expect(phoneSearchDigits(null)).toBe("");
  });
});

describe("phoneMatchesQuery", () => {
  const PHONE = "396249966"; // đuôi số như DB lưu

  it("query format công ty 84-đuôi → khớp", () => {
    expect(phoneMatchesQuery(PHONE, "84-396249966")).toBe(true);
  });
  it("query 84 dính liền → khớp", () => {
    expect(phoneMatchesQuery(PHONE, "84396249966")).toBe(true);
  });
  it("query có số 0 đầu → khớp", () => {
    expect(phoneMatchesQuery(PHONE, "0396249966")).toBe(true);
  });
  it("query +84 với space → khớp", () => {
    expect(phoneMatchesQuery(PHONE, "+84 396 249 966")).toBe(true);
  });
  it("phone trong DB dính sẵn 84 (data bẩn), query dạng 0x → khớp", () => {
    expect(phoneMatchesQuery("84904769355", "0904769355")).toBe(true);
  });
  it("phone trong DB dạng '+84 9889 739 96' (model FE có space) → khớp query 84-x", () => {
    expect(phoneMatchesQuery("+84 9889 739 96", "84-988973996")).toBe(true);
  });
  it("substring ≥4 digits vẫn khớp (giữ hành vi tìm 1 phần số)", () => {
    expect(phoneMatchesQuery(PHONE, "9624")).toBe(true);
  });
  it("query < 4 digits → KHÔNG khớp (tránh '84' match mọi số)", () => {
    expect(phoneMatchesQuery(PHONE, "84")).toBe(false);
  });
  it("query có chữ (không phải dạng SĐT) → KHÔNG khớp nhánh này", () => {
    expect(phoneMatchesQuery(PHONE, "PR-2026")).toBe(false);
    expect(phoneMatchesQuery(PHONE, "chi thuong")).toBe(false);
  });
  it("số khác → KHÔNG khớp", () => {
    expect(phoneMatchesQuery(PHONE, "84-999999999")).toBe(false);
  });
  it("phone rỗng/null → KHÔNG khớp", () => {
    expect(phoneMatchesQuery("", "84-396249966")).toBe(false);
    expect(phoneMatchesQuery(null, "84-396249966")).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy — phải FAIL**

Run: `cd frontend && npm run test -- src/lib/phoneSearch.test.ts`
Expected: FAIL — `Cannot find module './phoneSearch'`

- [ ] **Step 3: Implement**

```ts
// frontend/src/lib/phoneSearch.ts
/**
 * So khớp SĐT cho search — chấp mọi biến thể format công ty "đầu số-đuôi số"
 * (84-396249966 / 84396249966 / 0396249966 / +84 396 249 966) lẫn data bẩn
 * trong DB (đuôi trần, dính đầu số, có space).
 *
 * Nguyên tắc: đưa CẢ 2 phía về chuỗi digits (bỏ separator + toàn bộ số 0 đầu)
 * rồi so CHỨA 2 CHIỀU — không cần biết đầu số nước nào:
 *   query "84396249966" ⊇ phone "396249966" ✓ · phone "84904769355" ⊇ query "904769355" ✓
 *
 * Guard: chỉ kích hoạt khi query "giống SĐT" (digits + separator, không chữ)
 * và ≥ MIN_PHONE_QUERY_DIGITS — search tên/PR-ID không rơi vào nhánh này.
 */
const MIN_PHONE_QUERY_DIGITS = 4;
const PHONE_LIKE_QUERY = /^[+\d][\d\s().-]*$/;

export function phoneSearchDigits(s?: string | null): string {
  return (s || "").replace(/\D/g, "").replace(/^0+/, "");
}

export function phoneMatchesQuery(phone: string | null | undefined, rawQuery: string): boolean {
  const q = (rawQuery || "").trim();
  if (!PHONE_LIKE_QUERY.test(q)) return false;
  const qd = phoneSearchDigits(q);
  const pd = phoneSearchDigits(phone);
  if (!qd || !pd || qd.length < MIN_PHONE_QUERY_DIGITS) return false;
  return pd.includes(qd) || qd.includes(pd);
}
```

- [ ] **Step 4: Chạy lại — phải PASS**

Run: `cd frontend && npm run test -- src/lib/phoneSearch.test.ts`
Expected: PASS (12 tests)

---

### Task 2: Cắm search vào 2 chỗ

**Files:**
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts:18-30`
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.search.test.ts`
- Modify: `frontend/src/components/ReconciliationTab.tsx:482-495`

- [ ] **Step 1: Test fail — thêm vào cuối `paymentRequestUtils.search.test.ts` (dùng helper `makePr` sẵn có đầu file)**

```ts
describe("paymentRequestMatchesSearch — SĐT format đầu số-đuôi số (20/7)", () => {
  // makePr default: phone "+84 9889 739 96", country "VN"
  it("khớp 84-đuôi / 84 dính / 0 đầu / +84 space", () => {
    const pr = makePr({ phone: "396249966" });
    expect(paymentRequestMatchesSearch(pr, "84-396249966")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "84396249966")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "0396249966")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "+84 396 249 966")).toBe(true);
  });
  it("phone model FE có sẵn '+84 ... space' vẫn khớp 84-x", () => {
    const pr = makePr(); // "+84 9889 739 96"
    expect(paymentRequestMatchesSearch(pr, "84-988973996")).toBe(true);
  });
  it("số khác → không khớp; query chữ không bị ảnh hưởng", () => {
    const pr = makePr({ phone: "396249966" });
    expect(paymentRequestMatchesSearch(pr, "84-999999999")).toBe(false);
    expect(paymentRequestMatchesSearch(pr, "chị nhung")).toBe(true); // nhánh cũ vẫn chạy
  });
});
```

Run: `cd frontend && npm run test -- src/components/payment-request/paymentRequestUtils.search.test.ts`
Expected: describe mới FAIL, describe cũ PASS

- [ ] **Step 2: Sửa `paymentRequestMatchesSearch`**

```ts
// đầu file thêm import:
import { phoneMatchesQuery } from "../../lib/phoneSearch";

// trong hàm — thêm 1 dòng cuối trước return cũ:
export function paymentRequestMatchesSearch(pr: PaymentRequest, rawQuery: string): boolean {
  const q = normVi(rawQuery.trim());
  if (!q) return true;
  const haystack: (string | null | undefined)[] = [
    pr.id,
    pr.name,
    pr.uid,
    pr.phone,
    pr.childName,
    ...(pr.children?.map((c) => c.name) ?? []),
  ];
  if (haystack.some((value) => normVi(value).includes(q))) return true;
  // SĐT: chấp format công ty đầu số-đuôi số (84-x / 84x / 0x) — xem lib/phoneSearch.ts
  return phoneMatchesQuery(pr.phone, rawQuery);
}
```

Run lại test file trên → PASS toàn bộ (cũ + mới).

- [ ] **Step 3: Sửa filter modal ghép — `ReconciliationTab.tsx:482-495`**

Đầu file thêm import: `import { phoneMatchesQuery } from "../lib/phoneSearch";`

```ts
  const filteredBankCandidates = useMemo(() => {
    const q = bankCandSearch.trim().toLowerCase();
    return bankCandidates.filter((c) => {
      if (bankCandStatus !== "all" && c.status !== bankCandStatus) return false;
      if (!inDateRange(c.created_at || "", bankCandRange)) return false;
      if (!q) return true;
      if (phoneMatchesQuery(c.pr_phone, bankCandSearch)) return true;
      return [
        c.pr_id, c.pr_name,
        c.pr_uid || "", c.pr_phone || "",
        c.child_name || "", c.sale_name || "", c.team_name || "",
        c.transfer_code,
      ].some((v) => v.toLowerCase().includes(q));
    });
  }, [bankCandidates, bankCandSearch, bankCandRange, bankCandStatus]);
```

- [ ] **Step 4: Gate**

Run: `cd frontend && npx tsc -b 2>&1 | grep -E "error TS" || echo TS-OK`
Expected: `TS-OK`

---

### Task 3: Util display `formatPhoneIntl` + thay `formatCoursePhone`/`fmtPhone` (TDD)

**Files:**
- Modify: `frontend/src/components/payment-request/phoneUtils.ts` (+`formatPhoneIntl`, +`applySmartPhoneInput`)
- Modify: `frontend/src/components/payment-request/phoneUtils.test.ts`
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts` (xóa `formatCoursePhone` + `COUNTRY_DIALS`; `fmtPhone` xóa nếu hết caller — verify Step 5)
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.test.ts:105-106` (xóa 2 test `formatCoursePhone`)

- [ ] **Step 1: Test fail — thêm vào `phoneUtils.test.ts`**

```ts
import { smartParsePhonePaste, normalizeLocalPhone, crmPhoneFormat, formatPhoneIntl, applySmartPhoneInput } from "./phoneUtils";

describe("formatPhoneIntl — format công ty đầu số-đuôi số (20/7)", () => {
  it("VN sạch", () => {
    expect(formatPhoneIntl("VN", "396249966")).toBe("84-396249966");
  });
  it("data bẩn dính đầu số 84 → tự bỏ (fix double +84)", () => {
    expect(formatPhoneIntl("VN", "84904769355")).toBe("84-904769355");
  });
  it("số 0 đầu → bỏ (mirror BE lstrip)", () => {
    expect(formatPhoneIntl("VN", "0352334789")).toBe("84-352334789");
  });
  it("model FE có sẵn '+84 ... space'", () => {
    expect(formatPhoneIntl("VN", "+84 9889 739 96")).toBe("84-988973996");
  });
  it("nước ngoài map đầy đủ (DE +49 — COUNTRY_DIALS cũ thiếu)", () => {
    expect(formatPhoneIntl("DE", "1727552989")).toBe("49-1727552989");
  });
  it("US format ký tự rác", () => {
    expect(formatPhoneIntl("US", "(415) 555-0131")).toBe("1-4155550131");
  });
  it("country thiếu → fallback VN; phone rỗng → rỗng", () => {
    expect(formatPhoneIntl(undefined, "396249966")).toBe("84-396249966");
    expect(formatPhoneIntl("VN", "")).toBe("");
    expect(formatPhoneIntl("VN", null)).toBe("");
  });
  it("KHÔNG cắt dial khi phần còn lại quá ngắn (≤5)", () => {
    expect(formatPhoneIntl("VN", "84846")).toBe("84-84846");
  });
});

describe("applySmartPhoneInput", () => {
  it("dán 84-352334789 → tách dial + set country VN", () => {
    expect(applySmartPhoneInput("84-352334789")).toEqual({ phone: "352334789", countryCode: "VN" });
  });
  it("dán +420 777710688 → CZ", () => {
    expect(applySmartPhoneInput("+420 777710688")).toEqual({ phone: "777710688", countryCode: "CZ" });
  });
  it("digits trần KHÔNG đoán (G11)", () => {
    expect(applySmartPhoneInput("84987654321")).toEqual({ phone: "84987654321" });
  });
});
```

Run: `cd frontend && npm run test -- src/components/payment-request/phoneUtils.test.ts`
Expected: FAIL — `formatPhoneIntl` / `applySmartPhoneInput` not exported

- [ ] **Step 2: Implement trong `phoneUtils.ts`**

```ts
/** Format hiển thị chuẩn công ty: "84-396249966" (đầu số-đuôi số).
 *  MIRROR của BE Python `utils/zalo_message_builder.py::format_phone_intl` và SQL
 *  `public.format_phone_intl` (migration 2026-07-04) — sửa semantics phải sync 3 nơi.
 *  Khác BE: dùng findCountry (248 nước, generated) thay map tay cụt → khách DE/CZ... đúng dial.
 *  - bỏ ký tự ≠ số → bỏ TOÀN BỘ số 0 đầu → nếu dính sẵn dial VÀ phần còn lại > 5 ký tự thì cắt dial. */
export function formatPhoneIntl(countryCode: string | null | undefined, raw: string | null | undefined): string {
  const digitsAll = (raw || "").replace(/\D/g, "");
  if (!digitsAll) return "";
  const dial = findCountry(countryCode).dial.replace("+", "");
  let digits = digitsAll.replace(/^0+/, "");
  if (digits.startsWith(dial) && digits.length > dial.length + 5) {
    digits = digits.slice(dial.length);
  }
  return `${dial}-${digits}`;
}

/** Handler chung cho ô nhập SĐT (tạo PR / sửa PR / AR row): smart-paste tách đầu số.
 *  Trả countryCode khi nhận diện được (có separator + dial tồn tại — G11), caller set country. */
export function applySmartPhoneInput(raw: string): { phone: string; countryCode?: string } {
  const parsed = smartParsePhonePaste(raw);
  if (parsed.dial) {
    const c = COUNTRIES.find((x) => x.dial === `+${parsed.dial}`);
    return { phone: parsed.local, ...(c ? { countryCode: c.code } : {}) };
  }
  return { phone: parsed.local };
}
```

Import đầu file `phoneUtils.ts` đổi thành: `import { COUNTRIES, findCountry, type Country } from "./CountryCombo";`

Run test file → PASS.

- [ ] **Step 3: Thay 6 call site display** (giữ flag emoji nơi đang có)

| File:line | Cũ | Mới |
|---|---|---|
| `PaymentRequestTable.tsx:246` | `{country.dial} {fmtPhone(p.phone)}` | `{formatPhoneIntl(p.country, p.phone)}` |
| `PrRowCards.tsx:81` | `` `${country.flag} ${country.dial} ${fmtPhone(p.phone)}` `` | `` `${country.flag} ${formatPhoneIntl(p.country, p.phone)}` `` |
| `PaymentRequestDetailDrawer.tsx:2005` | `{country.dial} {fmtPhone(request.phone)}` | `{formatPhoneIntl(request.country, request.phone)}` |
| `PaymentRequestDetailDrawer.tsx:1021` | `{formatCoursePhone(u.country, u.phone)}` | `{formatPhoneIntl(u.country, u.phone)}` |
| `ReconciliationTab.tsx:175` | `{country.flag} {country.dial} {fmtPhone(pr.phone)}` | `{country.flag} {formatPhoneIntl(pr.country, pr.phone)}` |
| `ReconciliationTab.tsx:1505` | `UID {pr.uid} · {country.flag} {country.dial} {fmtPhone(pr.phone)}` | `UID {pr.uid} · {country.flag} {formatPhoneIntl(pr.country, pr.phone)}` |

Mỗi file: đổi import `fmtPhone`/`formatCoursePhone` (từ `paymentRequestUtils`) → `formatPhoneIntl` (từ `./phoneUtils` hoặc `./payment-request/phoneUtils` tùy vị trí file).

- [ ] **Step 4: Xóa code chết ở `paymentRequestUtils.ts`**

Xóa `formatCoursePhone` (dòng 741-746) + `COUNTRY_DIALS` (dòng 87-99). Xóa 2 test dòng 105-106 trong `paymentRequestUtils.test.ts` + bỏ `formatCoursePhone` khỏi import của test đó.

- [ ] **Step 5: Verify `fmtPhone` hết caller rồi mới xóa**

Run: `cd frontend && grep -rn "fmtPhone" src/ --include="*.ts" --include="*.tsx" | grep -v "formatPhoneIntl"`
Expected: chỉ còn định nghĩa tại `paymentRequestUtils.ts:734` (+ export). Nếu đúng → xóa `fmtPhone` + mọi import còn sót. Nếu còn caller khác → GIỮ `fmtPhone`, chỉ báo lại trong summary.

- [ ] **Step 6: Gate**

Run: `cd frontend && npx tsc -b 2>&1 | grep -E "error TS" || echo TS-OK` → `TS-OK`
Run: `cd frontend && npm run test -- src/components/payment-request/ 2>&1 | grep -E "Test Files|FAIL"` → không FAIL

---

### Task 4: BE trả `pr_country` + card modal hiển thị `84-đuôi số`

**Files:**
- Modify: `backend/sepay_routes.py:930,940,1011-1029`
- Modify: `frontend/src/lib/api.ts:605-611` (interface `BankMatchCandidate`)
- Modify: `frontend/src/components/ReconciliationTab.tsx:1764`

- [ ] **Step 1: BE — thêm `country` vào 2 câu select PR (dòng 930 + 940 — cả nhánh chính lẫn fallback)**

```python
# dòng 930:
.select("id, name, uid, phone, country, child_name, sale_email, state")
# dòng 940 (fallback):
.select("id, name, uid, phone, country, child_name, sale_email")
```

- [ ] **Step 2: BE — thêm field vào payload candidate (sau dòng `"pr_phone": ...` tại 1016)**

```python
                "pr_phone": pr.get("phone", ""),
                "pr_country": pr.get("country", "") or "",
```

Lưu ý: KHÔNG dùng `format_phone_intl` của BE ở đây — map dial BE cụt (10 nước, thiếu DE); FE format bằng nguồn 248 nước. Không sửa `_score_candidate` (đã so 9 số cuối, robust với đầu số dính).

- [ ] **Step 3: BE test nhanh syntax**

Run: `cd backend && python -c "import ast; ast.parse(open('sepay_routes.py', encoding='utf-8').read()); print('SYNTAX-OK')"`
Expected: `SYNTAX-OK`
(Payload build nằm trong route fn phụ thuộc Supabase — không unit-test riêng; guardrail #2 cover bằng FE fallback test ở Step 5.)

- [ ] **Step 4: FE — type + render card**

`api.ts` interface `BankMatchCandidate` thêm sau `pr_phone?: string;`:

```ts
  /** Mã nước PR (vd "VN", "DE") — BE thêm 20/7; optional để FE cũ/BE cũ không vỡ. */
  pr_country?: string;
```

`ReconciliationTab.tsx:1764` đổi:

```tsx
{c.pr_phone ? <> · {c.pr_country ? formatPhoneIntl(c.pr_country, c.pr_phone) : c.pr_phone}</> : null}
```

(Fallback raw khi BE chưa deploy — guardrail #2.)

- [ ] **Step 5: Test fallback — thêm vào `phoneUtils.test.ts`**

```ts
describe("card candidate — fallback khi BE chưa trả pr_country (guardrail additive)", () => {
  it("có pr_country → format 84-x; thiếu → giữ raw", () => {
    const withCountry = { pr_phone: "396249966", pr_country: "VN" };
    const without = { pr_phone: "396249966", pr_country: undefined as string | undefined };
    const render = (c: { pr_phone: string; pr_country?: string }) =>
      c.pr_country ? formatPhoneIntl(c.pr_country, c.pr_phone) : c.pr_phone;
    expect(render(withCountry)).toBe("84-396249966");
    expect(render(without)).toBe("396249966");
  });
});
```

Run: `cd frontend && npm run test -- src/components/payment-request/phoneUtils.test.ts` → PASS

- [ ] **Step 6: Gate** — `cd frontend && npx tsc -b` → pass

---

### Task 5: Smart input SĐT ở TẠO PR (CreatePaymentRequestModal)

**Files:**
- Modify: `frontend/src/components/payment-request/CreatePaymentRequestModal.tsx:154-176` (khối phone) + imports
- Modify: `frontend/src/components/payment-request/CreatePaymentRequestModal.test.tsx`

- [ ] **Step 1: Component test fail — thêm vào `CreatePaymentRequestModal.test.tsx` (theo pattern render sẵn có của file: `<CreatePaymentRequestModal open={true} onClose={onClose} onSubmit={onSubmit} />`; input SĐT là ô autoFocus, query bằng placeholder `987 654 321`)**

```tsx
describe("CreatePaymentRequestModal — smart SĐT (20/7)", () => {
  it("dán '84-352334789' → tự cắt đầu số, ô còn đuôi số", async () => {
    render(<CreatePaymentRequestModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    const phone = screen.getByPlaceholderText("987 654 321") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "84-352334789" } });
    expect(phone.value).toBe("352334789");
  });
  it("blur '0352334789' → tự bỏ số 0 đầu (khớp mẫu 9 số VN)", () => {
    render(<CreatePaymentRequestModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    const phone = screen.getByPlaceholderText("987 654 321") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "0352334789" } });
    fireEvent.blur(phone);
    expect(phone.value).toBe("352334789");
  });
  it("digits trần dính 84 → KHÔNG tự cắt (G11), hiện cảnh báo lệch độ dài", () => {
    render(<CreatePaymentRequestModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    const phone = screen.getByPlaceholderText("987 654 321") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "84987654321" } });
    fireEvent.blur(phone);
    expect(phone.value).toBe("84987654321"); // không đoán mò
    expect(screen.getByText(/SĐT chưa đúng/i)).toBeInTheDocument();
  });
  it("nhập đuôi hợp lệ → hiện preview 'Lưu dạng: 84-352334789'", () => {
    render(<CreatePaymentRequestModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    const phone = screen.getByPlaceholderText("987 654 321") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "352334789" } });
    expect(screen.getByText("84-352334789")).toBeInTheDocument();
  });
});
```

(Nếu file test hiện dùng `userEvent`/helper khác — dùng đúng helper đó, giữ assertion y nguyên. Placeholder thực tế render từ `findCountry("VN").exampleLocal` = `"987 654 321"`.)

Run: `cd frontend && npm run test -- src/components/payment-request/CreatePaymentRequestModal.test.tsx`
Expected: 4 test mới FAIL, test cũ PASS

- [ ] **Step 2: Implement — thay khối input SĐT (dòng 160-175) theo đúng pattern AR rows (drawer 2660-2700)**

Thêm import: `import { applySmartPhoneInput, normalizeLocalPhone, crmPhoneFormat } from "./phoneUtils";`

```tsx
              <div className="phone-row">
                <CountryCombo value={form.country} onChange={(v) => set("country", v)} />
                {(() => {
                  const country = findCountry(form.country);
                  const norm = normalizeLocalPhone(form.phone, country);
                  return (
                    <input
                      className="phone-input"
                      placeholder={country.exampleLocal}
                      value={form.phone}
                      onChange={(e) => {
                        const r = applySmartPhoneInput(e.target.value);
                        setForm((f) => ({ ...f, phone: r.phone, ...(r.countryCode ? { country: r.countryCode } : {}) }));
                      }}
                      onBlur={() => {
                        const n = normalizeLocalPhone(form.phone, findCountry(form.country));
                        if (n.value !== form.phone) set("phone", n.value);
                      }}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      autoFocus
                      style={norm.warn ? { borderColor: "var(--danger)" } : undefined}
                    />
                  );
                })()}
              </div>
              {(() => {
                const country = findCountry(form.country);
                const norm = normalizeLocalPhone(form.phone, country);
                return (
                  <div style={{ fontSize: 11.5, color: norm.warn ? "var(--danger)" : "var(--text-2)", fontWeight: 600, marginTop: 3 }}>
                    {norm.warn
                      ? "SĐT chưa đúng — vui lòng kiểm tra lại (độ dài lệch so với mẫu)"
                      : form.phone
                      ? <>Lưu dạng: <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{crmPhoneFormat(form.phone, country)}</span></>
                      : "Dán cả cụm (VD: 84-352334789) sẽ tự tách đầu số; hoặc chỉ nhập đuôi số"}
                  </div>
                );
              })()}
```

(Thay luôn dòng helper text cũ "Chỉ nhập phần số, không cần mã quốc gia". `canSubmit` GIỮ NGUYÊN — warn không chặn, G11.)

- [ ] **Step 3: Run test** → 4 mới + cũ PASS

---

### Task 6: Smart input SĐT ở SỬA PR (drawer edit) + refactor AR rows dùng helper chung

**Files:**
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:2137-2158` (edit draft) + `:2676-2688` (AR rows refactor) + import dòng 46

- [ ] **Step 1: Edit draft (dòng 2139-2153) — thay input**

```tsx
                  <div style={{ display: "flex", gap: 8 }}>
                    <CountryCombo value={draft.country} onChange={(v) => setDraft({ ...draft, country: v })} />
                    {(() => {
                      const country = findCountry(draft.country);
                      const norm = normalizeLocalPhone(draft.phone, country);
                      return (
                        <input
                          value={draft.phone}
                          onChange={(e) => {
                            const r = applySmartPhoneInput(e.target.value);
                            setDraft({ ...draft, phone: r.phone, ...(r.countryCode ? { country: r.countryCode } : {}) });
                          }}
                          onBlur={() => {
                            const n = normalizeLocalPhone(draft.phone, findCountry(draft.country));
                            if (n.value !== draft.phone) setDraft({ ...draft, phone: n.value });
                          }}
                          placeholder={country.exampleLocal}
                          style={{
                            flex: 1,
                            border: `1px solid ${norm.warn ? "var(--danger)" : "var(--border)"}`,
                            borderRadius: 8,
                            padding: "8px 10px",
                            font: "inherit",
                            fontSize: 13,
                          }}
                        />
                      );
                    })()}
                  </div>
                  {(() => {
                    const country = findCountry(draft.country);
                    const norm = normalizeLocalPhone(draft.phone, country);
                    return (
                      <div style={{ fontSize: 11.5, color: norm.warn ? "var(--danger)" : "var(--text-2)", fontWeight: 600, marginTop: 3 }}>
                        {norm.warn
                          ? "SĐT chưa đúng — vui lòng kiểm tra lại (độ dài lệch so với mẫu)"
                          : draft.phone
                          ? <>Lưu dạng: <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{crmPhoneFormat(draft.phone, country)}</span></>
                          : "Dán cả cụm (VD: 84-352334789) sẽ tự tách đầu số"}
                      </div>
                    );
                  })()}
```

(Xóa dòng helper text cũ "Chỉ nhập phần số..." 2155-2157. Import dòng 46 thêm `applySmartPhoneInput`.)

- [ ] **Step 2: AR rows (2676-2688) — thay onChange inline bằng helper (hành vi y hệt, bỏ trùng lặp)**

```tsx
                                onChange={(e) => {
                                  const r = applySmartPhoneInput(e.target.value);
                                  setArRow(i, { phone: r.phone, ...(r.countryCode ? { phoneCountry: r.countryCode } : {}) });
                                }}
```

(onBlur AR giữ nguyên. `applySmartPhoneInput` đã có unit test ở Task 3 — hành vi identical: cùng `smartParsePhonePaste` + cùng lookup COUNTRIES.)

- [ ] **Step 3: Gate**

Run: `cd frontend && npx tsc -b 2>&1 | grep -E "error TS" || echo TS-OK` → `TS-OK`
Run: `cd frontend && npm run test -- src/components/payment-request/ 2>&1 | grep -E "Test Files|FAIL"` → không FAIL

---

### Task 7: Validation tổng + MODULES.md + commit (1 commit duy nhất)

**Files:**
- Modify: `MODULES.md` (section 3-B1 + section 10)

- [ ] **Step 1: MODULES.md**

Section **3 › B1** — dòng "FE chi tiết" thêm `phoneUtils.ts` vào danh sách (sau `paymentRequestUtils.ts`).
Section **10 Shared/Core** — dòng "FE lib chung" thêm `phoneSearch.ts` (`phoneMatchesQuery` — search SĐT mọi biến thể đầu số-đuôi số) sau `vnPhone.ts`.

- [ ] **Step 2: Full gates (Tier 3)**

```bash
cd frontend && npx tsc -b                              # phải pass
cd frontend && npm run test 2>&1 | tail -5             # full Vitest — phải pass
cd frontend && npm run build 2>&1 | tail -3            # Vercel-identical
```

Nếu 1 gate fail 2 lần liên tiếp → DỪNG, báo output verbatim (loop budget của skill frontend-conventions).

- [ ] **Step 3: Commit — 1 commit gom (user preference squash)**

```bash
git add frontend/src/lib/phoneSearch.ts frontend/src/lib/phoneSearch.test.ts \
  frontend/src/components/payment-request/phoneUtils.ts frontend/src/components/payment-request/phoneUtils.test.ts \
  frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.test.ts \
  frontend/src/components/payment-request/paymentRequestUtils.search.test.ts \
  frontend/src/components/payment-request/CreatePaymentRequestModal.tsx frontend/src/components/payment-request/CreatePaymentRequestModal.test.tsx \
  frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx \
  frontend/src/components/payment-request/PaymentRequestTable.tsx frontend/src/components/payment-request/PrRowCards.tsx \
  frontend/src/components/ReconciliationTab.tsx frontend/src/lib/api.ts \
  backend/sepay_routes.py MODULES.md docs/superpowers/plans/2026-07-20-phone-intl-format-and-search.md
git commit -m "feat: SĐT chuẩn 84-đuôi số toàn app — hiển thị, tìm kiếm, smart input tạo/sửa PR

- formatPhoneIntl (FE, 248 nước) thay fmtPhone/formatCoursePhone — fix double đầu số + khách DE sai dial
- phoneMatchesQuery: search ăn 84-x / 84x / 0x / +84 space ở tab Quản lý thanh toán + modal ghép CK ngoài
- BE candidates trả thêm pr_country (additive, FE fallback raw khi thiếu)
- Smart-paste + normalize SĐT (pattern AR 18/7, G11 giữ nguyên) vào tạo PR + sửa PR"
```

- [ ] **Step 4: Chạy skill `extract-approach`** nếu quá trình lộ trap mới (Learning Law) — ứng viên: "3 impl format_phone_intl phải sync", "map dial tay cụt vs generated data".

---

## Deploy notes

- **Thứ tự an toàn:** FE (Vercel auto theo branch) và BE (Render — `bash scripts/deploy.sh`, auto-deploy OFF) độc lập nhờ guardrail #2. Deploy FE trước cũng được (card fallback raw đến khi BE lên).
- **Không migration DB.** Không backfill data bẩn (2 PR dính `84` hiển thị đã đúng nhờ util; muốn sạch DB → follow-up SQL riêng, ngoài scope).

## Test coverage tổng

| Lớp | File | Cover |
|---|---|---|
| Search util | `lib/phoneSearch.test.ts` (mới) | 12 cases: mọi biến thể + guard min-4 + phone-like + 2 chiều |
| Search PR tab | `paymentRequestUtils.search.test.ts` | +3 describe cases; cũ giữ nguyên pass |
| Display util | `phoneUtils.test.ts` | +8 formatPhoneIntl (bẩn 84, số 0, DE, fallback) + 3 applySmartPhoneInput + 1 fallback card |
| Create modal | `CreatePaymentRequestModal.test.tsx` | +4: paste tách dial, blur bỏ 0, G11 không đoán + warn, preview 84-x |
| Drawer edit + AR | dùng helper đã test (`applySmartPhoneInput`) — wiring 3 dòng | qua tsc + full suite |
| BE | syntax check; scoring không đổi (test `test_sepay_match_candidates.py` sẵn có pass) | additive select |
