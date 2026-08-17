import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { Input } from "../ui/Input";

const REAUTH_KEY = "payslip_reauth";
const REAUTH_TTL = 15 * 60 * 1000;

export function isReauthValid(): boolean {
  const ts = sessionStorage.getItem(REAUTH_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts, 10) < REAUTH_TTL;
}

export function markReauthValid(): void {
  sessionStorage.setItem(REAUTH_KEY, String(Date.now()));
}

function isOAuthProvider(session: { user?: { app_metadata?: { provider?: string } } } | null): boolean {
  const provider = session?.user?.app_metadata?.provider;
  return !!provider && provider !== "email";
}

interface Props {
  open: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export default function PayslipReauthModal({ open, onSuccess, onClose }: Props) {
  const { session, signInWithPassword } = useAuth();
  const [password, setPassword] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isOAuth = isOAuthProvider(session);
  const userEmail = session?.user?.email ?? "";

  const handleOAuthConfirm = () => {
    if (emailInput.trim().toLowerCase() !== userEmail.toLowerCase()) {
      setError("Email không khớp.");
      return;
    }
    markReauthValid();
    setEmailInput("");
    setError("");
    onSuccess();
  };

  const handlePasswordSubmit = async () => {
    setError("");
    setLoading(true);
    const { error: authErr } = await signInWithPassword(userEmail, password);
    setLoading(false);
    if (authErr) {
      setError(
        /invalid.*credential|invalid.*password/i.test(authErr.message)
          ? "Mật khẩu không đúng."
          : authErr.message
      );
      return;
    }
    markReauthValid();
    setPassword("");
    setError("");
    onSuccess();
  };

  if (isOAuth) {
    return (
      <Modal open={open} onClose={onClose} title="Xác thực để xem phiếu lương">
        <p className="mb-4 text-center text-sm text-gmv-muted">
          Nhập email đăng nhập để xác nhận danh tính. Phiên hết hạn sau 15 phút.
        </p>
        <div className="space-y-3">
          <Input
            type="email"
            placeholder="Email đăng nhập"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && emailInput) handleOAuthConfirm();
            }}
            autoFocus
          />
          {error && <p className="text-sm text-gmv-danger">{error}</p>}
          <Button
            variant="primary"
            fullWidth
            disabled={!emailInput}
            onClick={handleOAuthConfirm}
          >
            Xác nhận
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Xác thực để xem phiếu lương">
      <p className="mb-4 text-center text-sm text-gmv-muted">
        Nhập mật khẩu để mở phiếu lương. Phiên xác thực hết hạn sau 15 phút.
      </p>
      <div className="space-y-3">
        <Input
          type="password"
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading && password) void handlePasswordSubmit();
          }}
          autoFocus
        />
        {error && <p className="text-sm text-gmv-danger">{error}</p>}
        <Button
          variant="primary"
          fullWidth
          disabled={loading || !password}
          onClick={() => void handlePasswordSubmit()}
        >
          {loading ? "Đang xác thực..." : "Xác nhận"}
        </Button>
      </div>
    </Modal>
  );
}
