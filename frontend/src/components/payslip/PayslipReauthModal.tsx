import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { Input } from "../ui/Input";

const REAUTH_KEY = "payslip_reauth";
const REAUTH_TTL = 15 * 60 * 1000;
const REAUTH_RETURN_KEY = "payslip_reauth_return";

export function isReauthValid(): boolean {
  const ts = sessionStorage.getItem(REAUTH_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts, 10) < REAUTH_TTL;
}

export function markReauthValid(): void {
  sessionStorage.setItem(REAUTH_KEY, String(Date.now()));
}

export interface ReauthReturn {
  code: string;
  ky: string;
  email: string;
  prevToken: string;
}

export function setReauthReturn(data: ReauthReturn): void {
  sessionStorage.setItem(REAUTH_RETURN_KEY, JSON.stringify(data));
}

export function getReauthReturn(): ReauthReturn | null {
  const raw = sessionStorage.getItem(REAUTH_RETURN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReauthReturn;
  } catch {
    return null;
  }
}

export function clearReauthReturn(): void {
  sessionStorage.removeItem(REAUTH_RETURN_KEY);
}

type ReauthMethod = "totp" | "google" | "password";

export function pickReauthMethod(
  session: { user?: { app_metadata?: { provider?: string; providers?: string[] } } } | null,
  hasTotp = false,
): ReauthMethod {
  const meta = session?.user?.app_metadata;
  const providers = meta?.providers ?? [];
  const provider = meta?.provider ?? "";
  const isGoogle = providers.includes("google") || provider === "google";
  if (hasTotp) return "totp";
  if (isGoogle) return "google";
  return "password";
}

interface Props {
  open: boolean;
  pendingCode: string | null;
  pendingKy: string | null;
  hasTotp: boolean;
  totpFactorId: string | null;
  onSuccess: () => void;
  onClose: () => void;
}

export default function PayslipReauthModal({ open, pendingCode, pendingKy, hasTotp, totpFactorId, onSuccess, onClose }: Props) {
  const { session, signInWithPassword, reauthWithGoogle, mfaVerify } = useAuth();
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const method = pickReauthMethod(session, hasTotp);
  const userEmail = session?.user?.email ?? "";

  const handleGoogleReauth = async () => {
    if (!session?.access_token) return;
    if (pendingCode && pendingKy) {
      setReauthReturn({
        code: pendingCode,
        ky: pendingKy,
        email: userEmail,
        prevToken: session.access_token,
      });
    }
    await reauthWithGoogle();
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

  const handleTotpSubmit = async () => {
    if (!totpFactorId) return;
    setError("");
    setLoading(true);
    const { error: verifyErr } = await mfaVerify(totpFactorId, totpCode);
    setLoading(false);
    if (verifyErr) {
      setError(
        /invalid/i.test(verifyErr.message) ? "Mã không đúng, thử lại." : verifyErr.message
      );
      return;
    }
    markReauthValid();
    setTotpCode("");
    setError("");
    onSuccess();
  };

  if (method === "totp") {
    return (
      <Modal open={open} onClose={onClose} title="Xác thực để xem phiếu lương">
        <p className="mb-4 text-center text-sm text-gmv-muted">
          Nhập mã 6 số từ Google Authenticator. Phiên hết hạn sau 15 phút.
        </p>
        <div className="space-y-3">
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="Mã 6 số"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading && totpCode.length === 6) void handleTotpSubmit();
            }}
            autoFocus
          />
          {error && <p className="text-sm text-gmv-danger">{error}</p>}
          <Button
            variant="primary"
            fullWidth
            disabled={loading || totpCode.length !== 6}
            onClick={() => void handleTotpSubmit()}
          >
            {loading ? "Đang xác thực..." : "Xác nhận"}
          </Button>
        </div>
      </Modal>
    );
  }

  if (method === "google") {
    return (
      <Modal open={open} onClose={onClose} title="Xác thực để xem phiếu lương">
        <p className="mb-4 text-center text-sm text-gmv-muted">
          Đăng nhập lại bằng Google để xác nhận danh tính. Phiên hết hạn sau 15 phút.
        </p>
        <div className="space-y-3">
          {error && <p className="text-sm text-gmv-danger">{error}</p>}
          <Button
            variant="primary"
            fullWidth
            onClick={() => void handleGoogleReauth()}
          >
            Xác thực với Google
          </Button>
          <p className="mt-2 text-center text-xs text-gmv-muted">
            Thiết lập Google Authenticator trong Thông tin cá nhân để xác thực nhanh hơn.
          </p>
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
