export type PaymentRequestStatus = "pending" | "short" | "done" | "over" | "cancelled";
export type PaymentMethod = "qr" | "cash" | "card" | "installment";
export type PaymentAttemptStatus = "pending" | "paid";
export type ActiveRequestStatus = "pending_order" | "partial_order" | "ready_invoice" | "invoiced";

export interface PaymentAttempt {
  id: string;
  idx: number;
  amount: number;
  status: PaymentAttemptStatus;
  createdAt: string;
  paidAt?: string | null;
  code: string;
  bill: boolean;
  method: PaymentMethod;
  bank?: string;
  cardLast4?: string | null;
  installmentMonths?: string | null;
  cashier?: string | null;
  paymentLinkId?: string | null;
  transferContent?: string | null;
}

export interface PaymentRequest {
  id: string;
  name: string;
  uid: string;
  phone: string;
  country: string;
  address: string;
  ward?: string;
  province?: string;
  note?: string;
  target: number;
  source: string;
  createdAt: string;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  received: number;
  doneCount: number;
  totalCount: number;
  delta: number;
  state: PaymentRequestStatus;
  payments: PaymentAttempt[];
}

export interface ActiveCourse {
  courseCode: string;
  packageName: string;
  amount: number;
  orderId: string;
  invoiced: boolean;
  invoiceId?: string;
  invoicedAt?: string | null;
}

export interface ActiveUidGroup {
  uid: string;
  phone: string;
  country: string;
  courses: ActiveCourse[];
}

export interface ActiveRequest {
  id: string;
  prId: string | null;
  customerName: string;
  createdAt: string;
  createdBy: string;
  uids: ActiveUidGroup[];
}

export interface PaymentRequestsListResponse {
  requests: PaymentRequest[];
  activeRequests: ActiveRequest[];
}

export type AddPaymentAttemptPayload = {
  amount: number;
  method: PaymentMethod;
  bank?: string;
  cardLast4?: string;
  installmentMonths?: string;
  cashier?: string;
};

export type CreateActiveRequestPayload = {
  prId: string;
  customerName: string;
  uid: string;
  phone: string;
  country: string;
  targetAmount: number;
};
