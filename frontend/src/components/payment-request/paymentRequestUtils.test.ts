import { describe, expect, it } from "vitest";
import type { ActiveRequest, ActiveRequestApiRow, PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";
import {
  activationSummary,
  activeRequestAllocation,
  buildCreateActiveRequestPayload,
  displayReceived,
  feeTotal,
  formatCoursePhone,
  fromApiActiveRequest,
  fromApiAttempt,
  fromApiPaymentRequest,
  getArReferralStatus,
  getReferralStatus,
  grossReceived,
  hasUnverifiedFeeLine,
  lineNet,
  normalizeRequest,
  pageItems,
  paginate,
  paymentConfirmationText,
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
          courses: [{ ...ar.uids[0].courses[0], orderId: "ORD-CRM-88901", invoiced: false }],
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

    // 10/7 — modal AR mở rộng: builder nhận danh sách dòng {bé, gói, tiền}
    const payload = buildCreateActiveRequestPayload(pr, [
      { childName: "", uid: pr.uid, packageName: "2/W-NEW 24 PHI+2 HN", amount: pr.received, leadSource: "", leadChannel: "" },
    ]);
    expect(payload.uids).toHaveLength(1);
    expect(payload.uids[0].uid).toBe(pr.uid);
    // PR 1 con không tên → không gửi key name (payload y hệt flow cũ — G3)
    expect(payload.uids[0].name).toBeUndefined();
    expect(payload.uids[0].courses[0].amount).toBe(2000);
    // 7/7 — tên gói bắt buộc, không còn gửi name rỗng lên BE
    expect(payload.uids[0].courses[0].name).toBe("2/W-NEW 24 PHI+2 HN");
  });

  it("2 bé → 2 uid block, mỗi block mang name bé (modal AR mở rộng)", () => {
    const pr: PaymentRequest = {
      id: "PR-2026-0070",
      name: "Me Hai Be",
      uid: "u1",
      phone: "0912345678",
      country: "VN",
      address: "Hanoi",
      target: 2000,
      source: "manual",
      createdAt: "2026-07-10T00:00:00.000Z",
      received: 2000,
      doneCount: 1,
      totalCount: 1,
      delta: 0,
      state: "done",
      payments: [],
    };
    const payload = buildCreateActiveRequestPayload(pr, [
      { childName: "Bé Một", uid: "u1", packageName: "Gói A", amount: 1200, leadSource: "", leadChannel: "" },
      { childName: "Bé Hai", uid: "", packageName: "Gói B", amount: 800, leadSource: "", leadChannel: "" },
    ]);
    expect(payload.uids).toHaveLength(2);
    expect(payload.uids[0]).toMatchObject({ uid: "u1", name: "Bé Một" });
    expect(payload.uids[0].courses).toEqual([{ name: "Gói A", amount: 1200 }]);
    expect(payload.uids[1]).toMatchObject({ uid: "", name: "Bé Hai" });
    expect(payload.uids[1].courses).toEqual([{ name: "Gói B", amount: 800 }]);
  });

  it("2 gói cùng 1 bé → 1 block 2 courses", () => {
    const pr: PaymentRequest = {
      id: "PR-2026-0071",
      name: "Me Mot Be",
      uid: "u1",
      phone: "0912345678",
      country: "VN",
      address: "Hanoi",
      target: 2000,
      source: "manual",
      createdAt: "2026-07-10T00:00:00.000Z",
      received: 2000,
      doneCount: 1,
      totalCount: 1,
      delta: 0,
      state: "done",
      payments: [],
    };
    const payload = buildCreateActiveRequestPayload(pr, [
      { childName: "Bé Một", uid: "u1", packageName: "Gói A", amount: 1500, leadSource: "", leadChannel: "" },
      { childName: "Bé Một", uid: "u1", packageName: "Gói phụ", amount: 500, leadSource: "", leadChannel: "" },
    ]);
    expect(payload.uids).toHaveLength(1);
    expect(payload.uids[0].courses).toEqual([
      { name: "Gói A", amount: 1500 },
      { name: "Gói phụ", amount: 500 },
    ]);
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

  it("deserialize course cũ (không có field referral) → referral undefined/null", () => {
    const raw: ActiveRequestApiRow = {
      id: "AR-OLD",
      pr_id: "PR-OLD",
      customer_name: "Khách cũ",
      uids_data: [{
        uid: "U1", phone: "0900000000", country: "VN",
        courses: [{ code: "CC-1", name: "Gói cũ", amount: 3000000 }],
      }],
    };
    const course = fromApiActiveRequest(raw).uids[0].courses[0];
    expect(course.referrerUid).toBeUndefined();
    expect(course.bonusSessionsReferee).toBeUndefined();
    expect(course.bonusSessionsReferrer).toBeUndefined();
    expect(course.refereeCreditedAt).toBeNull();
    expect(course.referrerCreditedAt).toBeNull();
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

// ─── Referral bonus ────────────────────────────────────────────────────

describe("getReferralStatus", () => {
  it("returns 'full' when all sides credited", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2,
      bonusSessionsReferrer: 3,
      refereeCreditedAt: "2026-06-19T10:00:00Z",
      referrerCreditedAt: "2026-06-19T11:00:00Z",
    })).toBe("full");
  });

  it("returns 'none' when no side credited", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2,
      bonusSessionsReferrer: 3,
      refereeCreditedAt: null,
      referrerCreditedAt: null,
    })).toBe("none");
  });

  it("returns 'partial' when only referee credited", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2,
      bonusSessionsReferrer: 3,
      refereeCreditedAt: "2026-06-19T10:00:00Z",
      referrerCreditedAt: null,
    })).toBe("partial");
  });

  it("returns 'partial' when only referrer credited", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2,
      bonusSessionsReferrer: 3,
      refereeCreditedAt: null,
      referrerCreditedAt: "2026-06-19T11:00:00Z",
    })).toBe("partial");
  });

  it("returns 'full' when only referee has bonus and is credited", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2,
      bonusSessionsReferrer: 0,
      refereeCreditedAt: "2026-06-19T10:00:00Z",
      referrerCreditedAt: null,
    })).toBe("full");
  });

  it("returns 'full' when only referrer has bonus and is credited", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 0,
      bonusSessionsReferrer: 3,
      refereeCreditedAt: null,
      referrerCreditedAt: "2026-06-19T11:00:00Z",
    })).toBe("full");
  });

  it("returns 'none' when both bonus are 0 (no referral)", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 0,
      bonusSessionsReferrer: 0,
    })).toBe("none");
  });
});

