import { useEffect, useState } from "react";
import type { AuthUserRow } from "../../types/profile";
import { endpoints } from "../../lib/api";
import { Button, Input, Select } from "../ui";
import CrmLinkModal from "./CrmLinkModal";
import "./auth-accounts.css";

/* ── helpers ── */

type RoleKey = "User" | "Leader" | "Manager" | "Admin";

function roleLabel(role: string | null): RoleKey {
  if (!role) return "User";
  const r = role.toLowerCase();
  if (r === "system" || r === "admin") return "Admin";
  if (r === "manager") return "Manager";
  if (r === "leader") return "Leader";
  return "User";
}

function roleApiValue(label: RoleKey) {
  if (label === "Admin") return "system";
  if (label === "Manager") return "manager";
  if (label === "Leader") return "leader";
  return "sale";
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

function deptLabel(u: AuthUserRow): string {
  const d = (u.department || "").toLowerCase();
  if (d.includes("sale") || d.includes("bán hàng")) return "Bán hàng";
  if (d.includes("hr") || d.includes("nhân sự") || d.includes("quản trị")) return "Nhân sự & Quản trị";
  if (d.includes("marketing")) return "Marketing";
  if (d.includes("cs")) return "CS";
  return u.department || "—";
}

function deptBadgeClass(u: AuthUserRow): string {
  const d = (u.department || "").toLowerCase();
  if (d.includes("sale") || d.includes("bán hàng")) return "sale";
  if (d.includes("hr") || d.includes("nhân sự") || d.includes("quản trị")) return "hr";
  if (d.includes("marketing")) return "marketing";
  if (d.includes("cs")) return "cs";
  return "";
}

const DEPARTMENTS = [
  { value: "sale", label: "Đội Sale" },
  { value: "cs", label: "Đội CS" },
  { value: "hr", label: "Đội HR" },
  { value: "marketing", label: "Marketing" },
];

const TEAMS_BY_DEPT: Record<string, string[]> = {
  sale: ["Inhouse 1", "Inhouse 2", "HCM", "Offline Linh Đan"],
};

const SUBTEAMS_BY_TEAM: Record<string, string[]> = {
  "Inhouse 1": ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5", "Sales"],
  "Tele sale": ["Area 2", "Team Au"],
  "P'AU Group": ["Team Lookkaew", "Team Aon"],
  "P'TEE Group": ["Team James"],
};

function normalizeDeptKey(raw: string | null | undefined): string {
  const d = (raw || "").toLowerCase();
  if (d.includes("sale") || d.includes("bán hàng")) return "sale";
  if (d.includes("hr") || d.includes("nhân sự") || d.includes("quản trị")) return "hr";
  if (d.includes("marketing") || d.includes("mkt")) return "marketing";
  if (d.includes("cs")) return "cs";
  return raw || "";
}

const ROLE_CARDS: { key: RoleKey; desc: string }[] = [
  { key: "User", desc: "Chỉ xem thông tin cá nhân và dữ liệu liên quan đến tài khoản của chính họ." },
  { key: "Leader", desc: "Xem dữ liệu sub-team mình quản lý." },
  { key: "Manager", desc: "Xem dữ liệu toàn bộ team/chi nhánh mình quản lý." },
  { key: "Admin", desc: "Xem và thao tác được tất cả mọi thứ trong hệ thống." },
];

/* ── props ── */

interface Props {
  user: AuthUserRow | null;
  onClose: () => void;
  onUpdated: () => void;
  linkedCrmNames: Set<string>;
}

export default function AccountDetailDrawer({ user, onClose, onUpdated, linkedCrmNames }: Props) {
  const [selectedRole, setSelectedRole] = useState<RoleKey>("User");
  const [crmLinkOpen, setCrmLinkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [editSubTeam, setEditSubTeam] = useState("");

  const editTeams = TEAMS_BY_DEPT[editDept] || [];
  const editSubTeams = SUBTEAMS_BY_TEAM[editTeam] || [];

  useEffect(() => {
    if (user) {
      setSelectedRole(roleLabel(user.staffRole));
      setEditName(user.crmName || user.fullName || "");
      setEditPhone(user.phone || "");
      setEditDept(normalizeDeptKey(user.department));
      setEditTeam(user.team || "");
      setEditSubTeam(user.subTeam || "");
      setEditing(false);
      setError("");
    }
  }, [user]);

  if (!user) return null;

  const st = statusOf(user);
  const currentRole = roleLabel(user.staffRole);
  const roleChanged = selectedRole !== currentRole;
  const nameChanged = editing && editName !== (user.crmName || user.fullName || "");
  const phoneChanged = editing && editPhone !== (user.phone || "");
  const deptChanged = editing && editDept !== (user.department || "");
  const teamChanged = editing && editTeam !== (user.team || "");
  const subTeamChanged = editing && editSubTeam !== (user.subTeam || "");
  const hasChanges = roleChanged || nameChanged || phoneChanged || deptChanged || teamChanged || subTeamChanged;

  /* ── actions ── */

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);
    setError("");
    try {
      const patch: Record<string, string> = {};
      if (roleChanged) patch.role = roleApiValue(selectedRole);
      if (nameChanged) patch.full_name = editName.trim();
      if (phoneChanged) patch.phone = editPhone.trim();
      if (deptChanged) patch.department = editDept.trim();
      if (teamChanged) patch.team = editTeam.trim();
      if (subTeamChanged) patch.sub_team = editSubTeam.trim();
      await endpoints.admin.patchAuthUser(user!.id, patch);
      setEditing(false);
      onUpdated();
    } catch {
      setError("Không lưu được thay đổi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActivation() {
    setError("");
    try {
      await endpoints.admin.patchAuthUser(user!.id, { is_activated: !user!.isActivated });
      onUpdated();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? ((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Lỗi.")
          : "Lỗi.";
      setError(msg);
    }
  }

  async function handleCrmLink(crmName: string) {
    setError("");
    try {
      await endpoints.admin.patchAuthUser(user!.id, { crmName });
      setCrmLinkOpen(false);
      onUpdated();
    } catch {
      setError("Không liên kết CRM. Có thể nhân sự này đã được liên kết.");
    }
  }

  async function handleUnlinkCrm() {
    setError("");
    try {
      await endpoints.admin.patchAuthUser(user!.id, { crmName: "" });
      onUpdated();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? ((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Không huỷ liên kết CRM.")
          : "Không huỷ liên kết CRM.";
      setError(msg);
    }
  }

  function handleCopyId() {
    navigator.clipboard.writeText(user!.email).catch(() => {});
  }


  return (
    <>
      <div className="aa-drawer-overlay" onClick={onClose} />

      <div className="aa-drawer">
        {/* ── Header ── */}
        <div className="aa-drawer-header">
          <div className="aa-drawer-header-left">
            <span className="aa-drawer-id-pill">{user.email.split("@")[0].toUpperCase()}</span>
            <div>
              <div className="aa-drawer-name">{user.crmName || user.fullName || user.email}</div>
              <div className="aa-drawer-subtitle">
                Đăng nhập cuối:{" "}
                {user.lastSignIn
                  ? new Date(user.lastSignIn).toLocaleString("vi-VN", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })
                  : "Chưa đăng nhập"}
              </div>
            </div>
          </div>
          <div className="aa-drawer-badges">
            <span className={`aa-role-badge ${currentRole.toLowerCase()}`}>
              <span className="aa-role-dot" />
              {currentRole}
            </span>
            <span className={`aa-status ${st}`}>
              <span className="aa-status-dot" />
              {statusLabel(st)}
            </span>
            <button className="aa-drawer-close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="aa-drawer-scroll">
          {/* ── Summary bar ── */}
          <div className="aa-summary-bar">
            <div className="aa-summary-cell">
              <div className="aa-summary-label">Đội</div>
              <div className="aa-summary-value">{deptLabel(user)}</div>
            </div>
            <div className="aa-summary-cell">
              <div className="aa-summary-label">Team</div>
              <div className="aa-summary-value">{user.team || "—"}{user.subTeam ? ` · ${user.subTeam}` : ""}</div>
            </div>
            <div className="aa-summary-cell">
              <div className="aa-summary-label">CRM</div>
              <div className="aa-summary-value">
                {user.crmName ? (
                  <span className="aa-crm-link linked">
                    <span className="aa-status-dot" style={{ background: "var(--gmv-ok)" }} />
                    Đã liên kết
                  </span>
                ) : (
                  <span className="aa-crm-link unlinked">
                    <span className="aa-status-dot" style={{ background: "var(--gmv-warn)" }} />
                    Chưa liên kết
                  </span>
                )}
              </div>
            </div>
            <div className="aa-summary-cell">
              <div className="aa-summary-label">Trạng thái</div>
              <div className="aa-summary-value">
                <span className={`aa-status ${st}`}>
                  <span className="aa-status-dot" />
                  {statusLabel(st)}
                </span>
              </div>
            </div>
          </div>

          {error && <div className="text-sm text-gmv-danger mb-3">{error}</div>}

          {/* ── Section: Thông tin tài khoản ── */}
          <div className="aa-section">
            <div className="aa-section-header">
              <div className="aa-section-title">
                <span>👤</span> Thông tin tài khoản
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Huỷ sửa" : "Chỉnh sửa"}
              </Button>
            </div>
            <div className="aa-section-body">
              {editing ? (
                <div className="aa-info-grid">
                  <div className="aa-info-item">
                    <label>Họ tên trên CRM</label>
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                    />
                  </div>
                  <div className="aa-info-item">
                    <label>Email</label>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gmv-muted)" }}>
                      {user.email}
                    </span>
                  </div>
                  <div className="aa-info-item">
                    <label>Số điện thoại</label>
                    <Input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="0912 345 678"
                    />
                  </div>
                  <div className="aa-info-item">
                    <label>Đội</label>
                    <Select
                      value={editDept}
                      onChange={(e) => { setEditDept(e.target.value); setEditTeam(""); setEditSubTeam(""); }}
                    >
                      <option value="">— Chọn —</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="aa-info-item">
                    <label>Chọn team</label>
                    {editTeams.length > 0 ? (
                      <Select value={editTeam} onChange={(e) => { setEditTeam(e.target.value); setEditSubTeam(""); }}>
                        <option value="">— Chọn —</option>
                        {editTeams.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </Select>
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--gmv-muted)" }}>—</span>
                    )}
                  </div>
                  <div className="aa-info-item">
                    <label>Sub-team</label>
                    {editSubTeams.length > 0 ? (
                      <Select value={editSubTeam} onChange={(e) => setEditSubTeam(e.target.value)}>
                        <option value="">— Chọn —</option>
                        {editSubTeams.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </Select>
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--gmv-muted)" }}>—</span>
                    )}
                  </div>
                  <div className="aa-info-item">
                    <label>Provider</label>
                    <span style={{ fontSize: 13, color: "var(--gmv-muted)" }}>
                      {(user.providers || []).join(", ") || "email"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="aa-info-grid">
                  <div className="aa-info-item">
                    <label>Họ tên trên CRM</label>
                    <span>{user.crmName || user.fullName || "—"}</span>
                  </div>
                  <div className="aa-info-item">
                    <label>Email</label>
                    <a href={`mailto:${user.email}`}>{user.email}</a>
                  </div>
                  <div className="aa-info-item">
                    <label>Số điện thoại</label>
                    <span>{user.phone || "—"}</span>
                  </div>
                  <div className="aa-info-item">
                    <label>Đội</label>
                    {deptBadgeClass(user) ? (
                      <span className={`aa-dept-badge ${deptBadgeClass(user)}`}>{deptLabel(user)}</span>
                    ) : (
                      <span>{deptLabel(user)}</span>
                    )}
                  </div>
                  <div className="aa-info-item">
                    <label>Chọn team</label>
                    <span>{user.team || "—"}</span>
                  </div>
                  <div className="aa-info-item">
                    <label>Sub-team</label>
                    <span>{user.subTeam || "—"}</span>
                  </div>
                  <div className="aa-info-item">
                    <label>Provider</label>
                    <span>{(user.providers || []).join(", ") || "email"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Section: Liên kết Nhân sự Sale ── */}
          <div className="aa-section">
            <div className="aa-section-header">
              <div className="aa-section-title">
                <span>🔗</span> Liên kết Nhân sự Sale
              </div>
              <div className="flex gap-2">
                {user.crmName ? (
                  <>
                    <Button size="sm" variant="danger" onClick={handleUnlinkCrm}>
                      ✕ Huỷ liên kết
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCrmLinkOpen(true)}>
                      Thay đổi
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => setCrmLinkOpen(true)}>
                    + Liên kết
                  </Button>
                )}
              </div>
            </div>
            <div className="aa-section-body">
              {user.crmName ? (
                <div className="aa-crm-card">
                  <div>
                    <div className="aa-crm-card-name">{user.crmName}</div>
                    <div className="aa-crm-card-team">{user.team || "—"}{user.subTeam ? ` · ${user.subTeam}` : ""}</div>
                  </div>
                  <span className="aa-crm-link linked">
                    <span className="aa-status-dot" style={{ background: "var(--gmv-ok)" }} />
                    Đã liên kết
                  </span>
                </div>
              ) : (
                <div className="aa-crm-card-empty">
                  <span>Chưa liên kết nhân sự CRM. Nhấp "+ Liên kết" để chọn định danh thật.</span>
                  <span style={{ marginLeft: 8, color: "var(--gmv-primary)" }}>🔗</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Section: Vai trò & Phân quyền ── */}
          <div className="aa-section">
            <div className="aa-section-header">
              <div className="aa-section-title">
                <span>🛡️</span> Vai trò & Phân quyền
              </div>
            </div>
            <div className="aa-section-body">
              <div className="aa-role-cards">
                {ROLE_CARDS.map((r) => (
                  <div
                    key={r.key}
                    className={`aa-role-card${selectedRole === r.key ? " selected" : ""}`}
                    onClick={() => setSelectedRole(r.key)}
                  >
                    <div className="aa-role-card-title">{r.key}</div>
                    <div className="aa-role-card-desc">{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="aa-drawer-footer">
          <Button size="sm" variant="secondary" onClick={handleCopyId}>
            Sao chép mã
          </Button>
          <Button
            size="sm"
            variant={user.isActivated ? "danger" : "ok"}
            onClick={handleToggleActivation}
          >
            {user.isActivated ? "Dừng kích hoạt" : "Kích hoạt"}
          </Button>
          <div className="aa-drawer-footer-spacer" />
          <Button variant="primary" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>
      </div>

      <CrmLinkModal
        open={crmLinkOpen}
        onClose={() => setCrmLinkOpen(false)}
        onConfirm={handleCrmLink}
        linkedCrmNames={linkedCrmNames}
      />
    </>
  );
}
