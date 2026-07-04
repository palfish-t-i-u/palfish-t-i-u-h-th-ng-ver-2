// frontend/src/lib/api/dingtalkAdmin.ts
import { api } from '../api';

export interface DingTalkGroup {
  team_code: string;
  webhook_url: string;
  group_name: string;
  is_active: boolean;
  updated_at: string;
}

export interface DingTalkGroupCreate {
  team_code: string;
  webhook_url: string;
  secret: string;
  group_name: string;
  is_active: boolean;
}

export interface DingTalkGroupPatch {
  webhook_url?: string;
  secret?: string;
  group_name?: string;
  is_active?: boolean;
}

export interface DingTalkOutboxRow {
  id: number;
  source_table: string;
  source_id: string;
  event_type: string;
  team_code: string;
  message: string;
  created_at: string;
  sent_at: string | null;
  retries: number;
  last_error: string | null;
  next_retry_at: string | null;
  dingtalk_message_id: string | null;
}

export interface DingTalkTestPayload {
  team_code: string;
  message: string;
}

export const getDingTalkGroups = async (): Promise<DingTalkGroup[]> => {
  const response = await api.get('/api/v1/admin/dingtalk-groups');
  return response.data.data;
};

export const createDingTalkGroup = async (payload: DingTalkGroupCreate): Promise<DingTalkGroup> => {
  const response = await api.post('/api/v1/admin/dingtalk-groups', payload);
  return response.data.data;
};

export const updateDingTalkGroup = async (
  teamCode: string,
  payload: DingTalkGroupPatch,
): Promise<DingTalkGroup> => {
  const response = await api.patch(`/api/v1/admin/dingtalk-groups/${teamCode}`, payload);
  return response.data.data;
};

export const deleteDingTalkGroup = async (teamCode: string): Promise<void> => {
  await api.delete(`/api/v1/admin/dingtalk-groups/${teamCode}`);
};

export const getDingTalkOutbox = async (): Promise<DingTalkOutboxRow[]> => {
  const response = await api.get('/api/v1/admin/dingtalk-outbox');
  return response.data.data;
};

export const retryDingTalkOutbox = async (msgId: number): Promise<void> => {
  await api.post(`/api/v1/admin/dingtalk-outbox/${msgId}/retry`);
};

export const testDingTalkMessage = async (
  payload: DingTalkTestPayload,
): Promise<{ ok: boolean; message_id?: string; error?: string }> => {
  const response = await api.post('/api/v1/admin/dingtalk-test', payload);
  return response.data;
};
