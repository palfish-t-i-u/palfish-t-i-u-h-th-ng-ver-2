import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import type { InvoiceOrder } from "../types/order";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { Table, TableWrap, Td, Th, Tr } from "./ui/Table";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Module4Tab() {
  const [orders, setOrders] = useState<InvoiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.invoice.getM4Queue();
      setOrders(res.data.orders);
    } catch (e: unknown) {
      setError("Không tải được danh sách hàng đợi xuất hóa đơn.");
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel(order: InvoiceOrder) {
    setCancelling((prev) => ({ ...prev, [order.id]: true }));
    setError("");
    try {
      await endpoints.invoice.cancelM4Queue(order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || `Hủy queue đơn ${order.maDonHang} thất bại.`);
    } finally {
      setCancelling((prev) => ({ ...prev, [order.id]: false }));
    }
  }

  async function handleExport() {
    setConfirmExport(false);
    setExporting(true);
    setError("");
    try {
      const res = await endpoints.invoice.exportBatch();
      const blob = res.data;

      // Lấy filename từ header nếu có, fallback sang tên cứng
      const disposition = (res as unknown as { headers?: Record<string, string> }).headers?.["content-disposition"] ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `hoa_don_thue_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.zip`;

      downloadBlob(blob, filename);
      // Reload — sau export tất cả đơn đã chuyển sang DA_XUAT_HD
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Xuất hóa đơn thất bại. Vui lòng thử lại.");
    } finally {
      setExporting(false);
    }
  }

  const totalAmount = orders.reduce((s, o) => s + o.tongTien, 0);

  return (
    <div className="space-y-4">
      {/* Header + nút TẢI HÓA ĐƠN */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gmv-text-strong">
            Xuất hóa đơn thuế — M4
          </h2>
          <p className="text-xs text-gmv-muted">
            Đơn đã qua M3 — mã M... và PF... sẽ được chốt cứng khi bấm Tải hóa đơn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load} disabled={loading || exporting}>
            {loading ? "Đang tải…" : "Làm mới"}
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={orders.length === 0 || exporting || loading}
            onClick={() => setConfirmExport(true)}
            className="font-bold"
          >
            {exporting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Đang xuất…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                TẢI HÓA ĐƠN
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmExport && (
        <div className="rounded-gmv-md border border-gmv-primary/30 bg-gmv-primary-soft px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-gmv-text-strong">
            Xác nhận xuất {orders.length} hóa đơn?
          </p>
          <p className="mb-3 text-xs text-gmv-muted">
            Hệ thống sẽ cấp mã <strong>M...</strong> và <strong>PF...</strong> cho{" "}
            <strong>{orders.length} đơn</strong>, tổng tiền{" "}
            <strong>{fmt(totalAmount)}</strong>. Thao tác này <strong>không thể hoàn tác</strong>.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleExport}>
              Xác nhận — Tải xuống ZIP
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmExport(false)}>
              Hủy
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-gmv-md border border-gmv-danger/30 bg-gmv-danger-soft px-4 py-2.5 text-sm text-gmv-danger">
          {error}
        </div>
      )}

      {/* Summary badges */}
      {orders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge tone="primary">{orders.length} đơn trong queue</Badge>
          <Badge tone="ok">Tổng: {fmt(totalAmount)}</Badge>
        </div>
      )}

      {/* Empty */}
      {!loading && orders.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-gmv-md border border-dashed border-gmv-border bg-gmv-canvas py-16 text-gmv-muted">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-gmv-muted/50">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <p className="text-sm font-medium">Queue trống</p>
          <p className="mt-1 text-xs">Chưa có đơn nào qua bước M3 đang chờ xuất hóa đơn.</p>
        </div>
      )}

      {/* Table */}
      {orders.length > 0 && (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th className="w-8">STT</Th>
                <Th className="text-left">Mã đơn</Th>
                <Th className="text-left">Khách hàng</Th>
                <Th className="text-left">SĐT</Th>
                <Th className="text-left">Tên SP thuế</Th>
                <Th className="text-left">Mã CRM Order</Th>
                <Th>Số tiền</Th>
                <Th>Ngày M3</Th>
                <Th className="w-24">Thao tác</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, idx) => {
                const isCancelling = cancelling[o.id] ?? false;
                return (
                  <Tr key={o.id}>
                    <Td className="text-gmv-muted">{idx + 1}</Td>
                    <Td className="text-left font-mono text-xs">{o.maDonHang}</Td>
                    <Td className="text-left font-medium">{o.tenKhach || "—"}</Td>
                    <Td className="text-left text-xs text-gmv-muted">{o.sdt || "—"}</Td>
                    <Td className="max-w-[200px] truncate text-left text-xs font-medium text-gmv-text-strong">
                      {o.taxProductName || (
                        <span className="italic text-gmv-muted">Chưa điền</span>
                      )}
                    </Td>
                    <Td className="text-left font-mono text-xs text-gmv-muted">
                      {o.crmOrderId || "—"}
                    </Td>
                    <Td className="whitespace-nowrap font-medium text-gmv-ok">
                      {fmt(o.tongTien)}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-gmv-muted">
                      {fmtDate(o.m3ApprovedAt)}
                    </Td>
                    <Td>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={isCancelling}
                        onClick={() => handleCancel(o)}
                      >
                        {isCancelling ? "…" : "Hủy Queue"}
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
