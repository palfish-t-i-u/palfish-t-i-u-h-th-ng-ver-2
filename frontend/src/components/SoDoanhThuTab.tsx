import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import type { LedgerCreatePayload, LedgerPatchPayload, RevenueLedgerRow } from "../types/revenue";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { Input } from "./ui/Input";
import { Table, TableWrap, Td, Th, Tr } from "./ui/Table";

const TEAM_OPTIONS = ["Inhouse 1", "Inhouse 2", "HCM (Online)", "Khác"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function fmtRmb(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
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

export default function SoDoanhThuTab() {
  const [rows, setRows] = useState<RevenueLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loaiFilter, setLoaiFilter] = useState("");
  const [draft, setDraft] = useState<LedgerCreatePayload>(emptyDraft);
  const [savingId, setSavingId] = useState<string | null>(null);

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
    try {
      const res = await endpoints.revenue.createLedger(draft);
      setRows((prev) => [res.data, ...prev]);
      setDraft(emptyDraft());
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
          <Input placeholder="VND" type="number" value={draft.soTienVnd || ""} onChange={(e) => setDraft({ ...draft, soTienVnd: Number(e.target.value) })} />
          <Input placeholder="Gói học" value={draft.goiHoc} onChange={(e) => setDraft({ ...draft, goiHoc: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2">
          <Input placeholder="Ghi chú (tiền mặt, …)" className="flex-1" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <Button onClick={handleCreate}>Thêm dòng</Button>
        </div>
        <p className="mt-2 text-xs text-gmv-muted">RMB tự tính VND ÷ 3700. Có thể sửa RMB trên bảng sau khi thêm.</p>
      </div>

      <TableWrap>
        <Table>
          <thead>
            <Tr>
              <Th>Ngày tiền về</Th>
              <Th>Loại</Th>
              <Th>Khách / Sale</Th>
              <Th>Team</Th>
              <Th>VND</Th>
              <Th>GMV (RMB)</Th>
              <Th>Mã đơn</Th>
              <Th>Ghi chú</Th>
            </Tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <Tr>
                <Td colSpan={8} className="text-center text-gmv-muted">Chưa có dòng — thêm tay hoặc xác nhận M3.</Td>
              </Tr>
            )}
            {rows.map((row) => (
              <Tr key={row.id} className={savingId === row.id ? "opacity-60" : ""}>
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
                  <input
                    className="w-28 rounded border border-gmv-border px-2 py-1 text-sm text-right"
                    defaultValue={String(row.soTienVnd)}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0;
                      if (n !== row.soTienVnd) patchField(row, { soTienVnd: n });
                    }}
                  />
                  <div className="text-xs text-gmv-muted">{fmtVnd(row.soTienVnd)}</div>
                </Td>
                <Td>
                  <input
                    className="w-24 rounded border border-gmv-border px-2 py-1 text-sm text-right"
                    defaultValue={String(row.gmvRmb)}
                    onBlur={(e) => {
                      const n = parseFloat(e.target.value) || 0;
                      if (n !== row.gmvRmb) patchField(row, { gmvRmb: n });
                    }}
                  />
                  <div className="text-xs text-gmv-muted">{fmtRmb(row.gmvRmb)}</div>
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
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