describe("getArReferralStatus", () => {
  const baseAr: ActiveRequest = {
    id: "AR-2026-0099",
    prId: "PR-2026-0099",
    customerName: "Test",
    createdAt: "2026-06-19T10:00:00Z",
    createdBy: "admin",
    uids: [],
  };

  it("returns null when AR has no referral courses", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{ courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "", invoiced: false }],
      }],
    };
    expect(getArReferralStatus(ar)).toBeNull();
  });

  it("returns null when leadSource=gioi_thieu but no bonus sessions", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{
          courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "", invoiced: false,
          leadSource: "gioi_thieu", bonusSessionsReferee: 0, bonusSessionsReferrer: 0,
        }],
      }],
    };
    expect(getArReferralStatus(ar)).toBeNull();
  });

  it("returns 'none' when referral courses exist but none credited", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{
          courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "ORD-1", invoiced: false,
          leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
          referrerUid: "UID2", refereeCreditedAt: null, referrerCreditedAt: null,
        }],
      }],
    };
    expect(getArReferralStatus(ar)).toBe("none");
  });

  it("returns 'full' when all referral courses fully credited", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{
          courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "ORD-1", invoiced: false,
          leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
          referrerUid: "UID2",
          refereeCreditedAt: "2026-06-19T10:00:00Z",
          referrerCreditedAt: "2026-06-19T11:00:00Z",
        }],
      }],
    };
    expect(getArReferralStatus(ar)).toBe("full");
  });

  it("returns 'partial' when mixed credited status across courses", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [
          {
            courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "ORD-1", invoiced: false,
            leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
            referrerUid: "UID2",
            refereeCreditedAt: "2026-06-19T10:00:00Z",
            referrerCreditedAt: "2026-06-19T11:00:00Z",
          },
          {
            courseCode: "CC-002", packageName: "Gói B", amount: 3000000, orderId: "ORD-2", invoiced: false,
            leadSource: "gioi_thieu", bonusSessionsReferee: 1, bonusSessionsReferrer: 1,
            referrerUid: "UID2",
            refereeCreditedAt: null, referrerCreditedAt: null,
          },
        ],
      }],
    };
    expect(getArReferralStatus(ar)).toBe("partial");
  });
});

