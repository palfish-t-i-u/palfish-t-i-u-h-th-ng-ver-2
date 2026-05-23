import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import { cn } from "../lib/cn";
import { digitsOnly, formatVndInput, parseVndInput } from "../lib/vndFormat";
import type { LedgerCreatePayload, LedgerPatchPayload, RevenueLedgerRow } from "../types/revenue";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { Input } from "./ui/Input";
import {
  Table,
  TableScrollWrap,
  Td,
  Th,
  Tr,
  stickyTableHead,
  stickyTableHeadTop,
} from "./ui/Table";

const TEAM_OPTIONS = ["Inhouse 1", "Inhouse 2", "HCM (Online)", "Khác"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const emptyDraft = (): LedgerCreatePayload => ({
  ngayTienVe: todayIso(),
  tenKhach: "",
  sdt: "",
  uid: "",
  goiHoc: "",
  soTienVnd: 0,
  saleCrmName: "",
  team: "",
  loai: "",
  loai2: "",
  note: "",
  paymentMethod: "",
});

function VndField({
  value,
  onChange,
  onCommit,
  className,
  placeholder,
}: {
  value: number;
  onChange?: (n: number) => void;
  onCommit?: (n: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(() => (value ? digitsOnly(String(value)) : ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setRaw(value ? digitsOnly(String(Math.trunc(value))) : "");
    }
  }, [value, focused]);

  const commit = useCallback(
    (nextRaw: string) => {
      const n = parseVndInput(nextRaw);
      onChange?.(n);
      onCommit?.(n);
    },
    [onChange, onCommit]
  );

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      className={cn("tabular-nums text-right", className)}
      value={formatVndInput(raw)}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const next = digitsOnly(e.target.value);
        setRaw(next);
        onChange?.(parseVndInput(next));
      }}
      onBlur={() => {
        setFocused(false);
        commit(raw);
      }}
    />
  );
}

function RmbField({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => (value ? String(value) : ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(value ? String(value) : "");
    }
  }, [value, focused]);

  const display = focused
    ? text
    : value
      ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "";

  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cn("tabular-nums text-right", className)}
      value={display}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))}
      onBlur={() => {
        setFocused(false);
        const n = parseFloat(text.replace(/,/g, "")) || 0;
        if (n !== value) onCommit(n);
      }}
    />
  );
}

