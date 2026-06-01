import { useCallback, useEffect, useMemo, useState } from "react";
import { endpoints } from "../../lib/api";
import type { AuthUserRow } from "../../types/profile";
import { DEPARTMENT_LIST } from "../../types/permissions";
import Modal from "../ui/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (user: AuthUserRow) => void;
  existingEmails: Set<string>;
}

export default function StaffPickerModal({ open, onClose, onSelect, existingEmails }: Props) {
  const [users, setUsers] = useState<AuthUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await endpoints.admin.authUsers();
      setUsers(res.data.users || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setSearch("");
      load();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !existingEmails.has(u.email.toLowerCase()))
      .filter((u) => {
        if (!q) return true;
        return (
          u.email.toLowerCase().includes(q) ||
          (u.fullName || "").toLowerCase().includes(q) ||
          (u.department || "").toLowerCase().includes(q)
        );
      });
  }, [users, search, existingEmails]);

  const selectedUser = selected ? users.find((u) => u.email === selected) : null;

  function deptBadgeClass(dept: string | null): string {
    if (!dept) return "";
    const key = DEPARTMENT_LIST.find(
      (d) => dept.toLowerCase().includes(d.key) || dept.toLowerCase().includes(d.label.toLowerCase())
    )?.key;
    return key ? `pm-dept-badge ${key}` : "pm-dept-badge";
  }

  return (
    <Modal open={open} onClose={onClose} title="Chọn nhân viên để thêm override" wide>
      <div className="pm-picker-filters">
        <input
          type="search"
          placeholder="Tìm email, tên, bộ phận..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {loading ? (
        <p className="text-sm text-gmv-muted py-6 text-center">Đang tải...</p>
      ) : (
        <>
          <div className="pm-picker-count">{filtered.length} nhân viên</div>
          <div className="pm-picker-list">
            {filtered.map((u) => (
              <div
                key={u.email}
                className={`pm-picker-row${selected === u.email ? " selected" : ""}`}
                onClick={() => setSelected(u.email)}
              >
                <div className="pm-picker-radio" />
                <span className="pm-picker-email">{u.email}</span>
                <span className="pm-picker-name">{u.fullName || "—"}</span>
                <span className="pm-picker-dept">
                  {u.department ? (
                    <span className={deptBadgeClass(u.department)}>{u.department}</span>
                  ) : "—"}
                </span>
                <span className="pm-picker-team">{u.team || "—"}</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="pm-override-empty">
                {search ? "Không tìm thấy nhân viên phù hợp." : "Tất cả nhân viên đã có override."}
              </div>
            )}
          </div>
          <div className="pm-picker-foot">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold rounded-gmv-md border border-gmv-border text-gmv-text hover:bg-gmv-bg"
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-white bg-gmv-primary rounded-gmv-md hover:bg-gmv-primary-hover disabled:opacity-50"
              disabled={!selectedUser}
              onClick={() => { if (selectedUser) onSelect(selectedUser); }}
            >
              Thêm override
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
