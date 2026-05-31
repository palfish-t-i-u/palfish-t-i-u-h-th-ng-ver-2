import { useMemo, useState } from "react";
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

  // Local state — will be replaced by API when BE is ready
  const [matrix, setMatrix] = useState<Record<string, Record<string, AccessLevel>>>(
    () => structuredClone(DEFAULT_PERMISSIONS)
  );

  function handleCycle(dept: string, moduleKey: string) {
    if (!canManage) return;
    setMatrix((prev) => {
      const next = structuredClone(prev);
      const current = next[dept]?.[moduleKey] ?? "none";
      next[dept] = { ...next[dept], [moduleKey]: cycleAccessLevel(current) };
      return next;
    });
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
    return { totalModules, fullCount, noneCount, overrideCount: 0 };
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
            <div className="pm-kpi-value">{kpi.overrideCount}</div>
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
          <span className="pm-tab-count">{kpi.overrideCount}</span>
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
        <div className="pm-override-empty">
          <p style={{ fontSize: 16, marginBottom: 8 }}>🚧</p>
          <p>Tính năng Override cá nhân sẽ được phát triển sau khi BE hoàn thành bảng <code>permission_overrides</code>.</p>
          <p style={{ marginTop: 8, fontSize: 12 }}>Hiện tại, các quyền đặc biệt vẫn được quản lý thông qua vai trò trong Tài khoản Auth.</p>
        </div>
      )}
    </div>
  );
}
