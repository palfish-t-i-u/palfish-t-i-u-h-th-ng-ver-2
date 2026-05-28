import { describe, expect, it } from "vitest";
import type { ActiveRequest } from "../../types/paymentRequest";
import { deriveArStatus } from "./paymentFlowUtils";

describe("active request status derivation", () => {
  const baseAr: ActiveRequest = {
    id: "AR-2026-0029",
    prId: "PR-2026-0051",
    customerName: "HIẾU TEST10",
    createdAt: "2026-05-27T15:32:50.268033+00:00",
    createdBy: "hieuhn.mplanner",
    uids: [
      {
        uid: "21312321312",
        phone: "9323232333",
        country: "VN",
        courses: [
          {
            courseCode: "CC-0051-001",
            packageName: "2/W- NEW 48 US-UK+2 HN",
            amount: 10000,
            orderId: "",
            invoiced: false,
          },
        ],
      },
    ],
  };

  it("keeps a new active request in waiting-to-create-order state", () => {
    expect(deriveArStatus(baseAr)).toBe("pending_order");
  });

  it("treats AR with all order ids filled as activated", () => {
    const withOrderId: ActiveRequest = {
      ...baseAr,
      uids: [
        {
          ...baseAr.uids[0],
          courses: [{ ...baseAr.uids[0].courses[0], orderId: "ORD-CRM-88901" }],
        },
      ],
    };

    expect(deriveArStatus(withOrderId)).toBe("activated");
  });

  it("stays in pending_order if any course is still missing order id", () => {
    const partial: ActiveRequest = {
      ...baseAr,
      uids: [
        {
          ...baseAr.uids[0],
          courses: [
            { ...baseAr.uids[0].courses[0], orderId: "ORD-CRM-88901" },
            { ...baseAr.uids[0].courses[0], courseCode: "CC-0051-002", orderId: "" },
          ],
        },
      ],
    };

    expect(deriveArStatus(partial)).toBe("pending_order");
  });

  it("moves to invoiced only when all courses are invoiced", () => {
    const invoiced: ActiveRequest = {
      ...baseAr,
      uids: [
        {
          ...baseAr.uids[0],
          courses: [
            {
              ...baseAr.uids[0].courses[0],
              orderId: "ORD-CRM-88901",
              invoiced: true,
              invoicedAt: "2026-05-28T00:00:00.000Z",
            },
          ],
        },
      ],
    };

    expect(deriveArStatus(invoiced)).toBe("invoiced");
  });
});
