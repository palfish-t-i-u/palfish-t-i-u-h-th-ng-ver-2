import { useEffect, useState } from "react";
import { useMe } from "../hooks/useMe";
import { endpoints } from "../lib/api";
import { Button, Input } from "../components/ui";
import { Card, CardBody } from "../components/ui/Card";
import PageSection from "../components/ui/PageSection";

export default function ProfilePage() {
  const { profile, loading, error, refresh } = useMe();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [crmName, setCrmName] = useState("");

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
                <div className="font-semibold text-gmv-text-strong">{profile.subTeam || "—"}</div>
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
    </div>
  );
}
