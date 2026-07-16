import type { CSSProperties } from "react";
import type { ActiveCourse, ActiveRequest, ActiveRequestApiRow, ActiveRequestPatchUidPayload, ArDraftRow, CreateActiveRequestCoursePayload, CreateActiveRequestPayload, CreateActiveRequestUidPayload, PaymentAttempt, PaymentMethod, PaymentRequest, PaymentRequestStatus } from "../../types/paymentRequest";
import { normVi } from "../../lib/textUtils";

/** Gói giới thiệu (tên chứa "REFER") → cần điền thông tin người giới thiệu. */
export function isReferralPackage(name?: string | null): boolean {
  return !!name && /refer/i.test(name);
}

/**
 * So khớp 1 PR với chuỗi search của user — accent- & case-insensitive (normVi).
 * Fields tìm: PR-ID, tên khách, UID, SĐT, và tên con — cả bé 1 (childName) lẫn
 * các bé phụ (children[].name; children = bé 1 + extra_children từ BE).
 * Query rỗng/toàn khoảng trắng → true (không lọc).
 *
 * VD: PR có childName "Hà Bảo Ngân" khớp "ha bao ngan" / "Ha Bao Ngan" / "HÀ BẢO NGÂN".
 */
export function paymentRequestMatchesSearch(pr: PaymentRequest, rawQuery: string): boolean {
  const q = normVi(rawQuery.trim());
  if (!q) return true;
  const haystack: (string | null | undefined)[] = [
    pr.id,
    pr.name,
    pr.uid,
    pr.phone,
    pr.childName,
    ...(pr.children?.map((c) => c.name) ?? []),
  ];
  return haystack.some((value) => normVi(value).includes(q));
}

/**
 * Tách chuỗi tên con free-text thành danh sách tên riêng lẻ.
 * CHỈ tách theo dấu phân cách tường minh — KHÔNG đoán ranh giới khi không có dấu.
 *   "Lê Bảo Châu - Lê Bảo Khánh" | "A & B" | "A và B" | "A + B" | "A, B" | "A/B" | "A / B" → 2 tên
 *   "Anne-Marie" (gạch nối dính) → giữ nguyên (dash phải có space 2 bên; KH nước ngoài)
 *   "Kim Ji Yong" → ["Kim Ji Yong"] ;  "" / null / "   " → []
 * DB prod 2026-07-12: 197 PR có child_name, 0 chứa "/", ~6 PR đa-tên (dùng " - ","&",","," và ");
 * extra_children = 0 → split đủ phủ. Slash cắt cả khi dính (không có false-positive trong data).
 * Fail-safe (G5): dùng ở dropdown/ô gợi ý; rỗng → caller fallback tên KH.
 */
export function splitChildNames(raw?: string | null): string[] {
  if (!raw) return [];
  // dash (- – —): PHẢI có space 2 bên (chống cắt "Anne-Marie") | slash,&,+,phẩy: cắt cả khi dính | và/and: có space
  const SEP = /\s+[-–—]\s+|\s*[\/&+,]\s*|\s+và\s+|\s+and\s+/i;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(SEP)) {
    const name = part.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, 6);
}

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

