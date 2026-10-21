import { describe, it, expect } from "vitest";
import { isHandoverComplete } from "./paymentRequestUtils";

// Gate "Bàn giao cho CS" trong modal Báo đơn (B3) — chặn cứng đủ 3 trường khi báo đơn lần đầu.
describe("isHandoverComplete — gate bàn giao CS khi báo đơn (khâu 1)", () => {
  it("đủ 3 trường → true", () => {
    expect(isHandoverComplete("Zalo", "0901234567", "Lịch học T2-T4")).toBe(true);
  });
  it("thiếu Kênh chăm sóc → false", () => {
    expect(isHandoverComplete("", "0901234567", "note")).toBe(false);
  });
  it("thiếu Contact ID → false", () => {
    expect(isHandoverComplete("Zalo", "", "note")).toBe(false);
  });
  it("thiếu Note bàn giao → false", () => {
    expect(isHandoverComplete("Zalo", "0901234567", "")).toBe(false);
  });
  it("Contact ID / Note chỉ khoảng trắng → false (tính sau trim)", () => {
    expect(isHandoverComplete("Zalo", "   ", "note")).toBe(false);
    expect(isHandoverComplete("Zalo", "0901", "   ")).toBe(false);
  });
  it("null/undefined an toàn → false", () => {
    expect(isHandoverComplete(null, undefined, "")).toBe(false);
  });
});