describe("validateReferralBonus", () => {
  const baseAr: ActiveRequest = {
    id: "AR-2026-0099",
    prId: "PR-2026-0099",
    customerName: "Test",
    createdAt: "2026-06-19T10:00:00Z",
    createdBy: "admin",
    uids: [],
  };

  it("returns empty string when no referral courses", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{ courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "", invoiced: false }],
      }],
    };
    expect(validateReferralBonus(ar)).toBe("");
  });

  it("returns empty string when referral is valid", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{
          courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "", invoiced: false,
          leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
          referrerUid: "UID2",
        }],
      }],
    };
    expect(validateReferralBonus(ar)).toBe("");
  });

  it("returns error when referrer bonus set but no referrer UID", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{
          courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "", invoiced: false,
          leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
          referrerUid: "",
        }],
      }],
    };
    expect(validateReferralBonus(ar)).toContain("chưa nhập UID");
  });

  it("returns error when referrer UID equals referee UID", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{
          courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "", invoiced: false,
          leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
          referrerUid: "UID1",
        }],
      }],
    };
    expect(validateReferralBonus(ar)).toContain("phải khác UID");
  });

  it("passes when only referee bonus (no referrer bonus)", () => {
    const ar: ActiveRequest = {
      ...baseAr,
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{
          courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "", invoiced: false,
          leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 0,
        }],
      }],
    };
    expect(validateReferralBonus(ar)).toBe("");
  });
});

describe("toActiveRequestPatchUidsData — referral fields", () => {
  it("includes referral fields in serialized output", () => {
    const ar: ActiveRequest = {
      id: "AR-2026-0099",
      prId: "PR-2026-0099",
      customerName: "Test",
      createdAt: "2026-06-19T10:00:00Z",
      createdBy: "admin",
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{
          courseCode: "CC-001", packageName: "Gói A", amount: 5000000, orderId: "ORD-1", invoiced: false,
          leadSource: "gioi_thieu",
          referrerUid: "UID2",
          bonusSessionsReferee: 2,
          bonusSessionsReferrer: 3,
        }],
      }],
    };
    const result = toActiveRequestPatchUidsData(ar);
    const course = result[0].courses[0];
    expect(course.referrer_uid).toBe("UID2");
    expect(course.bonus_sessions_referee).toBe(2);
    expect(course.bonus_sessions_referrer).toBe(3);
  });

  it("sends undefined referral fields when not set", () => {
    const ar: ActiveRequest = {
      id: "AR-2026-0100",
      prId: "PR-2026-0100",
      customerName: "Test2",
      createdAt: "2026-06-19T10:00:00Z",
      createdBy: "admin",
      uids: [{
        uid: "UID1", phone: "123", country: "VN",
        courses: [{
          courseCode: "CC-001", packageName: "Gói B", amount: 3000000, orderId: "", invoiced: false,
        }],
      }],
    };
    const result = toActiveRequestPatchUidsData(ar);
    const course = result[0].courses[0];
    expect(course.referrer_uid).toBeUndefined();
    expect(course.bonus_sessions_referee).toBeUndefined();
    expect(course.bonus_sessions_referrer).toBeUndefined();
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

  it("báo lỗi khi referrerUid chỉ có whitespace", () => {
    const ar = { ...base, uids: [{ ...base.uids[0], courses: [
      { ...base.uids[0].courses[0], bonusSessionsReferrer: 3, referrerUid: "   " },
    ] }] };
    expect(validateReferralBonus(ar)).toContain("chưa nhập UID người giới thiệu");
  });
});

