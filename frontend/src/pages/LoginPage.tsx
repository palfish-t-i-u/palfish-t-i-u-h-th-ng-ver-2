import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button, Input } from "../components/ui";
import Badge from "../components/ui/Badge";
import AuthLayout from "../components/auth/AuthLayout";
import GoogleIcon from "../components/auth/GoogleIcon";
import "../components/auth/auth.css";

export default function LoginPage() {
  const { signInWithPassword, signInWithGoogle, isDevMode } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");
    const { error } = await signInWithPassword(email, password);
    setLoading(false);
    if (error) {
      setError(
        /invalid.*credential|invalid.*password/i.test(error.message)
          ? "Email hoặc mật khẩu không đúng."
          : error.message
      );
      return;
    }
    navigate("/");
  }

  async function handleGoogle() {
    setError("");
    if (isDevMode) {
      await signInWithGoogle();
      navigate("/");
      return;
    }
    const result = await signInWithGoogle();
    if (result && "error" in result && result.error) setError(result.error.message);
  }

  return (
    <AuthLayout title="Đăng nhập" subtitle="Đăng nhập vào hệ thống quản lý doanh thu">
      {isDevMode && (
        <div className="mb-4 flex justify-center">
          <Badge tone="warn">Dev mode — bypass auth</Badge>
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="auth-label">
            Email <span className="required">*</span>
          </label>
          <Input
            type="email"
            placeholder="Nhập email của bạn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">
            Mật khẩu <span className="required">*</span>
          </label>
          <div className="auth-password-wrap">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Nhập mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="auth-row">
          <span />
          <Link to="/forgot-password" className="auth-link">
            Quên mật khẩu?
          </Link>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <Button type="submit" disabled={loading} fullWidth variant="primary">
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
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
        Đăng nhập bằng Google
      </button>

      <div className="auth-footer">
        <p>Chưa có tài khoản?</p>
        <Link to="/signup" className="auth-footer-link">
          Đăng ký tài khoản mới
        </Link>
      </div>
    </AuthLayout>
  );
}
