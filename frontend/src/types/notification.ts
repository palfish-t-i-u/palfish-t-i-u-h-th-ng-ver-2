// Khớp BE schema từ Đức (fb83b5f, notification_routes.py):
// { id, user_email, kind, payload (jsonb), created_at, read_at }
// FE tự render title/body từ kind + payload và tự đếm unread.
export type NotificationKind =
  | "ar_confirmed"
  | "ar_rejected"
  | "invoice_remind"
  | "pr_overpaid"
  | "pr_underpaid"
  | "system";

export interface NotificationApiRow {
  id: string;
  user_email?: string;
  kind: NotificationKind | string;
  payload: Record<string, unknown>;
  created_at: string;
  read_at?: string | null;
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind | string;
  title: string;
  body: string;
  linkView?: string;
  linkPayload?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

export interface NotificationsListResponse {
  notifications: NotificationApiRow[];
}

// Render title/body từ kind + payload. Map đầy đủ các kind BE hiện sinh ra.
function renderNotification(kind: string, payload: Record<string, unknown>): {
  title: string;
  body: string;
  linkView?: string;
} {
  const prId = String(payload.pr_id ?? "");
  const customer = String(payload.customer_name ?? "");
  const courseCode = String(payload.course_code ?? "");
  const orderId = String(payload.order_id ?? "");

  switch (kind) {
    case "ar_confirmed":
      return {
        title: "Order CRM đã xác nhận",
        body: `${prId}${customer ? ` (${customer})` : ""}${
          courseCode ? ` — Course ${courseCode}` : ""
        }${orderId ? `, Order ${orderId}` : ""}`,
        linkView: "module3",
      };
    case "ar_rejected":
      return {
        title: "Order CRM bị từ chối",
        body: `${prId}${customer ? ` (${customer})` : ""} bị từ chối${
          payload.reason ? `: ${payload.reason}` : ""
        }`,
        linkView: "module3",
      };
    case "invoice_remind":
      return {
        title: "Khách yêu cầu xuất hóa đơn",
        body: `${prId}${customer ? ` — ${customer}` : ""}`,
        linkView: "module4",
      };
    case "pr_overpaid":
      return {
        title: "PR thu thừa",
        body: `${prId} đã thu vượt số tiền dự kiến.`,
        linkView: "paymentRequests",
      };
    case "pr_underpaid":
      return {
        title: "PR thu thiếu",
        body: `${prId} chưa đủ số tiền dự kiến.`,
        linkView: "paymentRequests",
      };
    default:
      return {
        title: typeof payload.title === "string" ? payload.title : "Thông báo",
        body: typeof payload.body === "string" ? payload.body : JSON.stringify(payload),
      };
  }
}

export function fromApiNotification(row: NotificationApiRow): NotificationItem {
  const payload = row.payload ?? {};
  const { title, body, linkView } = renderNotification(row.kind, payload);
  return {
    id: row.id,
    kind: row.kind,
    title,
    body,
    linkView,
    linkPayload: payload,
    isRead: row.read_at != null,
    createdAt: row.created_at,
    readAt: row.read_at ?? undefined,
  };
}
