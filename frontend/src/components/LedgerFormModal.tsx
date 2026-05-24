import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { digitsOnly, formatVndInput, parseVndInput } from "../lib/vndFormat";
import type { LedgerCreatePayload, LoaiNhap } from "../types/revenue";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { Input } from "./ui/Input";
import Modal from "./ui/Modal";

const TEAM_OPTIONS = ["Inhouse 1", "Inhouse 2", "HCM (Online)", "Khác"];

export type LedgerFormState = LedgerCreatePayload & {
  gmvRmb?: number;
  note2?: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function emptyLedgerForm(): LedgerFormState {
  return {
    ngayTienVe: todayIso(),
    tenKhach: "",
    sdt: "",
    uid: "",
    goiHoc: "",
    soTienVnd: 0,
    gmvRmb: undefined,
    saleCrmName: "",
    team: "",
    loai: "",
    loai2: "",
    note: "",
    note2: "",
    paymentMethod: "",
  };
}

function VndInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(() => (value ? digitsOnly(String(value)) : ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(value ? digitsOnly(String(Math.trunc(value))) : "");
  }, [value, focused]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      className={cn("tabular-nums", className)}
      value={formatVndInput(raw)}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const next = digitsOnly(e.target.value);
        setRaw(next);
        onChange(parseVndInput(next));
      }}
      onBlur={() => setFocused(false)}
    />
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block text-sm text-gmv-muted", className)}>
      <span className="mb-1 block font-medium text-gmv-text-strong">{label}</span>
      {children}
    </label>
  );
}

interface Props {
  open: boolean;
  mode: "create" | "edit";
  initial: LedgerFormState;
  rowMeta?: { loaiNhap?: LoaiNhap; maDonHang?: string; crmOrderId?: string };
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (payload: LedgerFormState) => void | Promise<void>;
}

export default function LedgerFormModal({
  open,
  mode,
  initial,
  rowMeta,
  saving,
  error,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<LedgerFormState>(initial);
  const [rmbText, setRmbText] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initial);
      setRmbText(initial.gmvRmb != null && initial.gmvRmb > 0 ? String(initial.gmvRmb) : "");
    }
  }, [open, initial]);

  function patch<K extends keyof LedgerFormState>(key: K, value: LedgerFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const gmv = rmbText.trim() ? parseFloat(rmbText.replace(/,/g, "")) || 0 : undefined;
    await onSave({ ...form, gmvRmb: gmv });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={mode === "create" ? "Thêm dòng Sổ doanh thu" : "Chỉnh sửa dòng Sổ doanh thu"}
    >
      {rowMeta?.loaiNhap && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={rowMeta.loaiNhap === "tu_dong" ? "primary" : "neutral"}>
            {rowMeta.loaiNhap === "tu_dong" ? "Tự động (M3)" : "Điền tay"}
          </Badge>
          {rowMeta.maDonHang && (
            <span className="text-gmv-muted">Mã đơn: {rowMeta.maDonHang}</span>
          )}
          {rowMeta.crmOrderId && (
            <span className="text-gmv-muted">CRM: {rowMeta.crmOrderId}</span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gmv-muted">Thông tin chính</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="User Name">
            <Input
              value={form.tenKhach ?? ""}
              onChange={(e) => patch("tenKhach", e.target.value)}
              placeholder="Tên khách"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.sdt ?? ""}
              onChange={(e) => patch("sdt", e.target.value)}
              placeholder="84-9xx xxx xxx"
            />
          </Field>
          <Field label="UID">
            <Input
              value={form.uid ?? ""}
              onChange={(e) => patch("uid", e.target.value)}
              placeholder="CRM UID"
            />
          </Field>
          <Field label="Pay Time (ngày tiền về)">
            <Input
              type="date"
              required
              value={form.ngayTienVe}
              onChange={(e) => patch("ngayTienVe", e.target.value)}
            />
          </Field>
          <Field label="Real Pay (VND)">
            <VndInput
              value={form.soTienVnd ?? 0}
              onChange={(n) => patch("soTienVnd", n)}
              placeholder="VD: 12.875.000"
            />
          </Field>
          <Field label="Payment method">
            <Input
              value={form.paymentMethod ?? ""}
              onChange={(e) => patch("paymentMethod", e.target.value)}
              placeholder="1st, tiền mặt, CK…"
            />
          </Field>
          <Field label="Type">
            <Input
              value={form.loai ?? ""}
              onChange={(e) => patch("loai", e.target.value)}
              placeholder="KOC, Refer…"
            />
          </Field>
          <Field label="Sales">
            <Input
              value={form.saleCrmName ?? ""}
              onChange={(e) => patch("saleCrmName", e.target.value)}
              placeholder="Tên sale CRM"
            />
          </Field>
          <Field label="Team">
            <select
              className="gmv-field w-full min-h-10 rounded-gmv-md border border-gmv-border px-3 text-sm"
              value={form.team ?? ""}
              onChange={(e) => patch("team", e.target.value)}
            >
              <option value="">— Chọn team —</option>
              {TEAM_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-gmv-muted">Chi tiết bổ sung</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Package (gói học)">
            <Input
              value={form.goiHoc ?? ""}
              onChange={(e) => patch("goiHoc", e.target.value)}
              placeholder="Gói học"
            />
          </Field>
          <Field label="GMV (RMB)">
            <Input
              type="text"
              inputMode="decimal"
              value={rmbText}
              onChange={(e) => setRmbText(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="Tự tính VND ÷ 3700 nếu để trống"
            />
          </Field>
          <Field label="Type 2">
            <Input
              value={form.loai2 ?? ""}
              onChange={(e) => patch("loai2", e.target.value)}
            />
          </Field>
          <Field label="Ghi chú">
            <Input
              value={form.note ?? ""}
              onChange={(e) => patch("note", e.target.value)}
              placeholder="Tiền mặt, nguồn…"
            />
          </Field>
          <Field label="Note 2" className="sm:col-span-2">
            <Input
              value={form.note2 ?? ""}
              onChange={(e) => patch("note2", e.target.value)}
            />
          </Field>
        </div>

        <p className="text-xs text-gmv-muted">RMB mặc định = VND ÷ 3700 khi không nhập GMV (RMB).</p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-gmv-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang lưu…" : mode === "create" ? "Thêm dòng" : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