describe("getReferralStatus", () => {
  it("full khi cả 2 bên đã cộng", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
      refereeCreditedAt: "2026-06-19T10:00:00Z", referrerCreditedAt: "2026-06-19T11:00:00Z",
    })).toBe("full");
  });

  it("none khi chưa cộng bên nào", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
      refereeCreditedAt: null, referrerCreditedAt: null,
    })).toBe("none");
  });

  it("partial khi chỉ referee cộng", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
      refereeCreditedAt: "2026-06-19T10:00:00Z", referrerCreditedAt: null,
    })).toBe("partial");
  });

  it("partial khi chỉ referrer cộng", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
      refereeCreditedAt: null, referrerCreditedAt: "2026-06-19T11:00:00Z",
    })).toBe("partial");
  });

  it("full khi chỉ 1 bên có bonus và đã cộng", () => {
    expect(getReferralStatus({
      bonusSessionsReferee: 2, bonusSessionsReferrer: 0,
      refereeCreditedAt: "2026-06-19T10:00:00Z", referrerCreditedAt: null,
    })).toBe("full");
    expect(getReferralStatus({
      bonusSessionsReferee: 0, bonusSessionsReferrer: 3,
      refereeCreditedAt: null, referrerCreditedAt: "2026-06-19T11:00:00Z",
    })).toBe("full");
  });

  it("none khi cả 2 bên bonus = 0", () => {
    expect(getReferralStatus({ bonusSessionsReferee: 0, bonusSessionsReferrer: 0 })).toBe("none");
  });

  it("none khi field hoàn toàn undefined (course cũ pre-referral)", () => {
    expect(getReferralStatus({})).toBe("none");
    expect(getReferralStatus({ bonusSessionsReferee: undefined, bonusSessionsReferrer: undefined })).toBe("none");
  });
});

describe("getArReferralStatus", () => {
  const baseAr: ActiveRequest = {
    id: "AR-1", prId: "PR-1", customerName: "X", createdAt: "", createdBy: "", uids: [],
  };

  it("null khi không có course giới thiệu", () => {
    const ar: ActiveRequest = { ...baseAr, uids: [{ uid: "U1", phone: "", country: "VN",
      courses: [{ courseCode: "C1", packageName: "", amount: 1000, orderId: "", invoiced: false }],
    }] };
    expect(getArReferralStatus(ar)).toBeNull();
  });

  it("null khi leadSource=gioi_thieu nhưng bonus đều 0", () => {
    const ar: ActiveRequest = { ...baseAr, uids: [{ uid: "U1", phone: "", country: "VN",
      courses: [{ courseCode: "C1", packageName: "", amount: 1000, orderId: "", invoiced: false,
        leadSource: "gioi_thieu", bonusSessionsReferee: 0, bonusSessionsReferrer: 0 }],
    }] };
    expect(getArReferralStatus(ar)).toBeNull();
  });

  it("none khi có referral course nhưng chưa cộng", () => {
    const ar: ActiveRequest = { ...baseAr, uids: [{ uid: "U1", phone: "", country: "VN",
      courses: [{ courseCode: "C1", packageName: "", amount: 1000, orderId: "ORD-1", invoiced: false,
        leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
        referrerUid: "U2", refereeCreditedAt: null, referrerCreditedAt: null }],
    }] };
    expect(getArReferralStatus(ar)).toBe("none");
  });

  it("full khi tất cả referral course đều cộng đủ", () => {
    const ar: ActiveRequest = { ...baseAr, uids: [{ uid: "U1", phone: "", country: "VN",
      courses: [{ courseCode: "C1", packageName: "", amount: 1000, orderId: "ORD-1", invoiced: false,
        leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
        referrerUid: "U2",
        refereeCreditedAt: "2026-06-19T10:00:00Z", referrerCreditedAt: "2026-06-19T11:00:00Z" }],
    }] };
    expect(getArReferralStatus(ar)).toBe("full");
  });

  it("partial khi 1 course full + 1 course none", () => {
    const ar: ActiveRequest = { ...baseAr, uids: [{ uid: "U1", phone: "", country: "VN",
      courses: [
        { courseCode: "C1", packageName: "", amount: 1000, orderId: "ORD-1", invoiced: false,
          leadSource: "gioi_thieu", bonusSessionsReferee: 2, bonusSessionsReferrer: 3,
          referrerUid: "U2",
          refereeCreditedAt: "2026-06-19T10:00:00Z", referrerCreditedAt: "2026-06-19T11:00:00Z" },
        { courseCode: "C2", packageName: "", amount: 2000, orderId: "ORD-2", invoiced: false,
          leadSource: "gioi_thieu", bonusSessionsReferee: 1, bonusSessionsReferrer: 1,
          referrerUid: "U2", refereeCreditedAt: null, referrerCreditedAt: null },
      ],
    }] };
    expect(getArReferralStatus(ar)).toBe("partial");
  });
});

