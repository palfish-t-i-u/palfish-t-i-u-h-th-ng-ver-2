import { useEffect, useState } from "react";
import {
  getZaloOutbox,
  retryZaloOutbox,
  cancelZaloOutbox,
  type ZaloOutboxRow,
} from "../../lib/api/zaloAdmin";
import useIsMobile from "../../hooks/useIsMobile";
import ZaloOutboxCards from "./ZaloOutboxCards";
import { HdsdLink } from "../help/HdsdLink";

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN");
}

function statusOf(row: ZaloOutboxRow): { label: string; cls: string } {
  if (row.sent_at) return { label: "Đã gửi", cls: "bg-green-100 text-green-700" };
  if (row.retries >= 99) return { label: "Đã huỷ", cls: "bg-gray-100 text-gray-500" };
  if (row.retries >= 4) return { label: "Dead", cls: "bg-red-100 text-red-700" };
  if (row.retries > 0) return { label: `Retry ${row.retries}/4`, cls: "bg-yellow-100 text-yellow-700" };
  return { label: "Chờ gửi", cls: "bg-blue-100 text-blue-700" };
}

const EVENT_LABELS: Record<string, string> = {
  payment_paid: "Báo tiền về",
  course_activated: "Kích hoạt TP",
  activation_urgent_reminder: "Nhắc kích hoạt",
  activation_request_created: "Y/c kích hoạt",
  bill_uploaded: "Ảnh bill",
};

function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] || eventType;
}

function imageStatus(row: ZaloOutboxRow): { icon: string; title: string; cls: string } | null {
  if (!row.image_url) return null;
  if (row.image_sent_at) return { icon: "✅", title: `Đã gửi ảnh lúc ${formatDate(row.image_sent_at)}`, cls: "text-green-600" };
  if (row.image_error) return { icon: "⚠", title: row.image_error, cls: "text-yellow-600" };
  return { icon: "🕐", title: "Chờ gửi ảnh", cls: "text-blue-500" };
}

export default function ZaloOutboxTab() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<ZaloOutboxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getZaloOutbox();
      setRows(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Lỗi tải outbox");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleRetry = async (id: number) => {
    setRetrying(id);
    setError(null);
    try {
      await retryZaloOutbox(id);
      flash(`Đã reset tin #${id} — worker sẽ gửi lại`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Lỗi retry");
    } finally {
      setRetrying(null);
    }
  };

  const handleCancel = async (id: number) => {
    setCancelling(id);
    setError(null);
    try {
      await cancelZaloOutbox(id);
      flash(`Đã huỷ tin #${id}`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Lỗi huỷ tin");
    } finally {
      setCancelling(null);
    }
  };

  const sent = rows.filter((r) => r.sent_at).length;
  const pending = rows.filter((r) => !r.sent_at && r.retries < 4).length;
  const dead = rows.filter((r) => !r.sent_at && r.retries >= 4).length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <HdsdLink moduleSlug="zaloOutbox" topicSlug="tong-quan" className="shrink-0" />
          <span>50 tin gần nhất</span>
          <span className="text-green-600">{sent} đã gửi</span>
          {pending > 0 && <span className="text-blue-600">{pending} chờ</span>}
          {dead > 0 && <span className="text-red-600">{dead} dead</span>}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      {isMobile ? (
        <ZaloOutboxCards
          rows={rows}
          loading={loading}
          retrying={retrying}
          onRetry={handleRetry}
          cancelling={cancelling}
          onCancel={handleCancel}
          formatDate={formatDate}
        />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left p-2 font-medium text-gray-600">ID</th>
              <th className="text-left p-2 font-medium text-gray-600">Sự kiện</th>
              <th className="text-left p-2 font-medium text-gray-600">Group</th>
              <th className="text-left p-2 font-medium text-gray-600">Nội dung</th>
              <th className="text-center p-2 font-medium text-gray-600">📎</th>
              <th className="text-center p-2 font-medium text-gray-600">Trạng thái</th>
              <th className="text-left p-2 font-medium text-gray-600">Tạo lúc</th>
              <th className="text-left p-2 font-medium text-gray-600">Gửi lúc</th>
              <th className="text-center p-2 font-medium text-gray-600">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="p-4 text-center text-gray-400">Đang tải...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-center text-gray-400">Chưa có tin nhắn nào</td></tr>
            )}
            {rows.map((row) => {
              const st = statusOf(row);
              const canRetry = !row.sent_at;
              return (
                <tr key={row.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 font-mono text-xs text-gray-400">{row.id}</td>
                  <td className="p-2 text-xs">
                    <span className="font-mono">{eventLabel(row.event_type)}</span>
                    <br />
                    <span className="text-gray-400">{row.source_table}#{row.source_id}</span>
                  </td>
                  <td className="p-2 font-mono text-xs text-gray-500 max-w-[120px] truncate" title={row.group_id}>
                    {row.group_id}
                  </td>
                  <td className="p-2 text-xs max-w-[250px]">
                    <div className="truncate" title={row.message}>{row.message}</div>
                    {row.last_error && (
                      <div className="text-red-500 truncate mt-0.5" title={row.last_error}>
                        ⚠ {row.last_error}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-center text-sm">
                    {(() => {
                      const img = imageStatus(row);
                      if (!img) return <span className="text-gray-300">—</span>;
                      return <span className={img.cls} title={img.title}>{img.icon}</span>;
                    })()}
                  </td>
                  <td className="p-2 text-center">
                    <span className={`inline-block px-1.5 py-0.5 text-xs rounded ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="p-2 text-xs text-gray-400 whitespace-nowrap">{formatDate(row.created_at)}</td>
                  <td className="p-2 text-xs text-gray-400 whitespace-nowrap">{formatDate(row.sent_at)}</td>
                  <td className="p-2 text-center space-x-1">
                    {canRetry && (
                      <>
                        <button
                          onClick={() => handleRetry(row.id)}
                          disabled={retrying === row.id}
                          className="px-2 py-0.5 text-xs rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                        >
                          {retrying === row.id ? "..." : "Retry"}
                        </button>
                        {row.retries < 99 && (
                          <button
                            onClick={() => handleCancel(row.id)}
                            disabled={cancelling === row.id}
                            className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            {cancelling === row.id ? "..." : "Huỷ"}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
