import type { ActiveRequest } from "../../types/paymentRequest";
import { getReferralStatus, type ReferralStatus } from "../payment-request/paymentRequestUtils";
import { normVi } from "../../lib/textUtils";

export type CourseTabId = "pending_order" | "activated" | "all";

/** Số AR tối đa mỗi trang. Phân trang đóng gói NGUYÊN cụm AR — các dòng khoá của
 * một AR không bao giờ bị tách qua hai trang. */
export const AR_PER_PAGE = 12;

/** Một dòng phẳng = một khoá học của một UID trong một AR. */
export interface CourseRow {
  /** `${arId}::${uidIdx}::${courseIdx}` — trùng convention deriveInvoiceRows. */
  key: string;
  arId: string;
  prId: string | null;
  customerName: string;
  saleName: string | null;
  createdAt: string;
  uid: string;
  /** Tên bé (multi-con). null nếu block UID không có tên riêng. */
  uidName: string | null;
  /** Ẩn trên list phẳng; chỉ dùng làm target khi lưu Order ID. */
  courseCode: string;
  packageName: string;
  amount: number;
  orderId: string;
  /** Đã có Order ID (đã trim). */
  activated: boolean;
  invoiced: boolean;
  /** Trạng thái thưởng giới thiệu của riêng khoá này; null nếu khoá không có thưởng. */
  referral: ReferralStatus | null;
  holdActivation: boolean;
  holdNote: string | null;
}

export interface CourseRowGroup {
  arId: string;
  rows: CourseRow[];
}

function courseReferral(c: {
  leadSource?: string;
  bonusSessionsReferee?: number;
  bonusSessionsReferrer?: number;
  refereeCreditedAt?: string | null;
  referrerCreditedAt?: string | null;
}): ReferralStatus | null {
  const hasBonus = (c.bonusSessionsReferee ?? 0) > 0 || (c.bonusSessionsReferrer ?? 0) > 0;
  if (c.leadSource !== "gioi_thieu" || !hasBonus) return null;
  return getReferralStatus(c);
}

/** Trải AR thành dòng-mỗi-khoá. Giữ nguyên thứ tự AR đầu vào; iterate uids thủ công
 * để lấy được tên bé (flatCourses của paymentFlowUtils bỏ mất u.name). */
export function flatCourseRows(ars: ActiveRequest[]): CourseRow[] {
  const rows: CourseRow[] = [];
  for (const ar of ars) {
    ar.uids.forEach((u, uidIdx) => {
      u.courses.forEach((c, courseIdx) => {
        const orderId = (c.orderId ?? "").trim();
        rows.push({
          key: `${ar.id}::${uidIdx}::${courseIdx}`,
          arId: ar.id,
          prId: ar.prId ?? null,
          customerName: ar.customerName ?? "",
          saleName: ar.saleName ?? null,
          createdAt: ar.createdAt ?? "",
          uid: (u.uid ?? "").trim(),
          uidName: (u.name ?? "").trim() || null,
          courseCode: c.courseCode,
          packageName: c.packageName ?? "",
          amount: c.amount ?? 0,
          orderId,
          activated: orderId !== "",
          invoiced: Boolean(c.invoiced),
          referral: courseReferral(c),
          holdActivation: Boolean(ar.holdActivation),
          holdNote: ar.holdNote ?? null,
        });
      });
    });
  }
  return rows;
}

export function courseRowMatchesTab(row: CourseRow, tab: CourseTabId): boolean {
  if (tab === "all") return true;
  if (tab === "activated") return row.activated;
  return !row.activated; // pending_order
}

/** Đếm ở cấp khoá học (không lọc theo tab/search/date) — dùng cho badge tab. */
export function countCourseTabs(ars: ActiveRequest[]): { all: number; pending_order: number; activated: number } {
  const rows = flatCourseRows(ars);
  let activated = 0;
  for (const r of rows) if (r.activated) activated++;
  return { all: rows.length, activated, pending_order: rows.length - activated };
}

/** nq PHẢI đã normVi sẵn ở caller. So khớp bỏ dấu trên nhiều trường. */
export function courseRowMatchesSearch(row: CourseRow, nq: string): boolean {
  if (!nq) return true;
  const fields = [row.uid, row.packageName, row.customerName, row.uidName ?? "", row.arId, row.prId ?? "", row.orderId];
  return fields.some((v) => normVi(v).includes(nq));
}

/** Gom các dòng theo AR, giữ thứ tự AR xuất hiện lần đầu. */
export function groupRowsByAr(rows: CourseRow[]): CourseRowGroup[] {
  const groups: CourseRowGroup[] = [];
  const index = new Map<string, CourseRowGroup>();
  for (const r of rows) {
    let g = index.get(r.arId);
    if (!g) {
      g = { arId: r.arId, rows: [] };
      index.set(r.arId, g);
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}

/** Thay đổi bất biến chỉ Order ID của một khoá (match theo courseCode).
 * Precondition: courseCode là duy nhất trong một AR (BE đảm bảo). */
export function applyCourseOrderId(ar: ActiveRequest, courseCode: string, orderId: string): ActiveRequest {
  return {
    ...ar,
    uids: ar.uids.map((u) => ({
      ...u,
      courses: u.courses.map((c) => (c.courseCode === courseCode ? { ...c, orderId } : c)),
    })),
  };
}
