import { useEffect, useState } from "react";
import type { AuthUserRow } from "../../types/profile";
import { endpoints } from "../../lib/api";
import { Button } from "../ui";
import CrmLinkModal from "./CrmLinkModal";
import "./auth-accounts.css";

/* ── helpers ── */

function roleLabel(role: string | null): "User" | "Leader" | "Admin" {
  if (!role) return "User";
  const r = role.toLowerCase();
  if (r === "system" || r === "admin" || r === "manager") return "Admin";
  if (r === "leader") return "Leader";
  return "User";
}

function roleApiValue(label: "User" | "Leader" | "Admin") {
  if (label === "Admin") return "admin";
  if (label === "Leader") return "leader";
  return "user";
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

const ROLE_CARDS: { key: "User" | "Leader" | "Admin"; desc: string }[] = [
  { key: "User", desc: "Chỉ xem thông tin cá nhân và dữ liệu liên quan đến tài khoản của chính họ." },
  { key: "Leader", desc: "Xem dữ liệu cá nhân và thông tin nhân viên dưới quyền quản lý." },
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
  /* local editable state — reset whenever user changes */
  const [selectedRole, setSelectedRole] = useState<"User" | "Leader" | "Admin">("User");
  const [crmLinkOpen, setCrmLinkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setSelectedRole(roleLabel(user.staffRole));
      setError("");
    }
  }, [user]);

  if (!user) return null;

  const st = statusOf(user);
  const currentRole = roleLabel(user.staffRole);
  const hasChanges = selectedRole !== currentRole;

  /* ── actions ── */

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);
    setError("");
    try {
      await endpoints.admin.patchAuthUser(user!.id, { role: roleApiValue(selectedRole) });
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
    } catch {
      setError("Không huỷ liên kết CRM.");
    }
  }

  function handleCopyId() {
    const id = user!.email;
    navigator.clipboard.writeText(id).catch(() => {});
  }

  return (
    <>
      {/* Overlay */}
      <div className="aa-drawer-overlay" onClick={onClose} />

      {/* Drawer */}
      <div className="aa-drawer">
        {/* ── Header ── */}
        <div className="aa-drawer-header">
          <div className="aa-drawer-header-left">
            <span className="aa-drawer-id-pill">{user.email.split("@")[0].toUpperCase()}</span>
            <div>
              <div className="aa-drawer-name">{user.fullName || user.crmName || user.email}</div>
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
              <div className="aa-summary-value">{user.team || "—"}</div>
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
            </div>
            <div className="aa-section-body">
              <div className="aa-info-grid">
                <div className="aa-info-item">
                  <label>Họ tên trên CRM</label>
                  <span>{user.fullName || user.crmName || "—"}</span>
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
                  <span>{deptLabel(user)}</span>
                </div>
                <div className="aa-info-item">
                  <label>Team</label>
                  <span>{user.team || "—"}</span>
                </div>
                <div className="aa-info-item">
                  <label>Provider</label>
                  <span>{(user.providers || []).join(", ") || "email"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Section: Liên kết Nhân sự Sale ── */}
          <div className="aa-section">
            <div className="aa-section-header">
              <div className="aa-section-title">
                <span>🔗</span> Liên kết Nhân sự Sale
              </div>
              <div className="flex gap-2">
                {/* TODO: Huỷ liên kết — BE chưa hỗ trợ unlink crmName, cần thêm logic */}
                <Button size="sm" variant="ghost" onClick={() => setCrmLinkOpen(true)}>
                  {user.crmName ? "Thay đổi" : "Liên kết"}
                </Button>
              </div>
            </div>
            <div className="aa-section-body">
              {user.crmName ? (
                <div className="aa-crm-card">
                  <div>
                    <div className="aa-crm-card-name">{user.crmName}</div>
                    <div className="aa-crm-card-team">{user.team || "—"}</div>
                  </div>
                  <span className="aa-crm-link linked">
                    <span className="aa-status-dot" style={{ background: "var(--gmv-ok)" }} />
                    Đã liên kết
                  </span>
                </div>
              ) : (
                <div className="aa-crm-card-empty">
                  Chưa liên kết nhân sự CRM. Bấm "Liên kết" để chọn.
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
            Sao chép email
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

      {/* CRM Link Modal */}
      <CrmLinkModal
        open={crmLinkOpen}
        onClose={() => setCrmLinkOpen(false)}
        onConfirm={handleCrmLink}
        linkedCrmNames={linkedCrmNames}
      />
    </>
  );
}
