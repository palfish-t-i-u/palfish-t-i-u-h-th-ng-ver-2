import React, { useState, useEffect } from 'react';
import { getZaloConfig, updateZaloConfig, testZaloMessage, ZaloConfigStatus, ZaloConfigPayload } from '../../lib/api/zaloAdmin';

export const ZaloConfigTab: React.FC = () => {
  const [statusData, setStatusData] = useState<ZaloConfigStatus | null>(null);
  const [config, setConfig] = useState<ZaloConfigPayload>({
    appId: '',
    appSecret: '',
    accessToken: '',
    refreshToken: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  const [showSecrets, setShowSecrets] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      setAlert(null);
      const data = await getZaloConfig();
      setStatusData(data);
      setConfig({
        appId: data.appId || '',
        appSecret: data.appSecret || '',
        accessToken: data.accessToken || '',
        refreshToken: data.refreshToken || '',
      });
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
    try {
      setIsSubmitting(true);
      setAlert(null);
      await updateZaloConfig(config);
      setAlert({ type: 'success', message: 'Lưu cấu hình Zalo thành công!' });
      // Reload the status
      await fetchConfig();
    } catch (err: any) {
      setAlert({
        type: 'error',
        message: err.response?.data?.detail || err.response?.data?.message || err.message || 'Lỗi khi lưu cấu hình',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTest = async () => {
    try {
      setIsTesting(true);
      setAlert(null);
      const result = await testZaloMessage();
      setAlert({ type: 'success', message: `Test thành công! Result: ${JSON.stringify(result)}` });
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Lỗi khi test tin nhắn';
      setAlert({
        type: 'error',
        message: `Lỗi Test Zalo: ${errorMsg}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const inputType = showSecrets ? 'text' : 'password';

  if (isLoading) {
    return <div className="p-4 text-gray-500">Đang tải cấu hình...</div>;
  }

  // Determine styles for status
  let statusColor = 'bg-gray-50 border-gray-200 text-gray-700';
  let statusText = 'Không xác định';

  if (statusData?.status === 'good') {
    statusColor = 'bg-green-50 border-green-200 text-green-700';
    statusText = 'Đang hoạt động tốt';
  } else if (statusData?.status === 'expiring') {
    statusColor = 'bg-yellow-50 border-yellow-200 text-yellow-700';
    statusText = 'Sắp hết hạn (Cần refresh)';
  } else if (statusData?.status === 'expired') {
    statusColor = 'bg-red-50 border-red-200 text-red-700';
    statusText = 'Đã hết hạn hoặc Lỗi';
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <h2 className="text-2xl font-bold text-gray-800">Cấu Hình Zalo OA</h2>

      {/* Alert Section */}
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
        <h3 className="font-semibold text-lg mb-2">Trạng thái Token</h3>
        <p><strong>Status:</strong> {statusText}</p>
        <p><strong>Ngày hết hạn (Expires At):</strong> {statusData?.expiresAt ? new Date(statusData.expiresAt).toLocaleString('vi-VN') : 'N/A'}</p>
      </div>

      {/* Form Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Thông tin API</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* App ID */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">App ID</label>
              <input
                type="text"
                name="appId"
                value={config.appId}
                onChange={handleChange}
                className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Nhập Zalo App ID"
              />
            </div>

            {/* App Secret */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">App Secret</label>
              <div className="relative">
                <input
                  type={inputType}
                  name="appSecret"
                  value={config.appSecret}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Nhập App Secret"
                />
              </div>
            </div>

            {/* Access Token */}
            <div className="flex flex-col md:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1">Access Token</label>
              <input
                type={inputType}
                name="accessToken"
                value={config.accessToken}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                placeholder="Nhập Access Token"
              />
            </div>

            {/* Refresh Token */}
            <div className="flex flex-col md:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1">Refresh Token</label>
              <input
                type={inputType}
                name="refreshToken"
                value={config.refreshToken}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                placeholder="Nhập Refresh Token"
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
        <h3 className="text-lg font-semibold mb-2 text-gray-800">Kiểm tra kết nối</h3>
        <p className="text-sm text-gray-600 mb-4">
          Gửi thử một tin nhắn tới Zalo OA để kiểm tra token có hoạt động hay không.
        </p>
        <button
          onClick={handleTest}
          disabled={isTesting}
          className={`px-4 py-2 rounded text-white font-medium transition-colors ${
            isTesting ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isTesting ? 'Đang gửi...' : 'Test Gửi Tin Zalo'}
        </button>
      </div>

    </div>
  );
};

export default ZaloConfigTab;
