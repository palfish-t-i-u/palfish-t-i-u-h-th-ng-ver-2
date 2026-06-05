import { useEffect, useMemo, useState } from "react";
import {
  MODULE_LIST,
  MODULE_SECTIONS,
  DEPARTMENT_LIST,
  DEFAULT_PERMISSIONS,
  ACCESS_LABELS,
  cycleAccessLevel,
  type AccessLevel,
  type MinRole,
  MIN_ROLE_LABELS,
} from "../../types/permissions";
import type { AuthUserRow } from "../../types/profile";
import { endpoints } from "../../lib/api";

function AccessIcon({ level }: { level: AccessLevel }) {
  if (level === "full") return <span className="pm-access-icon">✓</span>;
  if (level === "read") return <span className="pm-access-icon">👁</span>;
  return <span className="pm-access-icon">✕</span>;
}

const ROLE_RANK: Record<string, number> = { sale: 1, leader: 2, manager: 3, system: 4 };
function roleRank(role: string): number {
  return ROLE_RANK[role.toLowerCase()] ?? 1;
}

interface Props {
  user: AuthUserRow;
  /** Current matrix from the "Theo nhóm" tab */
  matrix: Record<string, Record<string, AccessLevel>>;
  /** Min role requirements per dept×module */
  minRoles: Record<string, Record<string, MinRole>>;
  /** Existing overrides for this user (from API) */
  existingOverrides: Record<string, AccessLevel>;
  onClose: () => void;
  onSaved: () => void;
}