const COUNTRY_DIALS: Record<string, string> = {
  VN: "+84",
  US: "+1",
  GB: "+44",
  CN: "+86",
  JP: "+81",
  KR: "+82",
  TH: "+66",
  SG: "+65",
  MY: "+60",
  ID: "+62",
  PH: "+63",
};

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
  const rejectReason = raw.reject_reason ?? raw.rejectReason ?? null;
  const cancelledFromReason =
    status === "rejected" && /hu(y|ỷ|ỷ)/i.test(String(rejectReason || ""));
  const billImages = Array.isArray(raw.bill_images)
    ? raw.bill_images.filter((x: unknown) => typeof x === "string")
    : Array.isArray(raw.billImages)
    ? raw.billImages.filter((x: unknown) => typeof x === "string")
    : (raw.bill_image ?? raw.billImage)
    ? [raw.bill_image ?? raw.billImage]
    : [];
  return {
    id: raw.id ?? "",
    idx: raw.idx ?? idx,
    amount: raw.amount ?? 0,
    status,
    createdAt: raw.created_at ?? raw.createdAt ?? "",
    paidAt: raw.paid_at ?? raw.paidAt ?? null,
    // BE uses transfer_code; fallback to code / payment_code for camelCase sources
    code: raw.transfer_code ?? raw.code ?? raw.payment_code ?? "",
    billImage: raw.bill_image ?? raw.billImage ?? billImages[billImages.length - 1] ?? null,
    billImages,
    bill: !!(raw.bill_image ?? raw.billImage) || billImages.length > 0,
    method: (raw.method ?? "qr") as PaymentAttempt["method"],
    bank: raw.bank,
    cardLast4: raw.card_last4 ?? raw.cardLast4 ?? null,
    installmentMonths: raw.installment_months ?? raw.installmentMonths ?? null,
    installmentPlatform: raw.installment_platform ?? raw.installmentPlatform ?? null,
    installmentTotal: raw.installment_total ?? raw.installmentTotal ?? null,
    saleReceived: raw.sale_received ?? raw.saleReceived ?? null,
    verifiedTotal: raw.verified_total ?? raw.verifiedTotal ?? null,
    verifiedReceived: raw.verified_received ?? raw.verifiedReceived ?? null,
    cashier: raw.cashier ?? null,
    paymentLinkId: raw.payment_link_id ?? raw.paymentLinkId ?? null,
    transferContent: raw.transfer_content ?? raw.transferContent ?? null,
    qrCode: raw.qr_code ?? raw.qrCode ?? null,
    checkoutUrl: raw.checkout_url ?? raw.checkoutUrl ?? null,
    cancelled: raw.cancelled ?? cancelledFromReason,
    cancelledAt: raw.cancelled_at ?? raw.cancelledAt ?? null,
    rejectReason,
    confirmedBy: raw.confirmed_by ?? raw.confirmedBy ?? null,
    confirmedByName: raw.confirmed_by_name ?? raw.confirmedByName ?? null,
    confirmedAt: raw.confirmed_at ?? raw.confirmedAt ?? null,
    confirmedSource: raw.confirmed_source ?? raw.confirmedSource ?? null,
    nameForTransfer: raw.name_for_transfer ?? raw.nameForTransfer ?? null,
    isContentStale: Boolean(raw.is_content_stale ?? raw.isContentStale ?? false),
    studentName: raw.student_name ?? raw.studentName ?? null,
  };
}

// Maps snake_case API response → camelCase PaymentRequest before normalizeRequest
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromApiPaymentRequest(raw: any): PaymentRequest {
  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    childName: raw.child_name ?? raw.childName ?? undefined,
    // Multi-con: BE trả children = [bé 1 + bé phụ]; response cũ không có → undefined
    children: Array.isArray(raw.children)
      ? raw.children
          .filter((c: unknown): c is { name: string; uid?: string | null } =>
            !!c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string")
          .map((c: { name: string; uid?: string | null }) => ({ name: c.name, uid: c.uid ?? null }))
      : undefined,
    uid: raw.uid ?? "",
    phone: raw.phone ?? "",
    country: raw.country ?? "VN",
    address: raw.address ?? "",
    ward: raw.ward,
    province: raw.province,
    note: raw.note,
    email: raw.email ?? "",
    taxId: raw.tax_id ?? raw.taxId ?? undefined,
    customerType: raw.customer_type ?? raw.customerType ?? "individual",
    companyName: raw.company_name ?? raw.companyName ?? undefined,
    leadSource: raw.lead_source ?? raw.leadSource ?? undefined,
    leadChannel: raw.lead_channel ?? raw.leadChannel ?? undefined,
    wantsInvoice: raw.wants_invoice ?? raw.wantsInvoice ?? undefined,
    target: raw.target ?? 0,
    source: raw.source ?? "",
    saleEmail: raw.sale_email ?? raw.saleEmail ?? "",
    // Chỉ set khi BE trả về (endpoint danh sách) — tránh spread ghi đè mất tên ở các response khác
    ...((raw.sale_name ?? raw.saleName) ? { saleName: raw.sale_name ?? raw.saleName } : {}),
    createdAt: raw.created_at ?? raw.createdAt ?? "",
    cancelledAt: raw.cancelled_at ?? raw.cancelledAt ?? null,
    cancelledReason: raw.cancelled_reason ?? raw.cancelledReason ?? null,
    received: raw.received ?? 0,
    doneCount: raw.done_count ?? raw.doneCount ?? 0,
    totalCount: raw.total_count ?? raw.totalCount ?? 0,
    delta: raw.delta ?? 0,
    state: raw.state ?? "pending",
    payments: Array.isArray(raw.payments) ? raw.payments.map(fromApiAttempt) : [],
    isTest: Boolean(raw.is_test ?? raw.isTest),
    completion_reports: Array.isArray(raw.completion_reports) ? raw.completion_reports : [],
  };
}

