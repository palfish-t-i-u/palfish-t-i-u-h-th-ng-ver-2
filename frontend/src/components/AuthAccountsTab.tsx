import { useCallback, useEffect, useMemo, useState } from "react";
import { useMe } from "../hooks/useMe";
import { endpoints } from "../lib/api";
import type { AuthUserRow } from "../types/profile";
import { Button, Input, Select } from "./ui";
import { TableWrap } from "./ui/Table";
import CreateAccountModal from "./auth/CreateAccountModal";
import AccountDetailDrawer from "./auth/AccountDetailDrawer";
import DeleteAccountsModal from "./auth/DeleteAccountsModal";
import "./auth/auth-accounts.css";

const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "leader", label: "Leader" },
  { value: "admin", label: "Admin" },
];

interface DeptDef {
  key: string;
  label: string;
  match: (u: AuthUserRow) => boolean;
}

const DEPARTMENTS: DeptDef[] = [
  { key: "all", label: "Tất cả", match: () => true },
  {
    key: "sale",
    label: "Bán hàng",
    match: (u) => {
      const d = (u.department || "").toLowerCase();
      return d.includes("sale") || d.includes("bán hàng");
    },
  },
  {
    key: "hr",
    label: "Nhân sự & Quản trị",
    match: (u) => {
      const d = (u.department || "").toLowerCase();
      return d.includes("hr") || d.includes("nhân sự") || d.includes("quản trị") || d.includes("admin");
    },
  },
  {
    key: "marketing",
    label: "Marketing",
    match: (u) => (u.department || "").toLowerCase().includes("marketing"),
  },
  {
    key: "cs",
    label: "CS",
    match: (u) => (u.department || "").toLowerCase().includes("cs"),
  },
];

function deptClass(u: AuthUserRow): string {
  if (DEPARTMENTS[1].match(u)) return "sale";
  if (DEPARTMENTS[2].match(u)) return "hr";
  if (DEPARTMENTS[3].match(u)) return "marketing";
  if (DEPARTMENTS[4].match(u)) return "cs";
  return "";
}

function deptLabel(u: AuthUserRow): string {
  if (DEPARTMENTS[1].match(u)) return "Bán hàng";
  if (DEPARTMENTS[2].match(u)) return "Nhân sự & Quản trị";
  if (DEPARTMENTS[3].match(u)) return "Marketing";
  if (DEPARTMENTS[4].match(u)) return "CS";
  return u.department || "—";
}

function statusOf(u: AuthUserRow): "activated" | "pending" | "banned" {
  if (u.isBanned) return "banned";
  if (u.isActivated) return "activated";
  return "pending";
}

function statusLabel(s: "activated" | "pending" | "banned") {
  if (s === "activated") return "Đã kích hoạt";
  if (s === "banned") return "Đã khoá";
  return "Chờ kích hoạt";
}

function roleLabel(role: string | null) {
  if (!role) return "User";
  const r = role.toLowerCase();
  if (r === "system" || r === "admin" || r === "manager") return "Admin";
  if (r === "leader") return "Leader";
  return "User";
}

function roleClass(role: string | null) {
  const label = roleLabel(role).toLowerCase();
  if (label === "admin") return "admin";
  if (label === "leader") return "leader";
  return "user";
}

