import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import type { InvoiceOrder } from "../types/order";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { Table, TableWrap, Td, Th, Tr } from "./ui/Table";

const STATUS_DONE = ["CHO_XUAT_HD", "DA_XUAT_HD"];

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

function fmtMoney(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

function fmtSdt(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length === 11) return `84-${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length === 10) return `84-${digits.slice(1)}`;
  if (digits.length === 9) return `84-${digits}`;
  return raw || "—";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "DA_XUAT_HD") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
        Đã xuất
      </span>
    );
  }
  if (status === "CHO_XUAT_HD") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600 ring-1 ring-amber-200">
        Chờ xuất
      </span>
    );
  }
  return null;
}

export default function Module3Tab() {
  const [orders, setOrders] = useState<InvoiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [crmEdits, setCrmEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState<Record<string, boolean>>({});
  const [saveOk, setSaveOk] = useState<Record<string, boolean>>({});
  const [exportingBatch, setExportingBatch] = useState(false);
  const [confirmBatchExport, setConfirmBatchExport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await endpoints.invoice.getM3Pending();
      setOrders(res.data.orders);
      setCrmEdits((prev) => {
        const next = { ...prev };
        for (const o of res.data.orders) {
          if (next[o.id] === undefined) next[o.id] = o.crmOrderId || "";
        }
        return next;
      });
    } catch (e: unknown) {
      setError("Không tải được danh sách đơn hàng.");
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSaveCrm(order: InvoiceOrder) {
    setSaving((p) => ({ ...p, [order.id]: true }));
    setSaveOk((p) => ({ ...p, [order.id]: false }));
    setError("");
    try {
      await endpoints.invoice.saveM3CrmId(order.id, crmEdits[order.id] ?? "");
      setSaveOk((p) => ({ ...p, [order.id]: true }));
      setOrders((prev) =>
        prev.map((o) => o.id === order.id ? { ...o, crmOrderId: crmEdits[order.id] ?? "" } : o)
      );
      setTimeout(() => setSaveOk((p) => ({ ...p, [order.id]: false })), 2500);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || `Lưu đơn ${order.maDonHang} thất bại.`);
    } finally {
      setSaving((p) => ({ ...p, [order.id]: false }));
    }
  }

  async function handleExport(order: InvoiceOrder) {
    setExporting((p) => ({ ...p, [order.id]: true }));
    setError("");
    try {
      const taxProductName = order.goiHoc || order.maDonHang;
      const crmOrderId = crmEdits[order.id] ?? order.crmOrderId ?? "";
      const updated = await endpoints.invoice.approveM3Order(order.id, taxProductName, crmOrderId);
      setOrders((prev) =>
        prev.map((o) => o.id === order.id ? { ...o, ...updated.data } : o)
      );
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || `Xuất đơn ${order.maDonHang} thất bại.`);
    } finally {
      setExporting((p) => ({ ...p, [order.id]: false }));
    }
  }

  async function handleBatchExport() {
    setConfirmBatchExport(false);
    setExportingBatch(true);
    setError("");
    try {
      // Bước 1: bulk-approve tất cả đơn đang CHO_XAC_NHAN → CHO_XUAT_HD
      const waitingToApprove = orders.filter((o) => o.trangThaiThuTuc === "CHO_XAC_NHAN");
      if (waitingToApprove.length > 0) {
        await endpoints.invoice.approveBulk();
      }
      // Bước 2: xuất hóa đơn hàng loạt → tải ZIP
      const res = await endpoints.invoice.exportBatch();
      const blob = res.data;
      const disposition = (res as unknown as { headers?: Record<string, string> }).headers?.["content-disposition"] ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `hoa_don_thue_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.zip`;
      downloadBlob(blob, filename);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Xuất hóa đơn hàng loạt thất bại. Vui lòng thử lại.");
    } finally {
      setExportingBatch(false);
    }
  }

  const pending = orders.filter((o) => !STATUS_DONE.includes(o.trangThaiThuTuc));
  const done = orders.filter((o) => STATUS_DONE.includes(o.trangThaiThuTuc));
  // Đơn "còn xuất được" = CHO_XAC_NHAN + CHO_XUAT_HD (chưa hoàn tất DA_XUAT_HD)
  const exportableOrders = orders.filter((o) => o.trangThaiThuTuc !== "DA_XUAT_HD");
  const sorted = [...pending, ...done];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gmv-text-strong">Xác nhận CRM</h2>
          <p className="mt-0.5 text-xs text-gmv-muted">
            Các đơn hàng chỉ xuất hiện tại tab này khi được xác nhận đã thanh toán thành công
            (TT tiền về được confirm).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load} disabled={loading || exportingBatch}>
            {loading ? "Đang tải…" : "Làm mới"}
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={exportableOrders.length === 0 || exportingBatch || loading}
            onClick={() => setConfirmBatchExport(true)}
            className="font-bold"
          >
            {exportingBatch ? (
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
                Xuất hóa đơn hàng loạt
                {exportableOrders.length > 0 && (
                  <Badge tone="ok" className="ml-1">{exportableOrders.length}</Badge>
                )}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Confirm batch export dialog */}
      {confirmBatchExport && (
        <div className="rounded-gmv-md border border-gmv-primary/30 bg-gmv-primary-soft px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-gmv-text-strong">
            Xác nhận xuất hóa đơn hàng loạt cho {exportableOrders.length} đơn?
          </p>
          <p className="mb-3 text-xs text-gmv-muted">
            {pending.length > 0 && (
              <><strong>{pending.length} đơn</strong> đang chờ xác nhận sẽ được tự động duyệt qua M3.{" "}</>
            )}
            Hệ thống sẽ cấp mã <strong>M...</strong> và <strong>PF...</strong> cho toàn bộ{" "}
            <strong>{exportableOrders.length} đơn</strong> chưa xuất.
            Thao tác này <strong>không thể hoàn tác</strong>.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleBatchExport}>
              Xác nhận — Tải xuống ZIP
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmBatchExport(false)}>
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

      {/* Empty */}
      {!loading && orders.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-gmv-md border border-dashed border-gmv-border bg-gmv-canvas py-16 text-gmv-muted">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <p className="text-sm font-medium">Không có đơn nào có tiền về</p>
        </div>
      )}

      {/* Table */}
      {sorted.length > 0 && (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th className="min-w-[160px] text-left">
                  ID đơn hàng
                  <span className="ml-1 text-[10px] font-normal text-gmv-muted">(lấy từ CRM)</span>
                </Th>
                <Th className="text-left">
                  SDT
                  <span className="ml-1 text-[10px] font-normal text-gmv-muted">(theo format 84-xxxxxxxxx)</span>
                </Th>
                <Th className="text-left">UID</Th>
                <Th className="min-w-[180px] text-left">Tên gói học</Th>
                <Th className="text-left">Tên khách</Th>
                <Th className="text-right">Số tiền</Th>
                <Th className="w-28 text-center">Thao tác</Th>
                <Th className="w-28 text-center">Xuất hóa đơn</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((o) => {
                const isDone = STATUS_DONE.includes(o.trangThaiThuTuc);
                const isSaving = saving[o.id] ?? false;
                const isExporting = exporting[o.id] ?? false;
                const didSave = saveOk[o.id] ?? false;
                const crmVal = crmEdits[o.id] ?? o.crmOrderId ?? "";
                const isDirty = crmVal !== (o.crmOrderId || "");

                return (
                  <Tr key={o.id} className={isDone ? "opacity-60" : ""}>
                    {/* ID đơn hàng từ CRM — chỉ edit khi chưa done */}
                    <Td className="text-left">
                      {isDone ? (
                        <span className="font-mono text-xs text-gmv-muted">{o.crmOrderId || "—"}</span>
                      ) : (
                        <input
                          type="text"
                          value={crmVal}
                          onChange={(e) => {
                            setCrmEdits((p) => ({ ...p, [o.id]: e.target.value }));
                            setSaveOk((p) => ({ ...p, [o.id]: false }));
                          }}
                          placeholder="Điền ID từ CRM"
                          className="w-full min-w-[140px] rounded-gmv-md border border-gmv-border bg-gmv-bg px-2 py-1.5 text-xs text-gmv-text-strong placeholder:text-gmv-muted/60 focus:border-gmv-primary focus:outline-none"
                          disabled={isSaving || isExporting}
                        />
                      )}
                    </Td>

                    {/* SDT — read-only, formatted 84-xxx */}
                    <Td className="whitespace-nowrap text-left font-mono text-xs text-gmv-muted">
                      {fmtSdt(o.sdt)}
                    </Td>

                    {/* UID */}
                    <Td className="text-left font-mono text-xs text-gmv-muted">
                      {o.uid || "—"}
                    </Td>

                    {/* Tên gói học */}
                    <Td className="max-w-[220px] text-left">
                      <span className="line-clamp-2 text-xs leading-snug">{o.goiHoc || "—"}</span>
                    </Td>

                    {/* Tên khách */}
                    <Td className="text-left text-sm font-medium">{o.tenKhach || "—"}</Td>

                    {/* Số tiền */}
                    <Td className="whitespace-nowrap text-right font-medium text-gmv-ok">
                      {fmtMoney(o.tongTien)}
                    </Td>

                    {/* Thao tác — Lưu thông tin */}
                    <Td className="text-center">
                      {isDone ? null : (
                        <Button
                          size="sm"
                          variant={didSave ? "secondary" : isDirty ? "primary" : "secondary"}
                          disabled={isSaving || isExporting}
                          onClick={() => handleSaveCrm(o)}
                          className="whitespace-nowrap"
                        >
                          {isSaving ? "Đang lưu…" : didSave ? "✓ Đã lưu" : "Lưu thông tin"}
                        </Button>
                      )}
                    </Td>

                    {/* Xuất hóa đơn */}
                    <Td className="text-center">
                      {isDone ? (
                        <StatusBadge status={o.trangThaiThuTuc} />
                      ) : (
                        <button
                          onClick={() => handleExport(o)}
                          disabled={isExporting || isSaving}
                          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {isExporting ? (
                            <span className="animate-spin">⟳</span>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                          )}
                          {isExporting ? "…" : "Xuất"}
                        </button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {/* Footer count */}
      {sorted.length > 0 && (
        <p className="text-right text-xs text-gmv-muted">
          {pending.length} chờ xác nhận · {done.length} đã xử lý
        </p>
      )}
    </div>
  );
}
