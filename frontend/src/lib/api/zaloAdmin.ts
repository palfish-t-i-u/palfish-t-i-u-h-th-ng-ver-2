import { api } from '../api';

// ── G4: Zalo Config ──

export interface ZaloConfigData {
  app_id: string;
  expires_at: string | null;
  status: 'good' | 'expiring' | 'expired';
}

export interface ZaloConfigPayload {
  app_id: string;
  app_secret: string;
  access_token: string;
  refresh_token: string;
}

export interface ZaloTestPayload {
  group_id: string;
  message: string;
}

export const getZaloConfig = async (): Promise<ZaloConfigData | null> => {
  const response = await api.get('/api/v1/admin/zalo-config');
  return response.data.data;
};

export const updateZaloConfig = async (payload: ZaloConfigPayload): Promise<void> => {
  await api.post('/api/v1/admin/zalo-config', payload);
};

export const testZaloMessage = async (payload: ZaloTestPayload): Promise<{ ok: boolean; message_id?: string; error?: string }> => {
  const response = await api.post('/api/v1/admin/zalo-config/test', payload);
  return response.data;
};

// ── G5: Zalo Team Groups ──

export interface ZaloGroup {
  team_code: string;
  group_id: string;
  group_name: string;
  is_active: boolean;
  updated_at: string;
}

export interface ZaloGroupCreate {
  team_code: string;
  group_id: string;
  group_name: string;
  is_active: boolean;
}

export interface ZaloGroupPatch {
  group_id?: string;
  group_name?: string;
  is_active?: boolean;
}

export const getZaloGroups = async (): Promise<ZaloGroup[]> => {
  const response = await api.get('/api/v1/admin/zalo-groups');
  return response.data.data;
};

export const createZaloGroup = async (payload: ZaloGroupCreate): Promise<ZaloGroup> => {
  const response = await api.post('/api/v1/admin/zalo-groups', payload);
  return response.data.data;
};

export const updateZaloGroup = async (teamCode: string, payload: ZaloGroupPatch): Promise<ZaloGroup> => {
  const response = await api.patch(`/api/v1/admin/zalo-groups/${teamCode}`, payload);
  return response.data.data;
};

export const deleteZaloGroup = async (teamCode: string): Promise<void> => {
  await api.delete(`/api/v1/admin/zalo-groups/${teamCode}`);
};

// ── G6: Zalo Outbox ──

export interface ZaloOutboxRow {
  id: number;
  source_table: string;
  source_id: string;
  event_type: string;
  group_id: string;
  message: string;
  created_at: string;
  sent_at: string | null;
  retries: number;
  last_error: string | null;
  next_retry_at: string | null;
  zalo_message_id: string | null;
}

export const getZaloOutbox = async (): Promise<ZaloOutboxRow[]> => {
  const response = await api.get('/api/v1/admin/zalo-outbox');
  return response.data.data;
};

export const retryZaloOutbox = async (msgId: number): Promise<void> => {
  await api.post(`/api/v1/admin/zalo-outbox/${msgId}/retry`);
};
