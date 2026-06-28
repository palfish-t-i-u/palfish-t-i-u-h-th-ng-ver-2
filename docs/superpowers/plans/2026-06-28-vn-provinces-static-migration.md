# VN Provinces Static Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Vietnam provinces dropdown data source from external API `provinces.open-api.vn` to bundled static JSON, eliminating external dependency while improving dropdown latency from 200-500ms to instant.

**Architecture:** Drop-in static module — generate `frontend/src/data/vnProvinces.ts` once from `vietnamese-provinces-database` v4.0.0 release via build script, refactor `useProvinceWardSelect` hook to read from module instead of fetching. Combobox's existing fallback logic (`Combobox.tsx:109`) preserves legacy values (e.g., "Tỉnh Hà Tây" PRs from before sáp nhập 2025).

**Tech Stack:** React 19 + Vite + TypeScript, Vitest unit tests, Playwright E2E, Node.js `adm-zip` (devDep only for build script).

**Spec:** [docs/superpowers/specs/2026-06-28-vn-provinces-static-migration-design.md](../specs/2026-06-28-vn-provinces-static-migration-design.md)

**Branch:** `feat/static-vn-provinces`

**Rollback:** Multiple TDD commits during dev → squash on merge to main per [[feedback_squash_commits]]. Result: 1 atomic commit on main; rollback = `git revert <hash>` → Vercel auto deploy bản cũ ~2 phút.

---

## Task 1: Branch + adm-zip devDependency

**Files:**
- Modify: `frontend/package.json` (add devDep)
- Modify: `frontend/package-lock.json` (lockfile)

- [ ] **Step 1.1: Create feature branch**

```bash
git checkout main
git pull
git checkout -b feat/static-vn-provinces
```

- [ ] **Step 1.2: Install adm-zip as devDependency**

```bash
cd frontend && npm install --save-dev adm-zip @types/adm-zip
```

Expected: `adm-zip` + `@types/adm-zip` appear in `devDependencies` of `frontend/package.json`. Verify FE bundle NOT affected (devDep only).

- [ ] **Step 1.3: Verify lockfile + package.json**

```bash
cd frontend && cat package.json | grep -A2 devDependencies | grep adm-zip
```

Expected: `"adm-zip": "^X.Y.Z"` line visible.

