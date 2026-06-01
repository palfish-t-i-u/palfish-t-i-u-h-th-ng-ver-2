import { useState } from "react";
import { endpoints } from "../../lib/api";
import { Button, Input, Select } from "../ui";
import Modal from "../ui/Modal";

const DEPARTMENTS = [
  { value: "sale", label: "Đội Sale" },
  { value: "cs", label: "Đội CS" },
  { value: "hr", label: "Đội HR" },
  { value: "marketing", label: "Marketing" },
];

const TEAMS_BY_DEPT: Record<string, string[]> = {
  sale: ["Inhouse 1", "Inhouse 2", "HCM", "Offline Linh Đan"],
};

const ROLES = [
  { value: "user", label: "User" },
  { value: "leader", label: "Leader" },
  { value: "admin", label: "Admin" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface Form {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  department: string;
  team: string;
  role: string;
  is_activated: boolean;
}

const INITIAL: Form = {
  email: "",
  password: "",
  full_name: "",
  phone: "",
  department: "",
  team: "",
  role: "user",
  is_activated: false,
};

export default function CreateAccountModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<Form>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const teams = TEAMS_BY_DEPT[form.department] ?? [];
  const showTeam = teams.length > 0;

  function set<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "department") next.team = "";
      return next;
    });
  }

  function handleReset() {
    setForm(INITIAL);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("Vui lòng điền email và mật khẩu.");
      return;
    }
    if (form.password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await endpoints.admin.createAuthUser({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim() || undefined,
        phone: form.phone.trim() || undefined,
        department: form.department || undefined,
        team: form.team || undefined,
        role: form.role,
        is_activated: form.is_activated,
      });
      handleReset();
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? ((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
            "Không tạo được tài khoản.")
          : "Không tạo được tài khoản.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Thêm tài khoản mới">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email + Password */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gmv-text-strong">
              Email <span className="text-gmv-danger">*</span>
            </label>
            <Input
              type="email"
              placeholder="email@company.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gmv-text-strong">
              Mật khẩu <span className="text-gmv-danger">*</span>
            </label>
            <Input
              type="password"
              placeholder="Tối thiểu 6 ký tự"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              required
              minLength={6}
            />
          </div>
        </div>

        {/* Name + Phone */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gmv-text-strong">
              Họ và tên
            </label>
            <Input
              type="text"
              placeholder="Nguyễn Văn A"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gmv-text-strong">
              Số điện thoại
            </label>
            <Input
              type="tel"
              placeholder="0912 345 678"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
        </div>

        {/* Department + Team */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gmv-text-strong">
              Bộ phận
            </label>
            <Select
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
            >
              <option value="">-- Chọn bộ phận --</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gmv-text-strong">
              Team
            </label>
            {showTeam ? (
              <Select
                value={form.team}
                onChange={(e) => set("team", e.target.value)}
              >
                <option value="">-- Chọn team --</option>
                {teams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            ) : (
              <Input type="text" value="—" disabled />
            )}
          </div>
        </div>

        {/* Role + Activate */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gmv-text-strong">
              Vai trò
            </label>
            <Select
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-gmv-text-strong cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_activated}
                onChange={(e) => set("is_activated", e.target.checked)}
                style={{ accentColor: "var(--gmv-primary)" }}
              />
              Kích hoạt ngay
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-gmv-danger">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} type="button">
            Huỷ
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? "Đang tạo..." : "Tạo tài khoản"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