export default function OverrideDrawer({ user, matrix, minRoles, existingOverrides, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Record<string, AccessLevel>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const deptKey = useMemo(() => {
    const d = (user.department || "").toLowerCase();
    return DEPARTMENT_LIST.find(
      (dept) => d.includes(dept.key) || d.includes(dept.label.toLowerCase())
    )?.key ?? null;
  }, [user.department]);

  const userRank = roleRank(user.staffRole || "sale");

  const deptDefaults = useMemo(() => {
    const defaults: Record<string, AccessLevel> = {};
    for (const mod of MODULE_LIST) {
      let level: AccessLevel = deptKey
        ? (matrix[deptKey]?.[mod.key] ?? DEFAULT_PERMISSIONS[deptKey]?.[mod.key] ?? "none")
        : "none";
      if (level !== "none" && deptKey) {
        const mr = minRoles[deptKey]?.[mod.key] ?? "sale";
        if (userRank < roleRank(mr)) level = "none";
      }
      defaults[mod.key] = level;
    }
    return defaults;
  }, [deptKey, matrix, minRoles, userRank]);

  useEffect(() => {
    const initial: Record<string, AccessLevel> = {};
    for (const mod of MODULE_LIST) {
      initial[mod.key] = existingOverrides[mod.key] ?? deptDefaults[mod.key];
    }
    setDraft(initial);
  }, [existingOverrides, deptDefaults]);

  const modulesBySection = useMemo(() => {
    const map: Record<string, typeof MODULE_LIST> = {};
    for (const section of MODULE_SECTIONS) {
      map[section] = MODULE_LIST.filter((m) => m.section === section);
    }
    return map;
  }, []);

  const overrideCount = useMemo(
    () => MODULE_LIST.filter((m) => draft[m.key] !== deptDefaults[m.key]).length,
    [draft, deptDefaults]
  );

  function handleCycle(moduleKey: string) {
    setDraft((prev) => ({
      ...prev,
      [moduleKey]: cycleAccessLevel(prev[moduleKey] ?? "none"),
    }));
  }

  function handleReset(moduleKey: string) {
    setDraft((prev) => ({
      ...prev,
      [moduleKey]: deptDefaults[moduleKey],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const overrides: Record<string, string> = {};
      for (const mod of MODULE_LIST) {
        const draftLevel = draft[mod.key];
        const defaultLevel = deptDefaults[mod.key];
        const hadOverride = mod.key in existingOverrides;

        if (draftLevel !== defaultLevel) {
          overrides[mod.key] = draftLevel;
        } else if (hadOverride) {
          overrides[mod.key] = "reset";
        }
      }
      if (Object.keys(overrides).length > 0) {
        await endpoints.admin.bulkOverride({ email: user.email, overrides });
      }
      onSaved();
    } catch {
      setError("Không lưu được override. Thử lại sau.");
    } finally {
      setSaving(false);
    }
  }

  const deptLabel = DEPARTMENT_LIST.find((d) => d.key === deptKey)?.label ?? user.department ?? "Không rõ";
  const deptBadgeCls = deptKey ? `pm-dept-badge ${deptKey}` : "pm-dept-badge";

  return (
    <>
      <div className="pm-drawer-overlay" onClick={onClose} />
      <div className="pm-drawer">
        {/* Header */}
        <div className="pm-drawer-head">
          <div className="pm-drawer-head-info">
            <h3>{user.fullName || user.email}</h3>
            <div className="pm-drawer-head-meta">
              <span className={deptBadgeCls}>{deptLabel}</span>
              <span>{overrideCount} override đang hoạt động</span>
            </div>
          </div>
          <button type="button" className="pm-drawer-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Info banner */}
        <div className="pm-drawer-banner">
          <span>⚙</span>
          <span>
            Quyền nhóm <strong>{deptLabel}</strong> là mặc định. Override sẽ ghi đè cho riêng{" "}
            <strong>{user.fullName || user.email}</strong>. Click pill để thay đổi — pill tím = đang override.
          </span>
        </div>

        {/* Module list */}
        <div className="pm-drawer-scroll">
          {MODULE_SECTIONS.map((section) => (
            <div key={section}>
              <div className="pm-drawer-section-label">{section}</div>
              {modulesBySection[section].map((mod) => {
                const level = draft[mod.key] ?? "none";
                const isOverride = level !== deptDefaults[mod.key];
                const mr = deptKey ? (minRoles[deptKey]?.[mod.key] ?? "sale") : "sale";
                const rawLevel = deptKey
                  ? (matrix[deptKey]?.[mod.key] ?? DEFAULT_PERMISSIONS[deptKey]?.[mod.key] ?? "none")
                  : "none";
                const blockedByScope = rawLevel !== "none" && userRank < roleRank(mr);
                return (
                  <div key={mod.key} className="pm-drawer-module">
                    <div className="pm-drawer-module-info">
                      <div className="pm-drawer-module-name">{mod.label}</div>
                      <div className="pm-drawer-module-default">
                        Nhóm mặc định: {ACCESS_LABELS[deptDefaults[mod.key]]}
                        {blockedByScope && (
                          <span style={{ color: "var(--gmv-danger)", marginLeft: 6, fontSize: 10 }}>
                            (phạm vi: {MIN_ROLE_LABELS[mr]})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="pm-drawer-module-actions">
                      {isOverride && (
                        <>
                          <span className="pm-dept-badge" style={{ background: "#ede9fe", color: "#6d28d9", fontSize: 10 }}>
                            Override
                          </span>
                          <button type="button" className="pm-drawer-reset" onClick={() => handleReset(mod.key)}>
                            ↻ Reset
                          </button>
                        </>
                      )}
                      <span
                        className={`pm-access-badge ${level}${isOverride ? " is-override" : ""}`}
                        onClick={() => handleCycle(mod.key)}
                        title={`Click để đổi (hiện: ${ACCESS_LABELS[level]})`}
                      >
                        <AccessIcon level={level} />
                        {ACCESS_LABELS[level]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pm-drawer-foot">
          {error && <span className="text-xs text-gmv-danger mr-auto">{error}</span>}
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
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Đang lưu..." : "Lưu override"}
          </button>
        </div>
      </div>
    </>
  );
}
