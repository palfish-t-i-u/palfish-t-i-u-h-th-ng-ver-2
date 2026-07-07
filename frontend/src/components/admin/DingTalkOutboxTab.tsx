// frontend/src/components/admin/DingTalkOutboxTab.tsx
import React, { useEffect, useState } from 'react';
import {
  getDingTalkOutbox,
  retryDingTalkOutbox,
  type DingTalkOutboxRow,
} from '../../lib/api/dingtalkAdmin';
import useIsMobile from '../../hooks/useIsMobile';
import DingTalkOutboxCards from './DingTalkOutboxCards';

export const DingTalkOutboxTab: React.FC = () => {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<DingTalkOutboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchRows = async () => {
    try {
      setLoading(true);
      const data = await getDingTalkOutbox();
      setRows(data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAlert({ type: 'error', message: e.response?.data?.detail || e.message || 'Lỗi tải outbox' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, []);

  const handleRetry = async (id: number) => {
    try {
      await retryDingTalkOutbox(id);
      setAlert({ type: 'success', message: `Đã đặt lại retry cho msg ${id}` });
      await fetchRows();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAlert({ type: 'error', message: e.response?.data?.detail || e.message || 'Lỗi retry' });
    }
  };

  const statusBadge = (row: DingTalkOutboxRow) => {
    if (row.sent_at) return <span className="text-green-700 bg-green-100 px-2 py-0.5 rounded text-xs">sent</span>;
    if (row.retries >= 4) return <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded text-xs">dead</span>;
    if (row.retries > 0) return <span className="text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded text-xs">retry {row.retries}</span>;
    return <span className="text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs">pending</span>;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">DingTalk — Outbox (50 gần nhất)</h2>
        <button onClick={fetchRows} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">Refresh</button>
      </div>

      {alert && (
        <div className={`p-3 rounded-md border ${alert.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {alert.message}
        </div>
      )}

      {isMobile ? (
        <DingTalkOutboxCards
          rows={rows}
          loading={loading}
          onRetry={handleRetry}
        />
      ) : loading ? (
        <div className="text-gray-500">Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-500">Chưa có tin nhắn nào.</div>
      ) : (
        <div className="overflow-x-auto bg-white border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">ID</th>
                <th className="px-2 py-2 text-left">created_at</th>
                <th className="px-2 py-2 text-left">event_type</th>
                <th className="px-2 py-2 text-left">team_code</th>
                <th className="px-2 py-2 text-left">message</th>
                <th className="px-2 py-2 text-left">status</th>
                <th className="px-2 py-2 text-left">last_error</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-2 py-2 font-mono">{r.id}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString('vi-VN')}</td>
                  <td className="px-2 py-2 text-xs">{r.event_type}</td>
                  <td className="px-2 py-2 text-xs font-mono">{r.team_code}</td>
                  <td className="px-2 py-2 text-xs max-w-md truncate">{r.message}</td>
                  <td className="px-2 py-2">{statusBadge(r)}</td>
                  <td className="px-2 py-2 text-xs text-red-700 max-w-xs truncate">{r.last_error || ''}</td>
                  <td className="px-2 py-2">
                    {!r.sent_at && (
                      <button onClick={() => handleRetry(r.id)} className="text-blue-600 text-xs hover:underline">Retry</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DingTalkOutboxTab;
