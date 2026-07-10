import { describe, expect, it } from "vitest";
import type { ActiveRequest, ActiveRequestApiRow, PaymentAttempt, PaymentRequest } from "../../types/paymentRequest";
import {
  activationSummary,
  activeRequestAllocation,
  buildCreateActiveRequestPayload,
  formatCoursePhone,
  fromApiActiveRequest,
  fromApiAttempt,
  fromApiPaymentRequest,
  getArReferralStatus,
  getReferralStatus,
  hasUnmatchedCardLine,
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
      { childName: "", uid: pr.uid, packageName: "2/W-NEW 24 PHI+2 HN", amount: pr.received },
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
      { childName: "Bé Một", uid: "u1", packageName: "Gói A", amount: 1200 },
      { childName: "Bé Hai", uid: "", packageName: "Gói B", amount: 800 },
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
      { childName: "Bé Một", uid: "u1", packageName: "Gói A", amount: 1500 },
      { childName: "Bé Một", uid: "u1", packageName: "Gói phụ", amount: 500 },
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

// ─── Bộ lọc "Chưa ghép thẻ/TG" (10/7) ────────────────────────────────────
describe("hasUnmatchedCardLine", () => {
  const line = (overrides: Partial<PaymentAttempt>): PaymentAttempt => ({
    id: "l1",
    idx: 1,
    amount: 1_000_000,
    status: "pending",
    createdAt: "2026-07-01T00:00:00Z",
    code: "ABCDE",
    bill: false,
    method: "card",
    ...overrides,
  });
  const pr = (payments: PaymentAttempt[]): PaymentRequest =>
    ({ id: "PR-X", payments } as PaymentRequest);

  it("true khi có lần quẹt thẻ đang pending (chưa ghép)", () => {
    expect(hasUnmatchedCardLine(pr([line({ method: "card" })]))).toBe(true);
  });

  it("true khi có lần trả góp đang pending — dù PR đã đủ tiền từ line khác", () => {
    expect(
      hasUnmatchedCardLine(
        pr([
          line({ id: "qr1", method: "qr", status: "paid" }),
          line({ id: "inst1", method: "installment", status: "pending" }),
        ])
      )
    ).toBe(true);
  });

  it("false khi line thẻ đã xác nhận (đã ghép)", () => {
    expect(hasUnmatchedCardLine(pr([line({ status: "paid" })]))).toBe(false);
  });

  it("false khi line thẻ đã huỷ / bị từ chối", () => {
    expect(hasUnmatchedCardLine(pr([line({ status: "rejected", cancelled: true })]))).toBe(false);
    expect(hasUnmatchedCardLine(pr([line({ status: "rejected" })]))).toBe(false);
  });

  it("false khi chỉ có QR/tiền mặt pending (không phải thẻ/trả góp)", () => {
    expect(
      hasUnmatchedCardLine(pr([line({ method: "qr" }), line({ id: "l2", method: "cash" })]))
    ).toBe(false);
  });

  it("false khi không có lần thanh toán nào", () => {
    expect(hasUnmatchedCardLine(pr([]))).toBe(false);
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
});