/** Merge POST payment-lines response into a PR — append line if poll wiped optimistic state. */
export function mergeAddPaymentLineResponse(
  current: PaymentRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: { payment_line: any; payment_request: any; payos?: any },
  fallbackIdx: number
): PaymentRequest {
  const prRaw = res.payment_request;
  if (Array.isArray(prRaw?.payments) && prRaw.payments.length > 0) {
    return normalizeRequest(fromApiPaymentRequest(prRaw));
  }
  const line = fromApiAttempt(res.payment_line, fallbackIdx);
  if (res.payos?.qr_code) {
    line.qrCode = res.payos.qr_code;
    line.checkoutUrl = res.payos.checkout_url;
    line.paymentLinkId = res.payos.payment_link_id;
    line.transferContent = res.payos.transfer_content || line.code;
  }
  const exists = current.payments.some((p) => p.id === line.id);
  const payments = exists
    ? current.payments.map((p) => (p.id === line.id ? { ...p, ...line } : p))
    : [...current.payments, line];
  const prFromBe = fromApiPaymentRequest(prRaw);
  return normalizeRequest({ ...current, ...prFromBe, payments });
}

/** Method có thể phát sinh phí xử lý (mPOS/Payoo) — phải khớp BE FEE_METHODS. */
const FEE_METHODS = new Set<PaymentMethod>(["card", "installment"]);

/** Số tiền THỰC NHẬN của 1 lần thanh toán (net-of-fee).
 *  card/installment đã kế toán xác nhận (verifiedReceived truthy) → dùng verifiedReceived.
 *  Còn lại (kể cả verifiedReceived = 0/"" — chưa ghép) → dùng amount (gross).
 *  Phải khớp CHÍNH XÁC BE `_line_net` (payment_request_routes.py) — G2. */
export function lineNet(p: PaymentAttempt): number {
  if (FEE_METHODS.has(p.method) && p.verifiedReceived) {
    return p.verifiedReceived;
  }
  return p.amount;
}

export function normalizeRequest(req: PaymentRequest): PaymentRequest {
  const payments = req.payments || [];
  const live = payments.filter((p) => !p.cancelled);
  const received = live.filter((p) => p.status === "paid").reduce((sum, p) => sum + lineNet(p), 0);
  const doneCount = live.filter((p) => p.status === "paid").length;
  const totalCount = live.length;
  const delta = received - req.target;
  let state: PaymentRequestStatus;
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
  if (payment.status === "rejected") return "Bị từ chối";
  if (payment.billImage || payment.bill) return "Chờ xác nhận";
  return "Chờ chuyển";
}

