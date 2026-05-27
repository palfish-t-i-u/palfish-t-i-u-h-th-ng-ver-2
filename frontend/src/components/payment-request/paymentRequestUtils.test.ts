import { describe, expect, it } from "vitest";
import type { ActiveRequest } from "../../types/paymentRequest";
import {
  activationSummary,
  formatCoursePhone,
  toActiveRequestPatchUidsData,
  updateActiveCoursePackage,
} from "./paymentRequestUtils";

describe("active request course package updates", () => {
  const ar: ActiveRequest = {
    id: "AR-2026-0025",
    prId: "PR-2026-0044",
    customerName: "test711",
    createdAt: "2026-05-27T12:12:36.295444+00:00",
    createdBy: "hieuhn.mplanner",
    uids: [
      {
        uid: "978124462",
        phone: "54353424",
        country: "VN",
        courses: [
          {
            courseCode: "CC-0044-001",
            packageName: "",
            amount: 100000,
            orderId: "",
            invoiced: false,
          },
        ],
      },
    ],
  };

  it("updates only the selected course package name", () => {
    const next = updateActiveCoursePackage(ar, "CC-0044-001", "2/W- NEW 96 US-UK+5 HN");

    expect(next.uids[0].courses[0].packageName).toBe("2/W- NEW 96 US-UK+5 HN");
    expect(ar.uids[0].courses[0].packageName).toBe("");
  });

  it("keeps snake_case course data when saving the active request", () => {
    const next = updateActiveCoursePackage(ar, "CC-0044-001", "2/W- NEW 96 US-UK+5 HN");

    expect(toActiveRequestPatchUidsData(next)).toEqual([
      {
        uid: "978124462",
        phone: "54353424",
        country: "VN",
        courses: [
          {
            code: "CC-0044-001",
            name: "2/W- NEW 96 US-UK+5 HN",
            amount: 100000,
            order_id: "",
            invoiced: false,
            invoice_id: undefined,
            invoiced_at: undefined,
            invoice_requested_at: undefined,
            tax_invoice_code: undefined,
            tax_product_code: undefined,
          },
        ],
      },
    ]);
  });

  it("labels a created active request as waiting until all courses have order ids", () => {
    expect(activationSummary(null).buttonLabel).toBe("Kích hoạt khóa học");
    expect(activationSummary(ar).buttonLabel).toBe("Chờ kích hoạt khóa học");

    const activated: ActiveRequest = {
      ...ar,
      uids: [
        {
          ...ar.uids[0],
          courses: [{ ...ar.uids[0].courses[0], orderId: "ORD-CRM-88901" }],
        },
      ],
    };

    expect(activationSummary(activated).buttonLabel).toBe("Đã kích hoạt khóa học");
    expect(activationSummary(activated).courseBadgeLabel).toBe("Đã kích hoạt");
  });

  it("formats active request phones with country dial prefix", () => {
    expect(formatCoursePhone("VN", "9323232333")).toBe("+84 9323 232 333");
    expect(formatCoursePhone("US", "(415) 555-0131")).toBe("+1 4155 550 131");
  });
});
