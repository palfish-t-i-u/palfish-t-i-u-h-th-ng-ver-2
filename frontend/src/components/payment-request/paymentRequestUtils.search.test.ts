import { describe, expect, it } from "vitest";
import { paymentRequestMatchesSearch } from "./paymentRequestUtils";
import type { PaymentRequest } from "../../types/paymentRequest";

function makePr(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "PR-2026-0314",
    name: "Chị Nhung",
    childName: "Hà Bảo Ngân",
    uid: "300265",
    phone: "+84 9889 739 96",
    country: "VN",
    address: "",
    target: 0,
    source: "manual",
    createdAt: "2026-07-15T00:00:00Z",
    received: 0,
    doneCount: 0,
    totalCount: 0,
    delta: 0,
    state: "tracking",
    payments: [],
    saleEmail: "",
    ...overrides,
  } as PaymentRequest;
}

describe("paymentRequestMatchesSearch", () => {
  it("khớp tên con — mọi cách gõ dấu/hoa thường (yêu cầu chính của task)", () => {
    const pr = makePr();
    expect(paymentRequestMatchesSearch(pr, "Hà Bảo Ngân")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "Ha Bao Ngan")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "ha bao ngan")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "HÀ BẢO NGÂN")).toBe(true);
  });

  it("khớp một phần tên con", () => {
    const pr = makePr();
    expect(paymentRequestMatchesSearch(pr, "bao ngan")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "ngan")).toBe(true);
  });

  it("vẫn khớp các field cũ: PR-ID, tên khách, UID, SĐT", () => {
    const pr = makePr();
    expect(paymentRequestMatchesSearch(pr, "pr-2026-0314")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "nhung")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "300265")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "9889")).toBe(true);
  });

  it("khớp bé phụ trong children[] (đa-con), không chỉ bé 1", () => {
    const pr = makePr({
      childName: "Lê Bảo Châu",
      children: [
        { name: "Lê Bảo Châu", uid: "111" },
        { name: "Lê Bảo Khánh", uid: "222" },
      ],
    });
    expect(paymentRequestMatchesSearch(pr, "le bao khanh")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "le bao chau")).toBe(true);
  });

  it("children undefined (response cũ) → vẫn khớp childName, không crash", () => {
    const pr = makePr({ children: undefined });
    expect(paymentRequestMatchesSearch(pr, "ha bao ngan")).toBe(true);
  });

  it("childName rỗng/undefined → không crash, chỉ trượt truy vấn tên con", () => {
    const pr = makePr({ childName: undefined, children: undefined });
    expect(paymentRequestMatchesSearch(pr, "ha bao ngan")).toBe(false);
    expect(paymentRequestMatchesSearch(pr, "nhung")).toBe(true); // tên khách vẫn khớp
  });

  it("query không khớp field nào → false", () => {
    const pr = makePr();
    expect(paymentRequestMatchesSearch(pr, "không tồn tại")).toBe(false);
  });

  it("query rỗng / toàn khoảng trắng → true (không lọc)", () => {
    const pr = makePr();
    expect(paymentRequestMatchesSearch(pr, "")).toBe(true);
    expect(paymentRequestMatchesSearch(pr, "   ")).toBe(true);
  });
});