// ── KPI Icons (inline SVG) ──
const KpiIcons = {
  users: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  check: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  link: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  shield: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

export default function AuthAccountsTab() {
  const { profile } = useMe();
  const canManage = profile?.canManageStaff ?? false;

  const [authUsers, setAuthUsers] = useState<AuthUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [linkFilter, setLinkFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptTab, setDeptTab] = useState("all");

  // Create account modal
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Delete accounts modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Detail drawer
  const [drawerUser, setDrawerUser] = useState<AuthUserRow | null>(null);

  const loadAuthUsers = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.admin.authUsers();
      setAuthUsers(res.data.users || []);
    } catch {
      setError("Không tải tài khoản Auth (cần quyền System).");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    loadAuthUsers();
  }, [loadAuthUsers]);

  // Keep drawer user in sync with latest data after reload
  useEffect(() => {
    if (drawerUser) {
      const fresh = authUsers.find((u) => u.id === drawerUser.id);
      if (fresh && fresh !== drawerUser) setDrawerUser(fresh);
    }
  }, [authUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ──
  const linkedCrmNames = useMemo(
    () => new Set(authUsers.map((u) => u.crmName).filter(Boolean) as string[]),
    [authUsers]
  );

  const filtered = useMemo(() => {
    let list = authUsers;

    // Department tab
    if (deptTab !== "all") {
      const dept = DEPARTMENTS.find((d) => d.key === deptTab);
      if (dept) list = list.filter(dept.match);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          (u.fullName || "").toLowerCase().includes(q) ||
          (u.crmName || "").toLowerCase().includes(q) ||
          (u.phone || "").includes(q)
      );
    }

    // Role filter
    if (roleFilter) {
      list = list.filter((u) => roleLabel(u.staffRole).toLowerCase() === roleFilter);
    }

    // CRM link filter
    if (linkFilter === "linked") list = list.filter((u) => !!u.crmName);
    if (linkFilter === "unlinked") list = list.filter((u) => !u.crmName);

    // Status filter
    if (statusFilter) {
      list = list.filter((u) => statusOf(u) === statusFilter);
    }

    return list;
  }, [authUsers, deptTab, search, roleFilter, linkFilter, statusFilter]);

  // ── KPI stats ──
  const kpi = useMemo(() => {
    const total = authUsers.length;
    const activated = authUsers.filter((u) => u.isActivated).length;
    const linked = authUsers.filter((u) => !!u.crmName).length;
    const leaderAdmin = authUsers.filter((u) => {
      const r = roleLabel(u.staffRole).toLowerCase();
      return r === "leader" || r === "admin";
    }).length;
    const pending = total - activated;
    return { total, activated, pending, linked, leaderAdmin };
  }, [authUsers]);

  // ── Tab counts ──
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dept of DEPARTMENTS) {
      counts[dept.key] = authUsers.filter(dept.match).length;
    }
    counts.all = authUsers.length;
    return counts;
  }, [authUsers]);

  // Actions are handled inside AccountDetailDrawer now

  if (!canManage) {
    return (
      <div className="rounded-gmv-md border border-gmv-warn/40 bg-gmv-warn-soft p-4 text-sm text-gmv-warn">
        Chỉ cấp System (Hiếu/Kem/Minh) xem tab Tài khoản Auth.
      </div>
    );
  }

  return (
    <div>
      {/* Header with action buttons */}
      <div className="aa-header-bar">
        <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
          🗑 Xóa tài khoản
        </Button>
        <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
          + Thêm tài khoản
        </Button>
      </div>

      {/* Banner */}
      <div className="aa-banner">
        <span>ℹ️</span>
        <span>
          Mỗi tài khoản Auth liên kết với <strong>một nhân sự trong CRM</strong> để xác định phạm vi dữ liệu được truy cập.
          Mỗi nhân sự chỉ có thể liên kết với <strong>một tài khoản duy nhất</strong>.
        </span>
      </div>

      {/* KPI Cards */}
      <div className="aa-kpis">
        <div className="aa-kpi">
          <div className="aa-kpi-icon blue">{KpiIcons.users}</div>
          <div className="aa-kpi-body">
            <div className="aa-kpi-label">Tổng tài khoản</div>
            <div className="aa-kpi-value">{kpi.total}</div>
            <div className="aa-kpi-sub">trong hệ thống</div>
          </div>
        </div>
        <div className="aa-kpi">
          <div className="aa-kpi-icon green">{KpiIcons.check}</div>
          <div className="aa-kpi-body">
            <div className="aa-kpi-label">Đã kích hoạt</div>
            <div className="aa-kpi-value">{kpi.activated}</div>
            <div className="aa-kpi-sub">{kpi.pending} đang chờ</div>
          </div>
        </div>
        <div className="aa-kpi">
          <div className="aa-kpi-icon purple">{KpiIcons.link}</div>
          <div className="aa-kpi-body">
            <div className="aa-kpi-label">Đã liên kết CRM</div>
            <div className="aa-kpi-value">{kpi.linked}</div>
            <div className="aa-kpi-sub">có định danh CRM</div>
          </div>
        </div>
        <div className="aa-kpi">
          <div className="aa-kpi-icon amber">{KpiIcons.shield}</div>
          <div className="aa-kpi-body">
            <div className="aa-kpi-label">Leader + Admin</div>
            <div className="aa-kpi-value">{kpi.leaderAdmin}</div>
            <div className="aa-kpi-sub">quyền mở rộng</div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="aa-filters">
        <div className="aa-search">
          <Input
            type="search"
            placeholder="Tìm tên, SĐT, email, mã..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="aa-filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">Tất cả vai trò</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
        <Select
          className="aa-filter-select"
          value={linkFilter}
          onChange={(e) => setLinkFilter(e.target.value)}
        >
          <option value="">CRM liên kết</option>
          <option value="linked">Đã liên kết</option>
          <option value="unlinked">Chưa liên kết</option>
        </Select>
        <Select
          className="aa-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="activated">Đã kích hoạt</option>
          <option value="pending">Chờ kích hoạt</option>
          <option value="banned">Đã khoá</option>
        </Select>
      </div>

      {/* Department Tabs */}
      <div className="aa-tabs">
        {DEPARTMENTS.map((dept) => (
          <button
            key={dept.key}
            className={`aa-tab${deptTab === dept.key ? " active" : ""}`}
            onClick={() => setDeptTab(dept.key)}
          >
            {dept.label}
            <span className="aa-tab-count">{tabCounts[dept.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="aa-results-count">{filtered.length} kết quả</div>

      {error && <p className="text-sm text-gmv-danger mb-3">{error}</p>}
      {loading && <p className="text-sm text-gmv-muted">Đang tải…</p>}

      {/* Table */}
      {!loading && (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gmv-border bg-gmv-table-head text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Họ tên trên CRM</th>
                <th className="px-4 py-3">SĐT</th>
                <th className="px-4 py-3">Đội</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">CRM liên kết</th>
                <th className="px-4 py-3">Đăng nhập cuối</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const st = statusOf(u);
                return (
                  <tr
                    key={u.id}
                    className="border-b border-gmv-border last:border-0 hover:bg-gmv-row-hover aa-row-clickable"
                    onClick={() => setDrawerUser(u)}
                  >
                    <td className="px-4 py-2 font-medium text-gmv-text-strong">{u.email}</td>
                    <td className="px-4 py-2 text-gmv-text">{u.crmName || u.fullName || "—"}</td>
                    <td className="px-4 py-2 text-gmv-text">{u.phone || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`aa-dept-badge ${deptClass(u)}`}>{deptLabel(u)}</span>
                    </td>
                    <td className="px-4 py-2 text-gmv-text">{u.team || "—"}</td>
                    <td className="px-4 py-2">
                      {u.crmName ? (
                        <span className="aa-crm-link linked">
                          <span className="aa-status-dot" style={{ background: "var(--gmv-ok)" }} />
                          Đã liên kết
                        </span>
                      ) : (
                        <span className="aa-crm-link unlinked">
                          <span className="aa-status-dot" style={{ background: "var(--gmv-border)" }} />
                          Chưa liên kết
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gmv-text">
                      {u.lastSignIn
                        ? new Date(u.lastSignIn).toLocaleString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`aa-role-badge ${roleClass(u.staffRole)}`}>
                        <span className="aa-role-dot" />
                        {roleLabel(u.staffRole)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`aa-status ${st}`}>
                        <span className="aa-status-dot" />
                        {statusLabel(st)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-sm text-gmv-muted">Không có tài khoản phù hợp.</p>
          )}
        </TableWrap>
      )}

      {/* Create Account Modal */}
      <CreateAccountModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={loadAuthUsers}
      />

      {/* Delete Accounts Modal */}
      <DeleteAccountsModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onDeleted={loadAuthUsers}
        users={authUsers}
      />

      {/* Account Detail Drawer */}
      <AccountDetailDrawer
        user={drawerUser}
        onClose={() => setDrawerUser(null)}
        onUpdated={async () => {
          await loadAuthUsers();
          // drawer will re-render with fresh user via useEffect below
        }}
        linkedCrmNames={linkedCrmNames}
      />
    </div>
  );
}
