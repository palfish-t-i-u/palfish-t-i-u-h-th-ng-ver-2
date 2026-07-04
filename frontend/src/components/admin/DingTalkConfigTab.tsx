// frontend/src/components/admin/DingTalkConfigTab.tsx
import React, { useEffect, useState } from 'react';
import {
  getDingTalkGroups,
  testDingTalkMessage,
  type DingTalkGroup,
  type DingTalkTestPayload,
} from '../../lib/api/dingtalkAdmin';

export const DingTalkConfigTab: React.FC = () => {
  const [groups, setGroups] = useState<DingTalkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [testForm, setTestForm] = useState<DingTalkTestPayload>({
    team_code: '',
    message: 'Test từ PalFish GMV Admin',
  });
  const [testing, setTesting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getDingTalkGroups();
        setGroups((data ?? []).filter((g) => g.is_active));
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleTest = async () => {
    if (!testForm.team_code) {
      setAlert({ type: 'error', message: 'Chọn team_code để test' });
      return;
    }
    try {
      setTesting(true);
      setAlert(null);
      const result = await testDingTalkMessage(testForm);
      if (result.ok) {
        setAlert({ type: 'success', message: `Gửi thành công! ${result.message_id}` });
      } else {
        setAlert({ type: 'error', message: `Thất bại: ${result.error}` });
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAlert({ type: 'error', message: e.response?.data?.detail || e.message || 'Lỗi gửi test' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">DingTalk — Cấu hình</h2>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-900 space-y-2">
        <p><strong>DingTalk khác Zalo:</strong> không có "OA token" toàn cục. Mỗi nhóm DingTalk có 1 robot riêng với webhook URL + secret.</p>
        <p>Cấu hình URL/secret tại tab <strong>Nhóm thông báo</strong>. Tab này chỉ dùng để test gửi sau khi đã thêm nhóm.</p>
      </div>

      {alert && (
        <div className={`p-3 rounded-md border ${alert.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {alert.message}
        </div>
      )}

      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-2 text-gray-800">Kiểm tra kết nối</h3>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          {loading ? (
            <div className="flex-1 px-3 py-2 border rounded-md text-sm text-gray-400 bg-gray-50">Đang tải nhóm...</div>
          ) : groups.length === 0 ? (
            <div className="flex-1 px-3 py-2 border rounded-md text-sm text-gray-500 bg-gray-50">
              Chưa có nhóm. Vào tab <strong>Nhóm thông báo</strong> để thêm.
            </div>
          ) : (
            <select
              value={testForm.team_code}
              onChange={(e) => setTestForm({ ...testForm, team_code: e.target.value })}
              className="flex-1 px-3 py-2 border rounded-md text-sm"
            >
              <option value="">— Chọn nhóm —</option>
              {groups.map((g) => (
                <option key={g.team_code} value={g.team_code}>{g.group_name} ({g.team_code})</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={testForm.message}
            onChange={(e) => setTestForm({ ...testForm, message: e.target.value })}
            className="flex-1 px-3 py-2 border rounded-md text-sm"
            placeholder="Nội dung tin test"
          />
        </div>
        <button
          onClick={handleTest}
          disabled={testing || !testForm.team_code}
          className={`px-4 py-2 rounded text-white ${testing || !testForm.team_code ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
        >
          {testing ? 'Đang gửi...' : 'Test Gửi DingTalk'}
        </button>
      </div>
    </div>
  );
};

export default DingTalkConfigTab;
