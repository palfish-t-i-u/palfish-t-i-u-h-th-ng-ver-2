import type { ActiveRequest, ActiveRequestApiRow, CreateActiveRequestPayload, PaymentAttempt, PaymentMethod, PaymentRequest, PaymentRequestStatus } from "../../types/paymentRequest";

export type RequestBucket = "tracking" | "created" | "cancelled";
export type StatusFilter = "all" | "pending" | "short" | "done" | "over";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  qr: "Chuyển khoản",
  cash: "Tiền mặt",
  card: "Quẹt thẻ",
  installment: "Trả góp",
};

export const STATUS_LABEL: Record<PaymentRequestStatus, string> = {
  pending: "Chưa thanh toán",
  short: "Thiếu",
  done: "Đủ",
  over: "Thừa",
  cancelled: "Đã huỷ",
};

export const STATUS_CLASS: Record<PaymentRequestStatus, string> = {
  pending: "is-pending",
  short: "is-short",
  done: "is-done",
  over: "is-over",
  cancelled: "is-cancelled",
};

export const vnd = (value: number) => `${Math.round(value).toLocaleString("vi-VN")} đ`;

/** PayOS returns EMV payload in qrCode — render via QR image API (same as Tab1Form). */
export function payosQrImageUrl(qrCode: string | null | undefined, size = 240): string | null {
  const raw = (qrCode || "").trim();
  if (!raw) return null;
  if (/^(https?:|data:image\/)/i.test(raw)) return raw;
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(raw)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromApiAttempt(raw: any, idx = 0): PaymentAttempt {
  const status = (raw.status ?? "pending") as PaymentAttempt["status"];
  return {
    id: raw.id ?? "",
    idx: raw.idx ?? idx,
    amount: raw.amount ?? 0,
    status,
    createdAt: raw.created_at ?? raw.createdAt ?? "",
    paidAt: raw.paid_at ?? raw.paidAt ?? null,
    // BE uses transfer_code; fallback to code / payment_code for camelCase sources
    code: raw.transfer_code ?? raw.code ?? raw.payment_code ?? "",
    billImage: raw.bill_image ?? raw.billImage ?? null,
    bill: !!(raw.bill_image ?? raw.billImage),
    method: (raw.method ?? "qr") as PaymentAttempt["method"],
    bank: raw.bank,
    cardLast4: raw.card_last4 ?? raw.cardLast4 ?? null,
    installmentMonths: raw.installment_months ?? raw.installmentMonths ?? null,
    cashier: raw.cashier ?? null,
    paymentLinkId: raw.payment_link_id ?? raw.paymentLinkId ?? null,
    transferContent: raw.transfer_content ?? raw.transferContent ?? null,
    qrCode: raw.qr_code ?? raw.qrCode ?? null,
    checkoutUrl: raw.checkout_url ?? raw.checkoutUrl ?? null,
    cancelled: raw.cancelled ?? false,
    cancelledAt: raw.cancelled_at ?? raw.cancelledAt ?? null,
    rejectReason: raw.reject_reason ?? raw.rejectReason ?? null,
  };
}

// Maps snake_case API response → camelCase PaymentRequest before normalizeRequest
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromApiPaymentRequest(raw: any): PaymentRequest {
  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    uid: raw.uid ?? "",
    phone: raw.phone ?? "",
    country: raw.country ?? "VN",
    address: raw.address ?? "",
    ward: raw.ward,
    province: raw.province,
    note: raw.note,
    email: raw.email ?? "",
    target: raw.target ?? 0,
    source: raw.source ?? "",
    createdAt: raw.created_at ?? raw.createdAt ?? "",
    cancelledAt: raw.cancelled_at ?? raw.cancelledAt ?? null,
    cancelledReason: raw.cancelled_reason ?? raw.cancelledReason ?? null,
    received: raw.received ?? 0,
    doneCount: raw.done_count ?? raw.doneCount ?? 0,
    totalCount: raw.total_count ?? raw.totalCount ?? 0,
    delta: raw.delta ?? 0,
    state: raw.state ?? "pending",
    payments: Array.isArray(raw.payments) ? raw.payments.map(fromApiAttempt) : [],
  };
}

export function normalizeRequest(req: PaymentRequest): PaymentRequest {
  const payments = req.payments || [];
  const live = payments.filter((p) => !p.cancelled);
  const received = live.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const doneCount = live.filter((p) => p.status === "paid").length;
  const totalCount = live.length;
  const delta = received - req.target;
  let state: PaymentRequestStatus = "pending";
  if (req.cancelledAt || req.state === "cancelled") state = "cancelled";
  else if (received === 0) state = "pending";
  else if (delta === 0) state = "done";
  else if (delta > 0) state = "over";
  else state = "short";
  return { ...req, payments, received, doneCount, totalCount, delta, state };
}

export function paymentAttemptLabel(payment: PaymentAttempt) {
  if (payment.cancelled) return "Đã huỷ";
  if (payment.status === "paid") return "Đã xác nhận";
  if (payment.billImage || payment.bill) return "Chờ xác nhận";
  return "Chờ chuyển";
}

export function progressPercent(request: PaymentRequest) {
  if (request.target <= 0) return 0;
  return Math.min(100, Math.round((request.received / request.target) * 100));
}