export default function SoDoanhThuTab() {
  const [rows, setRows] = useState<RevenueLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loaiFilter, setLoaiFilter] = useState("");
  const [draft, setDraft] = useState<LedgerCreatePayload>(emptyDraft);
  const [draftVnd, setDraftVnd] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.revenue.listLedger({
        from: from || undefined,
        to: to || undefined,
        loai_nhap: loaiFilter || undefined,
      });
      setRows(res.data.rows);
    } catch {
      setError("Không tải được Sổ doanh thu.");
    } finally {
      setLoading(false);
    }
  }, [from, to, loaiFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setError("");
    const payload = { ...draft, soTienVnd: draftVnd };
    try {
      const res = await endpoints.revenue.createLedger(payload);
      setRows((prev) => [res.data, ...prev]);
      setDraft(emptyDraft());
      setDraftVnd(0);
    } catch {
      setError("Không thêm được dòng mới.");
    }
  }

  async function patchField(row: RevenueLedgerRow, patch: LedgerPatchPayload) {
    setSavingId(row.id);
    try {
      const res = await endpoints.revenue.patchLedger(row.id, patch);
      setRows((prev) => prev.map((r) => (r.id === row.id ? res.data : r)));
    } catch {
      setError("Lưu thất bại.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(row: RevenueLedgerRow) {
    const label = row.tenKhach || row.maDonHang || "dòng này";
    if (!window.confirm(`Xóa dòng "${label}"? Không khôi phục được.`)) return;
    setError("");
    setDeletingId(row.id);
    try {
      await endpoints.revenue.deleteLedger(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      setError("Không xóa được dòng.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gmv-muted">
          Từ ngày
          <Input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm text-gmv-muted">
          Đến ngày
          <Input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-sm text-gmv-muted">
          Nguồn dòng
          <select
            className="mt-1 block min-h-10 rounded-gmv-md border border-gmv-border px-3 text-sm"
            value={loaiFilter}
            onChange={(e) => setLoaiFilter(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="tu_dong">Tự động (M3)</option>
            <option value="tay">Điền tay</option>
          </select>
        </label>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới"}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-gmv-lg border border-gmv-border bg-gmv-canvas p-4 shadow-gmv-1">
        <h3 className="mb-3 text-sm font-semibold text-gmv-text-strong">Thêm dòng tay</h3>
        <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-6">
          <Input type="date" value={draft.ngayTienVe} onChange={(e) => setDraft({ ...draft, ngayTienVe: e.target.value })} />
          <Input placeholder="Tên khách" value={draft.tenKhach} onChange={(e) => setDraft({ ...draft, tenKhach: e.target.value })} />
          <Input placeholder="Sale (CRM)" value={draft.saleCrmName} onChange={(e) => setDraft({ ...draft, saleCrmName: e.target.value })} />
          <select
            className="min-h-10 rounded-gmv-md border border-gmv-border px-3 text-sm"
            value={draft.team}
            onChange={(e) => setDraft({ ...draft, team: e.target.value })}
          >
            <option value="">Team</option>
            {TEAM_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <VndField
            placeholder="VND (VD: 12.875.000)"
            value={draftVnd}
            onChange={setDraftVnd}
          />
          <Input placeholder="Gói học" value={draft.goiHoc} onChange={(e) => setDraft({ ...draft, goiHoc: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2">
          <Input placeholder="Ghi chú (tiền mặt, …)" className="flex-1" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <Button onClick={handleCreate}>Thêm dòng</Button>
        </div>
        <p className="mt-2 text-xs text-gmv-muted">RMB tự tính VND ÷ 3700. Có thể sửa RMB trên bảng sau khi thêm.</p>
      </div>

      <TableScrollWrap>
        <Table>
          <thead>
            <Tr>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Ngày tiền về</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Loại</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Khách / Sale</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Team</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop, "min-w-[11rem]")}>VND</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop, "min-w-[8rem]")}>GMV (RMB)</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Mã đơn</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Ghi chú</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop, "w-20")} />
            </Tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <Tr>
                <Td colSpan={9} className="text-center text-gmv-muted">Chưa có dòng — thêm tay hoặc xác nhận M3.</Td>
              </Tr>
            )}
            {rows.map((row) => (
              <Tr key={row.id} className={savingId === row.id || deletingId === row.id ? "opacity-60" : ""}>
                <Td>
                  <input
                    type="date"
                    className="w-36 rounded border border-gmv-border px-2 py-1 text-sm"
                    defaultValue={row.ngayTienVe}
                    onBlur={(e) => e.target.value !== row.ngayTienVe && patchField(row, { ngayTienVe: e.target.value })}
                  />
                </Td>
                <Td>
                  <Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"}>
                    {row.loaiNhap === "tu_dong" ? "M3" : "Tay"}
                  </Badge>
                </Td>
                <Td>
                  <div className="space-y-1">
                    <input
                      className="w-full min-w-[8rem] rounded border border-gmv-border px-2 py-1 text-sm"
                      defaultValue={row.tenKhach}
                      onBlur={(e) => e.target.value !== row.tenKhach && patchField(row, { tenKhach: e.target.value })}
                    />
                    <input
                      className="w-full min-w-[8rem] rounded border border-gmv-border px-2 py-1 text-xs"
                      placeholder="Sale"
                      defaultValue={row.saleCrmName}
                      onBlur={(e) => e.target.value !== row.saleCrmName && patchField(row, { saleCrmName: e.target.value })}
                    />
                  </div>
                </Td>
                <Td>
                  <select
                    className="min-w-[7rem] rounded border border-gmv-border px-2 py-1 text-sm"
                    defaultValue={row.team}
                    onChange={(e) => patchField(row, { team: e.target.value })}
                  >
                    <option value="">—</option>
                    {TEAM_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Td>
                <Td>
                  <VndField
                    className="min-w-[10rem] py-1"
                    value={row.soTienVnd}
                    onCommit={(n) => n !== row.soTienVnd && patchField(row, { soTienVnd: n })}
                  />
                </Td>
                <Td>
                  <RmbField
                    className="min-w-[7rem] py-1"
                    value={row.gmvRmb}
                    onCommit={(n) => n !== row.gmvRmb && patchField(row, { gmvRmb: n })}
                  />
                </Td>
                <Td className="text-xs">
                  {row.maDonHang || "—"}
                  {row.crmOrderId && <div className="text-gmv-muted">CRM: {row.crmOrderId}</div>}
                </Td>
                <Td>
                  <input
                    className="w-full min-w-[6rem] rounded border border-gmv-border px-2 py-1 text-sm"
                    defaultValue={row.note}
                    onBlur={(e) => e.target.value !== row.note && patchField(row, { note: e.target.value })}
                  />
                </Td>
                <Td>
                  {row.loaiNhap === "tay" ? (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={deletingId === row.id}
                      onClick={() => handleDelete(row)}
                    >
                      {deletingId === row.id ? "…" : "Xóa"}
                    </Button>
                  ) : (
                    <span className="text-gmv-muted">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableScrollWrap>
    </div>
  );
}
