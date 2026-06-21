import type { ActiveRequest } from "../../types/paymentRequest";

/** Mock AR rows aligned with Hiếu prototype SAMPLE_ARS + MOCK_PAYMENT_REQUESTS prIds */
export const MOCK_ACTIVE_REQUESTS: ActiveRequest[] = [
  {
    id: "AR-2026-0001",
    prId: "PR-2026-0042",
    customerName: "Nguyễn Thị Mai Anh",
    createdAt: "2026-05-23 17:00",
    createdBy: "admin.tranminhanh",
    uids: [
      {
        uid: "3213123123",
        phone: "0934428123",
        country: "VN",
        courses: [
          {
            courseCode: "CC-0001-001",
            packageName: "2/W- NEW 48 US-UK+2 HN",
            amount: 12_000_000,
            orderId: "ORD-2026-87654",
            invoiced: true,
            invoiceId: "INV-2026-1042",
            invoicedAt: "2026-05-24 09:30",
          },
          {
            courseCode: "CC-0001-002",
            packageName: "2/W- UPSALE 24 US-UK+1 HN",
            amount: 12_000_000,
            orderId: "ORD-2026-87655",
            invoiced: false,
          },
        ],
      },
    ],
  },
  {
    id: "AR-2026-0002",
    prId: "PR-2026-0040",
    customerName: "Phạm Thu Hương",
    createdAt: "2026-05-25 09:10",
    createdBy: "admin.tranminhanh",
    uids: [
      {
        uid: "0123456789",
        phone: "0123456789",
        country: "VN",
        courses: [
          {
            courseCode: "CC-0002-001",
            packageName: "2/W- NEW 48 US-UK+2 HN",
            amount: 12_000_000,
            orderId: "",
            invoiced: false,
            leadSource: "gioi_thieu",
          },
        ],
      },
    ],
  },
  {
    id: "AR-2026-0003",
    prId: "PR-2026-0038",
    customerName: "Đặng Khánh Linh",
    createdAt: "2026-05-22 11:42",
    createdBy: "admin.tranminhanh",
    uids: [
      {
        uid: "khanhlinh",
        phone: "0987234511",
        country: "VN",
        courses: [
          {
            courseCode: "CC-0003-001",
            packageName: "2/W- UPSALE 96 PHI+10 HN",
            amount: 6_000_000,
            orderId: "ORD-2026-87600",
            invoiced: true,
            invoiceId: "INV-2026-1038",
            invoicedAt: "2026-05-22 15:20",
            leadSource: "gioi_thieu",
            referrerUid: "3213123123",
            bonusSessionsReferee: 2,
            bonusSessionsReferrer: 2,
          },
        ],
      },
    ],
  },
  {
    id: "AR-2026-0004",
    prId: "PR-2026-0036",
    customerName: "Hoàng Thị Lan",
    createdAt: "2026-05-24 09:15",
    createdBy: "admin.tranminhanh",
    uids: [
      {
        uid: "hoanglan_88",
        phone: "0967424123",
        country: "VN",
        courses: [
          {
            courseCode: "CC-0004-001",
            packageName: "2/W- UPSALE 48 PHI+5 HN",
            amount: 6_000_000,
            orderId: "ORD-2026-87612",
            invoiced: true,
            invoiceId: "INV-2026-1036",
            invoicedAt: "2026-05-24 14:05",
          },
        ],
      },
    ],
  },
];
