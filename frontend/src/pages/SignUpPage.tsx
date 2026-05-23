import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button, Input, Select } from "../components/ui";
import { Card, CardBody } from "../components/ui/Card";
import Badge from "../components/ui/Badge";

const TEAMS = ["Inhouse 1", "Inhouse 2", "HCM", "Offline Linh Đan"];

export default function SignUpPage() {
  const { signUp, signInWithGoogle, isDevMode } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", full_name: "", phone: "", team: "" });
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    const result = await signInWithGoogle();
    setLoading(false);
    if (result && "error" in result && result.error) {
      setError(result.error.message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { email, full_name, phone, team } = form;
    if (!email || !full_name || !team) {
      setError("Vui lòng điền đầy đủ các trường bắt buộc.");
      return;
    }
    setLoading(true);
    setError("");

    if (isDevMode) {
      await signUp(email, { full_name, phone, team });
      setLoading(false);
      navigate("/");
      return;
    }

    const result = await signUp(email, { full_name, phone, team });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.sessionReady) {
      navigate("/");
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gmv-bg p-4">
      <Card className="w-full max-w-md">
        <CardBody>
          {isDevMode && (
            <div className="mb-4 flex justify-center">
              <Badge tone="warn">Dev mode — bypass auth</Badge>
            </div>
          )}

          <h1 className="mb-1 text-center text-2xl font-semibold text-gmv-text-strong">Đăng ký tài khoản</h1>
          <p className="mb-6 text-center text-xs text-gmv-muted">Khuyến nghị: đăng ký bằng Gmail công ty</p>

          {sent ? (
            <div className="py-4 text-center font-medium text-gmv-ok">
              ✓ Kiểm tra email để hoàn tất đăng ký (magic link).
            </div>
          ) : (
            <>
              <Button type="button" disabled={loading} onClick={handleGoogle} fullWidth variant="primary">
                Đăng ký / Đăng nhập bằng Google
              </Button>

              <p className="my-3 text-center text-xs text-gmv-muted">— hoặc —</p>

              {!showEmailForm ? (
                <button
                  type="button"
                  onClick={() => setShowEmailForm(true)}
                  className="mb-2 w-full text-sm text-gmv-link underline"
                >
                  Đăng ký bằng email
                </button>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gmv-text-strong">
                      Email dùng để đăng nhập <span className="text-gmv-danger">*</span>
                    </label>
                    <Input type="email" placeholder="Gmail của bạn" value={form.email} onChange={set("email")} required />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gmv-text-strong">
                      Họ và tên trên CRM <span className="text-gmv-danger">*</span>
                    </label>
                    <Input type="text" value={form.full_name} onChange={set("full_name")} required />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gmv-text-strong">
                      Số điện thoại đăng nhập trên CRM
                    </label>
                    <Input type="tel" value={form.phone} onChange={set("phone")} />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gmv-text-strong">
                      Chọn team của bạn <span className="text-gmv-danger">*</span>
                    </label>
                    <Select value={form.team} onChange={set("team")} required>
                      <option value="" disabled>
                        -- Chọn team --
                      </option>
                      {TEAMS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {error && <p className="text-xs text-gmv-danger">{error}</p>}

                  <Button type="submit" disabled={loading} fullWidth variant="secondary">
                    {loading ? "Đang xử lý..." : "Hoàn thành đăng ký"}
                  </Button>
                </form>
              )}
              {error && !showEmailForm && <p className="mt-2 text-xs text-gmv-danger">{error}</p>}
            </>
          )}

          <div className="mt-5 text-center">
            <Link to="/login" className="text-xs text-gmv-link hover:underline">
              ← Quay lại đăng nhập
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