- [ ] **Step 1.4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): add adm-zip devDep for VN provinces build script"
```

---

## Task 2: Build script — `scripts/build-vn-provinces.mjs`

**Files:**
- Create: `scripts/build-vn-provinces.mjs`
- Modify: `frontend/package.json` (add `build:vn-provinces` script)

- [ ] **Step 2.1: Create script skeleton with download + extract**

Create `scripts/build-vn-provinces.mjs`:

```js
#!/usr/bin/env node
/**
 * Build static VN provinces data from vietnamese-provinces-database release.
 * Run: node scripts/build-vn-provinces.mjs
 * Output: frontend/src/data/vnProvinces.ts
 *
 * Spec: docs/superpowers/specs/2026-06-28-vn-provinces-static-migration-design.md
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import https from "node:https";
import AdmZip from "adm-zip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const VERSION = "v4.0.0";
const ZIP_URL = `https://github.com/thanglequoc/vietnamese-provinces-database/releases/download/${VERSION}/vietnamese_provinces_database_${VERSION}_json.zip`;
const OUTPUT = join(REPO_ROOT, "frontend/src/data/vnProvinces.ts");

const EXPECTED_PROVINCES = 34;
const MIN_WARDS = 3000;

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}

async function main() {
  console.log(`→ Downloading ${ZIP_URL}`);
  const zipBuf = await download(ZIP_URL);
  console.log(`✓ Got ${(zipBuf.length / 1024).toFixed(1)} KB`);

  const zip = new AdmZip(zipBuf);
  const entries = zip.getEntries().filter((e) => e.entryName.endsWith(".json"));
  if (entries.length === 0) throw new Error("No JSON file inside zip");
  const jsonEntry = entries.find((e) => /provinces/i.test(e.entryName)) || entries[0];
  console.log(`→ Extracting ${jsonEntry.entryName}`);
  const raw = JSON.parse(jsonEntry.getData().toString("utf-8"));

  // raw shape: [{code, name, full_name, wards: [{code, name, full_name, ...}]}]
  // Parse defensively — log if shape differs.
  if (!Array.isArray(raw)) {
    console.error("Top-level JSON shape:", typeof raw, Object.keys(raw || {}).slice(0, 5));
    throw new Error("Expected array at top level");
  }

  const provinces = raw.map((p) => {
    if (typeof p.code !== "number" || typeof p.name !== "string") {
      throw new Error(`Bad province shape: ${JSON.stringify(p).slice(0, 200)}`);
    }
    return { code: p.code, name: p.name };
  });

  const wardsByProvinceCode = {};
  let totalWards = 0;
  for (const p of raw) {
    const wards = Array.isArray(p.wards) ? p.wards : [];
    const names = wards.map((w) => {
      if (typeof w.name !== "string") {
        throw new Error(`Bad ward shape in province ${p.code}: ${JSON.stringify(w).slice(0, 200)}`);
      }
      return w.name;
    });
    names.sort((a, b) => a.localeCompare(b, "vi"));
    wardsByProvinceCode[p.code] = names;
    totalWards += names.length;
  }

  // Sanity checks
  if (provinces.length !== EXPECTED_PROVINCES) {
    throw new Error(`Expected ${EXPECTED_PROVINCES} provinces, got ${provinces.length}`);
  }
  if (totalWards < MIN_WARDS) {
    throw new Error(`Expected ≥${MIN_WARDS} wards, got ${totalWards}`);
  }

  // Sort provinces theo locale "vi", bỏ prefix "Tỉnh"/"Thành phố"
  const stripPrefix = (s) => s.replace(/^(Tỉnh|Thành phố)\s+/i, "");
  provinces.sort((a, b) => stripPrefix(a.name).localeCompare(stripPrefix(b.name), "vi"));

  const banner = [
    `// Generated from vietnamese-provinces-database ${VERSION}`,
    `// Generated at: ${new Date().toISOString()}`,
    `// DO NOT EDIT MANUALLY — run: node scripts/build-vn-provinces.mjs`,
    `// Source: ${ZIP_URL}`,
  ].join("\n");

  const tsBody = `${banner}

export const VN_PROVINCES_VERSION = ${JSON.stringify(VERSION)} as const;

export interface Province {
  code: number;
  name: string;
}

export const provinces: ReadonlyArray<Province> = ${JSON.stringify(provinces, null, 2)} as const;

export const wardsByProvinceCode: Readonly<Record<number, ReadonlyArray<string>>> = ${JSON.stringify(wardsByProvinceCode, null, 2)} as const;
`;

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, tsBody, "utf-8");

  const sizeKB = (tsBody.length / 1024).toFixed(1);
  console.log(`✓ ${provinces.length} provinces, ${totalWards} wards → ${OUTPUT} (${sizeKB} KB)`);
}

main().catch((err) => {
  console.error("✗ Build failed:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2.2: Add npm script to package.json**

Modify `frontend/package.json` — add inside `"scripts"` block:

```json
"build:vn-provinces": "node ../scripts/build-vn-provinces.mjs"
```

(Verify the relative path `../scripts/` resolves from `frontend/` working dir.)

- [ ] **Step 2.3: Run script to generate data file**

```bash
cd frontend && npm run build:vn-provinces
```

Expected output (approximate):
```
→ Downloading https://github.com/.../v4.0.0/...zip
✓ Got 180.5 KB
→ Extracting vietnamese_provinces_database.json
✓ 34 provinces, 3321 wards → frontend/src/data/vnProvinces.ts (52.3 KB)
```

Expected: file `frontend/src/data/vnProvinces.ts` exists, is valid TypeScript.

- [ ] **Step 2.4: Verify generated file syntactically valid**

```bash
cd frontend && npx tsc --noEmit src/data/vnProvinces.ts
```

Expected: zero errors.

- [ ] **Step 2.5: Commit script + generated data**

```bash
git add scripts/build-vn-provinces.mjs frontend/package.json frontend/src/data/vnProvinces.ts
git commit -m "feat(addr): add VN provinces build script + generated v4.0.0 data"
```

---

## Task 3: Unit test data file

**Files:**
- Create: `frontend/src/data/vnProvinces.test.ts`

- [ ] **Step 3.1: Write failing test**

Create `frontend/src/data/vnProvinces.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { provinces, wardsByProvinceCode, VN_PROVINCES_VERSION } from "./vnProvinces";

describe("vnProvinces static data", () => {
  it("has version metadata", () => {
    expect(VN_PROVINCES_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it("has exactly 34 provinces (sáp nhập 2025)", () => {
    expect(provinces.length).toBe(34);
  });

  it("every province has valid code + name", () => {
    for (const p of provinces) {
      expect(typeof p.code).toBe("number");
      expect(typeof p.name).toBe("string");
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it("every province has wards key", () => {
    for (const p of provinces) {
      expect(wardsByProvinceCode[p.code]).toBeDefined();
      expect(Array.isArray(wardsByProvinceCode[p.code])).toBe(true);
    }
  });

  it("total wards ≥ 3000", () => {
    const total = Object.values(wardsByProvinceCode).reduce((sum, ws) => sum + ws.length, 0);
    expect(total).toBeGreaterThanOrEqual(3000);
  });

  it("wards within each province are sorted (locale vi)", () => {
    for (const code of Object.keys(wardsByProvinceCode)) {
      const wards = wardsByProvinceCode[Number(code)];
      const sorted = [...wards].sort((a, b) => a.localeCompare(b, "vi"));
      expect(wards).toEqual(sorted);
    }
  });

  it("Hà Nội exists with sensible ward count", () => {
    const hn = provinces.find((p) => /Hà Nội/i.test(p.name));
    expect(hn).toBeDefined();
    expect(wardsByProvinceCode[hn!.code].length).toBeGreaterThan(50);
  });

  it("TP.HCM exists with sensible ward count", () => {
    const hcm = provinces.find((p) => /Hồ Chí Minh/i.test(p.name));
    expect(hcm).toBeDefined();
    expect(wardsByProvinceCode[hcm!.code].length).toBeGreaterThan(50);
  });

  it("Đà Nẵng exists", () => {
    const dn = provinces.find((p) => /Đà Nẵng/i.test(p.name));
    expect(dn).toBeDefined();
    expect(wardsByProvinceCode[dn!.code].length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 3.2: Run test to verify pass**

```bash
cd frontend && npx vitest run src/data/vnProvinces.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/data/vnProvinces.test.ts
git commit -m "test(addr): unit tests for vnProvinces static data integrity"
```

---

## Task 4: Refactor `useProvinceWardSelect` hook (TDD)

**Files:**
- Create: `frontend/src/components/payment-request/VietnamAddressFields.test.tsx`
- Modify: `frontend/src/components/payment-request/VietnamAddressFields.tsx`

- [ ] **Step 4.1: Write failing test for refactored hook behavior**

Create `frontend/src/components/payment-request/VietnamAddressFields.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProvinceWardSelect } from "./VietnamAddressFields";

describe("useProvinceWardSelect (static data)", () => {
  it("returns all 34 provinces immediately, no loading state", () => {
    const { result } = renderHook(() => useProvinceWardSelect(""));
    expect(result.current.provinces.length).toBe(34);
    expect(result.current.loadingWards).toBe(false);
    expect(result.current.wards).toEqual([]);
  });

  it("returns wards instantly when province selected", () => {
    const hn = "Thành phố Hà Nội";
    const { result } = renderHook(() => useProvinceWardSelect(hn));
    expect(result.current.wards.length).toBeGreaterThan(50);
    expect(result.current.loadingWards).toBe(false);
  });

  it("returns empty wards for unknown province (legacy values preserved by Combobox)", () => {
    const { result } = renderHook(() => useProvinceWardSelect("Tỉnh Hà Tây"));
    expect(result.current.wards).toEqual([]);
    expect(result.current.loadingWards).toBe(false);
  });

  it("does NOT fire any network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderHook(() => useProvinceWardSelect("Thành phố Hà Nội"));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
```

Note: Add `import { vi } from "vitest";` at top.

- [ ] **Step 4.2: Run test, verify fail**

```bash
cd frontend && npx vitest run src/components/payment-request/VietnamAddressFields.test.tsx
```

Expected: tests fail because current hook uses fetch (no provinces loaded sync, loadingWards=true async, fetchSpy called).

- [ ] **Step 4.3: Refactor hook in VietnamAddressFields.tsx**

Modify `frontend/src/components/payment-request/VietnamAddressFields.tsx` — replace lines 1-47 with:

```tsx
import { useMemo } from "react";
import Combobox from "../ui/Combobox";
import { provinces, wardsByProvinceCode } from "../../data/vnProvinces";

/**
 * Province + ward options from bundled static data — generated from
 * vietnamese-provinces-database v4.0.0 (đơn vị hành chính 2 cấp sau sáp nhập
 * 2025: tỉnh → phường/xã, bỏ cấp quận/huyện).
 *
 * Wards đã pre-sort alphabet (locale "vi") trong data file.
 * Source: docs/superpowers/specs/2026-06-28-vn-provinces-static-migration-design.md
 */
