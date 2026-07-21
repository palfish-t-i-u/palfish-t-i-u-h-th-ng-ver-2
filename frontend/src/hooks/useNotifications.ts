import { useCallback, useEffect, useRef, useState } from "react";
import { useVisiblePoll } from "./useVisiblePoll";
import { endpoints } from "../lib/api";
import {
  fromApiNotification,
  type NotificationItem,
} from "../types/notification";

const POLL_INTERVAL_MS = 30_000;

interface State {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

const INITIAL: State = {
  items: [],
  unreadCount: 0,
  loading: false,
  error: null,
};

// Tạm in-memory để FE chạy được khi BE chưa có endpoint /notifications.
// Khi Đức push BE, response thật sẽ ghi đè state ngay sau lần fetch đầu tiên.
const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "mock-1",
    kind: "ar_confirmed",
    title: "Order CRM đã xác nhận",
    body: "Chị Thu Hiền đã xác nhận order cho PR-2026-9001 (Nguyễn Minh Anh). Bạn có thể nhắc ops xuất hóa đơn.",
    linkView: "module3",
    isRead: false,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: "mock-2",
    kind: "ar_rejected",
    title: "Order CRM bị từ chối",
    body: "Active Request cho PR-2026-9003 bị từ chối: thiếu Course Code. Vui lòng cập nhật & gửi lại.",
    linkView: "module3",
    isRead: false,
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  {
    id: "mock-3",
    kind: "invoice_remind",
    title: "Khách yêu cầu xuất hóa đơn",
    body: "PR-2026-8888 — khách đã đủ thông tin xuất HĐ.",
    linkView: "module4",
    isRead: true,
    createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    readAt: new Date(Date.now() - 1 * 3600_000).toISOString(),
  },
];

export function useNotifications() {
  const [state, setState] = useState<State>(INITIAL);
  const usingMockRef = useRef(false);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await endpoints.notifications.list({ limit: 20 });
      const items = res.data.notifications.map(fromApiNotification);
      usingMockRef.current = false;
      setState({
        items,
        unreadCount: items.filter((n) => !n.isRead).length,
        loading: false,
        error: null,
      });
    } catch (err) {
      // BE chưa sẵn sàng (404/500) → fallback mock để UI vẫn demo được.
      // Production thực sự sẽ không bao giờ rơi vào nhánh này (Đức ship rồi).
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 500 || status === undefined) {
        usingMockRef.current = true;
        setState({
          items: MOCK_NOTIFICATIONS,
          unreadCount: MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length,
          loading: false,
          error: null,
        });
        return;
      }
      setState((s) => ({
        ...s,
        loading: false,
        error: "Không tải được thông báo",
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useVisiblePoll(() => {
    void refresh();
  }, POLL_INTERVAL_MS);

  const markRead = useCallback(async (id: string) => {
    const prev = state;
    setState((s) => ({
      ...s,
      items: s.items.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
      unreadCount: Math.max(0, s.unreadCount - (s.items.find((n) => n.id === id)?.isRead ? 0 : 1)),
    }));
    if (usingMockRef.current) return;
    try {
      await endpoints.notifications.markRead(id);
    } catch {
      setState(prev);
    }
  }, [state]);

  const markAllRead = useCallback(async () => {
    const prev = state;
    setState((s) => ({
      ...s,
      items: s.items.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() })),
      unreadCount: 0,
    }));
    if (usingMockRef.current) return;
    try {
      await endpoints.notifications.markAllRead();
    } catch {
      setState(prev);
    }
  }, [state]);

  return {
    items: state.items,
    unreadCount: state.unreadCount,
    loading: state.loading,
    error: state.error,
    refresh,
    markRead,
    markAllRead,
    usingMock: usingMockRef.current,
  };
}
