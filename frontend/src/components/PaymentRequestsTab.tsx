// UI spec: PalFish CRM.html — Payment Request list (Hiếu prototype)
import { useEffect, useMemo, useState } from "react";
import "../styles/prototype-payments.css";
import { usePaymentFlow } from "../contexts/PaymentFlowContext";
import { endpoints } from "../lib/api";
import { compressImageFile } from "../lib/imageCompress";
import type {
  AddPaymentAttemptPayload,
  CreatePaymentRequestPayload,
  PaymentAttempt,
  PaymentRequest,
  UpdatePaymentRequestPayload,
} from "../types/paymentRequest";
import CancelPrModal from "./payment-request/CancelPrModal";
import CreatePaymentRequestModal from "./payment-request/CreatePaymentRequestModal";
import { type DateRange, EMPTY_RANGE, inDateRange } from "./payment-request/DateRangeFilter";
import { Icons } from "./payment-request/Icons";
import PaymentRequestDetailDrawer from "./payment-request/PaymentRequestDetailDrawer";
import PaymentRequestKpiCards from "./payment-request/PaymentRequestKpiCards";
import PaymentRequestTable from "./payment-request/PaymentRequestTable";
import PaymentRequestToolbar from "./payment-request/PaymentRequestToolbar";
import QrViewModal from "./payment-request/QrViewModal";
import Modal from "./ui/Modal";
import {
  type RequestBucket,
  type StatusFilter,
  buildArByPrId,
  fromApiAttempt,
  fromApiPaymentRequest,
  isBackendLineId,
  normalizeRequest,
  nowStamp,
} from "./payment-request/paymentRequestUtils";

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-emerald-500/50">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      {message}
    </div>
  );
}

