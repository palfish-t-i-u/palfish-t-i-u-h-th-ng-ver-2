import { describe, it, expect } from "vitest";
import { findPaidLinesWithoutBill } from "./billGuardUtils";
import type { PaymentAttempt } from "../../types/paymentRequest";

function makeLine(overrides: Partial<PaymentAttempt>): PaymentAttempt {
  return {
    id: "line-1",
    idx: 0,
    amount: 1000000,
    status: "paid",
    createdAt: "2026-01-01T00:00:00Z",
    code: "ABCDE",
    bill: false,
    method: "qr",
    ...overrides,
  };
}

describe("findPaidLinesWithoutBill", () => {
  it("returns paid lines missing both billImage and billImages", () => {
    const lines = [makeLine({ id: "l1", billImage: null, billImages: undefined })];
    expect(findPaidLinesWithoutBill(lines)).toHaveLength(1);
    expect(findPaidLinesWithoutBill(lines)[0].id).toBe("l1");
  });

  it("returns paid lines where billImage is empty string", () => {
    const lines = [makeLine({ billImage: "", billImages: [] })];
    expect(findPaidLinesWithoutBill(lines)).toHaveLength(1);
  });

  it("returns paid lines where billImage is whitespace-only", () => {
    const lines = [makeLine({ billImage: "   ", billImages: [] })];
    expect(findPaidLinesWithoutBill(lines)).toHaveLength(1);
  });

  it("does not flag lines with billImage set", () => {
    const lines = [makeLine({ billImage: "https://example.com/bill.jpg" })];
    expect(findPaidLinesWithoutBill(lines)).toHaveLength(0);
  });

  it("does not flag lines with billImages array containing at least one entry", () => {
    const lines = [makeLine({ billImage: null, billImages: ["https://example.com/bill.jpg"] })];
    expect(findPaidLinesWithoutBill(lines)).toHaveLength(0);
  });

  it("does not flag non-paid lines", () => {
    const lines = [
      makeLine({ id: "pending-1", status: "pending", billImage: null, billImages: [] }),
      makeLine({ id: "rejected-1", status: "rejected", billImage: null, billImages: undefined }),
    ];
    expect(findPaidLinesWithoutBill(lines)).toHaveLength(0);
  });

  it("returns only the paid-without-bill lines from a mixed list", () => {
    const lines = [
      makeLine({ id: "ok-paid", status: "paid", billImage: "https://example.com/bill.jpg" }),
      makeLine({ id: "missing-paid", status: "paid", billImage: null, billImages: [] }),
      makeLine({ id: "pending-no-bill", status: "pending", billImage: null }),
    ];
    const result = findPaidLinesWithoutBill(lines);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("missing-paid");
  });

  it("returns an empty array when lines is empty", () => {
    expect(findPaidLinesWithoutBill([])).toEqual([]);
  });
});
