import { describe, expect, it } from "vitest";
import type { PaymentAttempt, PaymentMethod, PaymentRequest } from "../../types/paymentRequest";
import { activatableReceived } from "./paymentRequestUtils";

// Cổng "đủ tạm" pre-mPOS: đơn quẹt thẻ/trả góp báo đơn được ngay khi có bill.
// activatableReceived = net(paid) + gross(card/installment pending CÓ bill).
// PHẢI khớp branch-for-branch với BE pr_guards.activatable_received (G-PARITY).

function line(over: Partial<PaymentAttempt> & { method: PaymentMethod }): PaymentAttempt {
  return {
    id: "l1",
    idx: 1,
    amount: 1000,
    status: "pending",
    createdAt: "2026-08-05T10:00:00.000Z",
    code: "PR001",
    bill: false,
    billImage: null,
    billImages: [],
    ...over,
  };
}

function pr(payments: PaymentAttempt[], target = 1000): PaymentRequest {
  return {
    id: "PR-1",
    name: "Khách",
    uid: "u1",
    phone: "0900000000",
    country: "VN",
    address: "",
    target,
    source: "manual",
    createdAt: "2026-08-05T10:00:00.000Z",
    received: 0,
    doneCount: 0,
    totalCount: payments.length,
    delta: 0,
    state: "short",
    payments,
  };
}

describe("activatableReceived — ma trận đủ tạm pre-mPOS", () => {
  it("không line → 0", () => {
    expect(activatableReceived(pr([]))).toBe(0);
  });

  it("QR paid → net (khớp received)", () => {
    expect(activatableReceived(pr([line({ method: "qr", status: "paid", amount: 2000 })]))).toBe(2000);
  });

  it("card pending CÓ bill (billImage) → cộng gross", () => {
    expect(
      activatableReceived(pr([line({ method: "card", status: "pending", amount: 1000, billImage: "https://x/b.jpg" })])),
    ).toBe(1000);
  });

  it("card pending CÓ bill (billImages[]) → cộng gross", () => {
    expect(
      activatableReceived(pr([line({ method: "installment", status: "pending", amount: 1500, billImages: ["https://x/1.jpg"] })])),
    ).toBe(1500);
  });

  it("card pending KHÔNG bill → loại", () => {
    expect(activatableReceived(pr([line({ method: "card", status: "pending", amount: 1000 })]))).toBe(0);
  });

  it("QR pending CÓ bill → loại (chỉ card/installment mới đủ tạm)", () => {
    expect(
      activatableReceived(pr([line({ method: "qr", status: "pending", amount: 1000, billImage: "https://x/b.jpg" })])),
    ).toBe(0);
  });

  it("cash pending CÓ bill → loại", () => {
    expect(
      activatableReceived(pr([line({ method: "cash", status: "pending", amount: 1000, billImage: "https://x/b.jpg" })])),
    ).toBe(0);
  });

  it("card pending bill nhưng billImage khoảng trắng → loại", () => {
    expect(
      activatableReceived(pr([line({ method: "card", status: "pending", amount: 1000, billImage: "   " })])),
    ).toBe(0);
  });

  it("hỗn hợp: QR paid net 500 + card pending gross 700 → 1200", () => {
    expect(
      activatableReceived(
        pr([
          line({ id: "l1", method: "qr", status: "paid", amount: 500 }),
          line({ id: "l2", method: "card", status: "pending", amount: 700, billImage: "https://x/b.jpg" }),
        ]),
      ),
    ).toBe(1200);
  });

  it("card paid có verifiedReceived → dùng net (không gross)", () => {
    expect(
      activatableReceived(pr([line({ method: "card", status: "paid", amount: 1000, verifiedReceived: 950 })])),
    ).toBe(950);
  });

  it("line cancelled → bỏ qua", () => {
    expect(
      activatableReceived(pr([line({ method: "card", status: "paid", amount: 1000, cancelled: true })])),
    ).toBe(0);
  });

  it("rejected pending card CÓ bill → loại (status không phải pending/paid)", () => {
    expect(
      activatableReceived(pr([line({ method: "card", status: "rejected", amount: 1000, billImage: "https://x/b.jpg" })])),
    ).toBe(0);
  });
});