export function useProvinceWardSelect(province: string) {
  const wards = useMemo<string[]>(() => {
    if (!province) return [];
    const p = provinces.find((x) => x.name === province);
    if (!p) return [];
    return [...(wardsByProvinceCode[p.code] ?? [])];
  }, [province]);

  return { provinces, wards, loadingWards: false as const };
}
```

Keep lines 49-119 (`VietnamAddressFields` component) **unchanged**. The `Province` interface previously declared locally is replaced by the typed import — component code uses the typed `provinces` array directly without a local interface.

- [ ] **Step 4.4: Run test, verify pass**

```bash
cd frontend && npx vitest run src/components/payment-request/VietnamAddressFields.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 4.5: Run full unit test suite to verify no regression**

```bash
cd frontend && npm run test
```

Expected: all pre-existing tests still pass.

- [ ] **Step 4.6: Run tsc -b (strict project ref build, per [[feedback_tsc_build_mode]])**

```bash
cd frontend && npx tsc -b
```

Expected: zero errors.

- [ ] **Step 4.7: Commit**

```bash
git add frontend/src/components/payment-request/VietnamAddressFields.tsx frontend/src/components/payment-request/VietnamAddressFields.test.tsx
git commit -m "feat(addr): refactor useProvinceWardSelect to use static data, drop fetch"
```

