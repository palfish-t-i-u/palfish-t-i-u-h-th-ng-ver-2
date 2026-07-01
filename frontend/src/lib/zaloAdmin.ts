/**
 * Zalo OA Admin API layer.
 *
 * Uses the shared Axios instance from `../../lib/api` which already
 * handles auth token injection and base URL resolution.
 */

import { api } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZaloConfigStatus {
  appId: string;
  expiresAt: string | null;
  status: 'good' | 'expiring' | 'expired' | 'unknown';
}

export interface ZaloConfigPayload {
  appId: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
}

export interface ZaloTeamGroup {
  team_code: string;
  group_id: string;
  group_name: string;
  is_active: boolean;
  updated_at: string;
}

export interface ZaloTeamGroupPayload {
  team_code: string;
  group_id: string;
  group_name: string;
  is_active: boolean;
}

export interface ZaloTeamGroupPatchPayload {
  group_id?: string;
  group_name?: string;
  is_active?: boolean;
}

export interface ZaloOutboxMessage {
  id: number;
  event_type: string;
  group_id: string;
  message: string;
  created_at: string;
  sent_at: string | null;
  retries: number;
  last_error: string | null;
  next_retry_at: string | null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getZaloConfig = () =>
  api.get<ZaloConfigStatus>('/api/v1/admin/zalo-config');

export const updateZaloConfig = (payload: ZaloConfigPayload) =>
  api.post<{ ok: boolean }>('/api/v1/admin/zalo-config', payload);

export const testZaloMessage = () =>
  api.post<{ ok: boolean; detail?: string }>('/api/v1/admin/zalo-config/test');

// ---------------------------------------------------------------------------
// Zalo Team Groups API functions
// ---------------------------------------------------------------------------

export const getZaloGroups = () =>
  api.get<{ data: ZaloTeamGroup[] }>('/api/v1/admin/zalo-groups');

export const createZaloGroup = (payload: ZaloTeamGroupPayload) =>
  api.post<{ data: ZaloTeamGroup }>('/api/v1/admin/zalo-groups', payload);

export const updateZaloGroup = (teamCode: string, payload: ZaloTeamGroupPatchPayload) =>
  api.patch<{ data: ZaloTeamGroup }>(`/api/v1/admin/zalo-groups/${encodeURIComponent(teamCode)}`, payload);

export const deleteZaloGroup = (teamCode: string) =>
  api.delete<{ success: boolean; deleted_team_code: string }>(`/api/v1/admin/zalo-groups/${encodeURIComponent(teamCode)}`);

// ---------------------------------------------------------------------------
// Zalo Outbox Admin API functions
// ---------------------------------------------------------------------------

export const getZaloOutbox = () =>
  api.get<{ data: ZaloOutboxMessage[] }>('/api/v1/admin/zalo-outbox');

export const retryZaloOutboxMessage = (id: number) =>
  api.post<{ ok: boolean }>(`/api/v1/admin/zalo-outbox/${id}/retry`);
