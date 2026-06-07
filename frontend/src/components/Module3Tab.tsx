import { useCallback, useEffect, useState } from "react";
import { endpoints } from "../lib/api";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import type { InvoiceOrder } from "../types/order";
import { usePermission } from "../hooks/usePermission";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { Table, TableWrap, Td, Th, Tr } from "./ui/Table";

const STATUS_APPROVED = ["CHO_XUAT_HD", "DA_XUAT_HD"]; // đã qua bước xuất từng dòng
const STATUS_FULLY_DONE = "DA_XUAT_HD";                // đã xuất hóa đơn xong hoàn toàn

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
  const { readOnly } = usePermission("module3");
  const [orders, setOrders] = useState<InvoiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [crmEdits, setCrmEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState<Record<string, boolean>>({});
  const [saveOk, setSaveOk] = useState<Record<string, boolean>>({});
  const [exportingBatch, setExportingBatch] = useState(false);
  const [batchConfirming, setBatchConfirming] = useState<Record<string, boolean>>({});
  const [confirmBatchExport, setConfirmBatchExport] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [confirmBulkSave, setConfirmBulkSave] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
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
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useRealtimeTable(["active_requests"], load);
  useRefetchOnFocus(() => load({ silent: true }));

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
    const targets = orders.filter((o) => !STATUS_APPROVED.includes(o.trangThaiThuTuc));
    if (targets.length === 0) {
      setExportingBatch(false);
      return;
    }
    const targetIds = new Set(targets.map((o) => o.id));
    const prevStatusById = new Map(targets.map((o) => [o.id, o.trangThaiThuTuc]));
    setBatchConfirming((prev) => {
      const next = { ...prev };
      for (const o of targets) next[o.id] = true;
      return next;
    });
    setOrders((prev) =>
      prev.map((o) =>
        targetIds.has(o.id) ? { ...o, trangThaiThuTuc: STATUS_APPROVED[0] } : o
      )
    );
    try {
      const results = await Promise.all(
        targets.map(async (o) => {
          try {
            const taxProductName = o.goiHoc || o.maDonHang;
            const crmOrderId = crmEdits[o.id] ?? o.crmOrderId ?? "";
            const updated = await endpoints.invoice.approveM3Order(o.id, taxProductName, crmOrderId);
            return { id: o.id, ok: true as const, data: updated.data };
          } catch {
            return { id: o.id, ok: false as const };
          }
        })
      );
      const failedIds = results.filter((r) => !r.ok).map((r) => r.id);
      if (failedIds.length > 0) {
        const failedSet = new Set(failedIds);
        setOrders((prev) =>
          prev.map((o) =>
            failedSet.has(o.id)
              ? { ...o, trangThaiThuTuc: prevStatusById.get(o.id) ?? o.trangThaiThuTuc }
              : o
          )
        );
        const failedOrders = targets.filter((o) => failedSet.has(o.id)).map((o) => o.maDonHang);
        setError(`Xuat that bai: ${failedOrders.join(", ")}`);
      }
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Xuất hàng loạt thất bại. Vui lòng thử lại.");
    } finally {
      setBatchConfirming((prev) => {
        const next = { ...prev };
        for (const o of targets) delete next[o.id];
        return next;
      });
      setExportingBatch(false);
    }
  }

  async function handleBulkSave() {
    setConfirmBulkSave(false);
    setSavingBulk(true);
    setError("");
    const targets = orders.filter((o) => o.trangThaiThuTuc !== STATUS_FULLY_DONE);
    const errors: string[] = [];
    for (const o of targets) {
      try {
        const crmVal = crmEdits[o.id] ?? o.crmOrderId ?? "";
        await endpoints.invoice.saveM3CrmId(o.id, crmVal);
        setOrders((prev) =>
          prev.map((x) => x.id === o.id ? { ...x, crmOrderId: crmVal } : x)
        );
        setSaveOk((p) => ({ ...p, [o.id]: true }));
        setTimeout(() => setSaveOk((p) => ({ ...p, [o.id]: false })), 2500);
      } catch {
        errors.push(o.maDonHang);
      }
    }
    if (errors.length > 0) {
      setError(`Lưu thất bại: ${errors.join(", ")}`);
    }
    setSavingBulk(false);
  }

  // pending = CHO_XAC_NHAN (chưa xuất sang Tab 4)
  const pending = orders.filter((o) => !STATUS_APPROVED.includes(o.trangThaiThuTuc));
  // done = CHO_XUAT_HD + DA_XUAT_HD (đã xuất sang Tab 4 hoặc đã hoàn tất)
  const done = orders.filter((o) => STATUS_APPROVED.includes(o.trangThaiThuTuc));
  // saveable = tất cả đơn chưa DA_XUAT_HD (có thể vẫn sửa CRM ID)
  const saveable = orders.filter((o) => o.trangThaiThuTuc !== STATUS_FULLY_DONE);
  const sorted = [...pending, ...done];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gmv-text-strong">Kích hoạt khóa học</h2>
          <p className="mt-0.5 text-xs text-gmv-muted">
            Đơn đã xác nhận tiền về — điền mã CRM Order để kích hoạt khóa học trên PalFish.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => load()} disabled={loading || exportingBatch || savingBulk}>
            {loading ? "Đang tải…" : "Làm mới"}
          </Button>
          {!readOnly && (
            <>
              <Button
                variant="secondary"
                size="md"
                disabled={saveable.length === 0 || savingBulk || exportingBatch || loading}
                onClick={() => setConfirmBulkSave(true)}
              >
                {savingBulk ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Đang lưu…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Lưu hàng loạt
                    {saveable.length > 0 && (
                      <Badge tone="primary" className="ml-1">{saveable.length}</Badge>
                    )}
                  </>
                )}
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={pending.length === 0 || exportingBatch || loading}
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
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    Xuất hàng loạt
                    {pending.length > 0 && (
                      <Badge tone="ok" className="ml-1">{pending.length}</Badge>
                    )}
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Confirm bulk save dialog */}
      {confirmBulkSave && (
        <div className="rounded-gmv-md border border-gmv-border bg-gmv-canvas px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-gmv-text-strong">
            Lưu thông tin hàng loạt cho {pending.length} đơn?
          </p>
          <p className="mb-3 text-xs text-gmv-muted">
            Hệ thống sẽ lưu ID CRM Order hiện tại trong ô nhập của{" "}
            <strong>{saveable.length} đơn</strong> chưa hoàn tất.
            Các đơn để trống sẽ được lưu với giá trị rỗng.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleBulkSave}>
              Xác nhận — Lưu tất cả
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmBulkSave(false)}>
              Hủy
            </Button>
          </div>
        </div>
      )}

      {/* Confirm batch export dialog */}
      {confirmBatchExport && (
        <div className="rounded-gmv-md border border-gmv-primary/30 bg-gmv-primary-soft px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-gmv-text-strong">
            Xuất {pending.length} đơn sang hàng đợi Tab 4?
          </p>
          <p className="mb-3 text-xs text-gmv-muted">
            <strong>{pending.length} đơn</strong> đang chờ xác nhận sẽ được chuyển sang trạng thái{" "}
            <strong>Chờ xuất HD</strong> và xuất hiện trong Tab 4 để tải hóa đơn.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleBatchExport}>
              Xác nhận — Xuất hàng loạt
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
                const isFullyDone = o.trangThaiThuTuc === STATUS_FULLY_DONE;
                const isApproved = STATUS_APPROVED.includes(o.trangThaiThuTuc);
                const isSaving = saving[o.id] ?? false;
                const isExporting = exporting[o.id] ?? false;
                const isBatchConfirming = batchConfirming[o.id] ?? false;
                const isBusy = isSaving || isExporting || isBatchConfirming || exportingBatch;
                const didSave = saveOk[o.id] ?? false;
                const crmVal = crmEdits[o.id] ?? o.crmOrderId ?? "";
                const isDirty = crmVal !== (o.crmOrderId || "");

                return (
                  <Tr key={o.id} className={isFullyDone ? "opacity-60" : ""}>
                    {/* ID đơn hàng từ CRM — chỉ edit khi chưa DA_XUAT_HD */}
                    <Td className="text-left">
                      {isFullyDone ? (
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
                          disabled={isBusy || readOnly}
                          readOnly={readOnly}
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

                    {/* Thao tác — Lưu thông tin (ẩn khi DA_XUAT_HD hoặc readOnly) */}
                    <Td className="text-center">
                      {isFullyDone || readOnly ? null : (
                        <Button
                          size="sm"
                          variant={didSave ? "secondary" : isDirty ? "primary" : "secondary"}
                          disabled={isBusy}
                          onClick={() => handleSaveCrm(o)}
                          className="whitespace-nowrap"
                        >
                          {isSaving ? "Đang lưu…" : didSave ? "✓ Đã lưu" : "Lưu thông tin"}
                        </Button>
                      )}
                    </Td>

                    {/* Xuất hóa đơn (từng dòng) */}
                    <Td className="text-center">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1.5">
                          {isBatchConfirming ? <span className="animate-spin text-xs text-gmv-muted">âŸ³</span> : null}
                          <StatusBadge status={o.trangThaiThuTuc} />
                        </span>
                      ) : readOnly ? null : (
                        <button
                          onClick={() => handleExport(o)}
                          disabled={isBusy}
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
