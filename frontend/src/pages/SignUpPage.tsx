import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button, Input, Select } from "../components/ui";
import Badge from "../components/ui/Badge";
import AuthLayout from "../components/auth/AuthLayout";
import GoogleIcon from "../components/auth/GoogleIcon";
import "../components/auth/auth.css";

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

interface FormState {
  email: string;
  password: string;
  confirmPassword: string;
  full_name: string;
  phone: string;
  department: string;
  team: string;
  sub_team: string;
}

const INITIAL: FormState = {
  email: "",
  password: "",
  confirmPassword: "",
  full_name: "",
  phone: "",
  department: "",
  team: "",
  sub_team: "",
};

export default function SignUpPage() {
  const { signUpWithPassword, signInWithGoogle, isDevMode } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const teams = TEAMS_BY_DEPT[form.department] ?? [];
  const showTeam = teams.length > 0;
  const subTeams = SUBTEAMS_BY_TEAM[form.team] ?? [];
  const showSubTeam = subTeams.length > 0;

  function set<K extends keyof FormState>(field: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = e.target.value;
      setForm((f) => {
        const next = { ...f, [field]: val };
        if (field === "department") { next.team = ""; next.sub_team = ""; }
        if (field === "team") { next.sub_team = ""; }
        return next;
      });
    };
  }

  function validate(): string | null {
    if (!form.email || !form.password || !form.full_name || !form.department) {
      return "Vui lòng điền đầy đủ các trường bắt buộc.";
    }
    if (form.password.length < 6) {
      return "Mật khẩu phải có ít nhất 6 ký tự.";
    }
    if (form.password !== form.confirmPassword) {
      return "Mật khẩu xác nhận không khớp.";
    }
    if (showTeam && !form.team) {
      return "Vui lòng chọn team.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    setError("");

    const meta = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      department: form.department,
      team: form.team,
      sub_team: form.sub_team || undefined,
    };

    const result = await signUpWithPassword(form.email.trim(), form.password, meta);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setSubmitted(true);
  }

  async function handleGoogle() {
    setError("");
    const result = await signInWithGoogle();
    if (result && "error" in result && result.error) setError(result.error.message);
  }

  if (submitted) {
    return (
      <AuthLayout title="Đăng ký thành công">
        <div className="auth-pending">
          <div className="auth-pending-icon">⏳</div>
          <h3>Tài khoản đang chờ kích hoạt</h3>
          <p>
            Tài khoản <strong>{form.email}</strong> đã được tạo thành công.
          </p>
          <p>
            Vui lòng chờ quản trị viên xác nhận và kích hoạt tài khoản của bạn
            trước khi đăng nhập.
          </p>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--gmv-muted)" }}>
            Bạn sẽ được thông báo qua email khi tài khoản được kích hoạt.
          </p>
        </div>
        <div className="auth-footer">
          <Link to="/login" className="auth-footer-link">
            Quay lại đăng nhập
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Đăng ký tài khoản"
      subtitle="Khuyến nghị: sử dụng Gmail công ty"
    >
      {isDevMode && (
        <div className="mb-4 flex justify-center">
          <Badge tone="warn">Dev mode — bypass auth</Badge>
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        {/* ── Department & Team ── */}
        <div className={showTeam ? "auth-field-row" : undefined}>
          <div className="auth-field">
            <label className="auth-label">
              Bộ phận <span className="required">*</span>
            </label>
            <Select value={form.department} onChange={set("department")} required>
              <option value="" disabled>
                -- Chọn bộ phận --
              </option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>

          {showTeam && (
            <div className="auth-field">
              <label className="auth-label">
                Team <span className="required">*</span>
              </label>
              <Select value={form.team} onChange={set("team")} required>
                <option value="" disabled>
                  -- Chọn team --
                </option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {showSubTeam && (
          <div className="auth-field">
            <label className="auth-label">Sub-team</label>
            <Select value={form.sub_team} onChange={set("sub_team")}>
              <option value="">-- Chọn sub-team --</option>
              {subTeams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* ── Credentials ── */}
        <div className="auth-field">
          <label className="auth-label">
            Email đăng nhập <span className="required">*</span>
          </label>
          <Input
            type="email"
            placeholder="Gmail của bạn"
            value={form.email}
            onChange={set("email")}
            required
            autoComplete="email"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">
            Mật khẩu <span className="required">*</span>
          </label>
          <Input
            type="password"
            placeholder="Tối thiểu 6 ký tự"
            value={form.password}
            onChange={set("password")}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">
            Xác nhận mật khẩu <span className="required">*</span>
          </label>
          <Input
            type="password"
            placeholder="Nhập lại mật khẩu"
            value={form.confirmPassword}
            onChange={set("confirmPassword")}
            required
            autoComplete="new-password"
          />
        </div>

        {/* ── Personal info ── */}
        <div className="auth-field">
          <label className="auth-label">
            Họ và tên (trên CRM) <span className="required">*</span>
          </label>
          <Input
            type="text"
            placeholder="Nguyễn Văn A"
            value={form.full_name}
            onChange={set("full_name")}
            required
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">Số điện thoại</label>
          <Input
            type="tel"
            placeholder="0912 345 678"
            value={form.phone}
            onChange={set("phone")}
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <Button type="submit" disabled={loading} fullWidth variant="primary">
          {loading ? "Đang xử lý..." : "Đăng ký tài khoản"}
        </Button>
      </form>

      <div className="auth-divider">
        <span>hoặc</span>
      </div>

      <button
        type="button"
        className="auth-google-btn"
        onClick={handleGoogle}
        disabled={loading}
      >
        <GoogleIcon />
        Đăng ký bằng Google
      </button>

      <div className="auth-footer">
        <p>Đã có tài khoản?</p>
        <Link to="/login" className="auth-footer-link">
          Đăng nhập
        </Link>
      </div>
    </AuthLayout>
  );
}
