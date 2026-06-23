import api from '../api';

export interface ZaloConfigStatus {
  appId: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  status: 'good' | 'expiring' | 'expired' | 'unknown';
}

export interface ZaloConfigPayload {
  appId: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
}

export const getZaloConfig = async (): Promise<ZaloConfigStatus> => {
  const response = await api.get('/api/v1/admin/zalo-config');
  return response.data;
};

export const updateZaloConfig = async (payload: ZaloConfigPayload): Promise<void> => {
  await api.post('/api/v1/admin/zalo-config', payload);
};

export const testZaloMessage = async (): Promise<any> => {
  const response = await api.post('/api/v1/admin/zalo-config/test');
  return response.data;
};