export function progressFillClass(request: PaymentRequest): "is-low" | "is-mid" | "is-done" | "is-over" {
  const pct = progressPercent(request);
  if (request.state === "over") return "is-over";
  if (pct >= 100) return "is-done";
  if (pct >= 50) return "is-mid";
  return "is-low";
}

export function fromApiActiveRequest(raw: ActiveRequestApiRow): ActiveRequest {
  const prSnippet = raw.payment_request;
  return {
    id: raw.id ?? "",
    prId: raw.pr_id ?? null,
    customerName: prSnippet?.name ?? "",
    createdAt: raw.created_at ?? "",
    createdBy: "",
    uids: (raw.uids_data ?? []).map((u) => ({
      uid: u.uid ?? "",
      phone: u.phone ?? "",
      country: u.country ?? "VN",
      courses: (u.courses ?? []).map((c) => ({
        courseCode: c.code ?? "",
        packageName: c.name ?? "",
        amount: c.amount ?? 0,
        orderId: c.order_id ?? "",
        invoiced: !!c.invoiced,
        invoiceId: c.invoice_id,
        invoicedAt: c.invoiced_at ?? null,
      })),
    })),
  };
}

export function buildArByPrId(ars: ActiveRequest[]): Record<string, ActiveRequest> {
  const map: Record<string, ActiveRequest> = {};
  for (const ar of ars) {
    if (ar.prId) map[ar.prId] = ar;
  }
  return map;
}

export function buildCreateActiveRequestPayload(pr: PaymentRequest): CreateActiveRequestPayload {
  return {
    uids: [
      {
        uid: pr.uid,
        phone: pr.phone,
        country: pr.country,
        courses: [{ name: "", amount: pr.target }],
      },
    ],
  };
}

export function createLocalActiveRequest(pr: PaymentRequest, existing: ActiveRequest[]): ActiveRequest {
  const nextNum = existing.length + 1;
  const id = `AR-2026-${String(nextNum).padStart(4, "0")}`;
  const numPart = id.replace(/[^\d]/g, "").slice(-4);
  return {
    id,
    prId: pr.id,
    customerName: pr.name,
    createdAt: nowStamp(),
    createdBy: "admin.tranminhanh",
    uids: [
      {
        uid: pr.uid,
        phone: pr.phone,
        country: pr.country,
        courses: [
          {
            courseCode: `CC-${numPart}-001`,
            packageName: "",
            amount: pr.target,
            orderId: "",
            invoiced: false,
          },
        ],
      },
    ],
  };
}

export function createLocalActiveRequestFromForm(
  data: {
    prId: string | null;
    customerName: string;
    uid: string;
    phone?: string;
    country?: string;
    packageName: string;
    amount: number;
  },
  existing: ActiveRequest[]
): ActiveRequest {
  const nextNum = existing.length + 1;
  const id = `AR-2026-${String(nextNum).padStart(4, "0")}`;
  const numPart = id.replace(/[^\d]/g, "").slice(-4);
  return {
    id,
    prId: data.prId,
    customerName: data.customerName,
    createdAt: nowStamp(),
    createdBy: "admin.tranminhanh",
    uids: [
      {
        uid: data.uid,
        phone: data.phone || "",
        country: data.country || "VN",
        courses: [
          {
            courseCode: `CC-${numPart}-001`,
            packageName: data.packageName,
            amount: data.amount,
            orderId: "",
            invoiced: false,
          },
        ],
      },
    ],
  };
}

export function isBackendLineId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function hasCreatedPackage(request: PaymentRequest, arByPrId: Record<string, ActiveRequest>) {
  return !!arByPrId[request.id];
}

export function requestBucket(request: PaymentRequest, arByPrId: Record<string, ActiveRequest>): RequestBucket {
  if (request.state === "cancelled") return "cancelled";
  if (hasCreatedPackage(request, arByPrId)) return "created";
  return "tracking";
}

export function parsePaymentDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Display parts for table cells — handles ISO and legacy `YYYY-MM-DD HH:mm`. */
export function formatPaymentDateTime(dateStr: string): { date: string; time: string } {
  const d = parsePaymentDate(dateStr);
  if (!d) {
    const [date = dateStr, time = ""] = dateStr.split(" ");
    return { date, time };
  }
  return {
    date: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

export function formatPaymentDateShort(dateStr: string): string {
  return formatPaymentDateTime(dateStr).date;
}

export function formatPaymentDateFull(dateStr: string): string {
  const { date, time } = formatPaymentDateTime(dateStr);
  return time ? `${date} ${time}` : date;
}


export function fmtPhone(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7) return raw;
  return digits.replace(/(\d{4})(\d{3})(\d+)/, "$1 $2 $3");
}

export function createdAtDate(createdAt: string) {
  return formatPaymentDateTime(createdAt);
}

export function ddmmyyyy(createdAt: string) {
  return formatPaymentDateShort(createdAt);
}
export function relativeFrom(dateStr: string): string {
  if (!dateStr) return "";
  const d = parsePaymentDate(dateStr);
  if (!d) return "";
  const now = new Date();
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} giờ trước`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD} ngày trước`;
  return `${Math.round(diffD / 30)} tháng trước`;
}

export function nowStamp(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

export function nextPaymentCode(prId: string, idx: number): string {
  const digits = prId.replace(/[^\d]/g, "").slice(-4) || "0000";
  return `TT-PR${digits}-${String(idx).padStart(3, "0")}`;
}
