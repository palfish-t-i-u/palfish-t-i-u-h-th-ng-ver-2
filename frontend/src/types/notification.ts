// Khớp snake_case từ BE (Đức sẽ trả về). FE đã có normalizer pattern.
export type NotificationKind =
  | "ar_confirmed"
  | "ar_rejected"
  | "invoice_remind"
  | "pr_overpaid"
  | "pr_underpaid"
  | "system";

export interface NotificationApiRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link_view?: string | null; // ViewId để FE biết navigate sang tab nào
  link_payload?: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
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
  unread_count: number;
}

export function fromApiNotification(row: NotificationApiRow): NotificationItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    linkView: row.link_view ?? undefined,
    linkPayload: row.link_payload ?? undefined,
    isRead: row.is_read,
    createdAt: row.created_at,
    readAt: row.read_at ?? undefined,
  };
}
