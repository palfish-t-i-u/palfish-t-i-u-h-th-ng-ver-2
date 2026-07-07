import { useEffect, useState } from "react";
import {
  getZaloGroups,
  createZaloGroup,
  updateZaloGroup,
  deleteZaloGroup,
  type ZaloGroup,
  type ZaloGroupCreate,
} from "../../lib/api/zaloAdmin";
import useIsMobile from "../../hooks/useIsMobile";
import ZaloGroupCards from "./ZaloGroupCards";

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN");
}

const EMPTY_FORM: ZaloGroupCreate = {
  team_code: "",
  group_id: "",
  group_name: "",
  is_active: true,
};

export default function ZaloGroupsTab() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<ZaloGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ZaloGroupCreate>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ group_id: string; group_name: string; is_active: boolean }>({
    group_id: "",
    group_name: "",
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getZaloGroups();
      setRows(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Lỗi tải danh sách");
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.team_code.trim() || !form.group_id.trim() || !form.group_name.trim()) {
      setError("Vui lòng điền đầy đủ các trường");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createZaloGroup(form);
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      flash("Thêm nhóm Zalo thành công");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Lỗi thêm mới");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (row: ZaloGroup) => {
    setEditingKey(row.team_code);
    setEditForm({ group_id: row.group_id, group_name: row.group_name, is_active: row.is_active });
  };

  const cancelEdit = () => setEditingKey(null);

  const saveEdit = async (teamCode: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await updateZaloGroup(teamCode, editForm);
      setEditingKey(null);
      flash("Cập nhật thành công");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Lỗi cập nhật");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (teamCode: string) => {
    if (!confirm(`Xoá mapping cho team "${teamCode}"?`)) return;
    setError(null);
    try {
      await deleteZaloGroup(teamCode);
      flash("Đã xoá");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Lỗi xoá");
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Mapping team → nhóm Zalo GMF. Trigger tự tra bảng này khi gửi thông báo.
        </p>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); }}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          {showForm ? "Huỷ" : "+ Thêm mới"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="p-4 bg-gray-50 border rounded-md space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Team code</label>
              <input
                value={form.team_code}
                onChange={(e) => setForm({ ...form, team_code: e.target.value })}
                placeholder="VD: IH2"
                className="w-full px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Group ID (Zalo)</label>
              <input
                value={form.group_id}
                onChange={(e) => setForm({ ...form, group_id: e.target.value })}
                placeholder="VD: df7d5a31765c9f02c64d"
                className="w-full px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên nhóm</label>
              <input
                value={form.group_name}
                onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                placeholder="VD: IH2 - GMV Notify"
                className="w-full px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Kích hoạt
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? "Đang lưu..." : "Thêm"}
            </button>
          </div>
        </form>
      )}

      {isMobile ? (
        <ZaloGroupCards
          groups={rows}
          loading={loading}
          onEdit={startEdit}
          onDelete={handleDelete}
          formatDate={formatDate}
          canManage={true}
        />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left p-2 font-medium text-gray-600">Team</th>
              <th className="text-left p-2 font-medium text-gray-600">Group ID</th>
              <th className="text-left p-2 font-medium text-gray-600">Tên nhóm</th>
              <th className="text-center p-2 font-medium text-gray-600">Active</th>
              <th className="text-left p-2 font-medium text-gray-600">Cập nhật</th>
              <th className="text-center p-2 font-medium text-gray-600">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-4 text-center text-gray-400">Đang tải...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-gray-400">Chưa có nhóm Zalo nào</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.team_code} className="border-b hover:bg-gray-50">
                <td className="p-2 font-mono text-xs">{row.team_code}</td>
                {editingKey === row.team_code ? (
                  <>
                    <td className="p-2">
                      <input
                        value={editForm.group_id}
                        onChange={(e) => setEditForm({ ...editForm, group_id: e.target.value })}
                        className="w-full px-1.5 py-1 border rounded text-xs font-mono"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={editForm.group_name}
                        onChange={(e) => setEditForm({ ...editForm, group_name: e.target.value })}
                        className="w-full px-1.5 py-1 border rounded text-xs"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                      />
                    </td>
                    <td className="p-2 text-xs text-gray-400">{formatDate(row.updated_at)}</td>
                    <td className="p-2 text-center space-x-1">
                      <button
                        onClick={() => saveEdit(row.team_code)}
                        disabled={submitting}
                        className="px-2 py-0.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Lưu
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-0.5 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        Huỷ
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-2 font-mono text-xs text-gray-500">{row.group_id}</td>
                    <td className="p-2">{row.group_name}</td>
                    <td className="p-2 text-center">
                      {row.is_active ? (
                        <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700">ON</span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-500">OFF</span>
                      )}
                    </td>
                    <td className="p-2 text-xs text-gray-400">{formatDate(row.updated_at)}</td>
                    <td className="p-2 text-center space-x-1">
                      <button
                        onClick={() => startEdit(row)}
                        className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(row.team_code)}
                        className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100"
                      >
                        Xoá
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
