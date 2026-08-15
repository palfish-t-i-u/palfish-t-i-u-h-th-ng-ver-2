import { describe, it, expect } from "vitest";
import type { ActiveRequest, ActiveCourse } from "../../types/paymentRequest";
import {
  AR_PER_PAGE,
  applyCourseOrderId,
  countCourseTabs,
  courseRowMatchesSearch,
  courseRowMatchesTab,
  flatCourseRows,
  groupRowsByAr,
  isArInvoiceActionable,
  summarizeArInvoiceAction,
  visibleActiveRequests,
} from "./activationFlatList";
import { normVi } from "../../lib/textUtils";

function course(over: Partial<ActiveCourse> = {}): ActiveCourse {
  return { courseCode: "CC-0001-001", packageName: "Gói 24 buổi", amount: 1_000_000, orderId: "", invoiced: false, ...over };
}

function ar(over: Partial<ActiveRequest> = {}): ActiveRequest {
  return {
    id: "AR-0001",
    prId: "PR-2026-0001",
    customerName: "Nguyễn Văn A",
    createdAt: "2026-07-30T10:00:00Z",
    createdBy: "ops@example.com",
    uids: [{ uid: "U1", phone: "0900000000", country: "VN", courses: [course()] }],
    ...over,
  };
}

/** AR nửa vời: 1 khoá đã có Order ID, 1 khoá chưa. */
const halfFilled = ar({
  id: "AR-2",
  prId: "PR-2",
  uids: [
    {
      uid: "U2",
      phone: "0",
      country: "VN",
      courses: [
        course({ courseCode: "CC-2-001", orderId: "OID-1" }),
        course({ courseCode: "CC-2-002", orderId: "" }),
      ],
    },
  ],
});

describe("flatCourseRows", () => {
  it("một dòng cho mỗi khoá học của mỗi UID", () => {
    const rows = flatCourseRows([halfFilled]);
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe("AR-2::0::0");
    expect(rows[0].activated).toBe(true);
    expect(rows[1].activated).toBe(false);
    expect(rows[0].courseCode).toBe("CC-2-001");
  });

  it("map đúng tên khách, sale, uid, gói, tiền", () => {
    const row = flatCourseRows([ar({ saleName: "Chị Thu" })])[0];
    expect(row.arId).toBe("AR-0001");
    expect(row.prId).toBe("PR-2026-0001");
    expect(row.customerName).toBe("Nguyễn Văn A");
    expect(row.saleName).toBe("Chị Thu");
    expect(row.uid).toBe("U1");
    expect(row.packageName).toBe("Gói 24 buổi");
    expect(row.amount).toBe(1_000_000);
  });

  it("uidName lấy từ tên bé (multi-con); null khi không có", () => {
    const withName = ar({ uids: [{ uid: "U9", name: "Bé Bơ", phone: "0", country: "VN", courses: [course()] }] });
    expect(flatCourseRows([withName])[0].uidName).toBe("Bé Bơ");
    expect(flatCourseRows([ar()])[0].uidName).toBeNull();
  });

  it("referral null khi không phải nguồn giới thiệu; full khi đã cộng đủ", () => {
    expect(flatCourseRows([ar()])[0].referral).toBeNull();
    const ref = ar({
      uids: [
        {
          uid: "U3",
          phone: "0",
          country: "VN",
          courses: [
            course({ courseCode: "CC-3-001", leadSource: "gioi_thieu", bonusSessionsReferee: 2, refereeCreditedAt: "2026-07-30T00:00:00Z" }),
          ],
        },
      ],
    });
    expect(flatCourseRows([ref])[0].referral).toBe("full");
  });

  it("multi-UID AR: key và số dòng đúng", () => {
    const multiUid = ar({
      id: "MU-1",
      uids: [
        { uid: "UA", phone: "0", country: "VN", courses: [course({ courseCode: "CC-MU-001" })] },
        { uid: "UB", phone: "0", country: "VN", courses: [course({ courseCode: "CC-MU-002" })] },
      ],
    });
    const rows = flatCourseRows([multiUid]);
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe("MU-1::0::0");
    expect(rows[1].key).toBe("MU-1::1::0");
    expect(rows[0].uid).toBe("UA");
    expect(rows[1].uid).toBe("UB");
  });

  it("invoiced và holdActivation truyền xuống dòng", () => {
    const inv = ar({ holdActivation: true, holdNote: "chờ khách xác nhận", uids: [{ uid: "U4", phone: "0", country: "VN", courses: [course({ orderId: "X", invoiced: true })] }] });
    const row = flatCourseRows([inv])[0];
    expect(row.invoiced).toBe(true);
    expect(row.holdActivation).toBe(true);
    expect(row.holdNote).toBe("chờ khách xác nhận");
  });
});

describe("courseRowMatchesTab", () => {
  it("tách dòng theo trạng thái từng khoá (AR nửa vời)", () => {
    const [activated, pending] = flatCourseRows([halfFilled]);
    expect(courseRowMatchesTab(activated, "activated")).toBe(true);
    expect(courseRowMatchesTab(activated, "pending_order")).toBe(false);
    expect(courseRowMatchesTab(pending, "pending_order")).toBe(true);
    expect(courseRowMatchesTab(pending, "activated")).toBe(false);
    expect(courseRowMatchesTab(pending, "all")).toBe(true);
  });
});

