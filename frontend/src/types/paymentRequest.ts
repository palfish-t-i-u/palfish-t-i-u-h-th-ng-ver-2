export type PaymentRequestStatus = "pending" | "short" | "done" | "over" | "cancelled";
export type PaymentMethod = "qr" | "cash" | "card" | "installment";
export type PaymentAttemptStatus = "pending" | "paid" | "rejected";
export type ActiveRequestStatus = "pending_order" | "activated" | "invoiced";

export interface PaymentAttempt {
  id: string;
  idx: number;
  amount: number;
  status: PaymentAttemptStatus;
  createdAt: string;
  paidAt?: string | null;
  code: string;
  bill: boolean;
  billImage?: string | null;
  billImages?: string[];
  method: PaymentMethod;
  bank?: string;
  cardLast4?: string | null;
  installmentMonths?: string | null;
  installmentPlatform?: string | null;
  installmentTotal?: number | null;
  saleReceived?: number | null;
  verifiedTotal?: number | null;
  verifiedReceived?: number | null;
  cashier?: string | null;
  paymentLinkId?: string | null;
  transferContent?: string | null;
  qrCode?: string | null;
  checkoutUrl?: string | null;
  cancelled?: boolean;
  cancelledAt?: string | null;
  rejectReason?: string | null;
  confirmedBy?: string | null;
  confirmedByName?: string | null;
  confirmedAt?: string | null;
  confirmedSource?: string | null;
  /** Tên dùng cho nội dung CK (parent name HOẶC child name) sale chọn lúc tạo line */
  nameForTransfer?: string | null;
  /** True khi PR đã đổi name/phone/childName/country và transfer_content lưu không còn khớp PR hiện tại */
  isContentStale?: boolean;
  /** Multi-con: lần TT của bé nào (null = bé 1 / child_name của PR) */
  studentName?: string | null;
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
  bill_image?: string | null;
  bill_images?: string[];
  created_at?: string;
  updated_at?: string;
  transfer_content?: string | null;
  name_for_transfer?: string | null;
  is_content_stale?: boolean;
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

export type CustomerType = "individual" | "business";

/** Multi-con: 1 bé trên PR (bé 1 = childName/uid của PR, bé 2+ từ extra_children) */
export interface PrChild {
  name: string;
  uid: string | null;
}

export interface PaymentRequest {
  id: string;
  name: string;
  childName?: string;
  /** Multi-con: danh sách đầy đủ các bé (bé 1 + bé phụ). Undefined với response cũ. */
  children?: PrChild[];
  uid: string;
  phone: string;
  country: string;
  address: string;
  ward?: string;
  province?: string;
  note?: string;
  email?: string;
  taxId?: string;
  customerType?: CustomerType;
  companyName?: string;
  leadSource?: string;
  leadChannel?: string;
  sdtGoc?: string | null;
  leadMatched?: boolean | null;
  leadId?: string | null;
  leadMatchedBy?: "sdt" | "sdt_goc" | "uid" | "manual" | null;
  lyDoKhongGhep?: string | null;
  leadCheckAt?: string | null;
  wantsInvoice?: boolean;
  target: number;
  source: string;
  createdAt: string;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  received: number;
  doneCount: number;
  totalCount: number;
  delta: number;
  saleEmail?: string;
  /** Tên TVTS phụ trách (map từ nhan_su_sale theo sale_email) — chỉ có ở response danh sách */
  saleName?: string;
  /** Tên leader phụ trách sale sở hữu PR — chỉ có ở response danh sách (23/7) */
  saleLeaderName?: string;
  state: PaymentRequestStatus;
  payments: PaymentAttempt[];
  isTest?: boolean;
  /** Lịch sử "Báo đơn hoàn thành" (B3, 16/7). BE có thể chưa merge — luôn đọc `?? []`. */
  completion_reports?: CompletionReport[];
}

/** 1 lần bấm "Báo đơn hoàn thành" — nguồn sự thật thay trigger DingTalk pr_fully_paid tự động. */
export interface CompletionReport {
  id: string;
  seq: number;
  reason: string | null;
  reported_by: string;
  total_net: number;
  target: number;
  created_at: string;
}

export interface ActiveCourse {
  courseCode: string;
  packageName: string;
  amount: number;
  orderId: string;
  invoiced: boolean;
  invoiceId?: string;
  invoicedAt?: string | null;
  invoiceRequestedAt?: string | null;
  /** Mã đơn hàng thuế (M...) — BE cấp khi export batch */
  taxInvoiceCode?: string;
  /** Mã sản phẩm thuế (PF...) — BE cấp khi export batch */
  taxProductCode?: string;
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
  leadSource?: string;
  leadChannel?: string;
  /** UID người giới thiệu (referral) — sale nhập khi nguồn = gioi_thieu */
  referrerUid?: string;
  /** Số buổi thưởng cho người được giới thiệu (chủ AR) */
  bonusSessionsReferee?: number;
  /** Số buổi thưởng cho người giới thiệu */
  bonusSessionsReferrer?: number;
  /** Thời điểm bộ phận quản trị đã cộng buổi cho người được giới thiệu trong CRM (Sprint 2 BE) */
  refereeCreditedAt?: string | null;
  /** Người thực hiện cộng buổi cho người được giới thiệu */
  refereeCreditedBy?: string | null;
  /** Thời điểm bộ phận quản trị đã cộng buổi cho người giới thiệu trong CRM (Sprint 2 BE) */
  referrerCreditedAt?: string | null;
  /** Người thực hiện cộng buổi cho người giới thiệu */
  referrerCreditedBy?: string | null;
  /** Người gắn/sửa Order ID gần nhất */
  orderIdSetBy?: string | null;
  /** Thời điểm gắn/sửa Order ID gần nhất */
  orderIdSetAt?: string | null;
}

export interface ActiveUidGroup {
  uid: string;
  /** Multi-con: tên bé của block này (undefined = bé 1 / fallback child_name PR) */
  name?: string;
  phone: string;
  country: string;
  courses: ActiveCourse[];
}

export interface ActiveRequest {
  id: string;
  prId: string | null;
  customerName: string;
  /** Tên TVTS phụ trách PR — enriched từ nhan_su_sale ở list endpoint (T6) */
  saleName?: string;
  createdAt: string;
  createdBy: string;
  uids: ActiveUidGroup[];
  holdActivation?: boolean;
  holdNote?: string | null;
  crmAddressConfirmed?: boolean;
  /** Ngày tiền về sớm nhất (min) trong Sổ doanh thu của AR — ISO "YYYY-MM-DD". null = chưa có tiền về. */
  tienVeSom?: string | null;
  /** Ngày tiền về muộn nhất (max) trong Sổ doanh thu của AR — ISO "YYYY-MM-DD". */
  tienVeMuon?: string | null;
  /** Đơn tín dụng còn lần quẹt thẻ chưa ghép giao dịch → ẩn hẳn khỏi tab Kích hoạt
   * tới khi tiền về. BE tính ở list + mọi endpoint đơn-AR (batch gateway match). */
  creditSettlementPending?: boolean;
  isCreditOrder?: boolean;
  updatedAt?: string;
}

export interface PaymentRequestsListResponse {
  requests: PaymentRequest[];
  activeRequests: ActiveRequest[];
  total?: number;
}

export type AddPaymentAttemptPayload = {
  amount: number;
  method: PaymentMethod;
  bank?: string;
  cardLast4?: string;
  installmentMonths?: string;
  installment_platform?: string;
  installment_total?: number;
  sale_received?: number;
  cashier?: string;
  name_for_transfer?: string;
  /** Multi-con: lần TT của bé nào (bỏ qua = bé 1) */
  student_name?: string;
};

export type CreatePaymentRequestPayload = {
  uid?: string;
  name: string;
  child_name?: string;
  country: string;
  phone: string;
  address: string;
  ward?: string;
  province?: string;
  target: number;
  note?: string;
  email?: string;
  tax_id?: string;
  customer_type?: string;
  company_name?: string;
  lead_source?: string;
  lead_channel?: string;
  wants_invoice?: boolean;
  /** Tạo hộ (Leader/Manager): email sale sở hữu PR. Bỏ qua = tự sở hữu. */
  owner_sale_email?: string;

  sdt_goc?: string | null;
  lead_matched?: boolean | null;
  lead_id?: string | null;
  lead_matched_by?: string | null;
  ly_do_khong_ghep?: string | null;
};

/** 1 nhân sự trong dropdown "Sale sở hữu PR" / modal "Chuyển sale" */
export interface OwnerOption {
  email: string;
  name: string;
  role: string;
  team?: string;
  sub_team?: string;
  is_self?: boolean;
}

export interface OwnerOptionsResponse {
  role: string;
  options: OwnerOption[];
}

/** 1 dòng Nhật ký lưu chuyển PR (tạo / tạo hộ / chuyển giao) */
export interface PrOwnershipLogEntry {
  id: string;
  action: "create" | "create_on_behalf" | "transfer";
  from_sale_email?: string | null;
  from_sale_name?: string;
  to_sale_email: string;
  to_sale_name?: string;
  actor_email: string;
  actor_name?: string;
  reason?: string | null;
  created_at: string;
}

export interface TransferPrResponse {
  payment_request: Record<string, unknown>;
  from_sale_email: string;
  to_sale_email: string;
  to_sale_name?: string;
}

export type PatchPaymentRequestPayload = Partial<CreatePaymentRequestPayload>;

export type CreateActiveRequestCoursePayload = {
  name?: string;
  package_name?: string;
  amount: number;
  lead_source?: string;
  lead_channel?: string;
  /** Cộng buổi referral (nguồn = gioi_thieu) — nhập inline khi báo đơn */
  referrer_uid?: string;
  bonus_sessions_referee?: number;
  bonus_sessions_referrer?: number;
};

export type CreateActiveRequestUidPayload = {
  uid: string;
  /** Multi-con: tên bé — BE giữ trong uids_data, Zalo builder render đúng bé */
  name?: string;
  phone?: string;
  country?: string;
  courses: CreateActiveRequestCoursePayload[];
};

/** 1 dòng trong modal "Kích hoạt khoá học" mở rộng: 1 gói gán cho 1 bé */
export type ArDraftRow = {
  childName: string;   // "" khi PR không có tên con (fallback bé 1)
  uid: string;         // "" = bé chưa có UID CRM (Ops điền ở B3 → write-back)
  phone: string;       // đuôi số local (digits) — CRM mỗi bé 1 SĐT riêng (18/7)
  phoneCountry: string; // country code cho đầu số, VD "VN"
  packageName: string;
  amount: number;      // VND
  leadSource: string;
  leadChannel: string;
  /** Referral (nguồn gioi_thieu) — nhập inline ngay trong form báo đơn */
  referrerUid?: string;
  bonusSessionsReferee?: number;
  bonusSessionsReferrer?: number;
};

export type CreateActiveRequestPayload = {
  uids: CreateActiveRequestUidPayload[];
  hold_activation?: boolean;
  hold_note?: string | null;
  crm_address_confirmed?: boolean;
};

/** Raw row from GET/POST /api/v1/active-requests (snake_case) */
export type ActiveRequestApiRow = {
  id?: string;
  pr_id?: string | null;
  customer_name?: string;
  uids_data?: Array<{
    uid?: string;
    name?: string;
    phone?: string;
    country?: string;
    courses?: Array<{
      code?: string;
      name?: string;
      amount?: number;
      order_id?: string;
      orderId?: string;
      invoiced?: boolean;
      invoice_id?: string;
      invoiced_at?: string;
      invoice_requested_at?: string;
      tax_invoice_code?: string;
      tax_product_code?: string;
      lead_source?: string;
      leadSource?: string;
      lead_channel?: string;
      leadChannel?: string;
      referrer_uid?: string;
      bonus_sessions_referee?: number;
      bonus_sessions_referrer?: number;
      referee_credited_at?: string | null;
      referee_credited_by?: string | null;
      referrer_credited_at?: string | null;
      referrer_credited_by?: string | null;
      order_id_set_by?: string | null;
      order_id_set_at?: string | null;
    }>;
  }>;
  status?: string;
  created_at?: string;
  updated_at?: string;
  hold_activation?: boolean;
  hold_note?: string | null;
  crm_address_confirmed?: boolean;
  tien_ve_som?: string | null;
  tien_ve_muon?: string | null;
  credit_settlement_pending?: boolean;
  is_credit_order?: boolean;
  payment_request?: { name?: string; email?: string; sale_name?: string; sale_email?: string };
};

export type ActiveRequestPatchUidPayload = {
  uid: string;
  name?: string;
  phone?: string;
  country?: string;
  courses: Array<{
    code: string;
    name: string;
    amount: number;
    order_id?: string;
    invoiced?: boolean;
    invoice_id?: string;
    invoiced_at?: string;
    invoice_requested_at?: string;
    tax_invoice_code?: string;
    tax_product_code?: string;
    lead_source?: string;
    lead_channel?: string;
    referrer_uid?: string;
    bonus_sessions_referee?: number;
    bonus_sessions_referrer?: number;
  }>;
};

export type PatchActiveRequestPayload = {
  customer_name?: string;
  info_confirmed?: boolean;
  uids_data?: ActiveRequestPatchUidPayload[];
  expected_updated_at?: string;
};

export type CreateStandaloneActiveRequestPayload = {
  customer_name?: string;
  pr_id?: string | null;
  uids: CreateActiveRequestUidPayload[];
};