function emailToName(email: string): string {
  const local = email.split("@")[0] || email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * Render dòng "Xác nhận lúc ... bởi ..." / "Xác nhận tự động lúc ..." cho 1 lần thanh toán.
 * Ưu tiên confirmedByName (display_name từ nhan_su_sale); fallback capitalize email prefix.
 * Phân loại người/máy dựa vào actor (confirmed_by), KHÔNG dựa vào confirmed_source
 * (source list đã drift — gateway/manual_repair thiếu trong schema comment cũ).
 */
export function paymentConfirmationText(payment: PaymentAttempt): string {
  const date = payment.paidAt ? formatPaymentDateFull(payment.paidAt) : "";
  const actor = (payment.confirmedBy || "").trim();
  const source = (payment.confirmedSource || "").toLowerCase();

  // (1) Actor người thật — email, không bắt đầu "system:".
  // Bao gồm: ghép mPOS/Payoo (source=gateway) + xác nhận tay (source=manual).
  const hasHumanActor = actor.length > 0 && !actor.startsWith("system:");
  if (hasHumanActor) {
    const name = payment.confirmedByName || emailToName(actor);
    if (!date) return `Xác nhận bởi ${name}`;
    return `Xác nhận lúc ${date} bởi ${name}`;
  }

  // (2) Máy tự xác nhận: actor "system:*" (SePay/PayOS webhook),
  // hoặc phòng thủ: source auto đã biết mà thiếu actor.
  const AUTO_SOURCES = new Set(["sepay", "payos"]);
  const isSystemActor = actor.startsWith("system:");
  const isAuto = isSystemActor || (actor.length === 0 && AUTO_SOURCES.has(source));
  if (isAuto) {
    return date ? `Xác nhận tự động lúc ${date}` : "Xác nhận tự động";
  }

  // (3) Không rõ actor (legacy null-source qr T6, manual_repair thiếu actor).
  return date ? `Xác nhận lúc ${date}` : "Xác nhận";
}

export function activationAuditText(course: ActiveCourse): string | null {
  if (!course.orderIdSetBy || !course.orderIdSetAt) return null;
  const name = emailToName(course.orderIdSetBy);
  const date = formatPaymentDateFull(course.orderIdSetAt);
  return date ? `Kích hoạt lúc ${date} bởi ${name}` : `Kích hoạt bởi ${name}`;
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
    customerName: raw.customer_name || prSnippet?.name || "",
    saleName: prSnippet?.sale_name || undefined,
    createdAt: raw.created_at ?? "",
    createdBy: "",
    uids: (raw.uids_data ?? []).map((u) => ({
      uid: u.uid ?? "",
      ...(u.name ? { name: u.name } : {}),
      phone: u.phone ?? "",
      country: u.country ?? "VN",
      courses: (u.courses ?? []).map((c) => ({
        courseCode: c.code ?? "",
        packageName: c.name ?? "",
        amount: c.amount ?? 0,
        orderId: c.order_id ?? c.orderId ?? "",
        invoiced: !!c.invoiced,
        invoiceId: c.invoice_id,
        invoicedAt: c.invoiced_at ?? null,
        invoiceRequestedAt: c.invoice_requested_at ?? null,
        taxInvoiceCode: c.tax_invoice_code,
        taxProductCode: c.tax_product_code,
        leadSource: c.lead_source ?? c.leadSource ?? undefined,
        leadChannel: c.lead_channel ?? c.leadChannel ?? undefined,
        referrerUid: c.referrer_uid ?? undefined,
        bonusSessionsReferee: c.bonus_sessions_referee ?? undefined,
        bonusSessionsReferrer: c.bonus_sessions_referrer ?? undefined,
        refereeCreditedAt: c.referee_credited_at ?? null,
        refereeCreditedBy: c.referee_credited_by ?? null,
        referrerCreditedAt: c.referrer_credited_at ?? null,
        referrerCreditedBy: c.referrer_credited_by ?? null,
        orderIdSetBy: c.order_id_set_by ?? null,
        orderIdSetAt: c.order_id_set_at ?? null,
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

/** Modal AR mở rộng (10/7): gom các dòng {bé, gói, tiền} thành uid-block.
 *  Cùng bé (childName+uid) → 1 block nhiều courses. Tên gói bắt buộc —
 *  BE chặn tạo AR khi name rỗng (tin Zalo bắn ngay lúc tạo). */
export function buildCreateActiveRequestPayload(pr: PaymentRequest, rows: ArDraftRow[]): CreateActiveRequestPayload {
  const blocks = new Map<string, CreateActiveRequestUidPayload>();
  for (const row of rows) {
    const key = `${row.childName.trim()}|${row.uid.trim()}`;
    let block = blocks.get(key);
    if (!block) {
      block = {
        uid: row.uid.trim(),
        phone: pr.phone,
        country: pr.country,
        courses: [],
      };
      const name = row.childName.trim();
      // Tên bé chỉ gửi khi có — PR 1 con không tên giữ payload y hệt cũ (G3)
      if (name) block.name = name;
      blocks.set(key, block);
    }
    const course: CreateActiveRequestCoursePayload = {
      name: row.packageName.trim(),
      amount: Math.max(0, Math.round(row.amount)),
    };
    const src = (row.leadSource ?? "").trim();
    if (src) {
      course.lead_source = src;
    } else if (isReferralPackage(row.packageName)) {
      course.lead_source = "gioi_thieu";
    }
    const ch = (row.leadChannel ?? "").trim();
    if (ch) course.lead_channel = ch;
    block.courses.push(course);
  }
  return { uids: [...blocks.values()] };
}

export function activeRequestAllocation(ar: ActiveRequest, pr: PaymentRequest | null | undefined) {
  const total = ar.uids.reduce(
    (sum, uid) => sum + uid.courses.reduce((courseSum, course) => courseSum + Math.max(0, course.amount || 0), 0),
    0
  );
  const received = Math.max(0, pr?.received ?? 0);
  const overAmount = Math.max(0, total - received);
  return {
    total,
    received,
    remaining: Math.max(0, received - total),
    overAmount,
    percent: received > 0 ? Math.min(100, Math.round((total / received) * 100)) : 0,
    isOver: !!pr && overAmount > 0,
  };
}

export type ReferralStatus = "none" | "partial" | "full";

export const REFERRAL_STATUS_PANEL_STYLE: Record<ReferralStatus, CSSProperties> = {
  full:    { border: "1.5px solid var(--success, #10b981)", background: "var(--success-bg, #d1fae5)" },
  partial: { border: "1.5px solid var(--caution, #eab308)", background: "var(--caution-bg, #fef9c3)" },
  none:    { border: "1.5px solid var(--warning, #f59e0b)", background: "var(--warning-bg, #fef3c7)" },
};

export const REFERRAL_STATUS_HEADER: Record<ReferralStatus, string> = {
  full:    "Khoá này đã được cộng buổi thưởng giới thiệu đầy đủ cho cả 2 bên.",
  partial: "Khoá này có thưởng giới thiệu — bộ phận quản trị đã cộng 1 bên, còn 1 bên chưa.",
  none:    "Khoá này có thưởng giới thiệu — bộ phận quản trị chưa cộng buổi trong CRM.",
};

export function getReferralStatus(course: {
  bonusSessionsReferee?: number;
  bonusSessionsReferrer?: number;
  refereeCreditedAt?: string | null;
  referrerCreditedAt?: string | null;
}): ReferralStatus {
  const needRefereeCredit = (course.bonusSessionsReferee ?? 0) > 0;
  const needReferrerCredit = (course.bonusSessionsReferrer ?? 0) > 0;
  if (!needRefereeCredit && !needReferrerCredit) return "none";
  const refereeOk = !needRefereeCredit || Boolean(course.refereeCreditedAt);
  const referrerOk = !needReferrerCredit || Boolean(course.referrerCreditedAt);
  if (refereeOk && referrerOk) return "full";
  if (refereeOk || referrerOk) return "partial";
  return "none";
}

/**
 * Aggregate referral status across all gioi_thieu courses in an AR.
 * Returns null if AR has no referral courses.
 */
export function getArReferralStatus(ar: ActiveRequest): ReferralStatus | null {
  const referralCourses: { bonusSessionsReferee?: number; bonusSessionsReferrer?: number; refereeCreditedAt?: string | null; referrerCreditedAt?: string | null }[] = [];
  for (const u of ar.uids) {
    for (const c of u.courses) {
      if (
        c.leadSource === "gioi_thieu" &&
        ((c.bonusSessionsReferee ?? 0) > 0 || (c.bonusSessionsReferrer ?? 0) > 0)
      ) {
        referralCourses.push(c);
      }
    }
  }
  if (referralCourses.length === 0) return null;
  const statuses = referralCourses.map(getReferralStatus);
  if (statuses.every((s) => s === "full")) return "full";
  if (statuses.every((s) => s === "none")) return "none";
  return "partial";
}

/**
 * Kiểm tra dữ liệu cộng buổi referral trên toàn bộ AR.
 * Trả về chuỗi lỗi đầu tiên, hoặc "" nếu hợp lệ.
 * Quy tắc: nếu một course nguồn "gioi_thieu" cộng buổi cho người giới thiệu
 * (bonusSessionsReferrer > 0) thì bắt buộc có referrerUid, và referrerUid
 * phải khác UID người được giới thiệu (uid của nhóm).
 */
export function validateReferralBonus(ar: ActiveRequest): string {
  for (const u of ar.uids) {
    const refereeUid = (u.uid ?? "").trim();
    for (const c of u.courses) {
      if (c.leadSource !== "gioi_thieu") continue;
      if ((c.bonusSessionsReferrer ?? 0) > 0) {
        const refUid = (c.referrerUid ?? "").trim();
        if (!refUid) {
          return `Khoá ${c.courseCode}: đã cộng buổi cho người giới thiệu nhưng chưa nhập UID người giới thiệu.`;
        }
        if (refUid === refereeUid) {
          return `Khoá ${c.courseCode}: UID người giới thiệu phải khác UID người được giới thiệu (${refereeUid}).`;
        }
      }
    }
  }
  return "";
}

export function updateActiveCoursePackage(
  ar: ActiveRequest,
  courseCode: string,
  packageName: string
): ActiveRequest {
  return {
    ...ar,
    uids: ar.uids.map((u) => ({
      ...u,
      courses: u.courses.map((c) =>
        c.courseCode === courseCode ? { ...c, packageName } : c
      ),
    })),
  };
}

export function toActiveRequestPatchUidsData(ar: ActiveRequest): ActiveRequestPatchUidPayload[] {
  return ar.uids.map((u) => ({
    uid: u.uid,
    ...(u.name ? { name: u.name } : {}),
    phone: u.phone,
    country: u.country,
    courses: u.courses.map((c) => ({
      code: c.courseCode,
      name: c.packageName,
      amount: c.amount,
      order_id: c.orderId,
      invoiced: c.invoiced,
      invoice_id: c.invoiceId,
      invoiced_at: c.invoicedAt ?? undefined,
      invoice_requested_at: c.invoiceRequestedAt ?? undefined,
      tax_invoice_code: c.taxInvoiceCode,
      tax_product_code: c.taxProductCode,
      lead_source: c.leadSource,
      lead_channel: c.leadChannel,
      referrer_uid: c.referrerUid,
      bonus_sessions_referee: c.bonusSessionsReferee,
      bonus_sessions_referrer: c.bonusSessionsReferrer,
    })),
  }));
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
            amount: Math.max(0, pr.received),
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

const PENDING_QR_POLL_WINDOW_DAYS = 30;

/**
 * Gate bật poll 30s chờ SePay webhook. Chỉ xét PR tạo trong 30 ngày —
 * QR pending bỏ quên ở PR cũ sẽ giữ poll chạy vĩnh viễn cho mọi user
 * (GĐ1 load-all nạp cả PR cũ nên rủi ro này thành hiện thực).
 * PR cũ có khách CK thật vẫn được realtime subscription (payment_lines) bắt.
 */
export function hasPendingQrPayments(requests: PaymentRequest[], now: Date = new Date()): boolean {
  const cutoff = now.getTime() - PENDING_QR_POLL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return requests.some((pr) => {
    if (pr.state === "cancelled") return false;
    const created = parsePaymentDate(pr.createdAt);
    if (created && created.getTime() < cutoff) return false;
    return pr.payments.some((p) => !p.cancelled && p.method === "qr" && p.status === "pending");
  });
}

const VN_TZ = "Asia/Ho_Chi_Minh";

/** Display parts for table cells — always in Vietnam timezone (UTC+7). */
export function formatPaymentDateTime(dateStr: string): { date: string; time: string } {
  const d = parsePaymentDate(dateStr);
  if (!d) {
    const [date = dateStr, time = ""] = dateStr.split(" ");
    return { date, time };
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("day")}/${get("month")}/${get("year")}`,
    time: `${get("hour")}:${get("minute")}`,
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

export function formatCoursePhone(countryCode: string | undefined | null, raw: string | undefined | null): string {
  const digits = (raw || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  const dial = COUNTRY_DIALS[countryCode || "VN"] || COUNTRY_DIALS.VN;
  return `${dial} ${fmtPhone(digits)}`.trim();
}

export function activationSummary(ar: ActiveRequest | null | undefined) {
  if (!ar) {
    return {
      allActivated: false,
      activatedCount: 0,
      invoicedCount: 0,
      allInvoiced: false,
      courseCount: 0,
      buttonLabel: "Kích hoạt khóa học",
      courseBadgeLabel: "Chờ kích hoạt",
      courseBadgeClass: "is-over",
    };
  }
  const courses = ar.uids.flatMap((u) => u.courses);
  const activatedCount = courses.filter((c) => !!c.orderId?.trim()).length;
  const allActivated = courses.length > 0 && activatedCount === courses.length;
  const invoicedCount = courses.filter((c) => !!c.invoiced).length;
  const allInvoiced = courses.length > 0 && invoicedCount === courses.length;
  return {
    allActivated,
    activatedCount,
    invoicedCount,
    allInvoiced,
    courseCount: courses.length,
    buttonLabel: allActivated ? "Đã kích hoạt khóa học" : "Chờ kích hoạt khóa học",
    courseBadgeLabel: allActivated ? "Đã kích hoạt" : "Chờ kích hoạt",
    courseBadgeClass: allActivated ? "is-done" : "is-over",
  };
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

// ───────── Ẩn data test + phân trang client-side ─────────

/** PR hiển thị theo checkbox "Ẩn data test" — dùng làm gốc cho MỌI con số trên màn (badge/chip/KPI/bảng). */
export function visiblePaymentRequests(
  requests: PaymentRequest[],
  hideTest: boolean
): PaymentRequest[] {
  return hideTest ? requests.filter((r) => !r.isTest) : requests;
}

export interface PageSlice<T> {
  rows: T[];
  /** Trang hợp lệ sau khi clamp vào [1..totalPages] */
  page: number;
  totalPages: number;
  /** Thứ tự 1-based của dòng đầu/cuối trang; 0 khi không có kết quả */
  from: number;
  to: number;
}

/** Số tiền THỰC NHẬN để hiển thị trên card (net-of-fee, card + installment).
 *  Cùng công thức với normalizeRequest.received — dùng chung lineNet (G2). */
export function displayReceived(pr: PaymentRequest): number {
  return pr.payments.reduce((sum, p) => {
    if (p.status !== "paid") return sum;
    return sum + lineNet(p);
  }, 0);
}

/** True khi có lần card/installment đã trả nhưng kế toán CHƯA xác nhận số sau phí. */
export function hasUnverifiedFeeLine(pr: PaymentRequest): boolean {
  return pr.payments.some(
    (p) => p.status === "paid" && FEE_METHODS.has(p.method) && p.verifiedReceived == null,
  );
}
export const hasUnverifiedInstallment = hasUnverifiedFeeLine;

/** Tổng KHÁCH ĐÃ CHUYỂN (gross, trước phí) cho các lần đã trả. */
export function grossReceived(pr: PaymentRequest): number {
  return pr.payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);
}

/** Tổng phí xử lý (gross − net), clamp về 0 khi net > gross (không hiện phí âm). */
export function feeTotal(pr: PaymentRequest): number {
  return Math.max(0, grossReceived(pr) - displayReceived(pr));
}

export function paginate<T>(items: T[], rawPage: number, pageSize: number): PageSlice<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(rawPage) || 1), totalPages);
  const start = (page - 1) * pageSize;
  const rows = items.slice(start, start + pageSize);
  return {
    rows,
    page,
    totalPages,
    from: items.length === 0 ? 0 : start + 1,
    to: start + rows.length,
  };
}

/** Dãy nút trang rút gọn: luôn có trang 1 + trang cuối + cửa sổ quanh trang hiện tại, "..." cho khoảng trống. */
export function pageItems(page: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const wanted = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  const out: Array<number | "..."> = [];
  for (let i = 0; i < wanted.length; i++) {
    if (i > 0 && wanted[i] - wanted[i - 1] > 1) out.push("...");
    out.push(wanted[i]);
  }
  return out;
}

// ===== TVTS filter (bộ lọc tạm thời theo TVTS — TVTS-01) =====

/** Bucket cho PR không có sale_email (data cũ / data test). */
export const UNKNOWN_TVTS_KEY = "__unknown_tvts__";

export interface TvtsOption {
  /** saleEmail chuẩn hoá (trim + lowercase), hoặc UNKNOWN_TVTS_KEY */
  key: string;
  /** Tên hiển thị: saleName > phần trước @ của email > "Không rõ TVTS" */
  label: string;
  /** Số PR thuộc TVTS này trong danh sách đang thấy (tính mọi bucket, kể cả Đã huỷ) */
  count: number;
}

/** Key định danh TVTS của 1 PR — dùng saleEmail vì ổn định hơn saleName (saleName chỉ có ở response danh sách). */
export function tvtsKeyOf(r: PaymentRequest): string {
  const email = (r.saleEmail ?? "").trim().toLowerCase();
  return email || UNKNOWN_TVTS_KEY;
}

/** Label TVTS của 1 PR — cùng fallback với cột TVTS trong bảng (PaymentRequestTable). */
export function tvtsLabelOf(r: PaymentRequest): string {
  if (r.saleName) return r.saleName;
  const email = (r.saleEmail ?? "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return email || "Không rõ TVTS";
}

/**
 * Danh sách option cho dropdown lọc TVTS.
 * - Unique theo key; nếu PR đầu tiên gặp thiếu saleName thì lấy saleName từ PR sau (nếu có)
 * - Sort A→Z theo locale "vi"; bucket "Không rõ TVTS" luôn nằm cuối
 */
export function deriveTvtsOptions(requests: PaymentRequest[]): TvtsOption[] {
  const map = new Map<string, { label: string; count: number; hasName: boolean }>();
  for (const r of requests) {
    const key = tvtsKeyOf(r);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { label: tvtsLabelOf(r), count: 1, hasName: !!r.saleName });
    } else {
      existing.count += 1;
      if (!existing.hasName && r.saleName) {
        existing.label = r.saleName;
        existing.hasName = true;
      }
    }
  }
  const options = [...map.entries()].map(([key, v]) => ({ key, label: v.label, count: v.count }));
  return options.sort((a, b) => {
    if (a.key === UNKNOWN_TVTS_KEY) return 1;
    if (b.key === UNKNOWN_TVTS_KEY) return -1;
    return a.label.localeCompare(b.label, "vi");
  });
}

/**
 * Áp bộ lọc TVTS. selected rỗng = không lọc — trả về ĐÚNG reference mảng đầu vào
 * (bất biến quan trọng: giữ ổn định useMemo phía PaymentRequestsTab).
 */
export function applyTvtsFilter(
  requests: PaymentRequest[],
  selected: ReadonlySet<string>
): PaymentRequest[] {
  if (selected.size === 0) return requests;
  return requests.filter((r) => selected.has(tvtsKeyOf(r)));
}

export function extractErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail ? String(detail) : fallback;
}
