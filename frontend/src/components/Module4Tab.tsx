import { useCallback, useEffect, useMemo, useState } from "react";
import { endpoints } from "../lib/api";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import type { InvoiceOrder } from "../types/order";
import { usePermission } from "../hooks/usePermission";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { Table, TableWrap, Td, Th, Tr } from "./ui/Table";

type InvoiceTab = "pending" | "issued";

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " VND";
}

function fmtDate(s?: string) {
  if (!s) return "-";
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
  const { readOnly } = usePermission("module4");
  const [activeTab, setActiveTab] = useState<InvoiceTab>("pending");
  const [pendingOrders, setPendingOrders] = useState<InvoiceOrder[]>([]);
  const [issuedOrders, setIssuedOrders] = useState<InvoiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pendingRes, issuedRes] = await Promise.all([
        endpoints.invoice.getM4Queue(),
        endpoints.invoice.getM4Issued(),
      ]);
      setPendingOrders(pendingRes.data.orders);
      setIssuedOrders(issuedRes.data.orders);
    } catch (e: unknown) {
      setError("Khong tai duoc du lieu hoa don.");
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeTable(["active_requests"], load);
  useRefetchOnFocus(load);

  const rows = activeTab === "pending" ? pendingOrders : issuedOrders;
  const pendingTotal = useMemo(
    () => pendingOrders.reduce((s, o) => s + o.tongTien, 0),
    [pendingOrders]
  );
  const issuedTotal = useMemo(
    () => issuedOrders.reduce((s, o) => s + o.tongTien, 0),
    [issuedOrders]
  );

  async function handleCancel(order: InvoiceOrder) {
    setCancelling((prev) => ({ ...prev, [order.id]: true }));
    setError("");
    try {
      await endpoints.invoice.cancelM4Queue(order.id);
      setPendingOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || `Huy queue don ${order.maDonHang} that bai.`);
    } finally {
      setCancelling((prev) => ({ ...prev, [order.id]: false }));
    }
  }

  async function handleExport() {
    setConfirmExport(false);
    setExporting(true);
    setError("");
    const orderIds = pendingOrders.map((o) => o.id);
    try {
      const res = await endpoints.invoice.exportBatch(orderIds);
      const blob = res.data;
      const disposition =
        (res as unknown as { headers?: Record<string, string> }).headers?.["content-disposition"] ?? "";
      const match = disposition.match(/filename=\"([^\"]+)\"/);
      const filename =
        match?.[1] ?? `hoa_don_thue_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.zip`;
      downloadBlob(blob, filename);
      await load();
      setActiveTab("issued");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Xuat hoa don that bai. Vui long thu lai.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gmv-text-strong">Xuat hoa don thue - M4</h2>
          <p className="text-xs text-gmv-muted">
            Tab Cho xuat chi du lieu pending. Tab Da xuat chi lich su da cap ma.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load} disabled={loading || exporting}>
            {loading ? "Dang tai..." : "Lam moi"}
          </Button>
          {!readOnly && (
            <Button
              variant="primary"
              size="md"
              disabled={activeTab !== "pending" || pendingOrders.length === 0 || loading || exporting}
              onClick={() => setConfirmExport(true)}
              className="font-bold"
            >
              {exporting ? "Dang xuat..." : "Tai hoa don"}
            </Button>
          )}
        </div>
      </div>

      <div className="inline-flex rounded-gmv-md border border-gmv-border bg-gmv-canvas p-1">
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`rounded-gmv-sm px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === "pending"
              ? "bg-gmv-primary text-white"
              : "text-gmv-muted hover:bg-gmv-bg hover:text-gmv-text-strong"
          }`}
        >
          Cho xuat
          <span className="ml-1">{pendingOrders.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("issued")}
          className={`rounded-gmv-sm px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === "issued"
              ? "bg-gmv-primary text-white"
              : "text-gmv-muted hover:bg-gmv-bg hover:text-gmv-text-strong"
          }`}
        >
          Da xuat
          <span className="ml-1">{issuedOrders.length}</span>
        </button>
      </div>

      {confirmExport && (
        <div className="rounded-gmv-md border border-gmv-primary/30 bg-gmv-primary-soft px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-gmv-text-strong">
            Xac nhan xuat {pendingOrders.length} hoa don pending?
          </p>
          <p className="mb-3 text-xs text-gmv-muted">
            Batch chi gom don dang Cho xuat. Tong tien: <strong>{fmt(pendingTotal)}</strong>.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleExport}>
              Xac nhan - Tai xuong ZIP
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmExport(false)}>
              Huy
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-gmv-md border border-gmv-danger/30 bg-gmv-danger-soft px-4 py-2.5 text-sm text-gmv-danger">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Badge tone="primary">Cho xuat: {pendingOrders.length}</Badge>
        <Badge tone="ok">Tong pending: {fmt(pendingTotal)}</Badge>
        <Badge tone="neutral">Da xuat: {issuedOrders.length}</Badge>
        <Badge tone="neutral">Tong da xuat: {fmt(issuedTotal)}</Badge>
      </div>

      {!loading && rows.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-gmv-md border border-dashed border-gmv-border bg-gmv-canvas py-16 text-gmv-muted">
          <p className="text-sm font-medium">
            {activeTab === "pending" ? "Khong co don cho xuat" : "Chua co don da xuat"}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th className="w-8">STT</Th>
                <Th className="text-left">Ma don</Th>
                <Th className="text-left">Khach hang</Th>
                <Th className="text-left">SDT</Th>
                <Th className="text-left">Ten SP thue</Th>
                <Th className="text-left">CRM Order ID</Th>
                <Th className="text-left">Ma hoa don</Th>
                <Th className="text-left">Ma san pham</Th>
                <Th>So tien</Th>
                <Th>Ngay M3</Th>
                <Th className="w-24">Thao tac</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o, idx) => {
                const isCancelling = cancelling[o.id] ?? false;
                return (
                  <Tr key={o.id}>
                    <Td className="text-gmv-muted">{idx + 1}</Td>
                    <Td className="text-left font-mono text-xs">{o.maDonHang}</Td>
                    <Td className="text-left font-medium">{o.tenKhach || "-"}</Td>
                    <Td className="text-left text-xs text-gmv-muted">{o.sdt || "-"}</Td>
                    <Td className="max-w-[220px] truncate text-left text-xs font-medium text-gmv-text-strong">
                      {o.taxProductName || o.goiHoc || "-"}
                    </Td>
                    <Td className="text-left font-mono text-xs text-gmv-muted">
                      {o.crmOrderId || "-"}
                    </Td>
                    <Td className="text-left font-mono text-xs text-gmv-muted">
                      {o.taxInvoiceCode || "-"}
                    </Td>
                    <Td className="text-left font-mono text-xs text-gmv-muted">
                      {o.taxProductCode || "-"}
                    </Td>
                    <Td className="whitespace-nowrap font-medium text-gmv-ok">{fmt(o.tongTien)}</Td>
                    <Td className="whitespace-nowrap text-xs text-gmv-muted">{fmtDate(o.m3ApprovedAt)}</Td>
                    <Td>
                      {activeTab === "pending" && !readOnly ? (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isCancelling || exporting}
                          onClick={() => handleCancel(o)}
                        >
                          {isCancelling ? "..." : "Huy queue"}
                        </Button>
                      ) : (
                        <span className="text-xs text-gmv-muted">-</span>
                      )}
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
