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
import { useMe } from "../../hooks/useMe";
import { endpoints } from "../../lib/api";
import { TableWrap } from "../ui/Table";
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
      if (remote && Object.keys(remote).length > 0) {
        setMatrix(remote);
      }
    } catch {
      // API chưa có data → dùng DEFAULT_PERMISSIONS
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
        <OverrideTab />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Override Tab — sub-component
   ═══════════════════════════════════════ */

interface OverrideRow { email: string; moduleKey: string; accessLevel: AccessLevel }

function OverrideTab() {
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add form
  const [newEmail, setNewEmail] = useState("");
  const [newModule, setNewModule] = useState("");
  const [newLevel, setNewLevel] = useState<AccessLevel>("full");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await endpoints.admin.permissionOverrides();
      setOverrides(res.data.overrides || []);
    } catch {
      setError("Không tải được danh sách override.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail || !newModule) return;
    setAdding(true);
    setError("");
    try {
      await endpoints.admin.createPermissionOverride({
        email: newEmail.trim(),
        module_key: newModule,
        access_level: newLevel,
      });
      setNewEmail("");
      setNewModule("");
      setNewLevel("full");
      await load();
    } catch {
      setError("Không thêm được override.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(email: string, moduleKey: string) {
    try {
      await endpoints.admin.deletePermissionOverride(email, moduleKey);
      await load();
    } catch {
      setError("Không xoá được override.");
    }
  }

  const moduleLabel = (key: string) =>
    MODULE_LIST.find((m) => m.key === key)?.label ?? key;

  return (
    <div>
      {/* Add form */}
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gmv-muted">Email</label>
          <input
            type="email"
            className="gmv-field px-2.5 py-2 border border-gmv-border rounded-gmv-md text-sm bg-gmv-canvas min-w-[220px]"
            placeholder="user@company.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gmv-muted">Module</label>
          <select
            className="gmv-field px-2.5 py-2 border border-gmv-border rounded-gmv-md text-sm bg-gmv-canvas min-w-[180px]"
            value={newModule}
            onChange={(e) => setNewModule(e.target.value)}
            required
          >
            <option value="">— Chọn module —</option>
            {MODULE_LIST.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gmv-muted">Quyền</label>
          <select
            className="gmv-field px-2.5 py-2 border border-gmv-border rounded-gmv-md text-sm bg-gmv-canvas"
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value as AccessLevel)}
          >
            <option value="full">{ACCESS_LABELS.full}</option>
            <option value="read">{ACCESS_LABELS.read}</option>
            <option value="none">{ACCESS_LABELS.none}</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={adding}
          className="px-4 py-2 text-sm font-semibold text-white bg-gmv-primary rounded-gmv-md hover:bg-gmv-primary-hover disabled:opacity-50"
        >
          {adding ? "Đang thêm..." : "+ Thêm override"}
        </button>
      </form>

      {error && <p className="text-sm text-gmv-danger mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gmv-muted py-6 text-center">Đang tải...</p>
      ) : overrides.length === 0 ? (
        <div className="pm-override-empty">
          <p>Chưa có override nào. Thêm override để cấp quyền đặc biệt cho cá nhân vượt quyền bộ phận.</p>
        </div>
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gmv-border bg-gmv-table-head text-left text-xs font-semibold uppercase tracking-wide text-gmv-muted">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Quyền</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={`${o.email}-${o.moduleKey}`} className="border-b border-gmv-border last:border-0 hover:bg-gmv-row-hover">
                  <td className="px-4 py-2 font-medium text-gmv-text-strong">{o.email}</td>
                  <td className="px-4 py-2 text-gmv-text">{moduleLabel(o.moduleKey)}</td>
                  <td className="px-4 py-2">
                    <span className={`pm-access-badge ${o.accessLevel}`} style={{ cursor: "default" }}>
                      <AccessIcon level={o.accessLevel} />
                      {ACCESS_LABELS[o.accessLevel]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDelete(o.email, o.moduleKey)}
                      className="text-xs text-gmv-danger hover:underline"
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
