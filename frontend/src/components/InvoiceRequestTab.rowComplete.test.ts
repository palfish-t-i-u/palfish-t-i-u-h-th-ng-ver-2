import { describe, it, expect } from "vitest";
import { isRowComplete } from "./InvoiceRequestTab";
import type { InvoiceRow } from "./payment-flow/paymentFlowUtils";

function makeRow(opts: {
  wantsInvoice: boolean;
  address?: string;
  ward?: string;
  province?: string;
}): InvoiceRow {
  const { wantsInvoice, address = "", ward = "", province = "" } = opts;
  return {
    key: "row-1",
    ar: {
      id: "ar-1",
      prId: "pr-1",
      customerName: "Nguyen Van A",
      createdAt: "2026-09-01T00:00:00Z",
      createdBy: "sale@test.com",
      uids: [],
    },
    pr: {
      id: "pr-1",
      name: "Nguyen Van A",
      uid: "uid-1",
      phone: "0900000000",
      country: "VN",
      address: "",
      ward: "",
      province: "",
      wantsInvoice,
      target: 1000000,
      source: "manual",
      createdAt: "2026-09-01T00:00:00Z",
      received: 1000000,
      doneCount: 1,
      totalCount: 1,
      delta: 0,
      state: "completed",
      payments: [],
    },
    uidObj: {
      uid: "uid-1",
      phone: "0900000000",
      country: "VN",
      courses: [],
    },
    uidIdx: 0,
    courseIdx: 0,
    course: {
      courseCode: "C1",
      packageName: "Goi hoc",
      amount: 1000000,
      orderId: "O1",
      invoiced: false,
      address,
      ward,
      province,
    },
  } as unknown as InvoiceRow;
}

describe("isRowComplete", () => {
  it("non-taker (wantsInvoice=false) thieu dia chi van = true", () => {
    const row = makeRow({ wantsInvoice: false });
    expect(isRowComplete(row)).toBe(true);
  });

  it("taker (wantsInvoice=true) thieu dia chi = false", () => {
    const row = makeRow({ wantsInvoice: true });
    expect(isRowComplete(row)).toBe(false);
  });

  it("taker (wantsInvoice=true) du dia chi (province) = true", () => {
    const row = makeRow({ wantsInvoice: true, province: "Ha Noi" });
    expect(isRowComplete(row)).toBe(true);
  });
});
