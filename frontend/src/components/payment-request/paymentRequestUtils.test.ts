import { describe, expect, it } from "vitest";
import type { ActiveRequest, ActiveRequestApiRow, PaymentRequest } from "../../types/paymentRequest";
import {
  activationSummary,
  activeRequestAllocation,
  buildCreateActiveRequestPayload,
  formatCoursePhone,
  fromApiActiveRequest,
  pageItems,
  paginate,
  toActiveRequestPatchUidsData,
  updateActiveCoursePackage,
  validateReferralBonus,
  visiblePaymentRequests,
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

  it("creates linked active request courses from received money, not target money", () => {
    const pr: PaymentRequest = {
      id: "PR-2026-0065",
      name: "Hieu TEST01",
      uid: "123213213",
      phone: "934428192",
      country: "VN",
      address: "Hanoi",
      target: 6000,
      source: "manual",
      createdAt: "2026-05-29T14:56:16.000Z",
      received: 2000,
      doneCount: 2,
      totalCount: 2,
      delta: -4000,
      state: "short",
      payments: [],
    };

    expect(buildCreateActiveRequestPayload(pr).uids[0].courses[0].amount).toBe(2000);
  });

  it("detects when active request courses exceed linked payment request received money", () => {
    const pr: PaymentRequest = {
      id: "PR-2026-0065",
      name: "Hieu TEST01",
      uid: "123213213",
      phone: "934428192",
      country: "VN",
      address: "Hanoi",
      target: 6000,
      source: "manual",
      createdAt: "2026-05-29T14:56:16.000Z",
      received: 2000,
      doneCount: 2,
      totalCount: 2,
      delta: -4000,
      state: "short",
      payments: [],
    };
    const overAllocated: ActiveRequest = {
      ...ar,
      uids: [
        {
          ...ar.uids[0],
          courses: [
            { ...ar.uids[0].courses[0], amount: 2000 },
            { ...ar.uids[0].courses[0], courseCode: "CC-0044-002", amount: 4000 },
          ],
        },
      ],
    };

    expect(activeRequestAllocation(overAllocated, pr)).toMatchObject({
      total: 6000,
      received: 2000,
      remaining: 0,
      overAmount: 4000,
      isOver: true,
    });
  });

  it("đọc field referral snake_case từ API về camelCase", () => {
    const raw: ActiveRequestApiRow = {
      id: "AR-2026-0099",
      pr_id: "PR-2026-0099",
      customer_name: "Khách B",
      uids_data: [
        {
          uid: "BUYER_B",
          phone: "0900000000",
          country: "VN",
          courses: [
            {
              code: "CC-0099-001",
              name: "Gói X",
              amount: 5000000,
              lead_source: "gioi_thieu",
              referrer_uid: "REFERRER_A",
              bonus_sessions_referee: 2,
              bonus_sessions_referrer: 3,
            },
          ],
        },
      ],
    };

    const course = fromApiActiveRequest(raw).uids[0].courses[0];
    expect(course.leadSource).toBe("gioi_thieu");
    expect(course.referrerUid).toBe("REFERRER_A");
    expect(course.bonusSessionsReferee).toBe(2);
    expect(course.bonusSessionsReferrer).toBe(3);
  });

  it("ghi field referral camelCase ra payload snake_case", () => {
    const arWithReferral: ActiveRequest = {
      ...ar,
      uids: [
        {
          ...ar.uids[0],
          uid: "BUYER_B",
          courses: [
            {
              ...ar.uids[0].courses[0],
              leadSource: "gioi_thieu",
              referrerUid: "REFERRER_A",
              bonusSessionsReferee: 2,
              bonusSessionsReferrer: 3,
            },
          ],
        },
      ],
    };

    expect(toActiveRequestPatchUidsData(arWithReferral)[0].courses[0]).toMatchObject({
      lead_source: "gioi_thieu",
      referrer_uid: "REFERRER_A",
      bonus_sessions_referee: 2,
      bonus_sessions_referrer: 3,
    });
  });
});

