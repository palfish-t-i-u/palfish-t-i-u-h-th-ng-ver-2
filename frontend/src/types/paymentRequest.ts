export type PaymentRequestStatus = "pending" | "short" | "done" | "over" | "cancelled";
export type PaymentMethod = "qr" | "cash" | "card" | "installment";
export type PaymentAttemptStatus = "pending" | "paid" | "rejected";
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
  qrCode?: string | null;
  checkoutUrl?: string | null;
  cancelled?: boolean;
  cancelledAt?: string | null;
}

export interface PaymentLineApiRow {
  id: string;
  payment_request_id?: string;
  method?: string;
  amount?: number;
  status?: string;
  payos_order_code?: string;
  transfer_code?: string;
  qr_code?: string;
  checkout_url?: string;
  paid_at?: string;
  reject_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AddPaymentLineResponse {
  payment_line: PaymentLineApiRow;
  payment_request: Record<string, unknown>;
  received: number;
  target: number;
  state: string;
  payos?: {
    checkout_url: string;
    qr_code: string;
    order_code: number;
    transfer_content: string;
    payment_link_id: string;
  };
}

export interface CreatePrResponse {
  payment_request: Record<string, unknown>;
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
  customerType?: "individual" | "business";
  name?: string;
  email?: string;
  country?: string;
  phone?: string;
  address?: string;
  ward?: string;
  province?: string;
  taxCode?: string;
  companyName?: string;
  note?: string;
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

export type CreatePaymentRequestPayload = {
  uid: string;
  name: string;
  country: string;
  phone: string;
  address: string;
  ward?: string;
  province?: string;
  target: number;
  note?: string;
};

export type CreateActiveRequestCoursePayload = {
  name?: string;
  package_name?: string;
  amount: number;
};

export type CreateActiveRequestUidPayload = {
  uid: string;
  phone?: string;
  country?: string;
  courses: CreateActiveRequestCoursePayload[];
};

export type CreateActiveRequestPayload = {
  uids: CreateActiveRequestUidPayload[];
};

/** Raw row from GET/POST /api/v1/active-requests (snake_case) */
export type ActiveRequestApiRow = {
  id?: string;
  pr_id?: string | null;
  uids_data?: Array<{
    uid?: string;
    phone?: string;
    country?: string;
    courses?: Array<{
      code?: string;
      name?: string;
      amount?: number;
      order_id?: string;
      invoiced?: boolean;
      invoice_id?: string;
      invoiced_at?: string;
    }>;
  }>;
  status?: string;
  created_at?: string;
  payment_request?: { name?: string };
};

export type AttachCoursePayload = {
  order_id: string;
};
