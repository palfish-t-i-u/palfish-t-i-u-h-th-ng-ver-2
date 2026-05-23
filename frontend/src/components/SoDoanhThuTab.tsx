import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import { cn } from "../lib/cn";
import { formatVndNumber } from "../lib/vndFormat";
import { formatLoaiLabel } from "../lib/loaiLabel";
import type { LedgerPatchPayload, RevenueLedgerRow } from "../types/revenue";
import LedgerFormModal, {
  emptyLedgerForm,
  type LedgerFormState,
} from "./LedgerFormModal";
import LedgerSummaryCards from "./LedgerSummaryCards";
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

function fmtPayTime(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function rowToForm(row: RevenueLedgerRow): LedgerFormState {
  return {
    ngayTienVe: row.ngayTienVe,
    tenKhach: row.tenKhach,
    sdt: row.sdt,
    uid: row.uid,
    goiHoc: row.goiHoc,
    soTienVnd: row.soTienVnd,
    gmvRmb: row.gmvRmb,
    saleCrmName: row.saleCrmName,
    team: row.team,
    loai: row.loai,
    loai2: row.loai2,
    note: row.note,
    note2: row.note2,
    paymentMethod: row.paymentMethod,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function orderIdDisplay(row: RevenueLedgerRow) {
  return row.crmOrderId || row.maDonHang || "—";
}

export default function SoDoanhThuTab() {
  const [rows, setRows] = useState<RevenueLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loaiFilter, setLoaiFilter] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [modalInitial, setModalInitial] = useState<LedgerFormState>(emptyLedgerForm());
  const [editRow, setEditRow] = useState<RevenueLedgerRow | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState("");

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

  function openCreate() {
    setModalMode("create");
    setEditRow(null);
    setModalInitial(emptyLedgerForm());
    setModalError("");
    setModalOpen(true);
  }

  function openEdit(row: RevenueLedgerRow) {
    setModalMode("edit");
    setEditRow(row);
    setModalInitial(rowToForm(row));
    setModalError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (modalSaving) return;
    setModalOpen(false);
    setEditRow(null);
    setModalError("");
  }

  async function handleModalSave(payload: LedgerFormState) {
    setModalSaving(true);
    setModalError("");
    setError("");
    const body: LedgerPatchPayload = {
      ngayTienVe: payload.ngayTienVe,
      tenKhach: payload.tenKhach,
      sdt: payload.sdt,
      uid: payload.uid,
      goiHoc: payload.goiHoc,
      soTienVnd: payload.soTienVnd,
      gmvRmb: payload.gmvRmb,
      paymentMethod: payload.paymentMethod,
      loai: payload.loai,
      loai2: payload.loai2,
      saleCrmName: payload.saleCrmName,
      team: payload.team,
      note: payload.note,
      note2: payload.note2,
    };
    try {
      if (modalMode === "create") {
        const res = await endpoints.revenue.createLedger({
          ...body,
          ngayTienVe: payload.ngayTienVe,
        });
        setRows((prev) => [res.data, ...prev]);
      } else if (editRow) {
        const res = await endpoints.revenue.patchLedger(editRow.id, body);
        setRows((prev) => prev.map((r) => (r.id === editRow.id ? res.data : r)));
      }
      setModalOpen(false);
      setEditRow(null);
    } catch {
      setModalError(modalMode === "create" ? "Không thêm được dòng mới." : "Lưu thất bại.");
    } finally {
      setModalSaving(false);
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

  function resetFilters() {
    setFrom("");
    setTo("");
    setLoaiFilter("");
  }

  const hasActiveFilter = Boolean(from || to || loaiFilter);

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
        <Button
          variant="ghost"
          onClick={() => {
            const t = todayIso();
            setFrom(t);
            setTo(t);
          }}
        >
          Hôm nay
        </Button>
        <Button variant="ghost" onClick={resetFilters} disabled={!hasActiveFilter}>
          Reset bộ lọc
        </Button>
        <Button onClick={openCreate}>+ Thêm dòng</Button>
      </div>

      <LedgerSummaryCards rows={rows} from={from} to={to} loading={loading} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <TableScrollWrap>
        <Table className="min-w-[1280px]">
          <thead>
            <Tr>
              <Th className={cn(stickyTableHead, stickyTableHeadTop, "min-w-[9rem]")}>User Name</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Phone</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>UID</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Pay Time</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop, "min-w-[8rem]")}>Real Pay (VND)</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop, "min-w-[10rem]")}>Nội dung CK</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop, "min-w-[7rem]")}>ID đơn hàng</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Payment method</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Type</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Sales</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop)}>Team</Th>
              <Th className={cn(stickyTableHead, stickyTableHeadTop, "min-w-[9rem]")}>Thao tác</Th>
            </Tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <Tr>
                <Td colSpan={12} className="text-center text-gmv-muted">
                  {hasActiveFilter
                    ? "Không có dòng trong khoảng đã lọc — thử Reset bộ lọc hoặc mở rộng ngày."
                    : "Chưa có dòng — bấm Thêm dòng hoặc xác nhận M3."}
                </Td>
              </Tr>
            )}
            {rows.map((row) => (
              <Tr key={row.id} className={deletingId === row.id ? "opacity-60" : ""}>
                <Td className="text-left">
                  <div className="font-medium text-gmv-text-strong">{row.tenKhach || "—"}</div>
                  <Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"} className="mt-1">
                    {row.loaiNhap === "tu_dong" ? "M3" : "Tay"}
                  </Badge>
                </Td>
                <Td className="text-left text-sm">{row.sdt || "—"}</Td>
                <Td className="text-left text-sm">{row.uid || "—"}</Td>
                <Td className="whitespace-nowrap text-sm">{fmtPayTime(row.ngayTienVe)}</Td>
                <Td className="text-right font-medium tabular-nums">
                  {formatVndNumber(row.soTienVnd) || "—"}
                </Td>
                <Td className="text-left text-xs font-mono">{row.infoCode || "—"}</Td>
                <Td className="text-left text-sm font-mono">{orderIdDisplay(row)}</Td>
                <Td className="text-left text-sm">{row.paymentMethod || "—"}</Td>
                <Td className="text-left text-sm">{formatLoaiLabel(row.loai)}</Td>
                <Td className="text-left text-sm">{row.saleCrmName || "—"}</Td>
                <Td className="text-left text-sm">{row.team || "—"}</Td>
                <Td>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(row)}>
                      Chỉnh sửa
                    </Button>
                    {row.loaiNhap === "tay" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        disabled={deletingId === row.id}
                        onClick={() => handleDelete(row)}
                      >
                        {deletingId === row.id ? "…" : "Xóa"}
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableScrollWrap>

      <LedgerFormModal
        open={modalOpen}
        mode={modalMode}
        initial={modalInitial}
        rowMeta={
          editRow
            ? {
                loaiNhap: editRow.loaiNhap,
                maDonHang: editRow.maDonHang,
                crmOrderId: editRow.crmOrderId,
              }
            : undefined
        }
        saving={modalSaving}
        error={modalError}
        onClose={closeModal}
        onSave={handleModalSave}
      />
    </div>
  );
}
