import { describe, expect, it } from "vitest";
import { hasPendingQrPayments } from "./paymentRequestUtils";
import type { PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";

const NOW = new Date("2026-07-11T10:00:00Z");

function pr(overrides: Partial<PaymentRequest>, payments: Partial<PaymentAttempt>[]): PaymentRequest {
  return {
    id: "PR1", name: "KH", uid: "u1", phone: "", country: "VN", address: "",
    email: "", customerType: "individual", target: 1000, source: "", saleEmail: "s@x.com",
    createdAt: "2026-07-10 09:00", received: 0, doneCount: 0, totalCount: 0,
    delta: -1000, state: "pending", cancelledAt: null, cancelledReason: null,
    isTest: false,
    payments: payments.map((p, i) => ({
      id: `L${i}`, idx: i + 1, amount: 500, status: "pending", createdAt: "", paidAt: null,
      code: "", billImage: null, billImages: [], bill: false, method: "qr", bank: undefined,
      cardLast4: null, installmentMonths: null, installmentPlatform: null, installmentTotal: null,
      saleReceived: null, verifiedTotal: null, verifiedReceived: null, cashier: null,
      paymentLinkId: null, transferContent: null, qrCode: null, checkoutUrl: null,
      cancelled: false, cancelledAt: null, rejectReason: null, confirmedBy: null,
      confirmedByName: null, confirmedAt: null, confirmedSource: null, nameForTransfer: null,
      isContentStale: false, studentName: null,
      ...p,
    })),
    ...overrides,
  } as PaymentRequest;
}

describe("hasPendingQrPayments — scope 30 ngày", () => {
  it("PR mới (1 ngày) có QR pending → true", () => {
    expect(hasPendingQrPayments([pr({}, [{ method: "qr", status: "pending" }])], NOW)).toBe(true);
  });

  it("PR cũ 40 ngày có QR pending bỏ quên → false (chống poll vĩnh viễn)", () => {
    const old = pr({ createdAt: "2026-06-01 09:00" }, [{ method: "qr", status: "pending" }]);
    expect(hasPendingQrPayments([old], NOW)).toBe(false);
  });

  it("PR cancelled → false", () => {
    const cancelled = pr({ state: "cancelled" }, [{ method: "qr", status: "pending" }]);
    expect(hasPendingQrPayments([cancelled], NOW)).toBe(false);
  });

  it("line QR pending nhưng đã cancelled → false", () => {
    expect(hasPendingQrPayments([pr({}, [{ method: "qr", status: "pending", cancelled: true }])], NOW)).toBe(false);
  });

  it("createdAt không parse được → vẫn poll (fail-safe)", () => {
    const weird = pr({ createdAt: "" }, [{ method: "qr", status: "pending" }]);
    expect(hasPendingQrPayments([weird], NOW)).toBe(true);
  });
});