---

## Task 5: Delete dead code `useVietnamAddress.ts`

**Files:**
- Delete: `frontend/src/hooks/useVietnamAddress.ts`

- [ ] **Step 5.1: Verify zero imports across `.ts` and `.tsx` files**

```bash
grep -r 'useVietnamAddress' frontend/src/ --include='*.ts' --include='*.tsx'
```

Expected: only the declaration file `frontend/src/hooks/useVietnamAddress.ts` appears in matches; no `import` statements found in any other file. (Pre-checked during design — should be zero imports.)

- [ ] **Step 5.2: Delete file**

```bash
rm frontend/src/hooks/useVietnamAddress.ts
```

- [ ] **Step 5.3: Run tsc -b to verify nothing broke**

```bash
cd frontend && npx tsc -b
```

Expected: zero errors.

- [ ] **Step 5.4: Run unit tests**

```bash
cd frontend && npm run test
```

Expected: all tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add -u
git commit -m "chore(addr): remove dead code useVietnamAddress hook (zero imports)"
```

---

## Task 6: E2E smoke test

**Files:**
- Reference: `frontend/e2e/` (existing setup per [[e2e-test-setup]])

- [ ] **Step 6.1: Run existing E2E baseline to confirm no pre-existing failures**

```bash
cd frontend && npm run e2e
```

Expected: all existing E2E tests pass (CRM Sync + Dashboard Sales).

- [ ] **Step 6.2: Check if PR flow E2E exists**

```bash
ls frontend/e2e/ | grep -iE 'payment|pr|address' || echo "NONE"
```

If output is `NONE`: skip Step 6.3 (no PR flow E2E covered — manual smoke test in Task 7 covers it).
If output shows a PR flow file: proceed to Step 6.3.

- [ ] **Step 6.3 (conditional): Add VN address scenarios if PR flow E2E exists**

If a PR flow E2E exists, add scenarios:
1. Open create-PR modal → assert province dropdown has 34 options visible
2. Type "Hà Nội" → assert option appears → click → assert ward dropdown enabled instantly (no "Đang tải" text)
3. Open existing PR detail drawer → assert previously-saved address displays

(No code provided — add by following existing E2E patterns in `frontend/e2e/`.)

- [ ] **Step 6.4: Commit (only if Step 6.3 added new tests)**

```bash
git add frontend/e2e/
git commit -m "test(addr): E2E coverage for static VN provinces dropdown"
```

If no new E2E added: skip this step.

---

## Task 7: Final build verification + manual smoke

**Files:** none modified

- [ ] **Step 7.1: Run Vercel-identical build**

```bash
cd frontend && npm run build
```

Expected: build succeeds. Note bundle size from Vite output for comparison.

- [ ] **Step 7.2: Verify bundle size diff <20KB gzip**

Compare `dist/assets/*.js` size before vs after migration. Check Vite output line like:
```
dist/assets/index-XXX.js   XXX.XX kB │ gzip: XX.XX kB
```

Expected: gzip increase < 20KB.

- [ ] **Step 7.3: Local manual smoke test**

```bash
cd frontend && npm run dev
```

In browser (http://localhost:5173):
1. Open DevTools Network tab → filter `provinces.open-api.vn`
2. Login, navigate to Payment Requests
3. Click "Tạo PR mới" → fill form → choose Tỉnh → choose Phường
4. Assert: **0 requests** to `provinces.open-api.vn` in Network tab
5. Assert: dropdowns open instant, no "Đang tải phường/xã…" placeholder visible
6. Save PR → reload → open detail drawer → verify address persists

Stop dev server: Ctrl+C.

- [ ] **Step 7.4: Test legacy value preservation**

Open detail drawer of a PR created BEFORE the migration (any old PR with address). Assert:
- Old `province` value (e.g. "Tỉnh Hà Tây") displays raw in input field via Combobox fallback
- No crash, no clear, no error toast

If no old PR exists in local DB: skip — covered by Combobox.tsx:109 unit logic + verified during design.

---

## Task 8: Push to sandbox + manual sandbox smoke

**Files:** none modified

- [ ] **Step 8.1: Push branch**

```bash
git push -u origin feat/static-vn-provinces
```

Expected: branch pushed; Vercel sandbox auto-deploys (per [[vercel-projects]] — sandbox branch is `sandbox`, but feature branch deploys to a Vercel preview URL).

Wait for Vercel preview URL to be ready (~2-3 min). Get URL from `gh pr` or Vercel dashboard.

- [ ] **Step 8.2: Sandbox smoke test (15 minutes)**

Login at preview URL with `test.user@dev` (per [[sandbox-url]]):
1. Tạo PR mới — khách VN với địa chỉ đầy đủ → save → verify display
2. Tạo PR mới — khách OV (nước ngoài) → verify country picker không ảnh hưởng
3. Mở 5 PR cũ random → verify address hiển thị (legacy preserve)
4. DevTools Network: filter `provinces.open-api.vn` → assert **0 requests** during all flows

If any failure: roll back commits or fix forward depending on severity.

- [ ] **Step 8.3: Open PR**

```bash
gh pr create --base main --title "feat(addr): migrate VN provinces dropdown to static JSON" --body "$(cat <<'EOF'
## Summary
- Migrate Vietnam provinces + wards data source from external API `provinces.open-api.vn` to bundled static JSON (generated from `vietnamese-provinces-database` v4.0.0).
- Eliminate external API dependency → dropdown opens instant (was 200-500ms per fetch).
- Combobox's existing fallback (`Combobox.tsx:109`) preserves legacy province/ward names from PRs created before sáp nhập 2025 — no data loss.

## Tradeoffs (per [[feedback-3-criteria-for-solutions]])
- **Triệt để**: ✅ Zero dependency on `provinces.open-api.vn`
- **Không lỗi con**: ✅ Component props unchanged → 2 callers untouched; dead code `useVietnamAddress.ts` removed (zero imports)
- **Hạ tầng + hiệu năng**: ✅ Vercel bundle +~15KB gzip (~0.05% free tier); Render+Supabase zero impact; **hiệu năng tăng** (bỏ 2 fetch / form mở)

## Test plan
- [x] Unit: `frontend/src/data/vnProvinces.test.ts` — 9 tests on data integrity
- [x] Unit: `frontend/src/components/payment-request/VietnamAddressFields.test.tsx` — 4 tests, includes fetch-spy assertion
- [x] Manual smoke (sandbox): tạo PR mới khách VN/OV, mở PR cũ legacy
- [x] Network verify: 0 requests to provinces.open-api.vn
- [x] `tsc -b` pass, `npm run build` pass

## Spec
docs/superpowers/specs/2026-06-28-vn-provinces-static-migration-design.md

## Squash merge
Per [[feedback_squash_commits]] — please squash on merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL returned. Share with anh Minh for review.

---

## Task 9: Merge + monitor

**Files:** none modified

- [ ] **Step 9.1: Wait for review approval from anh Minh**

If review feedback received: fix in this branch, push, comment "fixed".

- [ ] **Step 9.2: Squash merge via GitHub UI**

Use "Squash and merge" button. Final commit on main:
```
feat(addr): migrate VN provinces dropdown to static JSON (#NNN)
```

- [ ] **Step 9.3: Verify production deploy**

```bash
gh run list --branch main --limit 1
```

Wait for Vercel production deploy to finish (~2-3 min).

- [ ] **Step 9.4: Production smoke test**

Open production URL → open Network DevTools → filter `provinces.open-api.vn` → open any PR detail drawer or create modal → assert **0 requests** to old API.

- [ ] **Step 9.5: Monitor 24h**

- Check Sentry / console errors related to address fields
- Check support channels for user reports of dropdown issues
- If regression found within 24h: `git revert <merge-hash>` on main → push → auto deploy

---

## Final state

After all tasks complete:
- ✅ `frontend/src/data/vnProvinces.ts` exists, bundled into FE
- ✅ `scripts/build-vn-provinces.mjs` exists for future updates
- ✅ `frontend/src/hooks/useVietnamAddress.ts` deleted (was dead code)
- ✅ `frontend/src/components/payment-request/VietnamAddressFields.tsx` hook refactored, component props unchanged
- ✅ External API `provinces.open-api.vn` no longer called from anywhere in app
- ✅ All tests green, build green, sandbox + prod verified
- ✅ Single squashed commit on main → easy revert

## Future updates (manual)

When new sáp nhập decree released:
1. Find new release tag at https://github.com/thanglequoc/vietnamese-provinces-database/releases
2. Update `VERSION` constant in `scripts/build-vn-provinces.mjs`
3. Update `EXPECTED_PROVINCES` if administrative count changed
4. Run `cd frontend && npm run build:vn-provinces`
5. Run tests, verify, commit, PR, deploy

Per design: decree-level changes are rare (~10+ year cadence).
