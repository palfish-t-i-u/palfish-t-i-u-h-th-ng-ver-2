import { describe, expect, it } from "vitest";
import type { ActiveRequest, PaymentRequest } from "../../types/paymentRequest";
import type { BankTransaction } from "../../lib/api";
import {
  bankTxnMatchesSearch,
  canAllocateCourseAmount,
  deriveArStatus,
  remainingReceivedAmount,
} from "./paymentFlowUtils";

describe("bankTxnMatchesSearch — tab CK ngoài chờ ghép", () => {
  const base: BankTransaction = {
    txn_id: "t1",
    date: null,
    amount: 4_290_000,
    content: null,
    transfer_content: "84983436566 Han Gia Han FI4WH",
    account_number: "1680011668899",
    sub_account: null,
    transaction_date: "2026-07-06T13:41:00+00:00",
    match_status: "pending",
    gateway: "manual",
    payment_line_id: null,
    matched_by: null,
    created_at: "2026-07-06T13:41:00+00:00",
    updated_at: "2026-07-06T13:41:00+00:00",
  };

  it("query rỗng / chỉ khoảng trắng → khớp tất cả", () => {
    expect(bankTxnMatchesSearch(base, "")).toBe(true);
    expect(bankTxnMatchesSearch(base, "   ")).toBe(true);
  });

  it("khớp tên trong nội dung CK, không phân biệt dấu (đúng case anh Long)", () => {
    expect(bankTxnMatchesSearch(base, "gia han")).toBe(true);
    expect(bankTxnMatchesSearch(base, "Gia Hân")).toBe(true);
    expect(bankTxnMatchesSearch({ ...base, transfer_content: "Nguyễn Hoàng" }, "nguyen hoang")).toBe(true);
  });

  it("khớp số tiền theo digits, bỏ dấu phẩy/chấm người dùng gõ", () => {
    expect(bankTxnMatchesSearch(base, "4290000")).toBe(true);
    expect(bankTxnMatchesSearch(base, "4,290,000")).toBe(true);
    expect(bankTxnMatchesSearch(base, "429")).toBe(true); // substring
    expect(bankTxnMatchesSearch(base, "9999999")).toBe(false);
  });

  it("khớp số TK nhận + fallback field content khi transfer_content rỗng", () => {
    expect(bankTxnMatchesSearch(base, "1680011668899")).toBe(true);
    expect(bankTxnMatchesSearch({ ...base, transfer_content: null, content: "QR giahan26b" }, "giahan")).toBe(true);
  });

  it("không khớp → false", () => {
    expect(bankTxnMatchesSearch(base, "khong ton tai")).toBe(false);
  });
});

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

describe("active request received allocation", () => {
  const baseAr: ActiveRequest = {
    id: "AR-2026-0030",
    prId: "PR-2026-0060",
    customerName: "Allocation Test",
    createdAt: "2026-05-30T10:00:00.000Z",
    createdBy: "minh",
    uids: [
      {
        uid: "uid-1",
        phone: "0900000001",
        country: "VN",
        courses: [
          {
            courseCode: "CC-0060-001",
            packageName: "Course A",
            amount: 300_000,
            orderId: "",
            invoiced: false,
          },
        ],
      },
    ],
  };

  const basePr: PaymentRequest = {
    id: "PR-2026-0060",
    name: "Allocation PR",
    uid: "uid-1",
    phone: "0900000001",
    country: "VN",
    address: "HN",
    target: 1_000_000,
    source: "manual",
    createdAt: "2026-05-30T10:00:00.000Z",
    received: 500_000,
    doneCount: 1,
    totalCount: 1,
    delta: -500_000,
    state: "short",
    payments: [],
  };

  it("uses received amount, not target amount, for the next course default", () => {
    expect(remainingReceivedAmount(baseAr, basePr)).toBe(200_000);
  });

  it("blocks saving a course amount that would exceed received money", () => {
    expect(canAllocateCourseAmount(baseAr, basePr, "CC-0060-001", 500_000)).toBe(true);
    expect(canAllocateCourseAmount(baseAr, basePr, "CC-0060-001", 500_001)).toBe(false);
  });

  it("does not cap standalone active requests without a linked PR", () => {
    expect(canAllocateCourseAmount(baseAr, null, "CC-0060-001", 5_000_000)).toBe(true);
  });
});