describe("multi-con mappers (10/7)", () => {
  it("maps children và studentName từ API", () => {
    const pr = fromApiPaymentRequest({
      id: "PR-1", name: "Me", uid: "u1", phone: "09",
      children: [{ name: "Bé Một", uid: "u1" }, { name: "Bé Hai", uid: null }],
    });
    expect(pr.children).toEqual([
      { name: "Bé Một", uid: "u1" },
      { name: "Bé Hai", uid: null },
    ]);
    const line = fromApiAttempt({ id: "l1", student_name: "Bé Hai" });
    expect(line.studentName).toBe("Bé Hai");
  });

  it("children undefined khi API không trả (PR cũ)", () => {
    const pr = fromApiPaymentRequest({ id: "PR-1", name: "Me", uid: "u1", phone: "09" });
    expect(pr.children).toBeUndefined();
    const line = fromApiAttempt({ id: "l1" });
    expect(line.studentName).toBeNull();
  });

  it("AR mapper round-trip giữ name của uid block", () => {
    const arMapped = fromApiActiveRequest({
      id: "AR-1", pr_id: "PR-1",
      uids_data: [
        { uid: "u1", courses: [{ code: "CC-1", name: "Gói A", amount: 1 }] },
        { uid: "u2", name: "Bé Hai", courses: [{ code: "CC-2", name: "Gói B", amount: 2 }] },
      ],
    });
    expect(arMapped.uids[0].name).toBeUndefined();
    expect(arMapped.uids[1].name).toBe("Bé Hai");
    const patch = toActiveRequestPatchUidsData(arMapped);
    expect(patch[0].name).toBeUndefined();
    expect(patch[1].name).toBe("Bé Hai");
  });

  it("AR mapper maps payment_request.sale_name → saleName (T6)", () => {
    const ar = fromApiActiveRequest({
      id: "AR-2", pr_id: "PR-2",
      payment_request: { name: "Khach A", sale_name: "Nguyen Thi Hoa", sale_email: "hoa@palfish.com" },
      uids_data: [],
    });
    expect(ar.saleName).toBe("Nguyen Thi Hoa");
  });
});

describe("lineNet — Thừa/Thiếu tính theo NET (12/7)", () => {
  it("qr → luôn dùng amount (gross), verifiedReceived bị bỏ qua", () => {
    const line = fromApiAttempt({ method: "qr", amount: 1000, verified_received: 900 });
    expect(lineNet(line)).toBe(1000);
  });

  it("card đã kế toán xác nhận → dùng verifiedReceived (net)", () => {
    const line = fromApiAttempt({ method: "card", amount: 20000000, verified_received: 19160000 });
    expect(lineNet(line)).toBe(19160000);
  });

  it("installment chưa xác nhận (verifiedReceived null) → fallback amount (gross)", () => {
    const line = fromApiAttempt({ method: "installment", amount: 5000, verified_received: null });
    expect(lineNet(line)).toBe(5000);
  });

  it("card verifiedReceived = 0 → coi như chưa ghép, fallback gross (khớp BE _line_net)", () => {
    const line = fromApiAttempt({ method: "card", amount: 2000, verified_received: 0 });
    expect(lineNet(line)).toBe(2000);
  });
});

