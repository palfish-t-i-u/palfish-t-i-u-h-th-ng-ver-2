import { useCallback, useEffect, useState } from "react";
import { useMe } from "../hooks/useMe";
import { useAuth, type MfaFactor } from "../hooks/useAuth";
import { endpoints } from "../lib/api";
import { subTeamLabel } from "../lib/subTeamLabels";
import { Button, Input } from "../components/ui";
import { Card, CardBody } from "../components/ui/Card";
import PageSection from "../components/ui/PageSection";

export default function ProfilePage() {
  const { profile, loading, error, refresh } = useMe();
  const { mfaEnroll, mfaVerify, mfaUnenroll, mfaListFactors } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [crmName, setCrmName] = useState("");

  // TOTP enrollment state
  const [totpFactor, setTotpFactor] = useState<MfaFactor | null>(null);
  const [totpLoading, setTotpLoading] = useState(true);
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [unenrollPending, setUnenrollPending] = useState(false);

  const loadTotpStatus = useCallback(async () => {
    setTotpLoading(true);
    const { totp } = await mfaListFactors();
    const verified = totp.find((f) => f.status === "verified") ?? null;
    setTotpFactor(verified);
    setTotpLoading(false);
  }, [mfaListFactors]);

  useEffect(() => {
    void loadTotpStatus();
  }, [loadTotpStatus]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || "");
    setPhone(profile.phone || "");
    setCrmName(profile.crmName || "");
  }, [profile]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  if (loading) {
    return <p className="p-4 text-gmv-muted">Đang tải thông tin cá nhân…</p>;
  }

  if (!profile) {
    return <p className="p-4 text-gmv-danger">Không tải được hồ sơ.</p>;
  }

  const dn = displayName || profile.displayName || "";
  const ph = phone || profile.phone || "";
  const cn = crmName || profile.crmName || "";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMsg("");
    try {
      const body: { displayName?: string; phone?: string; crmName?: string } = {};
      if (dn) body.displayName = dn;
      if (ph) body.phone = ph;
      if (!profile.linked && cn) body.crmName = cn;
      await endpoints.me.patch(body);
      setMsg("Đã lưu.");
      await refresh();
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setMsg(detail || "Lỗi khi lưu.");
    } finally {
      setSaving(false);
    }
  }

  const roleLabel: Record<string, string> = {
    sale: "Sale",
    leader: "Sale Leader",
    manager: "Sale Manager",
    system: "System",
  };

  return (
    <div className="max-w-lg">
      <PageSection
        title="Thông tin cá nhân"
        subtitle="Cập nhật SĐT và tên hiển thị. Team/role do quản trị gán trên sidebar Nhân sự Sale (phạm vi nhân sự VN)."
      />

      {error && (
        <p className="mb-3 rounded-gmv-md bg-gmv-warn-soft px-2 py-2 text-xs text-gmv-warn">
          {error} — đang dùng thông tin tạm từ đăng nhập.
        </p>
      )}

      <Card>
        <CardBody>
          <form onSubmit={handleSave} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-gmv-text-strong">Email đăng nhập</span>
              <Input type="email" value={profile.email} readOnly className="mt-1 bg-gmv-bg" />
            </label>

            {!profile.linked && (
              <label className="block">
                <span className="text-sm font-semibold text-gmv-text-strong">
                  Tên trên CRM (ghép lần đầu) <span className="text-gmv-danger">*</span>
                </span>
                <Input
                  type="text"
                  value={crmName || cn}
                  onChange={(e) => setCrmName(e.target.value)}
                  placeholder="VD: Le Kim Chi"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-gmv-muted">
                  Tên đúng như trên CRM/Metabase (<code className="text-gmv-text-strong">nhan_su_sale.crm_name</code>) — chỉ nhập một lần.
                </p>
              </label>
            )}

            <label className="block">
              <span className="text-sm font-semibold text-gmv-text-strong">Tên hiển thị</span>
              <Input
                type="text"
                value={profile.linked ? dn || profile.crmName || "" : dn}
                onChange={(e) => setDisplayName(e.target.value)}
                readOnly={profile.linked && !!profile.crmName}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-gmv-muted">
                {profile.linked
                  ? "Sau khi ghép CRM, tên CRM đã liên kết hiển thị ở đây."
                  : "Tên tùy chọn trên app. Sau khi ghép, CRM name là định danh chính."}
              </p>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gmv-text-strong">Số điện thoại</span>
              <Input type="tel" value={ph} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
            </label>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gmv-muted">Team</span>
                <div className="font-semibold text-gmv-text-strong">{profile.team || "—"}</div>
              </div>
              <div>
                <span className="text-gmv-muted">Sub-team</span>
                <div className="font-semibold text-gmv-text-strong">{subTeamLabel(profile.subTeam) || "—"}</div>
              </div>
              <div>
                <span className="text-gmv-muted">Cấp quyền</span>
                <div className="font-semibold text-gmv-text-strong">
                  {roleLabel[profile.role] || profile.role}
                </div>
              </div>
              <div>
                <span className="text-gmv-muted">Liên kết CRM</span>
                <div className="font-semibold text-gmv-text-strong">
                  {profile.linked ? "Đã ghép" : "Chưa ghép"}
                </div>
              </div>
            </div>

            {msg && (
              <p className={`text-sm ${msg.startsWith("Đã") ? "text-gmv-ok" : "text-gmv-danger"}`}>{msg}</p>
            )}

            <Button type="submit" disabled={saving} variant="secondary">
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* TOTP Enrollment */}
      <div className="mt-8">
        <PageSection title="Bảo mật" subtitle="Xác thực 2 bước bằng Google Authenticator." />
      </div>
      <Card>
        <CardBody>
          {totpLoading ? (
            <p className="text-sm text-gmv-muted animate-pulse">Đang kiểm tra...</p>
          ) : totpFactor ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gmv-ok">Google Authenticator đã bật.</p>
              {unenrollPending ? (
                <>
                  <p className="text-sm text-gmv-muted">Nhập mã 6 số từ Authenticator để xác nhận tắt:</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Mã 6 số"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && totpCode.length === 6 && !totpBusy) {
                          void handleUnenroll();
                        }
                      }}
                      className="max-w-[120px]"
                      autoFocus
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={totpBusy || totpCode.length !== 6}
                      onClick={() => void handleUnenroll()}
                    >
                      {totpBusy ? "Đang tắt..." : "Xác nhận tắt"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setUnenrollPending(false); setTotpCode(""); setTotpError(""); }}
                    >
                      Hủy
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setUnenrollPending(true)}
                >
                  Tắt Authenticator
                </Button>
              )}
              {totpError && <p className="text-sm text-gmv-danger">{totpError}</p>}
            </div>
          ) : enrollQr ? (
            <div className="space-y-4">
              <p className="text-sm text-gmv-text">
                Quét mã QR bằng Google Authenticator (hoặc app tương thích), rồi nhập mã 6 số để xác nhận.
              </p>
              <div className="flex justify-center">
                <img src={enrollQr} alt="TOTP QR Code" className="h-48 w-48" />
              </div>
              <details className="text-xs text-gmv-muted">
                <summary className="cursor-pointer">Không quét được? Nhập mã thủ công</summary>
                <code className="mt-1 block break-all rounded bg-gmv-bg p-2 font-mono text-xs">{enrollSecret}</code>
              </details>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Mã 6 số"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && totpCode.length === 6 && !totpBusy) {
                      void handleTotpConfirm();
                    }
                  }}
                  className="max-w-[120px]"
                  autoFocus
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={totpBusy || totpCode.length !== 6}
                  onClick={() => void handleTotpConfirm()}
                >
                  {totpBusy ? "Đang xác nhận..." : "Xác nhận"}
                </Button>
              </div>
              {totpError && <p className="text-sm text-gmv-danger">{totpError}</p>}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setEnrollQr(null); setEnrollSecret(null); setEnrollFactorId(null); setTotpCode(""); setTotpError(""); }}
              >
                Hủy
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gmv-muted">
                Bật Google Authenticator để xác thực nhanh khi xem phiếu lương (thay vì đăng nhập lại Google).
              </p>
              <Button
                variant="secondary"
                disabled={totpBusy}
                onClick={async () => {
                  setTotpBusy(true);
                  setTotpError("");
                  const { totp } = await mfaListFactors();
                  for (const f of totp.filter((t) => t.status === "unverified")) {
                    await mfaUnenroll(f.id);
                  }
                  const { qr, secret, factorId, error: err } = await mfaEnroll();
                  setTotpBusy(false);
                  if (err || !qr) { setTotpError(err?.message ?? "Không tạo được mã QR."); return; }
                  setEnrollQr(qr);
                  setEnrollSecret(secret);
                  setEnrollFactorId(factorId);
                }}
              >
                {totpBusy ? "Đang tạo..." : "Thiết lập Google Authenticator"}
              </Button>
              {totpError && <p className="text-sm text-gmv-danger">{totpError}</p>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );

  async function handleTotpConfirm() {
    if (!enrollFactorId) return;
    setTotpBusy(true);
    setTotpError("");
    const { error: err } = await mfaVerify(enrollFactorId, totpCode);
    setTotpBusy(false);
    if (err) {
      setTotpError(/invalid/i.test(err.message) ? "Mã không đúng, thử lại." : err.message);
      return;
    }
    setEnrollQr(null);
    setEnrollSecret(null);
    setEnrollFactorId(null);
    setTotpCode("");
    await loadTotpStatus();
  }

  async function handleUnenroll() {
    if (!totpFactor) return;
    setTotpBusy(true);
    setTotpError("");
    const { error: verifyErr } = await mfaVerify(totpFactor.id, totpCode);
    if (verifyErr) {
      setTotpBusy(false);
      setTotpError(/invalid/i.test(verifyErr.message) ? "Mã không đúng, thử lại." : verifyErr.message);
      return;
    }
    const { error: err } = await mfaUnenroll(totpFactor.id);
    setTotpBusy(false);
    if (err) { setTotpError(err.message); return; }
    setTotpFactor(null);
    setUnenrollPending(false);
    setTotpCode("");
  }
}
