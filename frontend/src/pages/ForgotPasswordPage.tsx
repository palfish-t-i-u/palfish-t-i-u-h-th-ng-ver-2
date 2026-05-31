import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button, Input } from "../components/ui";
import AuthLayout from "../components/auth/AuthLayout";
import "../components/auth/auth.css";

type Step = "email" | "otp" | "reset";

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ["email", "otp", "reset"];
  const idx = steps.indexOf(current);
  return (
    <div className="auth-steps">
      {steps.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {i > 0 && <div className={`auth-step-line${i <= idx ? " done" : ""}`} />}
          <div className={`auth-step${i === idx ? " active" : i < idx ? " done" : ""}`}>
            {i < idx ? "✓" : i + 1}
          </div>
        </div>
      ))}
    </div>
  );
}

const OTP_LENGTH = 6;

export default function ForgotPasswordPage() {
  const { sendPasswordReset, verifyOtp, updatePassword, passwordRecovery, user, signOut } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Magic link từ email (template còn ConfirmationURL) → Supabase bắn PASSWORD_RECOVERY
  useEffect(() => {
    if (passwordRecovery) {
      setStep("reset");
      if (user?.email && !email) setEmail(user.email);
    }
  }, [passwordRecovery, user?.email, email]);

  async function dispatchPasswordReset(targetEmail: string) {
    setLoading(true);
    setError("");
    setInfo("");
    const { error: resetError } = await sendPasswordReset(targetEmail.trim());
    setLoading(false);
    if (resetError) {
      const msg = resetError.message;
      if (/rate limit|too many/i.test(msg)) {
        setError("Gửi email quá nhanh. Vui lòng đợi 1 phút rồi thử lại.");
      } else {
        setError(msg);
      }
      return false;
    }
    setInfo(
      "Nếu email đã đăng ký, mã OTP 6 số sẽ được gửi trong vài phút. Kiểm tra cả hộp thư spam."
    );
    return true;
  }

  // ── Step 1: Send OTP ──
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    const ok = await dispatchPasswordReset(email);
    if (ok) setStep("otp");
  }

  async function handleResendOtp() {
    if (!email || loading) return;
    setOtp(Array(OTP_LENGTH).fill(""));
    await dispatchPasswordReset(email);
  }

  // ── Step 2: Verify OTP ──
  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = [...otp];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setOtp(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const token = otp.join("");
    if (token.length < OTP_LENGTH) {
      setError("Vui lòng nhập đủ mã OTP.");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await verifyOtp(email.trim(), token);
    setLoading(false);
    if (error) {
      setError("Mã OTP không đúng hoặc đã hết hạn.");
      return;
    }
    setStep("reset");
  }

  // ── Step 3: Set new password ──
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await updatePassword(newPassword);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    await signOut();
    navigate("/login", { state: { passwordReset: true } });
  }

  const titles: Record<Step, { title: string; subtitle: string }> = {
    email: {
      title: "Quên mật khẩu",
      subtitle: "Nhập email đã đăng ký để nhận mã xác thực",
    },
    otp: {
      title: "Xác minh OTP",
      subtitle: `Nhập mã 6 chữ số đã gửi tới ${email}`,
    },
    reset: {
      title: "Đặt lại mật khẩu",
      subtitle: "Tạo mật khẩu mới cho tài khoản của bạn",
    },
  };

  return (
    <AuthLayout title={titles[step].title} subtitle={titles[step].subtitle}>
      <StepIndicator current={step} />

      {step === "email" && (
        <form className="auth-form" onSubmit={handleSendOtp}>
          <div className="auth-field">
            <label className="auth-label">
              Email <span className="required">*</span>
            </label>
            <Input
              type="email"
              placeholder="Nhập email đã đăng ký"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          {info && <div className="auth-info">{info}</div>}
          <Button type="submit" disabled={loading} fullWidth variant="primary">
            {loading ? "Đang gửi..." : "Gửi mã OTP"}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form className="auth-form" onSubmit={handleVerifyOtp}>
          <div className="auth-otp-group" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                className="gmv-field w-full min-w-0 px-2.5 py-2 border border-gmv-border rounded-gmv-md text-sm bg-gmv-canvas text-gmv-text-strong transition focus:outline-none focus:border-gmv-primary focus:ring-1 focus:ring-gmv-primary"
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                autoFocus={i === 0}
              />
            ))}
          </div>
          {error && <div className="auth-error">{error}</div>}
          {info && <div className="auth-info">{info}</div>}
          <Button type="submit" disabled={loading} fullWidth variant="primary">
            {loading ? "Đang xác minh..." : "Xác minh"}
          </Button>
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              className="auth-link"
              disabled={loading}
              onClick={handleResendOtp}
            >
              {loading ? "Đang gửi lại..." : "Gửi lại mã OTP"}
            </button>
          </div>
        </form>
      )}

      {step === "reset" && (
        <form className="auth-form" onSubmit={handleResetPassword}>
          <div className="auth-field">
            <label className="auth-label">
              Mật khẩu mới <span className="required">*</span>
            </label>
            <Input
              type="password"
              placeholder="Tối thiểu 6 ký tự"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">
              Xác nhận mật khẩu <span className="required">*</span>
            </label>
            <Input
              type="password"
              placeholder="Nhập lại mật khẩu mới"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <Button type="submit" disabled={loading} fullWidth variant="primary">
            {loading ? "Đang cập nhật..." : "Đặt lại mật khẩu"}
          </Button>
        </form>
      )}

      <div className="auth-footer">
        <Link to="/login" className="auth-link">
          ← Quay lại đăng nhập
        </Link>
      </div>
    </AuthLayout>
  );
}