describe("visiblePaymentRequests", () => {
  const reqs = [
    { id: "PR-1", isTest: true } as PaymentRequest,
    { id: "PR-2" } as PaymentRequest,
    { id: "PR-3", isTest: false } as PaymentRequest,
  ];

  it("ẩn PR test khi hideTest bật", () => {
    expect(visiblePaymentRequests(reqs, true).map((r) => r.id)).toEqual(["PR-2", "PR-3"]);
  });

  it("giữ nguyên toàn bộ khi hideTest tắt", () => {
    expect(visiblePaymentRequests(reqs, false)).toEqual(reqs);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1);

  it("cắt trang 1 đúng 20 phần tử", () => {
    const s = paginate(items, 1, 20);
    expect(s.rows).toHaveLength(20);
    expect(s.rows[0]).toBe(1);
    expect(s.totalPages).toBe(3);
    expect(s.page).toBe(1);
    expect(s.from).toBe(1);
    expect(s.to).toBe(20);
  });

  it("trang cuối lẻ phần tử", () => {
    const s = paginate(items, 3, 20);
    expect(s.rows).toEqual([41, 42, 43, 44, 45]);
    expect(s.from).toBe(41);
    expect(s.to).toBe(45);
  });

  it("clamp khi page vượt totalPages (vd sau khi đổi filter danh sách co lại)", () => {
    const s = paginate(items, 99, 20);
    expect(s.page).toBe(3);
    expect(s.rows[0]).toBe(41);
  });

  it("clamp khi page < 1", () => {
    expect(paginate(items, 0, 20).page).toBe(1);
  });

  it("danh sách rỗng: 1 trang rỗng, from/to = 0", () => {
    const s = paginate([], 1, 20);
    expect(s.rows).toEqual([]);
    expect(s.totalPages).toBe(1);
    expect(s.page).toBe(1);
    expect(s.from).toBe(0);
    expect(s.to).toBe(0);
  });
});

describe("pageItems", () => {
  it("ít trang: hiện hết", () => {
    expect(pageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("đầu dãy: 1 2 … cuối", () => {
    expect(pageItems(1, 10)).toEqual([1, 2, "...", 10]);
  });

  it("giữa dãy: 1 … quanh trang hiện tại … cuối", () => {
    expect(pageItems(5, 10)).toEqual([1, "...", 4, 5, 6, "...", 10]);
  });

  it("cuối dãy: 1 … 9 10", () => {
    expect(pageItems(10, 10)).toEqual([1, "...", 9, 10]);
  });
});

describe("validateReferralBonus", () => {
  const base: ActiveRequest = {
    id: "AR-1", prId: "PR-1", customerName: "B", createdAt: "", createdBy: "",
    uids: [{ uid: "BUYER_B", phone: "", country: "VN", courses: [
      { courseCode: "CC-1", packageName: "", amount: 1000, orderId: "", invoiced: false, leadSource: "gioi_thieu" },
    ] }],
  };

  it("không lỗi khi không cộng buổi cho người giới thiệu", () => {
    expect(validateReferralBonus(base)).toBe("");
  });

  it("không lỗi khi chỉ cộng buổi cho người được giới thiệu", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], bonusSessionsReferee: 2 },
    ] }] };
    expect(validateReferralBonus(ar)).toBe("");
  });

  it("báo lỗi khi cộng buổi người giới thiệu nhưng thiếu UID", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], bonusSessionsReferrer: 3 },
    ] }] };
    expect(validateReferralBonus(ar)).toContain("chưa nhập UID người giới thiệu");
  });

  it("báo lỗi khi UID người giới thiệu trùng UID người được giới thiệu", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], bonusSessionsReferrer: 3, referrerUid: "BUYER_B" },
    ] }] };
    expect(validateReferralBonus(ar)).toContain("phải khác");
  });

  it("hợp lệ khi đủ UID người giới thiệu khác người được giới thiệu", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], bonusSessionsReferrer: 3, referrerUid: "REFERRER_A" },
    ] }] };
    expect(validateReferralBonus(ar)).toBe("");
  });

  it("bỏ qua course không phải nguồn Giới thiệu", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], leadSource: "quang_cao", bonusSessionsReferrer: 3 },
    ] }] };
    expect(validateReferralBonus(ar)).toBe("");
  });
});
