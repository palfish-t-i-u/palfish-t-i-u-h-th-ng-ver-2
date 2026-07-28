// frontend/src/components/admin/DingTalkGroupsTab.tsx
import React, { useEffect, useState } from 'react';
import {
  createDingTalkGroup,
  deleteDingTalkGroup,
  getDingTalkGroups,
  updateDingTalkGroup,
  type DingTalkGroup,
  type DingTalkGroupCreate,
} from '../../lib/api/dingtalkAdmin';
import useIsMobile from '../../hooks/useIsMobile';
import DingTalkGroupCards from './DingTalkGroupCards';
import { HdsdLink } from '../help/HdsdLink';

const EMPTY_FORM: DingTalkGroupCreate = {
  team_code: '',
  open_conversation_id: '',
  group_name: '',
  is_active: true,
};

export const DingTalkGroupsTab: React.FC = () => {
  const isMobile = useIsMobile();
  const [groups, setGroups] = useState<DingTalkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<DingTalkGroupCreate>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const data = await getDingTalkGroups();
      setGroups(data ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAlert({ type: 'error', message: e.response?.data?.detail || e.message || 'Lỗi tải danh sách' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.team_code.trim() || !form.open_conversation_id.trim() || !form.group_name.trim()) {
      setAlert({ type: 'error', message: 'Điền đủ team_code, open_conversation_id, group_name' });
      return;
    }
    try {
      setSubmitting(true);
      setAlert(null);
      await createDingTalkGroup(form);
      setAlert({ type: 'success', message: 'Thêm nhóm thành công' });
      setForm(EMPTY_FORM);
      await fetchGroups();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAlert({ type: 'error', message: e.response?.data?.detail || e.message || 'Lỗi thêm nhóm' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (g: DingTalkGroup) => {
    try {
      await updateDingTalkGroup(g.team_code, { is_active: !g.is_active });
      await fetchGroups();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAlert({ type: 'error', message: e.response?.data?.detail || e.message || 'Lỗi cập nhật' });
    }
  };

  const handleDelete = async (teamCode: string) => {
    if (!window.confirm(`Xóa DingTalk group cho team ${teamCode}?`)) return;
    try {
      await deleteDingTalkGroup(teamCode);
      await fetchGroups();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAlert({ type: 'error', message: e.response?.data?.detail || e.message || 'Lỗi xóa' });
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        DingTalk — Nhóm thông báo
        <HdsdLink moduleSlug="dingtalkGroups" topicSlug="tong-quan" className="shrink-0" />
      </h2>
      {alert && (
        <div className={`p-3 rounded-md border ${alert.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {alert.message}
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg border border-gray-200 space-y-3">
        <h3 className="font-semibold text-gray-800">Thêm nhóm mới</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="px-3 py-2 border rounded-md" placeholder="team_code (vd: SALE_HCM)" value={form.team_code} onChange={(e) => setForm({ ...form, team_code: e.target.value })} />
          <input className="px-3 py-2 border rounded-md" placeholder="Group name (mô tả)" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} />
          <input className="px-3 py-2 border rounded-md md:col-span-2 font-mono text-sm" placeholder="openConversationId (cid...)" value={form.open_conversation_id} onChange={(e) => setForm({ ...form, open_conversation_id: e.target.value })} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Bật ngay
          </label>
        </div>
        <button type="submit" disabled={submitting} className={`px-4 py-2 rounded text-white ${submitting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {submitting ? 'Đang lưu...' : 'Thêm nhóm'}
        </button>
      </form>

      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="font-semibold text-gray-800 mb-3">Danh sách nhóm</h3>
        {isMobile ? (
          <DingTalkGroupCards
            groups={groups}
            loading={loading}
            onToggle={handleToggleActive}
            onDelete={handleDelete}
          />
        ) : loading ? (
          <div className="text-gray-500">Đang tải...</div>
        ) : groups.length === 0 ? (
          <div className="text-gray-500">Chưa có nhóm nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">team_code</th>
                <th className="px-2 py-2 text-left">group_name</th>
                <th className="px-2 py-2 text-left">conversationId</th>
                <th className="px-2 py-2">active</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.team_code} className="border-t">
                  <td className="px-2 py-2 font-mono">{g.team_code}</td>
                  <td className="px-2 py-2">{g.group_name}</td>
                  <td className="px-2 py-2 font-mono text-xs">{g.open_conversation_id}</td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => handleToggleActive(g)} className={`px-2 py-1 rounded text-xs ${g.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {g.is_active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button onClick={() => handleDelete(g.team_code)} className="text-red-600 text-xs hover:underline">Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DingTalkGroupsTab;
