import { useEffect, useRef, useState } from "react";
import { useNotifications } from "../hooks/useNotifications";
import type { NotificationItem, NotificationKind } from "../types/notification";

const KIND_META: Record<NotificationKind, { icon: string; tone: string }> = {
  ar_confirmed: { icon: "✓", tone: "text-emerald-600 bg-emerald-50" },
  ar_rejected: { icon: "✕", tone: "text-rose-600 bg-rose-50" },
  invoice_remind: { icon: "📄", tone: "text-amber-600 bg-amber-50" },
  pr_overpaid: { icon: "⬆", tone: "text-amber-600 bg-amber-50" },
  pr_underpaid: { icon: "⬇", tone: "text-blue-600 bg-blue-50" },
  system: { icon: "ℹ", tone: "text-gray-600 bg-gray-50" },
};

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

export default function NotificationBell({
  onNavigate,
}: {
  onNavigate?: (view: string) => void;
}) {
  const { items, unreadCount, markRead, markAllRead, refresh, usingMock } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleItemClick = (n: NotificationItem) => {
    if (!n.isRead) void markRead(n.id);
    if (n.linkView && onNavigate) onNavigate(n.linkView);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
        title="Thông báo"
        aria-label={`Thông báo${unreadCount > 0 ? ` (${unreadCount} chưa đọc)` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-gmv-md border border-gmv-border bg-gmv-canvas text-gmv-text hover:bg-gmv-bg"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] max-w-[calc(100vw-1rem)] rounded-gmv-md border border-gmv-border bg-gmv-canvas shadow-gmv-2">
          <div className="flex items-center justify-between border-b border-gmv-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gmv-text-strong">Thông báo</span>
              {usingMock && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  mock
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-gmv-primary hover:underline"
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-gmv-muted">
                Chưa có thông báo nào
              </div>
            ) : (
              <ul className="divide-y divide-gmv-border">
                {items.map((n) => {
                  const meta = KIND_META[n.kind] ?? KIND_META.system;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className={`flex w-full gap-2.5 px-3 py-2.5 text-left transition hover:bg-gmv-bg ${
                          n.isRead ? "" : "bg-blue-50/50"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${meta.tone}`}
                        >
                          {meta.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className={`text-sm ${n.isRead ? "font-normal text-gmv-text" : "font-semibold text-gmv-text-strong"}`}>
                              {n.title}
                            </div>
                            {!n.isRead && (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                            )}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-gmv-muted">
                            {n.body}
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-gmv-muted">
                            {formatTimeAgo(n.createdAt)}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
