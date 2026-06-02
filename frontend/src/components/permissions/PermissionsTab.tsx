import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MODULE_LIST,
  MODULE_SECTIONS,
  DEPARTMENT_LIST,
  DEFAULT_PERMISSIONS,
  ACCESS_LABELS,
  cycleAccessLevel,
  type AccessLevel,
} from "../../types/permissions";
import type { AuthUserRow } from "../../types/profile";
import { useMe } from "../../hooks/useMe";
import { endpoints } from "../../lib/api";
import { TableWrap } from "../ui/Table";
import StaffPickerModal from "./StaffPickerModal";
import OverrideDrawer from "./OverrideDrawer";
import "./permissions.css";

type TabId = "byGroup" | "override";

/** Icons for access badges */
function AccessIcon({ level }: { level: AccessLevel }) {
  if (level === "full") return <span className="pm-access-icon">✓</span>;
  if (level === "read") return <span className="pm-access-icon">👁</span>;
  return <span className="pm-access-icon">✕</span>;
}

export default function PermissionsTab() {
  const { profile } = useMe();
  const canManage = profile?.canManageStaff ?? false;

  const [tab, setTab] = useState<TabId>("byGroup");
  const [matrix, setMatrix] = useState<Record<string, Record<string, AccessLevel>>>(
    () => structuredClone(DEFAULT_PERMISSIONS)
  );
  const [, setLoaded] = useState(false);
  const [overrideCount, setOverrideCount] = useState(0);

  const loadMatrix = useCallback(async () => {
    try {
      const res = await endpoints.admin.permissions();
      const remote = res.data.matrix as Record<string, Record<string, AccessLevel>>;
      const isEmpty = !remote || Object.values(remote).every(
        (mods) => Object.values(mods).every((l) => l === "none")
      );
      if (isEmpty) {
        await endpoints.admin.seedPermissions();
        const seeded = await endpoints.admin.permissions();
        setMatrix(seeded.data.matrix as Record<string, Record<string, AccessLevel>>);
      } else {
        setMatrix(remote);
      }
    } catch {
      // API lỗi → dùng DEFAULT_PERMISSIONS
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  useEffect(() => {
    endpoints.admin.permissionOverrides()
      .then((res) => setOverrideCount((res.data.overrides || []).length))
      .catch(() => {});
  }, []);

  async function handleCycle(dept: string, moduleKey: string) {
    if (!canManage) return;
    const current = matrix[dept]?.[moduleKey] ?? "none";
    const next = cycleAccessLevel(current);
    setMatrix((prev) => {
      const updated = structuredClone(prev);
      updated[dept] = { ...updated[dept], [moduleKey]: next };
      return updated;
    });
    try {
      await endpoints.admin.patchPermission({
        department: dept,
        module_key: moduleKey,
        access_level: next,
      });
    } catch {
      setMatrix((prev) => {
        const reverted = structuredClone(prev);
        reverted[dept] = { ...reverted[dept], [moduleKey]: current };
        return reverted;
      });
    }
  }

  // ── KPI stats ──
  const kpi = useMemo(() => {
    const totalModules = MODULE_LIST.length;
    let fullCount = 0;
    let noneCount = 0;
    for (const dept of DEPARTMENT_LIST) {
      for (const mod of MODULE_LIST) {
        const level = matrix[dept.key]?.[mod.key] ?? "none";
        if (level === "full") fullCount++;
        if (level === "none") noneCount++;
      }
    }
    return { totalModules, fullCount, noneCount };
  }, [matrix]);

  // ── Group modules by section ──
  const modulesBySection = useMemo(() => {
    const map: Record<string, typeof MODULE_LIST> = {};
    for (const section of MODULE_SECTIONS) {
      map[section] = MODULE_LIST.filter((m) => m.section === section);
    }
    return map;
  }, []);

  if (!canManage) {
    return (
      <div className="rounded-gmv-md border border-gmv-warn/40 bg-gmv-warn-soft p-4 text-sm text-gmv-warn">
        Chỉ Admin có quyền xem và quản lý phân quyền.
      </div>
    );
  }

  return (
    <div>
      {/* Banner */}
      <div className="pm-banner">
        <span>ℹ️</span>
        <span>
          Hai lớp quyền hoạt động độc lập: Phân quyền module xác định <strong>ai được vào module nào</strong>.
          Vai trò (User/Leader/Admin) trong Tài khoản Auth xác định <strong>ai xem được dữ liệu của ai</strong> trong từng module đó.
        </span>
      </div>

      {/* KPI Cards */}
      <div className="pm-kpis">
        <div className="pm-kpi">
          <div className="pm-kpi-icon blue">📦</div>
          <div className="pm-kpi-body">
            <div className="pm-kpi-label">Tổng module</div>
            <div className="pm-kpi-value">{kpi.totalModules}</div>
            <div className="pm-kpi-sub">trong hệ thống</div>
          </div>
        </div>
        <div className="pm-kpi">
          <div className="pm-kpi-icon green">✅</div>
          <div className="pm-kpi-body">
            <div className="pm-kpi-label">Toàn quyền (tổng)</div>
            <div className="pm-kpi-value">{kpi.fullCount}</div>
            <div className="pm-kpi-sub">trên tất cả nhóm</div>
          </div>
        </div>
        <div className="pm-kpi">
          <div className="pm-kpi-icon gray">🚫</div>
          <div className="pm-kpi-body">
            <div className="pm-kpi-label">Không có quyền</div>
            <div className="pm-kpi-value">{kpi.noneCount}</div>
            <div className="pm-kpi-sub">bị ẩn khỏi nhóm</div>
          </div>
        </div>
        <div className="pm-kpi">
          <div className="pm-kpi-icon amber">👤</div>
          <div className="pm-kpi-body">
            <div className="pm-kpi-label">Override cá nhân</div>
            <div className="pm-kpi-value">{overrideCount}</div>
            <div className="pm-kpi-sub">quyền được chỉnh riêng</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="pm-legend">
        <span className="pm-legend-label">Chú giải:</span>
        <span className="pm-legend-item">
          <span className="pm-access-badge full" style={{ cursor: "default" }}>
            <AccessIcon level="full" /> {ACCESS_LABELS.full}
          </span>
        </span>
        <span className="pm-legend-item">
          <span className="pm-access-badge read" style={{ cursor: "default" }}>
            <AccessIcon level="read" /> {ACCESS_LABELS.read}
          </span>
        </span>
        <span className="pm-legend-item">
          <span className="pm-access-badge none" style={{ cursor: "default" }}>
            <AccessIcon level="none" /> {ACCESS_LABELS.none}
          </span>
        </span>
        <span className="pm-legend-hint">— Click ô để xoay vòng quyền</span>
      </div>

      {/* Tabs */}
      <div className="pm-tabs">
        <button
          className={`pm-tab${tab === "byGroup" ? " active" : ""}`}
          onClick={() => setTab("byGroup")}
        >
          Theo nhóm
          <span className="pm-tab-count">{DEPARTMENT_LIST.length}</span>
        </button>
        <button
          className={`pm-tab${tab === "override" ? " active" : ""}`}
          onClick={() => setTab("override")}
        >
          Override cá nhân
          <span className="pm-tab-count">{overrideCount}</span>
        </button>
      </div>

      {/* Tab content */}
      {tab === "byGroup" && (
        <TableWrap>
          <table className="pm-matrix">
            <thead>
              <tr>
                <th>Module</th>
                {DEPARTMENT_LIST.map((dept) => (
                  <th key={dept.key} className={`dept-${dept.key}`}>
                    {dept.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULE_SECTIONS.map((section) => (
                <>
                  <tr key={`section-${section}`} className="pm-section-row">
                    <td colSpan={DEPARTMENT_LIST.length + 1}>{section}</td>
                  </tr>
                  {modulesBySection[section].map((mod) => (
                    <tr key={mod.key} className="pm-module-row">
                      <td>
                        <div className="pm-module-name">{mod.label}</div>
                        <div className="pm-module-desc">{mod.description}</div>
                      </td>
                      {DEPARTMENT_LIST.map((dept) => {
                        const level = matrix[dept.key]?.[mod.key] ?? "none";
                        return (
                          <td key={dept.key}>
                            <span
                              className={`pm-access-badge ${level}`}
                              onClick={() => handleCycle(dept.key, mod.key)}
                              title={`Click để đổi quyền (hiện tại: ${ACCESS_LABELS[level]})`}
                            >
                              <AccessIcon level={level} />
                              {ACCESS_LABELS[level]}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {tab === "override" && (
        <OverrideTab matrix={matrix} onCountChange={setOverrideCount} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Override Tab — sub-component (staff-grouped)
   ═══════════════════════════════════════ */

interface OverrideRow { email: string; moduleKey: string; accessLevel: AccessLevel }

interface StaffOverrideSummary {
  user: AuthUserRow;
  overrides: Record<string, AccessLevel>;
  count: number;
}

function OverrideTab({
  matrix,
  onCountChange,
}: {
  matrix: Record<string, Record<string, AccessLevel>>;
  onCountChange: (n: number) => void;
}) {
  const [allOverrides, setAllOverrides] = useState<OverrideRow[]>([]);
  const [authUsers, setAuthUsers] = useState<AuthUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<AuthUserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, usersRes] = await Promise.all([
        endpoints.admin.permissionOverrides(),
        endpoints.admin.authUsers(),
      ]);
      const ov = ovRes.data.overrides || [];
      setAllOverrides(ov);
      setAuthUsers(usersRes.data.users || []);
      onCountChange(ov.length);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const staffList = useMemo<StaffOverrideSummary[]>(() => {
    const byEmail = new Map<string, Record<string, AccessLevel>>();
    for (const o of allOverrides) {
      const key = o.email.toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, {});
      byEmail.get(key)![o.moduleKey] = o.accessLevel;
    }

    const result: StaffOverrideSummary[] = [];
    for (const [email, overrides] of byEmail) {
      const user = authUsers.find((u) => u.email.toLowerCase() === email);
      const stub: AuthUserRow = user ?? {
        id: email,
        email,
        providers: [],
        lastSignIn: null,
        createdAt: null,
        bannedUntil: null,
        crmName: null,
        staffRole: null,
        isBanned: false,
        isActivated: false,
        department: null,
        team: null,
        subTeam: null,
        fullName: null,
        phone: null,
      };
      result.push({ user: stub, overrides, count: Object.keys(overrides).length });
    }
    return result;
  }, [allOverrides, authUsers]);

  const existingEmails = useMemo(
    () => new Set(staffList.map((s) => s.user.email.toLowerCase())),
    [staffList]
  );

  function openDrawerForUser(user: AuthUserRow) {
    setDrawerUser(user);
    setPickerOpen(false);
  }

  function deptBadgeClass(dept: string | null): string {
    if (!dept) return "";
    const key = DEPARTMENT_LIST.find(
      (d) => dept.toLowerCase().includes(d.key) || dept.toLowerCase().includes(d.label.toLowerCase())
    )?.key;
    return key ? `pm-dept-badge ${key}` : "pm-dept-badge";
  }

  const drawerOverrides = useMemo(() => {
    if (!drawerUser) return {};
    const email = drawerUser.email.toLowerCase();
    const map: Record<string, AccessLevel> = {};
    for (const o of allOverrides) {
      if (o.email.toLowerCase() === email) map[o.moduleKey] = o.accessLevel;
    }
    return map;
  }, [drawerUser, allOverrides]);

  return (
    <div>
      <div className="pm-override-header">
        <div>
          <h3>Override cá nhân</h3>
          <p>Ghi đè quyền nhóm cho từng người cụ thể</p>
        </div>
        <button
          type="button"
          className="px-4 py-2 text-sm font-semibold text-white bg-gmv-primary rounded-gmv-md hover:bg-gmv-primary-hover"
          onClick={() => setPickerOpen(true)}
        >
          + Thêm override
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gmv-muted py-6 text-center">Đang tải...</p>
      ) : staffList.length === 0 ? (
        <div className="pm-override-empty">
          <p>Chưa có override nào. Bấm &quot;Thêm override&quot; để cấp quyền đặc biệt cho cá nhân vượt quyền bộ phận.</p>
        </div>
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gmv-border bg-gmv-table-head text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">
                <th className="px-4 py-3">Nhân viên</th>
                <th className="px-4 py-3">Nhóm</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Override đang có</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {staffList.map((s) => (
                <tr key={s.user.email} className="border-b border-gmv-border last:border-0 hover:bg-gmv-row-hover">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gmv-text-strong">{s.user.fullName || s.user.email}</div>
                    {s.user.fullName && (
                      <div className="text-xs text-gmv-muted mt-0.5">{s.user.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.user.department ? (
                      <span className={deptBadgeClass(s.user.department)}>{s.user.department}</span>
                    ) : (
                      <span className="text-gmv-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">{s.user.staffRole || "User"}</td>
                  <td className="px-4 py-3">
                    {s.count > 0 ? (
                      <span className="pm-module-count-badge">{s.count} module</span>
                    ) : (
                      <span className="text-gmv-muted">Dùng quyền nhóm</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-semibold rounded-gmv-md border border-gmv-border text-gmv-text hover:bg-gmv-bg"
                      onClick={() => openDrawerForUser(s.user)}
                    >
                      Chỉnh sửa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {/* Staff picker modal */}
      <StaffPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={openDrawerForUser}
        existingEmails={existingEmails}
      />

      {/* Override drawer */}
      {drawerUser && (
        <OverrideDrawer
          user={drawerUser}
          matrix={matrix}
          existingOverrides={drawerOverrides}
          onClose={() => setDrawerUser(null)}
          onSaved={() => {
            setDrawerUser(null);
            load();
          }}
        />
      )}
    </div>
  );
}
