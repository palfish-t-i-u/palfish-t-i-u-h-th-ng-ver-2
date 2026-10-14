import { describe, it, expect } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone (Feedback lead)", () => {
  it("giữ đầu số nước ngoài, KHÔNG nhét 84", () => {
    expect(normalizePhone("33-619500436")).toBe("33-619500436"); // Pháp (ca lỗi anh Minh báo)
    expect(normalizePhone("420-777710688")).toBe("420-777710688"); // Séc
  });

  it("số VN trần → 84-, bỏ 0 đầu", () => {
    expect(normalizePhone("0912345678")).toBe("84-912345678");
    expect(normalizePhone("912345678")).toBe("84-912345678");
  });

  it("idempotent — chạy lại KHÔNG cộng dồn 84", () => {
    expect(normalizePhone("84-912345678")).toBe("84-912345678");
    expect(normalizePhone(normalizePhone("33-619500436"))).toBe("33-619500436");
    expect(normalizePhone(normalizePhone("0912345678"))).toBe("84-912345678");
  });

  it("rỗng → rỗng", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("   ")).toBe("");
  });
});
