import type {
  ActiveRequest,
  ActiveRequestStatus,
  PaymentAttempt,
  PaymentMethod,
  PaymentRequest,
} from "../../types/paymentRequest";
import { fmtPhone, nowStamp, vnd } from "../payment-request/paymentRequestUtils";

export type TxnDisplayStatus = "awaiting" | "confirmed" | "rejected" | "cancelled" | "unsent";

export interface FlatTransaction extends PaymentAttempt {
  key: string;
  prId: string;
  prName: string;
  pr: PaymentRequest;
}

export interface InvoiceRow {
  key: string;
  ar: ActiveRequest;
  pr: PaymentRequest | null;
  uidObj: ActiveRequest["uids"][0];
  uidIdx: number;
  courseIdx: number;
  course: ActiveRequest["uids"][0]["courses"][0];
}

export const TXN_STATUS_META: Record<
  TxnDisplayStatus,
  { cls: string; text: string }
> = {
  awaiting: { cls: "is-over", text: "Chờ xác nhận" },
  confirmed: { cls: "is-done", text: "Đã xác nhận" },
  rejected: { cls: "is-short", text: "Kế toán từ chối" },
  cancelled: { cls: "is-cancelled", text: "Sales huỷ" },
  unsent: { cls: "is-pending", text: "Chờ chuyển khoản" },
};

export const METHOD_META: Record<
  PaymentMethod,
  { cls: string; label: string; icon: "QrCode" | "Cash" | "Bank" | "Sigma" }
> = {
  qr: { cls: "method-qr", label: "Chuyển khoản", icon: "QrCode" },
  cash: { cls: "method-cash", label: "Tiền mặt", icon: "Cash" },
  card: { cls: "method-card", label: "Quẹt thẻ", icon: "Bank" },
  installment: { cls: "method-installment", label: "Trả góp", icon: "Sigma" },
};

export const AR_STATUS_META: Record<
  ActiveRequestStatus,
  { cls: string; text: string }
> = {
  pending_order: { cls: "is-ar-pending", text: "Chờ tạo đơn" },
  partial_order: { cls: "is-ar-partial", text: "Đang điền Order ID" },
  ready_invoice: { cls: "is-ar-ready", text: "Sẵn sàng xuất HĐ" },
  invoiced: { cls: "is-ar-invoiced", text: "Đã xuất hoá đơn" },
};

export function txnDisplayStatus(qr: PaymentAttempt): TxnDisplayStatus {
  if (qr.cancelled) return "cancelled";
  if (qr.status === "paid") return "confirmed";
  if (qr.status === "rejected") return "rejected";
  // QR đã tạo link PayOS → chờ tiền về / webhook (tab "Chờ xác nhận"), không gom vào "Chờ chuyển khoản"
  if (qr.method === "qr" && qr.status === "pending") return "awaiting";
  if (!qr.bill && qr.method === "qr") return "unsent";
  return "awaiting";
}

export function flattenTransactions(requests: PaymentRequest[]): FlatTransaction[] {
  const rows: FlatTransaction[] = [];
  for (const pr of requests) {
    if (pr.state === "cancelled") continue;
    for (const p of pr.payments) {
      if (p.cancelled) continue;
      rows.push({
        ...p,
        key: `${pr.id}::${p.id}`,
        prId: pr.id,
        prName: pr.name,
        pr,
      });
    }
  }
  return rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function flatCourses(ar: ActiveRequest) {
  return ar.uids.flatMap((u) =>
    u.courses.map((c) => ({ ...c, uid: u.uid, uidPhone: u.phone, uidCountry: u.country }))
  );
}

export function nextCourseCode(ar: ActiveRequest): string {
  const all = flatCourses(ar);
  const arNumPart = ar.id.replace(/[^\d]/g, "").slice(-4) || "0000";
  return `CC-${arNumPart}-${String(all.length + 1).padStart(3, "0")}`;
}

export function deriveArStatus(ar: ActiveRequest): ActiveRequestStatus {
  const all = flatCourses(ar);
  if (all.length === 0) return "pending_order";
  const ordered = all.filter((c) => c.orderId?.trim()).length;
  if (ordered === 0) return "pending_order";
  if (ordered === all.length) {
    return all.every((c) => c.invoiced) ? "invoiced" : "ready_invoice";
  }
  return "partial_order";
}

export function deriveInvoiceRows(ars: ActiveRequest[], prs: PaymentRequest[]): InvoiceRow[] {
  const rows: InvoiceRow[] = [];
  for (const ar of ars) {
    const pr = ar.prId ? prs.find((p) => p.id === ar.prId) ?? null : null;
    ar.uids.forEach((uidObj, uidIdx) => {
      uidObj.courses.forEach((course, courseIdx) => {
        if (!course.orderId?.trim()) return;
        rows.push({ key: `${ar.id}::${uidIdx}::${courseIdx}`, ar, pr, uidObj, uidIdx, courseIdx, course });
      });
    });
  }
  return rows.sort((a, b) => {
    if (a.course.invoiced !== b.course.invoiced) return a.course.invoiced ? 1 : -1;
    return (b.ar.createdAt || "").localeCompare(a.ar.createdAt || "");
  });
}

export function countAwaitingTransactions(requests: PaymentRequest[]) {
  let n = 0;
  for (const pr of requests) {
    if (pr.state === "cancelled") continue;
    for (const p of pr.payments) {
      if (p.cancelled) continue;
      const st = txnDisplayStatus(p);
      if (st === "awaiting") n++;
    }
  }
  return n;
}

export function countPendingAr(ars: ActiveRequest[]) {
  return ars.filter((ar) => {
    const st = deriveArStatus(ar);
    return st === "pending_order" || st === "partial_order";
  }).length;
}

export function countPendingInvoice(ars: ActiveRequest[]) {
  let n = 0;
  for (const ar of ars) {
    for (const u of ar.uids) {
      for (const c of u.courses) {
        if (c.orderId?.trim() && !c.invoiced) n++;
      }
    }
  }
  return n;
}

export function enrichActiveRequest(ar: ActiveRequest) {
  const courses = flatCourses(ar);
  const total = courses.reduce((s, c) => s + (c.amount || 0), 0);
  const orderedCount = courses.filter((c) => c.orderId?.trim()).length;
  const activatedAmount = courses
    .filter((c) => c.orderId?.trim())
    .reduce((s, c) => s + (c.amount || 0), 0);
  return {
    ...ar,
    totalCourses: courses.length,
    orderedCount,
    activatedAmount,
    total,
    status: deriveArStatus(ar),
  };
}

export type EnrichedActiveRequest = ReturnType<typeof enrichActiveRequest>;

export function formatAddress(pr: PaymentRequest | null, row?: InvoiceRow) {
  const ward = row?.course ? row.pr?.ward : pr?.ward;
  const province = row?.course ? row.pr?.province : pr?.province;
  const address = row?.course ? row.pr?.address : pr?.address;
  return [address, ward, province].filter(Boolean).join(", ") || "—";
}

export { fmtPhone, nowStamp, vnd };
