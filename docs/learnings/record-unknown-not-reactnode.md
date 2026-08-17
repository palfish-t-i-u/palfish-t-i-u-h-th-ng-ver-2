# `Record<string, unknown>` value không dùng trực tiếp trong JSX — phải narrow trước

**Related files:** `frontend/src/components/payslip/PayslipDetail.tsx`, `frontend/src/types/payroll.ts`

**Problem:** `PayslipDetail.phieu` có type `Record<string, unknown>`. Truy cập `phieu["Name"]` trả về `unknown` — không gán được vào `ReactNode` → `error TS2322: Type 'unknown' is not assignable to type 'ReactNode'`.

**Trap:** Đặt `{phieu["Name"]}` hoặc `{chucDanh && <p>{chucDanh}</p>}` thẳng vào JSX. `unknown` không phải `ReactNode` — TypeScript từ chối, ngay cả khi giá trị runtime là string hợp lệ.

**Insight:** Hai pattern an toàn:
1. **Cast tại extraction**: `const name = String(phieu["Name"] ?? fallback)` — `String()` luôn trả `string`, là `ReactNode` hợp lệ.
2. **Narrow với typeof**: `const chucDanh = typeof phieu["Chức danh"] === "string" ? phieu["Chức danh"] : null` — sau đó `{chucDanh && <p>{chucDanh}</p>}` an toàn vì TypeScript đã biết kiểu `string | null`.

Pattern dùng `phieu[key] as string` cũng compile nhưng không type-safe (runtime crash nếu giá trị là object); ưu tiên `String()` hoặc `typeof` check.

**Rule:** Mọi `phieu[key]` trong JSX phải qua ≥1 bước narrow/cast trước khi render. Search: `grep -n "phieu\[" src/components/payslip/` — mọi hit phải kèm `String(` hoặc `typeof ... ===`.

**Verify:** `npx tsc -b` trong `frontend/` — 0 error TS2322 liên quan `unknown` trong `PayslipDetail.tsx`.