describe("normalizeRequest — received tính theo NET", () => {
  it("received = tổng lineNet của các lần đã trả (card verified trừ phí)", () => {
    const raw = fromApiPaymentRequest({
      id: "PR-1", name: "A", uid: "u1", phone: "09", target: 18544000,
      payments: [
        { id: "l1", method: "card", amount: 20000000, verified_received: 19160000, status: "paid" },
      ],
    });
    const pr = normalizeRequest(raw);
    expect(pr.received).toBe(19160000);
    expect(pr.delta).toBe(19160000 - 18544000);
    expect(pr.state).toBe("over");
  });

  it("gross qua target nhưng net dưới target → state lật sang short (đúng nghiệp vụ 'thừa tạm')", () => {
    const raw = fromApiPaymentRequest({
      id: "PR-2", name: "A", uid: "u1", phone: "09", target: 18544000,
      payments: [
        { id: "l1", method: "card", amount: 19600000, verified_received: 18160000, status: "paid" },
      ],
    });
    const pr = normalizeRequest(raw);
    expect(pr.received).toBe(18160000);
    expect(pr.state).toBe("short");
  });
});

describe("regression — PR thuần qr/cash không đổi hành vi (G7)", () => {
  it("PR chỉ có lần qr đã trả → received/state y hệt logic cũ (dùng gross)", () => {
    const raw = fromApiPaymentRequest({
      id: "PR-QR", name: "A", uid: "u1", phone: "09", target: 10000,
      payments: [{ id: "l1", method: "qr", amount: 10000, status: "paid" }],
    });
    const pr = normalizeRequest(raw);
    expect(pr.received).toBe(10000);
    expect(pr.state).toBe("done");
  });
});

describe("displayReceived / grossReceived / feeTotal", () => {
  it("displayReceived cộng net cho card + installment, gross cho qr", () => {
    const raw = fromApiPaymentRequest({
      id: "PR-3", name: "A", uid: "u1", phone: "09", target: 0,
      payments: [
        { id: "l1", method: "qr", amount: 1000, status: "paid" },
        { id: "l2", method: "card", amount: 20000, verified_received: 19160, status: "paid" },
        { id: "l3", method: "installment", amount: 5000, verified_received: null, status: "paid" },
      ],
    });
    expect(displayReceived(raw)).toBe(1000 + 19160 + 5000);
    expect(grossReceived(raw)).toBe(1000 + 20000 + 5000);
  });

  it("feeTotal clamp về 0 khi net > gross, không hiện số âm (G5)", () => {
    const raw = fromApiPaymentRequest({
      id: "PR-4", name: "A", uid: "u1", phone: "09", target: 0,
      payments: [{ id: "l1", method: "card", amount: 1000, verified_received: 1200, status: "paid" }],
    });
    expect(feeTotal(raw)).toBe(0);
  });

  it("feeTotal = gross − net khi có phí thật", () => {
    const raw = fromApiPaymentRequest({
      id: "PR-5", name: "A", uid: "u1", phone: "09", target: 0,
      payments: [{ id: "l1", method: "card", amount: 20000000, verified_received: 19160000, status: "paid" }],
    });
    expect(feeTotal(raw)).toBe(840000);
  });
});

