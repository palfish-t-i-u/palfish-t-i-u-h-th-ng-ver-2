import type { PaymentAttempt, PaymentMethod, PaymentRequest, PaymentRequestStatus } from "../../types/paymentRequest";

export type RequestBucket = "tracking" | "created" | "cancelled";
export type StatusFilter = "all" | "pending" | "short" | "done" | "over";
export type DateFilter = "all" | "today" | "7d" | "30d";

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

export const vnd = (value: number) => `${Math.round(value).toLocaleString("vi-VN")} đ`;

export function normalizeRequest(req: PaymentRequest): PaymentRequest {
  const payments = req.payments || [];
  const received = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const doneCount = payments.filter((p) => p.status === "paid").length;
  const delta = received - req.target;
  let state: PaymentRequestStatus = "pending";
  if (req.cancelledAt || req.state === "cancelled") state = "cancelled";
  else if (received === 0) state = "pending";
  else if (delta === 0) state = "done";
  else if (delta > 0) state = "over";
  else state = "short";
  return { ...req, payments, received, doneCount, totalCount: payments.length, delta, state };
}

export function paymentAttemptLabel(payment: PaymentAttempt) {
  if (payment.status === "paid") return "Đã xác nhận";
  if (payment.bill) return "Chờ xác nhận";
  return "Chờ chuyển";
}

export function progressPercent(request: PaymentRequest) {
  if (request.target <= 0) return 0;
  return Math.min(100, Math.round((request.received / request.target) * 100));
}

export function hasCreatedPackage(request: PaymentRequest) {
  return request.state === "done" || request.state === "over";
}

export function requestBucket(request: PaymentRequest): RequestBucket {
  if (request.state === "cancelled") return "cancelled";
  if (hasCreatedPackage(request)) return "created";
  return "tracking";
}

export function createdAtDate(createdAt: string) {
  const [date, time] = createdAt.split(" ");
  return { date: date || createdAt, time: time || "" };
}

