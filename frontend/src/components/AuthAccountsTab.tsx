import { useCallback, useEffect, useState } from "react";
import { useMe } from "../hooks/useMe";
import { endpoints } from "../lib/api";
import type { AuthUserRow } from "../types/profile";
import { Button } from "./ui";
import Badge from "./ui/Badge";
import { TableWrap } from "./ui/Table";

export default function AuthAccountsTab() {
  const { profile } = useMe();
  const canManage = profile?.canManageStaff ?? false;
  const [authUsers, setAuthUsers] = useState<AuthUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAuthUsers = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.admin.authUsers();
      setAuthUsers(res.data.users || []);
    } catch (e: unknown) {
      setError("Không tải tài khoản Auth (cần quyền System).");
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    loadAuthUsers();
  }, [loadAuthUsers]);

  async function toggleBan(user: AuthUserRow) {
    try {
      await endpoints.admin.patchAuthUser(user.id, { banned: !user.isBanned });
      await loadAuthUsers();
    } catch {
      setError("Không cập nhật trạng thái tài khoản.");
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-gmv-md border border-gmv-warn/40 bg-gmv-warn-soft p-4 text-sm text-gmv-warn">
        Chỉ cấp System (Hiếu/Kem/Minh) xem tab Tài khoản Auth.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-gmv-md border border-gmv-warn/30 bg-gmv-warn-soft/60 p-4">
        <p className="text-sm font-medium text-gmv-warn">
          Tài khoản Supabase Auth — email đã đăng ký vào app. Khoá khi nghỉ việc / lộ mật khẩu.
        </p>
      </div>

      {error && <p className="text-sm text-gmv-danger">{error}</p>}
      {loading && <p className="text-sm text-gmv-muted">Đang tải…</p>}

      {!loading && (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gmv-border bg-gmv-table-head text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Last sign-in</th>
                <th className="px-4 py-3">CRM link</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {authUsers.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-gmv-border last:border-0 hover:bg-gmv-row-hover"
                >
                  <td className="px-4 py-2 font-medium text-gmv-text-strong">{u.email}</td>
                  <td className="px-4 py-2 text-gmv-text">{(u.providers || []).join(", ") || "email"}</td>
                  <td className="px-4 py-2 text-gmv-text">
                    {u.lastSignIn ? new Date(u.lastSignIn).toLocaleString("vi-VN") : "—"}
                  </td>
                  <td className="px-4 py-2 text-gmv-text">{u.crmName || "—"}</td>
                  <td className="px-4 py-2">
                    {u.isBanned ? (
                      <Badge tone="danger" className="normal-case">
                        Đã khoá
                      </Badge>
                    ) : (
                      <Badge tone="ok" className="normal-case">
                        Hoạt động
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={u.isBanned ? "secondary" : "danger"}
                      onClick={() => toggleBan(u)}
                    >
                      {u.isBanned ? "Mở khoá" : "Khoá"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {authUsers.length === 0 && (
            <p className="px-4 py-6 text-sm text-gmv-muted">Chưa có user Auth.</p>
          )}
        </TableWrap>
      )}
    </div>
  );
}