describe("hasUnverifiedFeeLine — bao gồm card (không chỉ installment)", () => {
  it("card đã trả nhưng verifiedReceived null → true", () => {
    const raw = fromApiPaymentRequest({
      id: "PR-6", name: "A", uid: "u1", phone: "09", target: 0,
      payments: [{ id: "l1", method: "card", amount: 1000, status: "paid" }],
    });
    expect(hasUnverifiedFeeLine(raw)).toBe(true);
  });

  it("card đã kế toán xác nhận → false", () => {
    const raw = fromApiPaymentRequest({
      id: "PR-7", name: "A", uid: "u1", phone: "09", target: 0,
      payments: [{ id: "l1", method: "card", amount: 1000, verified_received: 950, status: "paid" }],
    });
    expect(hasUnverifiedFeeLine(raw)).toBe(false);
  });

  it("qr không bao giờ tính là unverified fee line", () => {
    const raw = fromApiPaymentRequest({
      id: "PR-8", name: "A", uid: "u1", phone: "09", target: 0,
      payments: [{ id: "l1", method: "qr", amount: 1000, status: "paid" }],
    });
    expect(hasUnverifiedFeeLine(raw)).toBe(false);
  });
});

describe("paymentConfirmationText — người ghép vs máy tự (fix nhãn gateway 13/7)", () => {
  const mk = (o: Partial<PaymentAttempt>) =>
    ({ status: "paid", paidAt: "2026-07-13T03:44:38Z", ...o } as PaymentAttempt);

  it("gateway + người ghép (có confirmedByName) → 'bởi <người>', KHÔNG 'tự động'", () => {
    const t = paymentConfirmationText(mk({
      confirmedSource: "gateway", confirmedBy: "van.nh96@gmail.com", confirmedByName: "Vân NH",
    }));
    expect(t).toContain("bởi Vân NH");
    expect(t).not.toContain("tự động");
  });

  it("gateway + người ghép (thiếu confirmedByName) → fallback tên, vẫn có 'bởi'", () => {
    const t = paymentConfirmationText(mk({
      confirmedSource: "gateway", confirmedBy: "van.nh96@gmail.com", confirmedByName: null,
    }));
    expect(t).toContain("bởi");
    expect(t).not.toContain("tự động");
  });

  it("manual + người → 'bởi <người>' (không đổi)", () => {
    const t = paymentConfirmationText(mk({
      confirmedSource: "manual", confirmedBy: "anhminhcv0512@gmail.com", confirmedByName: "Anh Minh",
    }));
    expect(t).toContain("bởi Anh Minh");
    expect(t).not.toContain("tự động");
  });

  it("sepay + system:sepay → 'tự động' (không đổi)", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: "sepay", confirmedBy: "system:sepay" }));
    expect(t).toContain("tự động");
    expect(t).not.toContain("bởi");
  });

  it("payos + system:payos → 'tự động' (không đổi)", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: "payos", confirmedBy: "system:payos" }));
    expect(t).toContain("tự động");
  });

  it("G2: legacy null-source + null actor → 'Xác nhận lúc …', KHÔNG 'tự động', KHÔNG 'bởi'", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: null, confirmedBy: null }));
    expect(t).toContain("Xác nhận lúc");
    expect(t).not.toContain("tự động");
    expect(t).not.toContain("bởi");
  });

  it("manual_repair + null actor → không 'tự động' (1 dòng prod)", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: "manual_repair", confirmedBy: null }));
    expect(t).not.toContain("tự động");
  });

  it("người thật, không có paidAt → 'Xác nhận bởi <người>' (không có 'lúc')", () => {
    const t = paymentConfirmationText(mk({
      paidAt: null, confirmedSource: "gateway", confirmedBy: "van.nh96@gmail.com", confirmedByName: "Vân NH",
    }));
    expect(t).toBe("Xác nhận bởi Vân NH");
  });

  it("system actor, không có paidAt → 'Xác nhận tự động'", () => {
    const t = paymentConfirmationText(mk({ paidAt: null, confirmedSource: "sepay", confirmedBy: "system:sepay" }));
    expect(t).toBe("Xác nhận tự động");
  });

  it("phòng thủ: source sepay nhưng thiếu actor → vẫn 'tự động'", () => {
    const t = paymentConfirmationText(mk({ confirmedSource: "sepay", confirmedBy: null }));
    expect(t).toContain("tự động");
  });
});
