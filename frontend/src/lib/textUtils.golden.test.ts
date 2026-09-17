import { describe, expect, it } from "vitest";
import { normVi } from "./textUtils";
import cases from "./__fixtures__/normViCases.json";

/**
 * Golden fixture 2 phía cho norm_vi (SQL) ↔ normVi (JS) — xem
 * docs/superpowers/plans/2026-09-15-pr-list-server-pagination.md M1-T3.
 *
 * File `__fixtures__/normViCases.json` là CHÂN LÝ DUY NHẤT: sinh ra bằng cách
 * chạy thật hàm `normVi` (không đoán tay), rồi backend/scripts/verify_norm_vi.py
 * đọc CÙNG file này gọi RPC `norm_vi` trên sandbox — lệch ở bên nào thì sửa bên đó,
 * KHÔNG sửa fixture để cho qua.
 */
describe("normVi — golden fixture (chân lý dùng chung với verify_norm_vi.py)", () => {
  for (const { input, expected } of cases as { input: string | null; expected: string }[]) {
    it(`normVi(${JSON.stringify(input)}) === ${JSON.stringify(expected)}`, () => {
      expect(normVi(input)).toBe(expected);
    });
  }
});