describe("countCourseTabs", () => {
  it("đếm ở cấp khoá học, tách AR nửa vời", () => {
    expect(countCourseTabs([halfFilled])).toEqual({ all: 2, activated: 1, pending_order: 1 });
  });
});

describe("courseRowMatchesSearch", () => {
  it("bỏ dấu tiếng Việt, khớp nhiều trường", () => {
    const row = flatCourseRows([ar({ customerName: "Đặng Thuý" })])[0];
    expect(courseRowMatchesSearch(row, normVi("dang thuy"))).toBe(true);
    expect(courseRowMatchesSearch(row, normVi("PR-2026"))).toBe(true);
    expect(courseRowMatchesSearch(row, normVi("khong-ton-tai"))).toBe(false);
    expect(courseRowMatchesSearch(row, "")).toBe(true);
  });
});

describe("groupRowsByAr", () => {
  it("gom dòng theo AR, giữ thứ tự xuất hiện", () => {
    const rows = flatCourseRows([ar({ id: "A", prId: "PR-A" }), ar({ id: "B", prId: "PR-B" })]);
    const groups = groupRowsByAr(rows);
    expect(groups.map((g) => g.arId)).toEqual(["A", "B"]);
    expect(groups[0].rows).toHaveLength(1);
  });

  it("một AR với nhiều khoá → một cụm, nhiều dòng", () => {
    const groups = groupRowsByAr(flatCourseRows([halfFilled]));
    expect(groups).toHaveLength(1);
    expect(groups[0].arId).toBe("AR-2");
    expect(groups[0].rows).toHaveLength(2);
  });
});

describe("applyCourseOrderId", () => {
  it("gán Order ID đúng khoá, bất biến (không sửa bản gốc)", () => {
    const base = ar();
    const next = applyCourseOrderId(base, "CC-0001-001", "OID-9");
    expect(next).not.toBe(base);
    expect(next.uids[0].courses[0].orderId).toBe("OID-9");
    expect(base.uids[0].courses[0].orderId).toBe("");
  });
});

describe("AR_PER_PAGE", () => {
  it("là số dương", () => {
    expect(AR_PER_PAGE).toBe(12);
  });
});

describe("summarizeArInvoiceAction", () => {
  it("empty: AR không có khoá nào", () => {
    expect(summarizeArInvoiceAction([])).toEqual({ kind: "empty" });
  });

  it("all_invoiced: mọi khoá đã xuất HĐ", () => {
    const a = summarizeArInvoiceAction([
      { invoiced: true, requested: false, hardMissing: [] },
      { invoiced: true, requested: true, hardMissing: [] },
    ]);
    expect(a).toEqual({ kind: "all_invoiced" });
  });

  it("all_requested: hết khoá chờ nhưng chưa xuất hết (còn khoá mới yêu cầu)", () => {
    const a = summarizeArInvoiceAction([
      { invoiced: true, requested: false, hardMissing: [] },
      { invoiced: false, requested: true, hardMissing: [] },
    ]);
    expect(a).toEqual({ kind: "all_requested" });
  });

  it("ready: còn khoá chờ, không vướng blocker cứng", () => {
    const a = summarizeArInvoiceAction([
      { invoiced: false, requested: false, hardMissing: [] },
    ]);
    expect(a).toEqual({ kind: "ready" });
  });

  it("blocked: khoá chờ còn thiếu điều kiện cứng, gộp trùng nhãn", () => {
    const a = summarizeArInvoiceAction([
      { invoiced: false, requested: false, hardMissing: ["số tiền"] },
      { invoiced: false, requested: false, hardMissing: ["số tiền", "địa chỉ"] },
    ]);
    expect(a.kind).toBe("blocked");
    if (a.kind === "blocked") expect(a.missing.sort()).toEqual(["số tiền", "địa chỉ"].sort());
  });

  it("blocker cứng chỉ xét khoá CHỜ — khoá đã xuất/đã yêu cầu bị bỏ qua", () => {
    const a = summarizeArInvoiceAction([
      { invoiced: true, requested: false, hardMissing: ["số tiền"] }, // đã xuất → không tính
      { invoiced: false, requested: false, hardMissing: [] }, // chờ, đủ điều kiện
    ]);
    expect(a).toEqual({ kind: "ready" });
  });
});

describe("isArInvoiceActionable", () => {
  it("chỉ 'ready' mới cho chọn + xuất", () => {
    expect(isArInvoiceActionable({ kind: "ready" })).toBe(true);
    expect(isArInvoiceActionable({ kind: "empty" })).toBe(false);
    expect(isArInvoiceActionable({ kind: "all_invoiced" })).toBe(false);
    expect(isArInvoiceActionable({ kind: "all_requested" })).toBe(false);
    expect(isArInvoiceActionable({ kind: "blocked", missing: ["số tiền"] })).toBe(false);
  });
});

describe("visibleActiveRequests", () => {
  it("ẩn AR có creditSettlementPending=true, giữ phần còn lại", () => {
    const pending = ar({ id: "AR-CARD", creditSettlementPending: true });
    const shown = ar({ id: "AR-QR" });
    const legacy = ar({ id: "AR-OLD" }); // field undefined → hiện
    const out = visibleActiveRequests([pending, shown, legacy]);
    expect(out.map((a) => a.id)).toEqual(["AR-QR", "AR-OLD"]);
  });
});
