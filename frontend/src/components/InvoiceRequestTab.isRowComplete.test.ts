import { describe, it, expect } from "vitest";
import { isRowComplete } from "./InvoiceRequestTab";
import type { InvoiceRow } from "./payment-flow/paymentFlowUtils";
import type { ActiveRequest, PaymentRequest } from "../types/paymentRequest";

function makeRow(overrides: {
  courseOverrides?: Record<string, unknown>;
  prOverrides?: Record<string, unknown>;
  prNull?: boolean;
}): InvoiceRow {
  const course = {
    courseCode: "CC-0001-001",
    packageName: "2/W- NEW 24 buoi",
    amount: 8_500_000,
    orderId: "123456",
    invoiced: false,
    name: "Nguyễn Văn A",
    phone: "84-908274977",
    ward: "Phường Hoàng Mai",
    province: "Thành phố Hà Nội",
    address: "",
    ...overrides.courseOverrides,
  };

  const uidObj = { uid: "3313345790", phone: "84-908274977", country: "VN", courses: [course] };

  const ar: ActiveRequest = {
    id: "ar-1",
    prId: "pr-1",
    customerName: "Nguyễn Văn A",
    createdAt: "2026-10-30T10:00:00Z",
    createdBy: "sale@example.com",
    uids: [uidObj],
  };

  const pr = overrides.prNull
    ? null
    : ({
        id: "pr-1",
        wantsInvoice: true,
        email: "a@example.com",
        province: "Thành phố Hà Nội",
        ward: "Phường Hoàng Mai",
        address: "",
        ...overrides.prOverrides,
      } as unknown as PaymentRequest);

  return { key: "ar-1/0/0", ar, pr, uidObj, uidIdx: 0, courseIdx: 0, course };
}

describe("isRowComplete — doanh nghiệp (mirror BE gate MST)", () => {
  it("business đủ MST + tên DN + email + địa chỉ → true", () => {
    const row = makeRow({
      courseOverrides: { customerType: "business", taxCode: "0123456789", companyName: "ABC Corp", email: "kt@abc.vn" },
      prOverrides: { wantsInvoice: true, customerType: "business" },
    });
    expect(isRowComplete(row)).toBe(true);
  });

  it("business thiếu MST → false", () => {
    const row = makeRow({
      courseOverrides: { customerType: "business", taxCode: "", companyName: "ABC Corp", email: "kt@abc.vn" },
      prOverrides: { wantsInvoice: true, customerType: "business", taxId: "" },
    });
    expect(isRowComplete(row)).toBe(false);
  });

  it("business thiếu tên đơn vị → false", () => {
    const row = makeRow({
      courseOverrides: { customerType: "business", taxCode: "0123456789", companyName: "", email: "kt@abc.vn" },
      prOverrides: { wantsInvoice: true, customerType: "business", companyName: "" },
    });
    expect(isRowComplete(row)).toBe(false);
  });

  it("business thiếu email → false", () => {
    const row = makeRow({
      courseOverrides: { customerType: "business", taxCode: "0123456789", companyName: "ABC Corp", email: "" },
      prOverrides: { wantsInvoice: true, customerType: "business", email: "" },
    });
    expect(isRowComplete(row)).toBe(false);
  });

  it("business thiếu địa chỉ → false", () => {
    const row = makeRow({
      courseOverrides: {
        customerType: "business", taxCode: "0123456789", companyName: "ABC Corp", email: "kt@abc.vn",
        ward: "", province: "", address: "",
      },
      prOverrides: { wantsInvoice: true, customerType: "business", ward: "", province: "", address: "" },
    });
    expect(isRowComplete(row)).toBe(false);
  });
});

describe("isRowComplete — cá nhân (không bị ảnh hưởng logic business)", () => {
  it("cá nhân đủ name + phone + địa chỉ → true (dù không có MST)", () => {
    const row = makeRow({
      courseOverrides: { customerType: "individual", taxCode: "" },
      prOverrides: { wantsInvoice: true },
    });
    expect(isRowComplete(row)).toBe(true);
  });

  it("cá nhân thiếu địa chỉ → false", () => {
    const row = makeRow({
      courseOverrides: { customerType: "individual", ward: "", province: "", address: "" },
      prOverrides: { wantsInvoice: true, ward: "", province: "", address: "" },
    });
    expect(isRowComplete(row)).toBe(false);
  });
});

describe("isRowComplete — non-taker (không lấy HĐ)", () => {
  it("non-taker chỉ cần name + phone → true", () => {
    const row = makeRow({ prOverrides: { wantsInvoice: false } });
    expect(isRowComplete(row)).toBe(true);
  });

  it("non-taker thiếu name → false", () => {
    const row = makeRow({
      courseOverrides: { name: "" },
      prOverrides: { wantsInvoice: false },
    });
    row.ar.customerName = "";
    expect(isRowComplete(row)).toBe(false);
  });
});