export default function PaymentRequestsTab() {
  const {
    requests,
    activeRequests,
    loading,
    apiNote,
    setApiNote,
    loadData,
    updateRequest,
    handleCreate: ctxCreate,
    handleUpdatePaymentRequest,
    handleAddPayment: ctxAddPayment,
    handleCreateActiveRequest,
    navigate,
    nav,
    setNav,
  } = usePaymentFlow();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [tab, setTab] = useState<RequestBucket>("tracking");
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PaymentRequest | null>(null);
  const [qrView, setQrView] = useState<{ qr: PaymentAttempt; request: PaymentRequest } | null>(null);
  const [uploadingBillId, setUploadingBillId] = useState<string | null>(null);
  const [billModal, setBillModal] = useState<{ open: boolean; code: string; src: string }>({
    open: false,
    code: "",
    src: "",
  });

  const arByPrId = useMemo(() => buildArByPrId(activeRequests), [activeRequests]);

  useEffect(() => {
    if (!nav.openPrId) return;
    const pr = requests.find((r) => r.id === nav.openPrId);
    if (!pr) return;
    setSelectedId(nav.openPrId);
    setDrawerOpen(true);
    setNav({});
  }, [nav.openPrId, requests, setNav]);

  const selected = useMemo(
    () => requests.find((r) => r.id === selectedId) || null,
    [requests, selectedId]
  );

  const trackingRequests = useMemo(
    () => requests.filter((r) => r.state !== "cancelled"),
    [requests]
  );
  const cancelledRequests = useMemo(
    () => requests.filter((r) => r.state === "cancelled"),
    [requests]
  );
  const createdRequests = useMemo(
    () => requests.filter((r) => r.state !== "cancelled" && arByPrId[r.id]),
    [requests, arByPrId]
  );

  const bucketTotal = useMemo(() => {
    if (tab === "cancelled") return cancelledRequests.length;
    if (tab === "created") return createdRequests.length;
    return trackingRequests.length;
  }, [tab, trackingRequests, cancelledRequests, createdRequests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (tab === "cancelled") {
        if (r.state !== "cancelled") return false;
      } else {
        if (r.state === "cancelled") return false;
        if (tab === "created" && !arByPrId[r.id]) return false;
      }
      if (tab !== "cancelled" && status !== "all" && r.state !== status) return false;
      if (!inDateRange(r.createdAt, dateRange)) return false;
      if (!q) return true;
      return [r.id, r.name, r.uid, r.phone].some((v) => v.toLowerCase().includes(q));
    });
  }, [requests, tab, status, dateRange, search, arByPrId]);

  const chips = useMemo(
    () => [
      { id: "all" as StatusFilter, label: "Tất cả", count: trackingRequests.length },
      {
        id: "pending" as StatusFilter,
        label: "Chưa TT",
        count: trackingRequests.filter((r) => r.state === "pending").length,
        color: "var(--text-2)",
      },
      {
        id: "short" as StatusFilter,
        label: "Thiếu",
        count: trackingRequests.filter((r) => r.state === "short").length,
        color: "var(--danger)",
      },
      {
        id: "done" as StatusFilter,
        label: "Đủ",
        count: trackingRequests.filter((r) => r.state === "done").length,
        color: "var(--success)",
      },
      {
        id: "over" as StatusFilter,
        label: "Thừa",
        count: trackingRequests.filter((r) => r.state === "over").length,
        color: "var(--warning)",
      },
    ],
    [trackingRequests]
  );

  const tabs = useMemo(
    () => [
      {
        key: "tracking" as RequestBucket,
        label: "Đang theo dõi",
        icon: "Wallet" as const,
        count: trackingRequests.length,
      },
      {
        key: "created" as RequestBucket,
        label: "Gói học đã tạo",
        icon: "Sparkle" as const,
        count: createdRequests.length,
      },
      {
        key: "cancelled" as RequestBucket,
        label: "Đã huỷ",
        icon: "XCircle" as const,
        count: cancelledRequests.length,
      },
    ],
    [trackingRequests, createdRequests, cancelledRequests]
  );

  const handleSelect = (request: PaymentRequest) => {
    setSelectedId(request.id);
    setDrawerOpen(true);
  };

  const handleUpdatePr = async (payload: UpdatePaymentRequestPayload) => {
    if (!selected) return;
    try {
      await handleUpdatePaymentRequest(selected.id, payload);
      setToast("Cập nhật thành công");
      setDrawerOpen(false);
    } catch {
      setApiNote("Không lưu được thay đổi — kiểm tra kết nối máy chủ.");
      throw new Error("update failed");
    }
  };

  const handleCreate = async (payload: CreatePaymentRequestPayload) => {
    const saved = await ctxCreate(payload);
    setSelectedId(saved.id);
    setCreateOpen(false);
    setDrawerOpen(true);
    setTab("tracking");
  };

  const handleAddPayment = async (payload: AddPaymentAttemptPayload) => {
    if (!selected) return;
    const confirmed = await ctxAddPayment(selected.id, payload);
    if (payload.method === "qr" && confirmed && confirmed.status !== "paid") {
      const fresh = requests.find((r) => r.id === selected.id) || selected;
      setQrView({ qr: confirmed, request: fresh });
    }
  };

  const handleCancelPayment = (qr: PaymentAttempt) => {
    if (!selected) return;
    if (!window.confirm(`Huỷ lần giao dịch #${qr.idx}?`)) return;
    updateRequest(selected.id, (r) => ({
      ...r,
      payments: r.payments.map((p: PaymentAttempt) =>
        p.id === qr.id ? { ...p, cancelled: true, cancelledAt: nowStamp() } : p
      ),
    }));
  };

  const handleMarkPaid = async (qr: PaymentAttempt) => {
    if (!selected) return;
    updateRequest(selected.id, (r) => ({
      ...r,
      payments: r.payments.map((p: PaymentAttempt) =>
        p.id === qr.id ? { ...p, status: "paid", paidAt: nowStamp() } : p
      ),
    }));
    if (isBackendLineId(qr.id)) {
      try {
        const res = await endpoints.transactions.patchStatus(qr.id, "paid");
        const line = res.data.payment_line;
        updateRequest(selected.id, (r) => {
          const updatedPayments = r.payments.map((p: PaymentAttempt) =>
            p.id === qr.id
              ? { ...p, status: "paid" as const, paidAt: line.paid_at || nowStamp(), bill: !!(line.bill_image ?? p.billImage), billImage: line.bill_image ?? p.billImage ?? null }
              : p
          );
          const prFromBe = fromApiPaymentRequest(res.data.payment_request);
          return normalizeRequest({ ...r, ...prFromBe, payments: updatedPayments });
        });
      } catch {
        /* optimistic */
      }
    }
  };

  const handleBillView = (qr: PaymentAttempt) => {
    if (qr.billImage) {
      setBillModal({ open: true, code: qr.code, src: qr.billImage });
    }
  };

  const handleBillFile = async (qr: PaymentAttempt, file: File) => {
    if (!selected) return;
    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn định dạng ảnh!");
      return;
    }
    if (!isBackendLineId(qr.id)) {
      alert("Giao dịch chưa lưu trên server — không upload được ảnh bill.");
      return;
    }
    setUploadingBillId(qr.id);
    try {
      const compressed = await compressImageFile(file);
      const blob = await (await fetch(compressed)).blob();
      const up = await endpoints.paymentRequests.uploadPaymentLineBill(qr.id, blob, `${qr.id}.jpg`);
      const line = up.data.payment_line;
      const mapped = fromApiAttempt(line, qr.idx);
      updateRequest(selected.id, (r) => ({
        ...r,
        payments: r.payments.map((p: PaymentAttempt) => (p.id === qr.id ? { ...p, ...mapped } : p)),
      }));
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const msg = err?.response?.data?.detail || err?.message || "Lỗi không xác định";
      alert(`Không lưu được ảnh biên lai: ${msg}`);
    } finally {
      setUploadingBillId(null);
    }
  };

  const handleConfirmCancel = async ({ reason }: { reason: string }) => {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    updateRequest(id, (r) => ({
      ...r,
      cancelledAt: nowStamp(),
      cancelledReason: reason,
      state: "cancelled",
    }));
    setCancelTarget(null);
    if (selected?.id === id) setDrawerOpen(false);
    try {
      await endpoints.paymentRequests.cancel(id);
    } catch {
      /* optimistic */
    }
  };

  const handleRestore = (request: PaymentRequest) => {
    updateRequest(request.id, (r) => ({
      ...r,
      cancelledAt: null,
      cancelledReason: null,
      state: "pending",
    }));
  };

  const onCreateActiveRequest = async () => {
    if (!selected || arByPrId[selected.id]) return;
    const ar = await handleCreateActiveRequest(selected);
    setDrawerOpen(false);
    setTab("created");
    navigate("module3", { openArId: ar.id });
  };

  return (
    <div className="gmv-prototype">
      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 640, lineHeight: 1.55 }}>
            Mỗi <strong style={{ color: "var(--text-2)" }}>Payment Request</strong> đại diện cho một thương vụ. Một PR có thể gồm{" "}
            <strong style={{ color: "var(--text-2)" }}>nhiều lần thanh toán</strong> (chuyển khoản nhiều lần hoặc 1 lần CK cho nhiều đơn). Khi đủ 100% sẽ chuyển sang bước Active Request.
          </div>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Icons.Plus size={15} strokeWidth={2.3} /> Tạo Payment Request
          </button>
        </div>

        {tab !== "cancelled" && <PaymentRequestKpiCards requests={trackingRequests} />}

        <PaymentRequestToolbar
          search={search}
          status={status}
          dateRange={dateRange}
          chips={chips}
          showChips={tab !== "cancelled"}
          onSearch={setSearch}
          onStatus={setStatus}
          onDateRange={setDateRange}
        />

        {apiNote && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #f6d36b",
              background: "var(--warning-bg)",
              color: "var(--warning-text)",
              fontSize: 12.5,
            }}
          >
            {apiNote}
          </div>
        )}

        <PaymentRequestTable
          requests={filtered}
          totalForBucket={bucketTotal}
          selectedId={drawerOpen ? selected?.id ?? null : null}
          tab={tab}
          onTabChange={setTab}
          tabs={tabs}
          onSelect={handleSelect}
          onCancelClick={setCancelTarget}
          onRestoreClick={handleRestore}
          arByPrId={arByPrId}
        />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-outline btn-sm" onClick={() => void loadData()} disabled={loading}>
            {loading ? "Đang tải..." : "Tải lại dữ liệu"}
          </button>
        </div>
      </div>

      <PaymentRequestDetailDrawer
        request={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdatePr={handleUpdatePr}
        onAddPayment={handleAddPayment}
        onCancelPayment={handleCancelPayment}
        onMarkPaid={handleMarkPaid}
        onBillFile={handleBillFile}
        onBillView={handleBillView}
        uploadingBillId={uploadingBillId}
        onCreateActiveRequest={onCreateActiveRequest}
        onCancelRequest={() => selected && setCancelTarget(selected)}
        activeRequestId={selected ? arByPrId[selected.id]?.id ?? null : null}
        onShowQr={(qr) => selected && setQrView({ qr, request: selected })}
      />

      <CreatePaymentRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} />
      <CancelPrModal pr={cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleConfirmCancel} />

      <QrViewModal
        qr={qrView?.qr ?? null}
        request={qrView?.request ?? null}
        onClose={() => setQrView(null)}
        onBillFile={qrView?.qr ? (file) => handleBillFile(qrView.qr, file) : undefined}
        onBillView={qrView?.qr ? () => handleBillView(qrView.qr) : undefined}
        uploadingBill={uploadingBillId === qrView?.qr?.id}
      />

      <Modal
        open={billModal.open}
        onClose={() => setBillModal((m) => ({ ...m, open: false }))}
        title={`Biên lai: ${billModal.code}`}
        wide
        className="text-center"
      >
        <img
          src={billModal.src}
          alt="Biên lai"
          className="mx-auto mt-2 max-h-[70vh] max-w-full rounded-gmv-md"
        />
      </Modal>

      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
