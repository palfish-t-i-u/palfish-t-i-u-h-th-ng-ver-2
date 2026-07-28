import React, { useState, useEffect } from 'react';
import { getZaloConfig, updateZaloConfig, testZaloMessage, getZaloGroups, type ZaloConfigData, type ZaloConfigPayload, type ZaloTestPayload, type ZaloGroup } from '../../lib/api/zaloAdmin';
import useIsMobile from '../../hooks/useIsMobile';
import { HdsdLink } from '../help/HdsdLink';

export const ZaloConfigTab: React.FC = () => {
  const isMobile = useIsMobile();
  const [configData, setConfigData] = useState<ZaloConfigData | null>(null);
  const [form, setForm] = useState<ZaloConfigPayload>({
    app_id: '',
    app_secret: '',
    access_token: '',
    refresh_token: '',
  });
  const [testForm, setTestForm] = useState<ZaloTestPayload>({
    group_id: '',
    message: 'Test từ PalFish GMV Admin',
    image_url: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [groups, setGroups] = useState<ZaloGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

  useEffect(() => {
    fetchConfig();
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      setGroupsLoading(true);
      const data = await getZaloGroups();
      setGroups((data ?? []).filter((g) => g.is_active));
    } catch {
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      setAlert(null);
      const data = await getZaloConfig();
      setConfigData(data);
      if (data?.app_id) {
        setForm((prev) => ({ ...prev, app_id: data.app_id }));
      }
    } catch (err: any) {
      setAlert({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Lỗi khi tải cấu hình Zalo',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.app_id.trim() || !form.app_secret.trim() || !form.access_token.trim() || !form.refresh_token.trim()) {
      setAlert({ type: 'error', message: 'Vui lòng điền đầy đủ các trường' });
      return;
    }
    try {
      setIsSubmitting(true);
      setAlert(null);
      await updateZaloConfig(form);
      setAlert({ type: 'success', message: 'Lưu cấu hình Zalo thành công!' });
      setForm((prev) => ({ ...prev, app_secret: '', access_token: '', refresh_token: '' }));
      await fetchConfig();
    } catch (err: any) {
      setAlert({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Lỗi khi lưu cấu hình',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTest = async () => {
    if (!testForm.group_id.trim()) {
      setAlert({ type: 'error', message: 'Chọn nhóm để test' });
      return;
    }
    try {
      setIsTesting(true);
      setAlert(null);
      const result = await testZaloMessage(testForm);
      if (result.ok) {
        setAlert({ type: 'success', message: `Test thành công! Message ID: ${result.message_id}` });
      } else {
        setAlert({ type: 'error', message: `Test thất bại: ${result.error}` });
      }
    } catch (err: any) {
      setAlert({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Lỗi khi test tin nhắn',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const inputType = showSecrets ? 'text' : 'password';

  if (isLoading) {
    return <div className="p-4 text-gray-500">Đang tải cấu hình...</div>;
  }

  let statusColor = 'bg-gray-50 border-gray-200 text-gray-700';
  let statusText = 'Chưa cấu hình';

  if (configData?.status === 'good') {
    statusColor = 'bg-green-50 border-green-200 text-green-700';
    statusText = 'Đang hoạt động tốt';
  } else if (configData?.status === 'expiring') {
    statusColor = 'bg-yellow-50 border-yellow-200 text-yellow-700';
    statusText = 'Sắp hết hạn (< 1 giờ)';
  } else if (configData?.status === 'expired') {
    statusColor = 'bg-red-50 border-red-200 text-red-700';
    statusText = 'Đã hết hạn';
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        Cấu Hình Zalo OA
        <HdsdLink moduleSlug="zaloConfig" topicSlug="tong-quan" className="shrink-0" />
      </h2>

      {alert && (
        <div
          className={`p-4 border rounded-md shadow-sm ${
            alert.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {alert.message}
        </div>
      )}

      {/* Status Card */}
      <div className={`p-4 rounded-lg border ${statusColor} shadow-sm`}>
        <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
          Trạng thái Token
          <HdsdLink moduleSlug="zaloConfig" topicSlug="trang-thai-token" className="shrink-0" />
        </h3>
        <p><strong>App ID:</strong> {configData?.app_id || 'N/A'}</p>
        <p><strong>Status:</strong> {statusText}</p>
        <p><strong>Hết hạn:</strong> {configData?.expires_at ? new Date(configData.expires_at).toLocaleString('vi-VN') : 'N/A'}</p>
      </div>

      {/* Form Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold mb-1 text-gray-800">Cập nhật Credentials</h3>
        {!isMobile && (
          <p className="text-sm text-gray-500 mb-4">Lưu sẽ thay thế toàn bộ cấu hình cũ. Token mới valid 25 giờ.</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">App ID</label>
              <input
                type="text"
                value={form.app_id}
                onChange={(e) => setForm({ ...form, app_id: e.target.value })}
                className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Zalo App ID"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">App Secret</label>
              <input
                type={inputType}
                value={form.app_secret}
                onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="App Secret"
              />
            </div>

            <div className="flex flex-col md:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1">Access Token</label>
              <input
                type={inputType}
                value={form.access_token}
                onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                placeholder="Access Token (lấy từ API Explorer)"
              />
            </div>

            <div className="flex flex-col md:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1">Refresh Token</label>
              <input
                type={inputType}
                value={form.refresh_token}
                onChange={(e) => setForm({ ...form, refresh_token: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                placeholder="Refresh Token (lấy từ API Explorer)"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-4">
            <button
              type="button"
              onClick={() => setShowSecrets(!showSecrets)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showSecrets ? 'Ẩn Token/Secret' : 'Hiển thị Token/Secret'}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-4 py-2 rounded text-white font-medium transition-colors ${
                isSubmitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu Cấu Hình'}
            </button>
          </div>
        </form>
      </div>

      {/* Test Section */}
      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-2 text-gray-800 flex items-center gap-2">
          Kiểm tra kết nối
          <HdsdLink moduleSlug="zaloConfig" topicSlug="kiem-tra-ket-noi" className="shrink-0" />
        </h3>
        {!isMobile && (
          <p className="text-sm text-gray-600 mb-4">
            Gửi thử một tin nhắn tới nhóm Zalo để kiểm tra token hoạt động.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {groupsLoading ? (
            <div className="flex-1 px-3 py-2 border rounded-md text-sm text-gray-400 bg-gray-50">Đang tải danh sách nhóm...</div>
          ) : groups.length === 0 ? (
            <div className="flex-1 px-3 py-2 border rounded-md text-sm text-gray-500 bg-gray-50">
              Chưa có nhóm nào. Thêm nhóm ở tab <strong>Nhóm thông báo</strong> trước.
            </div>
          ) : (
            <select
              value={testForm.group_id}
              onChange={(e) => setTestForm({ ...testForm, group_id: e.target.value })}
              className="flex-1 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">— Chọn nhóm —</option>
              {groups.map((g) => (
                <option key={g.team_code} value={g.group_id}>{g.group_name}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={testForm.message}
            onChange={(e) => setTestForm({ ...testForm, message: e.target.value })}
            className="flex-1 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Nội dung tin nhắn test"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            value={testForm.image_url || ''}
            onChange={(e) => setTestForm({ ...testForm, image_url: e.target.value || undefined })}
            className="flex-1 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Ảnh (URL) — tuỳ chọn"
          />
        </div>
        <button
          onClick={handleTest}
          disabled={isTesting || !testForm.group_id}
          className={`px-4 py-2 rounded text-white font-medium transition-colors ${
            isTesting || !testForm.group_id ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isTesting ? 'Đang gửi...' : 'Test Gửi Tin Zalo'}
        </button>
      </div>
    </div>
  );
};

export default ZaloConfigTab;
