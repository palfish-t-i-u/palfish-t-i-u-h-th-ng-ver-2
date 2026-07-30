import { useEffect, useState, type ReactNode } from "react";
import { endpoints } from "../lib/api";
import { cn } from "../lib/cn";
import {
  formatLoaiLabel,
  LEDGER_LOAI2_OPTIONS,
  ledgerLoaiSelectOptions,
  ledgerPaymentSelectOptions,
  LEDGER_VND_RMB_RATE,
} from "../lib/loaiLabel";
import { digitsOnly, formatVndInput, parseVndInput } from "../lib/vndFormat";
import type { LedgerCreatePayload, LoaiNhap } from "../types/revenue";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Combobox from "./ui/Combobox";
import { Input } from "./ui/Input";
import Modal from "./ui/Modal";
import { HdsdLink } from "./help/HdsdLink";

const PACKAGES_DATALIST_ID = "ledger-packages-datalist";

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
  const [packages, setPackages] = useState<string[]>([]);

  const loaiOptions = ledgerLoaiSelectOptions();
  const paymentOptions = ledgerPaymentSelectOptions();

  useEffect(() => {
    if (open) {
      setForm(initial);
      setRmbText(initial.gmvRmb != null && initial.gmvRmb > 0 ? String(initial.gmvRmb) : "");
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    endpoints.packages
      .list()
      .then((res) => setPackages(res.data.packages))
      .catch(() => setPackages([]));
  }, [open]);

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
      headerExtra={<HdsdLink moduleSlug="revenueLedger" topicSlug="tao-sua-dong-so" />}
    >
      {rowMeta?.loaiNhap && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={rowMeta.loaiNhap === "tu_dong" ? "primary" : "neutral"}>
            {rowMeta.loaiNhap === "tu_dong" ? "Tự động" : "Thủ công"}
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
          <Field label="Lần thanh toán">
            <Combobox
              value={form.paymentMethod ?? ""}
              onChange={(v) => patch("paymentMethod", v)}
              options={
                form.paymentMethod &&
                !paymentOptions.some((o) => o.value === form.paymentMethod)
                  ? [
                      { value: form.paymentMethod, label: form.paymentMethod },
                      ...paymentOptions,
                    ]
                  : paymentOptions
              }
              placeholder="Gõ 11 → 11th, hoặc chọn 1st…20th"
              emptyLabel="— Chọn —"
              matchDigitsToOrdinal
            />
          </Field>
          <Field label="Loại / Type">
            <Combobox
              value={form.loai ?? ""}
              onChange={(v) => patch("loai", v)}
              options={
                form.loai && !loaiOptions.some((o) => o.value === form.loai)
                  ? [{ value: form.loai, label: formatLoaiLabel(form.loai) }, ...loaiOptions]
                  : loaiOptions
              }
              placeholder="Chọn loại (mỗi nhãn một lần)"
              emptyLabel="— Chọn loại —"
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
              list={PACKAGES_DATALIST_ID}
              value={form.goiHoc ?? ""}
              onChange={(e) => patch("goiHoc", e.target.value)}
              placeholder="Gõ để tìm gói học (cùng danh sách Tab QR)…"
            />
            <datalist id={PACKAGES_DATALIST_ID}>
              {packages.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
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
          <Field label="Loại 2 (kênh con)">
            <select
              className="gmv-field w-full min-h-10 rounded-gmv-md border border-gmv-border px-3 text-sm"
              value={form.loai2 ?? ""}
              onChange={(e) => patch("loai2", e.target.value)}
            >
              <option value="">— Không / trống —</option>
              {LEDGER_LOAI2_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {formatLoaiLabel(v)}
                </option>
              ))}
              {form.loai2 &&
                !(LEDGER_LOAI2_OPTIONS as readonly string[]).includes(form.loai2) && (
                  <option value={form.loai2}>{formatLoaiLabel(form.loai2)}</option>
                )}
            </select>
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

        <p className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2 text-xs text-gmv-muted">
          Tỷ giá mặc định: 1 RMB = {LEDGER_VND_RMB_RATE.toLocaleString("vi-VN")} VND —{" "}
          <span className="font-medium text-gmv-text">
            GMV (RMB) = Real Pay (VND) ÷ {LEDGER_VND_RMB_RATE}
          </span>{" "}
          khi không nhập GMV (RMB) trong form.
        </p>

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
