import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { usePaymentFlow } from "../contexts/PaymentFlowContext";
import { usePermission } from "../hooks/usePermission";
import { endpoints, type BankTransaction } from "../lib/api";

const BankTransactionsTab = lazy(() => import("./BankTransactionsTab"));
import {
  type FlatTransaction,
  METHOD_META,
  TXN_STATUS_META,
  type TxnDisplayStatus,
  flattenTransactions,
  txnDisplayStatus,
  vnd,
} from "./payment-flow/paymentFlowUtils";
import DateRangeFilter, { EMPTY_RANGE, type DateRange, inDateRange } from "./payment-request/DateRangeFilter";
import { Icons } from "./payment-request/Icons";
import { findCountry } from "./payment-request/CountryCombo";
import Modal from "./ui/Modal";
import {
  formatPaymentDateFull,
  formatPaymentDateTime,
  fmtPhone,
  isBackendLineId,
} from "./payment-request/paymentRequestUtils";
import "../styles/prototype-payments.css";

type TabId = "awaiting" | "confirmed" | "cancelled" | "all";
type MethodFilter = "all" | "qr" | "cash" | "card" | "installment";

type BillImage = { id: number; src: string; name: string };
type BillModalState = {
  open: boolean;
  lineId: string;
  code: string;
  images: string[];
};

function getBillsForTxn(t: FlatTransaction): BillImage[] {
  const fromList = Array.isArray(t.billImages) ? t.billImages.filter((src): src is string => !!src) : [];
  const all = fromList.length > 0 ? fromList : t.billImage ? [t.billImage] : [];
  const unique = Array.from(new Set(all));
  return unique.map((src, idx) => ({
    id: idx,
    src,
    name: `bill_${t.code}_${idx + 1}.png`,
  }));
}

function parseDownloadFilename(contentDisposition: string | undefined, fallback: string) {
  if (!contentDisposition) return fallback;
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      // ignore decode failures and use plain fallback
    }
  }
  const plain = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  return plain?.[1]?.trim() || fallback;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function fallbackDirectImageDownload(src: string, fallbackName: string) {
  try {
    const resp = await fetch(src);
    const blob = await resp.blob();
    triggerBlobDownload(blob, fallbackName);
    return;
  } catch {
    // Last fallback for CORS-restricted URLs: open source image.
  }
  const a = document.createElement("a");
  a.href = src;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function BillReceiptArt({ txn, pr }: { txn: FlatTransaction; pr: FlatTransaction["pr"] }) {
  const country = findCountry(pr.country || "VN");
  const isCash = txn.method === "cash";
  const isCard = txn.method === "card";
  const stamp =
    txnDisplayStatus(txn) === "confirmed"
      ? "ĐÃ XÁC NHẬN"
      : txnDisplayStatus(txn) === "rejected"
        ? "TỪ CHỐI"
        : null;

  return (
    <div className={`bill-art ${txn.bill || txn.billImage ? "has" : ""}`}>
      <div style={{ position: "absolute", top: 14, left: 16, right: 16, textAlign: "left" }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-3)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {isCash ? "Phiếu thu tiền mặt" : isCard ? "Hoá đơn POS" : "Biên lai chuyển khoản"}
        </div>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            marginTop: 2,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {txn.bank || (isCash ? "PalFish Vietnam · Văn phòng" : "POS · PalFish Vietnam")}
        </div>
      </div>
      {stamp && <span className="stamp">{stamp}</span>}
      <div
        style={{
          marginTop: 44,
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10.5,
          color: "var(--text-2)",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--text-3)" }}>Mã GD</span>
          <span style={{ fontWeight: 600, color: "var(--text)" }}>{txn.code}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--text-3)" }}>Thời gian</span>
          <span>{formatPaymentDateFull(txn.paidAt || txn.createdAt)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--text-3)" }}>Người gửi</span>
          <span>{pr.name}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--text-3)" }}>SĐT</span>
          <span>
            {country.flag} {country.dial} {fmtPhone(pr.phone)}
          </span>
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: "1px dashed var(--border-strong)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          width: "100%",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--text-3)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          Số tiền
        </span>
        <span
          style={{
            fontSize: 19,
            fontWeight: 800,
            color: "var(--money)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {vnd(txn.amount)}
        </span>
      </div>
    </div>
  );
}

export function BillLightbox({ bill, onClose }: { bill: BillImage; onClose: () => void }) {
  return (
    <div className="bill-lightbox-scrim" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "90vw", maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "white" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{bill.name}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={bill.src}
              download={bill.name}
              className="btn btn-outline btn-sm"
              style={{ background: "rgba(255,255,255,0.95)" }}
            >
              <Icons.Download size={13} /> Tải ảnh
            </a>
            <button type="button" className="drawer-close" onClick={onClose} style={{ background: "rgba(255,255,255,0.95)" }}>
              <Icons.Close size={16} />
            </button>
          </div>
        </div>
        <img
          src={bill.src}
          alt={bill.name}
          style={{
            maxWidth: "90vw",
            maxHeight: "82vh",
            borderRadius: 12,
            background: "white",
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          }}
        />
      </div>
    </div>
  );
}

const REJECT_REASON_SUGGESTIONS = [
  "Tiền chưa về ngân hàng",
  "Sai số tiền (khác sao kê)",
  "Sai nội dung chuyển khoản",
  "Bill không rõ / không khớp",
  "Khác",
];

function RejectReasonModal({
  txnLabel,
  onConfirm,
  onCancel,
}: {
  txnLabel: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="gmv-prototype gmv-prototype-modal-scrim" onClick={onCancel}>
      <div className="modal" style={{ width: "min(460px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Lý do từ chối</h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{txnLabel}</div>
          </div>
          <button className="drawer-close" onClick={onCancel}>
            <Icons.Close size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ gap: 12 }}>
          <div className="field">
            <label>Lý do <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(bắt buộc)</span></label>
            <input
              list="reject-reasons"
              value={reason}
              autoFocus
              placeholder="Nhập hoặc chọn lý do…"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) { e.preventDefault(); onConfirm(reason.trim()); } }}
            />
            <datalist id="reject-reasons">
              {REJECT_REASON_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onCancel}>Huỷ bỏ</button>
          <button
            className="btn btn-danger"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            <Icons.XCircle size={14} /> Xác nhận từ chối
          </button>
        </div>
      </div>
    </div>
  );
}

function TxnStatusBadge({ status }: { status: TxnDisplayStatus }) {
  const meta = TXN_STATUS_META[status] || TXN_STATUS_META.unsent;
  return (
    <span className={`badge ${meta.cls}`}>
      <span className="dot" />
      {meta.text}
    </span>
  );
}

// Loại lần thanh toán CK: QR app (có link PayOS) vs CK ngoài (khách chuyển tay)
type TransferKind = "qr_app" | "ck_ngoai";
function transferKind(t: FlatTransaction): TransferKind {
  return t.checkoutUrl || t.qrCode || t.paymentLinkId ? "qr_app" : "ck_ngoai";
}

// Nguồn xác nhận tiền về: PayOS / SePay / Thủ công — dựa trên bank_transactions đã khớp
type ConfirmSource = "payos" | "sepay" | "manual" | null;
function confirmSource(t: FlatTransaction, matchedTxn?: BankTransaction): ConfirmSource {
  if (matchedTxn) {
    if (matchedTxn.gateway === "sepay_webhook" || matchedTxn.gateway === "sepay_poll") return "sepay";
    if (matchedTxn.gateway === "manual") return "manual";
  }
  if (t.status !== "paid") return null;
  // Đã thu nhưng không có bản ghi SePay → suy ra PayOS nếu có link, ngược lại thủ công
  return transferKind(t) === "qr_app" ? "payos" : "manual";
}

const KIND_META: Record<TransferKind, { label: string; bg: string; fg: string }> = {
  qr_app: { label: "QR app", bg: "var(--primary-50, #eef2ff)", fg: "var(--primary-700, #4338ca)" },
  ck_ngoai: { label: "CK ngoài", bg: "var(--surface-3, #f1f5f9)", fg: "var(--text-2)" },
};

const SOURCE_META: Record<"payos" | "sepay" | "manual", { label: string; bg: string; fg: string }> = {
  payos: { label: "PayOS", bg: "#e0f2fe", fg: "#0369a1" },
  sepay: { label: "SePay", bg: "#dcfce7", fg: "#15803d" },
  manual: { label: "Thủ công", bg: "#f1f5f9", fg: "#475569" },
};

function ChannelBadges({ t, matchedTxn }: { t: FlatTransaction; matchedTxn?: BankTransaction }) {
  const kind = KIND_META[transferKind(t)];
  const src = confirmSource(t, matchedTxn);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, padding: "1px 6px", borderRadius: 5, background: kind.bg, color: kind.fg }}>
        {kind.label}
      </span>
      {src && (
        <span style={{ fontSize: 10.5, fontWeight: 600, padding: "1px 6px", borderRadius: 5, background: SOURCE_META[src].bg, color: SOURCE_META[src].fg }}>
          {SOURCE_META[src].label}
        </span>
      )}
    </div>
  );
}

export default function ReconciliationTab() {
  const { readOnly } = usePermission("reconciliation");
  const { requests, confirmTransaction, rejectTransaction, navigate, apiNote } = usePaymentFlow();
  const [view, setView] = useState<"lines" | "bank">("lines");
  const [bankTxns, setBankTxns] = useState<BankTransaction[]>([]);
  const [tab, setTab] = useState<TabId>("awaiting");
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerTxn, setDrawerTxn] = useState<FlatTransaction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [verifiedTotalDraft, setVerifiedTotalDraft] = useState("");
  const [verifiedReceivedDraft, setVerifiedReceivedDraft] = useState("");
  const [lightboxBill, setLightboxBill] = useState<BillImage | null>(null);
  const [currentBillIdx, setCurrentBillIdx] = useState(0);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumSelected, setAlbumSelected] = useState<Set<number>>(new Set());
  const [billModal, setBillModal] = useState<BillModalState>({
    open: false,
    lineId: "",
    code: "",
    images: [],
  });
  const [downloadingAllBills, setDownloadingAllBills] = useState(false);
  const [downloadingBillIndex, setDownloadingBillIndex] = useState<number | null>(null);
  const [billDownloadStatus, setBillDownloadStatus] = useState("");
  const [isBulkConfirming, setIsBulkConfirming] = useState(false);
  const [pendingReject, setPendingReject] = useState<{ txns: FlatTransaction[]; label: string } | null>(null);

  const transactions = useMemo(() => flattenTransactions(requests), [requests]);

  // Tải biến động số dư ngân hàng (SePay) để gắn nguồn xác nhận lên từng lần TT
  useEffect(() => {
    let alive = true;
    endpoints.bankTxns
      .list()
      .then(({ data }) => { if (alive) setBankTxns(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setBankTxns([]); });
    return () => { alive = false; };
  }, []);

  // Map payment_line_id → bank_transaction đã khớp (ưu tiên bản ghi đã match)
  const bankByLine = useMemo(() => {
    const m = new Map<string, BankTransaction>();
    for (const b of bankTxns) {
      if (b.payment_line_id) m.set(b.payment_line_id, b);
    }
    return m;
  }, [bankTxns]);
  const billModalLineIsBackend = useMemo(
    () => isBackendLineId(billModal.lineId),
    [billModal.lineId]
  );

  const setDownloadStatusTransient = (msg: string, timeoutMs = 1800) => {
    setBillDownloadStatus(msg);
    window.setTimeout(() => {
      setBillDownloadStatus((curr) => (curr === msg ? "" : curr));
    }, timeoutMs);
  };

  const openBillModal = (txn: FlatTransaction) => {
    const images = getBillsForTxn(txn).map((b) => b.src);
    if (images.length === 0) return;
    setBillDownloadStatus("");
    setBillModal({
      open: true,
      lineId: txn.id,
      code: txn.code,
      images,
    });
  };

  const counts = useMemo(() => {
    const c = { awaiting: 0, confirmed: 0, rejected: 0, cancelled: 0, unsent: 0, all: transactions.length };
    const sums = { awaiting: 0, confirmed: 0, rejected: 0 };
    for (const t of transactions) {
      const st = txnDisplayStatus(t);
      if (st === "awaiting") {
        c.awaiting++;
        sums.awaiting += t.amount;
      } else if (st === "confirmed") {
        c.confirmed++;
        sums.confirmed += t.amount;
      } else if (st === "rejected") {
        c.rejected++;
        sums.rejected += t.amount;
      } else if (st === "cancelled") {
        c.cancelled++;
      } else if (st === "unsent") c.unsent++;
    }
    return { ...c, sums, tabCancelled: c.cancelled + c.rejected };
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      const st = txnDisplayStatus(t);
      if (tab === "awaiting" && st !== "awaiting") return false;
      if (tab === "confirmed" && st !== "confirmed") return false;
      if (tab === "cancelled" && st !== "cancelled" && st !== "rejected") return false;
      if (methodFilter !== "all" && t.method !== methodFilter) return false;
      if (!inDateRange(t.createdAt, dateRange)) return false;
      if (!q) return true;
      return [t.code, t.prId, t.prName, t.pr.uid, t.bank || ""].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [transactions, tab, search, methodFilter, dateRange]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab, search, methodFilter, dateRange]);

  useEffect(() => {
    if (!drawerTxn) return;
    const fresh = transactions.find((t) => t.key === drawerTxn.key);
    if (fresh) setDrawerTxn(fresh);
  }, [transactions, drawerTxn?.key]);

  useEffect(() => {
    setCurrentBillIdx(0);
    setAlbumOpen(false);
    setAlbumSelected(new Set());
    const vt = drawerTxn?.verifiedTotal;
    const vr = drawerTxn?.verifiedReceived;
    setVerifiedTotalDraft(vt != null ? String(vt) : "");
    setVerifiedReceivedDraft(vr != null ? String(vr) : "");
  }, [drawerTxn?.key]);

  useEffect(() => {
    if (!billModal.open) return;
    const fresh = transactions.find((t) => t.id === billModal.lineId);
    if (!fresh) return;
    const nextImages = getBillsForTxn(fresh).map((b) => b.src);
    setBillModal((prev) => ({
      ...prev,
      code: fresh.code,
      images: nextImages,
    }));
  }, [transactions, billModal.open, billModal.lineId]);

  const handleConfirm = async (t: FlatTransaction, verified?: { verified_total?: number; verified_received?: number }) => {
    await confirmTransaction(t.prId, t.id, verified);
  };

  // Opens the reject-reason modal for one or more transactions
  const handleReject = (t: FlatTransaction, label?: string) => {
    setPendingReject({ txns: [t], label: label ?? `${t.code} · ${t.prName}` });
  };

  const handleBulkReject = (txns: FlatTransaction[]) => {
    if (txns.length === 0) return;
    const label = txns.length === 1 ? `${txns[0].code} · ${txns[0].prName}` : `${txns.length} giao dịch đã chọn`;
    setPendingReject({ txns, label });
  };

  const confirmReject = async (reason: string) => {
    if (!pendingReject) return;
    setPendingReject(null);
    await Promise.all(pendingReject.txns.map((t) => rejectTransaction(t.prId, t.id, reason)));
  };

  const handleDownloadSingleBill = async (idx: number) => {
    if (!billModal.lineId || idx < 0 || idx >= billModal.images.length) return;
    if (downloadingAllBills || downloadingBillIndex !== null) return;

    setDownloadingBillIndex(idx);
    setBillDownloadStatus("Dang tai bill...");
    try {
      if (billModalLineIsBackend) {
        const res = await endpoints.paymentRequests.downloadPaymentLineBill(billModal.lineId, idx);
        const fallback = `${billModal.code || billModal.lineId}-bill-${idx + 1}.jpg`;
        const filename = parseDownloadFilename(
          (res.headers?.["content-disposition"] as string | undefined) ??
            (res.headers?.["Content-Disposition"] as string | undefined),
          fallback
        );
        triggerBlobDownload(res.data, filename);
        setDownloadStatusTransient("Da bat dau tai bill");
        return;
      }
      await fallbackDirectImageDownload(billModal.images[idx], `${billModal.code || "bill"}-${idx + 1}.jpg`);
      setDownloadStatusTransient("Da tai bill");
    } catch {
      if (billModal.images[idx]) {
        await fallbackDirectImageDownload(
          billModal.images[idx],
          `${billModal.code || "bill"}-${idx + 1}.jpg`
        );
        setDownloadStatusTransient("Da tai bill (fallback)");
      } else {
        setDownloadStatusTransient("Loi tai bill", 3000);
        alert("Khong tai duoc anh bill.");
      }
    } finally {
      setDownloadingBillIndex(null);
    }
  };

  const handleDownloadAllBills = async () => {
    if (!billModal.open || !billModal.lineId || billModal.images.length === 0 || downloadingAllBills) return;
    setDownloadingAllBills(true);
    setBillDownloadStatus("Dang tao goi tai...");
    try {
      if (billModalLineIsBackend) {
        const res = await endpoints.paymentRequests.downloadAllPaymentLineBills(billModal.lineId);
        const fallback = `${billModal.code || billModal.lineId}-bills.zip`;
        const filename = parseDownloadFilename(
          (res.headers?.["content-disposition"] as string | undefined) ??
            (res.headers?.["Content-Disposition"] as string | undefined),
          fallback
        );
        triggerBlobDownload(res.data, filename);
        setDownloadStatusTransient("Da bat dau tai ZIP");
      } else {
        await Promise.all(
          billModal.images.map((src, idx) =>
            fallbackDirectImageDownload(src, `${billModal.code || "bill"}-${idx + 1}.jpg`)
          )
        );
        setDownloadStatusTransient("Da mo tai tung bill");
      }
    } catch {
      if (billModal.images.length > 0) {
        await Promise.all(
          billModal.images.map((src, idx) =>
            fallbackDirectImageDownload(src, `${billModal.code || "bill"}-${idx + 1}.jpg`)
          )
        );
        setDownloadStatusTransient("Tai ZIP loi, da fallback tung bill");
      } else {
        setDownloadStatusTransient("Loi tai bill", 3000);
        alert("Khong tai duoc bo bill.");
      }
    } finally {
      setDownloadingAllBills(false);
    }
  };

  const tabConfig = [
    { id: "awaiting" as TabId, label: "Chờ xác nhận", icon: "Clock" as const, attention: true },
    { id: "confirmed" as TabId, label: "Đã xác nhận", icon: "CheckCircle" as const },
    { id: "cancelled" as TabId, label: "Đã huỷ", icon: "XCircle" as const },
    { id: "all" as TabId, label: "Tất cả", icon: "Database" as const },
  ];

  const methodChips: { id: MethodFilter; label: string }[] = [
    { id: "all", label: "Mọi phương thức" },
    { id: "qr", label: "Chuyển khoản" },
    { id: "cash", label: "Tiền mặt" },
    { id: "card", label: "Quẹt thẻ" },
    { id: "installment", label: "Trả góp" },
  ];

  return (
    <div className="gmv-prototype">
      <div className="page">
        <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 720, lineHeight: 1.55, marginBottom: 4 }}>
          Kế toán đối chiếu từng giao dịch với{" "}
          <strong style={{ color: "var(--text-2)" }}>sao kê ngân hàng / phiếu thu / báo cáo POS</strong>, xác nhận khi
          tiền đã về tài khoản PalFish. Mỗi lần xác nhận cập nhật ngay Payment Request tương ứng.
        </div>

        {apiNote && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #f6d36b",
              background: "var(--warning-bg)",
              color: "var(--warning-text)",
              fontSize: 12.5,
              marginBottom: 8,
            }}
          >
            {apiNote}
          </div>
        )}

        <div className="seg-toggle" style={{ display: "inline-flex", gap: 4, padding: 4, background: "var(--surface-3, #f1f5f9)", borderRadius: 10, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setView("lines")}
            style={{
              padding: "6px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer",
              background: view === "lines" ? "var(--surface-1, #fff)" : "transparent",
              color: view === "lines" ? "var(--text-1)" : "var(--text-3)",
              boxShadow: view === "lines" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Theo lần thanh toán
          </button>
          <button
            type="button"
            onClick={() => setView("bank")}
            style={{
              padding: "6px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer",
              background: view === "bank" ? "var(--surface-1, #fff)" : "transparent",
              color: view === "bank" ? "var(--text-1)" : "var(--text-3)",
              boxShadow: view === "bank" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Tiền về ngân hàng (SePay)
          </button>
        </div>

        {view === "bank" ? (
          <Suspense fallback={<div className="empty" style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>Đang tải…</div>}>
            <BankTransactionsTab />
          </Suspense>
        ) : (
        <>
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--warning-bg)", color: "var(--warning-text)" }}>
              <Icons.Clock size={16} />
            </div>
            <div className="kpi-label">Chờ kế toán xác nhận</div>
            <div className="kpi-value">{counts.awaiting}</div>
            <div className="kpi-sub">{vnd(counts.sums.awaiting)} chờ đối soát</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>
              <Icons.CheckCircle size={16} />
            </div>
            <div className="kpi-label">Đã xác nhận</div>
            <div className="kpi-value">{counts.confirmed}</div>
            <div className="kpi-sub">{vnd(counts.sums.confirmed)} tiền đã về</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--danger-bg)", color: "var(--danger-text)" }}>
              <Icons.XCircle size={16} />
            </div>
            <div className="kpi-label">Từ chối</div>
            <div className="kpi-value">{counts.rejected}</div>
            <div className="kpi-sub">Không khớp sao kê</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon">
              <Icons.Database size={16} />
            </div>
            <div className="kpi-label">Tổng giao dịch</div>
            <div className="kpi-value">{counts.all}</div>
            <div className="kpi-sub">{counts.unsent} chưa có bill</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <Icons.Search size={15} stroke="var(--text-3)" />
            <input
              placeholder="Tìm theo mã GD, PR-ID, tên khách hoặc ngân hàng…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {methodChips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`filter-chip ${methodFilter === c.id ? "active" : ""}`}
              onClick={() => setMethodFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
          <div style={{ marginLeft: "auto" }}>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        <div className="table-card has-tabs">
          <div className="table-head with-tabs">
            <div className="tabs">
              {tabConfig.map((tc) => {
                const Ico = Icons[tc.icon];
                const isActive = tab === tc.id;
                return (
                  <div key={tc.id} className={`tab ${isActive ? "active" : ""}`} onClick={() => setTab(tc.id)}>
                    <Ico size={14} /> {tc.label}
                    <span
                      className={`tab-count ${tc.attention && ((tc.id === "cancelled" ? counts.tabCancelled : counts[tc.id as "awaiting" | "confirmed" | "all"]) ?? 0) > 0 && !isActive ? "is-attention" : ""}`}
                    >
                      {tc.id === "cancelled"
                        ? counts.tabCancelled
                        : counts[tc.id as "awaiting" | "confirmed" | "all"]}
                    </span>
                  </div>
                );
              })}
            </div>
            <span className="right-meta">{filtered.length} kết quả</span>
          </div>

          {selectedIds.size > 0 && !readOnly && (
            <div className="bulk-bar">
              <Icons.CheckCircle size={16} />
              <span>
                <span className="count">{selectedIds.size}</span> giao dịch đã chọn · Tổng{" "}
                {vnd(
                  [...selectedIds].reduce(
                    (s, k) => s + (transactions.find((t) => t.key === k)?.amount || 0),
                    0
                  )
                )}
              </span>
              <div className="spacer" />
              <div className="bulk-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedIds(new Set())}>
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ color: "var(--danger)" }}
                  onClick={() => {
                    const txns = [...selectedIds]
                      .map((key) => transactions.find((x) => x.key === key))
                      .filter((t): t is FlatTransaction => !!t);
                    setSelectedIds(new Set());
                    handleBulkReject(txns);
                  }}
                >
                  <Icons.XCircle size={13} /> Từ chối đã chọn
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={isBulkConfirming}
                  onClick={async () => {
                    setIsBulkConfirming(true);
                    try {
                      const toConfirm = [...selectedIds]
                        .map((key) => transactions.find((x) => x.key === key))
                        .filter((t): t is FlatTransaction => !!t);
                      await Promise.all(toConfirm.map((t) => handleConfirm(t)));
                    } finally {
                      setSelectedIds(new Set());
                      setIsBulkConfirming(false);
                    }
                  }}
                >
                  <Icons.Check size={13} strokeWidth={2.5} /> {isBulkConfirming ? "Đang xác nhận…" : "Xác nhận đã chọn"}
                </button>
              </div>
            </div>
          )}

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="check-col" onClick={(e) => e.stopPropagation()}>
                    {tab === "awaiting" && (
                      <input
                        type="checkbox"
                        checked={
                          filtered.length > 0 &&
                          filtered
                            .filter((t) => txnDisplayStatus(t) === "awaiting")
                            .every((t) => selectedIds.has(t.key))
                        }
                        onChange={() => {
                          const ids = filtered
                            .filter((t) => txnDisplayStatus(t) === "awaiting")
                            .map((t) => t.key);
                          const all = ids.length > 0 && ids.every((id) => selectedIds.has(id));
                          setSelectedIds(all ? new Set() : new Set(ids));
                        }}
                      />
                    )}
                  </th>
                  <th style={{ width: 140 }}>Thời gian</th>
                  <th style={{ width: 145 }}>Mã GD</th>
                  <th style={{ minWidth: 200 }}>Payment Request</th>
                  <th style={{ width: 150 }}>Phương thức</th>
                  <th style={{ width: 165 }}>Ngân hàng / Chi tiết</th>
                  <th style={{ width: 140, textAlign: "right" }}>Số tiền</th>
                  <th style={{ width: 80, textAlign: "center" }}>Biên lai</th>
                  <th style={{ width: 140 }}>Trạng thái</th>
                  <th style={{ width: 100, textAlign: "center" }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty">
                        <Icons.CheckCircle size={20} />
                        <div>Không có giao dịch nào khớp với điều kiện lọc.</div>
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map((t) => {
                  const status = txnDisplayStatus(t);
                  const method = METHOD_META[t.method || "qr"];
                  const MIco = Icons[method.icon];
                  const created = formatPaymentDateTime(t.createdAt);
                  const txnBills = getBillsForTxn(t);
                  const hasBill = txnBills.length > 0 || !!t.bill;
                  return (
                    <tr
                      key={t.key}
                      className={drawerOpen && drawerTxn?.key === t.key ? "selected" : ""}
                      onClick={() => {
                        setDrawerTxn(t);
                        setDrawerOpen(true);
                      }}
                    >
                      <td className="check-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          disabled={status !== "awaiting"}
                          checked={selectedIds.has(t.key)}
                          onChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.key)) next.delete(t.key);
                              else next.add(t.key);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td>
                        <div className="cell-time">{created.date}</div>
                        <div className="time-relative">{created.time}</div>
                      </td>
                      <td>
                        <span className="cell-mono">{t.code}</span>
                      </td>
                      <td>
                        <div
                          style={{
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "var(--primary-700)",
                          }}
                        >
                          {t.prId}
                        </div>
                        <div className="cell-sub" style={{ color: "var(--text-2)" }}>
                          {t.prName}
                        </div>
                      </td>
                      <td>
                        <span className={`method-badge ${method.cls}`}>
                          <MIco size={11} strokeWidth={2.2} /> {method.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                          {t.method === "cash" && (t.cashier ? `Người thu: ${t.cashier}` : "—")}
                          {t.method === "card" && (t.cardLast4 ? `•••• ${t.cardLast4}` : t.bank || "—")}
                          {t.method === "installment" && (t.installmentPlatform || "Trả góp")}
                          {t.method === "qr" && <ChannelBadges t={t} matchedTxn={bankByLine.get(t.id)} />}
                        </div>
                        {t.method === "installment" && t.installmentTotal != null && (
                          <div className="cell-sub">
                            {vnd(t.installmentTotal)} → {vnd(t.saleReceived ?? 0)}
                            {t.verifiedReceived != null && t.verifiedReceived !== t.saleReceived && (
                              <span style={{ color: "var(--success-text)", marginLeft: 4 }}>✓ {vnd(t.verifiedReceived)}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="txn-amount" style={{ color: "var(--money)" }}>
                          {vnd(t.amount)}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <span
                          className={`txn-bill-preview ${hasBill ? "has" : ""}`}
                          title={hasBill ? "Xem biên lai" : "Chưa có biên lai"}
                          onClick={() => {
                            if (txnBills.length > 0) openBillModal(t);
                          }}
                          style={txnBills[0]?.src ? { cursor: "pointer", padding: 0, overflow: "hidden" } : undefined}
                        >
                          {txnBills[0]?.src ? (
                            <img src={txnBills[0].src} alt="Biên lai" className="txn-bill-thumb" />
                          ) : hasBill ? (
                            <Icons.Receipt />
                          ) : (
                            <Icons.Image />
                          )}
                        </span>
                      </td>
                      <td>
                        <TxnStatusBadge status={status} />
                      </td>
                      <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        {status === "awaiting" && !readOnly ? (
                          <div className="row-quick-actions">
                            <button
                              type="button"
                              className="btn-icon-success"
                              title="Xác nhận tiền về"
                              onClick={() => void handleConfirm(t)}
                            >
                              <Icons.Check size={14} strokeWidth={2.5} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon-danger"
                              title="Từ chối"
                              onClick={() => handleReject(t)}
                            >
                              <Icons.Close size={14} strokeWidth={2.2} />
                            </button>
                          </div>
                        ) : (
                          <button type="button" className="row-action" title="Xem chi tiết">
                            <Icons.ChevronRight size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}
      </div>

      <div
        className={`scrim ${drawerOpen ? "open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        style={{ pointerEvents: drawerOpen ? "auto" : "none" }}
      />
      <aside className={`drawer ${drawerOpen ? "open" : ""}`} style={{ width: "min(720px, 92vw)" }}>
        {drawerTxn && (() => {
          const status = txnDisplayStatus(drawerTxn);
          const method = METHOD_META[drawerTxn.method || "qr"];
          const MIco = Icons[method.icon];
          const pr = drawerTxn.pr;
          const billImages = getBillsForTxn(drawerTxn);
          const pct = pr.target ? Math.min(100, Math.round((pr.received / pr.target) * 100)) : 0;
          const country = findCountry(pr.country || "VN");

          return (
            <>
              <div className="drawer-head">
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span
                    className="pr-id-pill"
                    style={{ background: "var(--surface-3)", color: "var(--text-2)", fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {drawerTxn.code}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{vnd(drawerTxn.amount)}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                      Lần #{drawerTxn.idx} của <strong style={{ color: "var(--text-2)" }}>{pr.id}</strong> · {pr.name}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <TxnStatusBadge status={status} />
                  <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)}>
                    <Icons.Close size={16} />
                  </button>
                </div>
              </div>

              <div className="drawer-body txn-drawer-body">
                <div className="txn-bill-zone">
                  {billImages.length > 0 ? (
                    <>
                      {/* Carousel */}
                      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          disabled={currentBillIdx === 0}
                          onClick={() => setCurrentBillIdx((i) => i - 1)}
                          style={{
                            flexShrink: 0, width: 32, height: 32, borderRadius: "50%",
                            border: "1px solid var(--border)", background: "var(--surface-2)",
                            cursor: currentBillIdx === 0 ? "not-allowed" : "pointer",
                            opacity: currentBillIdx === 0 ? 0.35 : 1,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Icons.ChevronLeft size={16} />
                        </button>
                        <div
                          style={{ flex: 1, cursor: "pointer", borderRadius: 8, overflow: "hidden", maxHeight: 280 }}
                          onClick={() => setLightboxBill(billImages[currentBillIdx])}
                          title="Click để phóng to"
                        >
                          <img
                            src={billImages[currentBillIdx].src}
                            alt={billImages[currentBillIdx].name}
                            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={currentBillIdx === billImages.length - 1}
                          onClick={() => setCurrentBillIdx((i) => i + 1)}
                          style={{
                            flexShrink: 0, width: 32, height: 32, borderRadius: "50%",
                            border: "1px solid var(--border)", background: "var(--surface-2)",
                            cursor: currentBillIdx === billImages.length - 1 ? "not-allowed" : "pointer",
                            opacity: currentBillIdx === billImages.length - 1 ? 0.35 : 1,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Icons.ChevronRight size={16} />
                        </button>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6, textAlign: "center" }}>
                        {currentBillIdx + 1} / {billImages.length} ảnh · Click ảnh để phóng to
                      </div>
                    </>
                  ) : drawerTxn.bill ? (
                    <BillReceiptArt txn={drawerTxn} pr={pr} />
                  ) : (
                    <div className="bill-art">
                      <div>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                        <div style={{ fontWeight: 600, color: "var(--text-2)" }}>Chưa có biên lai</div>
                        <div style={{ fontSize: 11, marginTop: 4 }}>
                          Sales chưa upload ảnh bill cho lần thanh toán này.
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="actions">
                    {billImages.length > 0 ? (
                      <>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setLightboxBill(billImages[currentBillIdx])}>
                          <Icons.Image size={13} /> Phóng to
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setAlbumSelected(new Set());
                            setAlbumOpen(true);
                          }}
                        >
                          <Icons.Download size={13} /> Tải ảnh {billImages.length > 1 && `(${billImages.length})`}
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-outline btn-sm" disabled style={{ opacity: 0.5 }}>
                        <Icons.Upload size={13} /> Chờ sales up bill
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="panel" style={{ padding: 16 }}>
                    <div className="panel-head" style={{ marginBottom: 10 }}>
                      <h4>Thông tin giao dịch</h4>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div className="info-cell">
                        <div className="info-label">Phương thức</div>
                        <div className="info-value">
                          <span className={`method-badge ${method.cls}`} style={{ marginTop: 2 }}>
                            <MIco size={11} strokeWidth={2.2} /> {method.label}
                          </span>
                        </div>
                      </div>
                      <div className="info-cell">
                        <div className="info-label">
                          {drawerTxn.method === "cash"
                            ? "Người thu"
                            : drawerTxn.method === "card"
                              ? "4 số cuối"
                              : "Ngân hàng nhận"}
                        </div>
                        <div className="info-value">
                          {drawerTxn.method === "cash" && (drawerTxn.cashier || "—")}
                          {drawerTxn.method === "card" &&
                            (drawerTxn.cardLast4 ? `•••• ${drawerTxn.cardLast4}` : "—")}
                          {drawerTxn.method === "installment" &&
                            `${drawerTxn.installmentPlatform || "Trả góp"}${drawerTxn.installmentTotal != null ? ` · ${vnd(drawerTxn.installmentTotal)} → ${vnd(drawerTxn.saleReceived ?? 0)}` : ""}`}
                          {drawerTxn.method === "qr" && (drawerTxn.bank || "—")}
                        </div>
                      </div>
                      <div className="info-cell">
                        <div className="info-label">Số tiền</div>
                        <div className="info-value money">{vnd(drawerTxn.amount)}</div>
                      </div>
                      <div className="info-cell">
                        <div className="info-label">Mã đối soát</div>
                        <div className="info-value mono">{drawerTxn.code}</div>
                      </div>
                      <div className="info-cell">
                        <div className="info-label">Sales tạo lúc</div>
                        <div className="info-value mono">{formatPaymentDateFull(drawerTxn.createdAt)}</div>
                      </div>
                      <div className="info-cell">
                        <div className="info-label">Sales upload bill</div>
                        <div className="info-value">
                          {billImages.length > 0 ? (
                            <span style={{ color: "var(--success-text)", fontWeight: 600 }}>✓ Đã upload</span>
                          ) : (
                            <span style={{ color: "var(--text-3)" }}>Chưa</span>
                          )}
                        </div>
                      </div>
                      {status === "confirmed" && (
                        <div className="info-cell" style={{ gridColumn: "1 / -1" }}>
                          <div className="info-label">Kế toán xác nhận lúc</div>
                          <div className="info-value">
                            <strong style={{ color: "var(--success-text)" }}>
                              {formatPaymentDateFull(drawerTxn.paidAt || drawerTxn.createdAt)}
                            </strong>{" "}
                            · Tiền đã về tài khoản PalFish
                          </div>
                        </div>
                      )}
                      {status === "rejected" && (
                        <div className="info-cell" style={{ gridColumn: "1 / -1" }}>
                          <div className="info-label" style={{ color: "var(--danger-text)" }}>
                            Đã từ chối
                          </div>
                          <div
                            className="info-value"
                            style={{
                              background: "var(--danger-bg)",
                              borderColor: "var(--danger-bg)",
                              color: "var(--danger-text)",
                            }}
                          >
                            {drawerTxn.rejectReason ||
                              "Không tìm thấy giao dịch khớp trên sao kê ngân hàng."}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="panel" style={{ padding: 16 }}>
                    <div className="panel-head" style={{ marginBottom: 10 }}>
                      <h4>Payment Request liên kết</h4>
                    </div>
                    <div
                      className="linked-pr-card"
                      onClick={() => {
                        setDrawerOpen(false);
                        navigate("paymentRequests", { openPrId: pr.id });
                      }}
                    >
                      <div className="icon-block">
                        <Icons.Wallet size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          {pr.id} · {pr.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                          UID {pr.uid} · {country.flag} {country.dial} {fmtPhone(pr.phone)}
                        </div>
                        <div className="mini-prog">
                          <div style={{ width: `${pct}%` }} />
                        </div>
                        <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-3)" }}>
                          Đã nhận <strong style={{ color: "var(--text)" }}>{vnd(pr.received)}</strong> /{" "}
                          {vnd(pr.target)} ({pct}%)
                        </div>
                      </div>
                      <Icons.ChevronRight size={16} stroke="var(--text-3)" />
                    </div>
                  </div>
                </div>
              </div>

              {drawerTxn.method === "installment" && (status === "awaiting" || status === "rejected") && !readOnly && (
                <div style={{ background: "var(--primary-bg, #f0f0ff)", borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, border: "2px solid var(--primary)", margin: "0 0 4px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Kế toán xác nhận</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
                      Tổng tiền KH chuyển (thực tế) *
                      <input
                        className="input"
                        style={{ marginTop: 4, width: "100%", fontSize: 15, padding: "10px 12px" }}
                        placeholder="Số tiền KH thực chuyển qua Payoo/Mpos..."
                        value={verifiedTotalDraft}
                        onChange={(e) => setVerifiedTotalDraft(e.target.value.replace(/[^\d]/g, ""))}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
                      Thực nhận về công ty (sau phí) *
                      <input
                        className="input"
                        style={{ marginTop: 4, width: "100%", fontSize: 15, padding: "10px 12px" }}
                        placeholder="Sau khi trừ phí dịch vụ..."
                        value={verifiedReceivedDraft}
                        onChange={(e) => setVerifiedReceivedDraft(e.target.value.replace(/[^\d]/g, ""))}
                      />
                    </label>
                  </div>
                </div>
              )}
              {drawerTxn.method === "installment" && status === "confirmed" && (drawerTxn.verifiedTotal != null || drawerTxn.verifiedReceived != null) && (
                <div style={{ background: "var(--success-bg, #f0faf0)", borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--success-text)", margin: "0 0 4px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--success-text)", textTransform: "uppercase", letterSpacing: 0.5 }}>Kế toán đã xác nhận</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 14 }}>
                    <div><span style={{ color: "var(--text-3)" }}>KH chuyển:</span> <strong>{vnd(drawerTxn.verifiedTotal ?? 0)}</strong></div>
                    <div><span style={{ color: "var(--text-3)" }}>Thực nhận:</span> <strong>{vnd(drawerTxn.verifiedReceived ?? 0)}</strong></div>
                  </div>
                </div>
              )}

              <div className="drawer-foot" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Xác nhận sẽ cập nhật trạng thái về{" "}
                  <strong style={{ color: "var(--success-text)" }}>Đã xác nhận</strong> trên Payment Request.
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {status === "awaiting" && !readOnly && (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ color: "var(--danger)" }}
                        onClick={() => handleReject(drawerTxn, "Từ chối")}
                      >
                        <Icons.XCircle size={14} /> Từ chối
                      </button>
                      <button type="button" className="btn btn-success" onClick={() => {
                        const extra = drawerTxn.method === "installment" ? {
                          verified_total: parseInt(verifiedTotalDraft, 10) || undefined,
                          verified_received: parseInt(verifiedReceivedDraft, 10) || undefined,
                        } : undefined;
                        void handleConfirm(drawerTxn, extra);
                      }}>
                        <Icons.Check size={14} strokeWidth={2.5} /> Xác nhận tiền về
                      </button>
                    </>
                  )}
                  {status === "rejected" && !readOnly && (
                    <button type="button" className="btn btn-outline" onClick={() => {
                      const extra = drawerTxn.method === "installment" ? {
                        verified_total: parseInt(verifiedTotalDraft, 10) || undefined,
                        verified_received: parseInt(verifiedReceivedDraft, 10) || undefined,
                      } : undefined;
                      void handleConfirm(drawerTxn, extra);
                    }}>
                      <Icons.Clock size={14} /> Mở lại — Xác nhận
                    </button>
                  )}
                  {status === "confirmed" && !readOnly && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ color: "var(--danger)" }}
                      onClick={() => handleReject(drawerTxn, "Hoàn tác xác nhận")}
                    >
                      <Icons.XCircle size={14} /> Hoàn tác xác nhận
                    </button>
                  )}
                  {status === "unsent" && (
                    <button type="button" className="btn btn-outline" disabled style={{ opacity: 0.5 }}>
                      Đợi sales upload bill
                    </button>
                  )}
                  {status === "cancelled" && (
                    <button type="button" className="btn btn-outline" disabled style={{ opacity: 0.5 }}>
                      <Icons.XCircle size={14} /> Đã huỷ bởi sales
                    </button>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </aside>

      {lightboxBill && <BillLightbox bill={lightboxBill} onClose={() => setLightboxBill(null)} />}

      {/* Bill modal từ click thumbnail trên bảng — có nút tải từng ảnh + tải tất cả */}
      <Modal
        open={billModal.open}
        onClose={() => {
          setBillModal({ open: false, lineId: "", code: "", images: [] });
          setBillDownloadStatus("");
        }}
        title={`Bill: ${billModal.code}`}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            {billModal.images.length} bill
            {billDownloadStatus ? (
              <span style={{ marginLeft: 8, color: "var(--text-2)" }}>
                · {billDownloadStatus}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={
              !billModal.lineId ||
              (billModal.images.length === 0 && !billModalLineIsBackend) ||
              downloadingAllBills ||
              downloadingBillIndex !== null
            }
            onClick={() => void handleDownloadAllBills()}
          >
            <Icons.Download size={13} /> {downloadingAllBills ? "Đang tải..." : "Tải tất cả"}
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
            maxHeight: "min(70vh, 680px)",
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {billModal.images.map((src, idx) => (
            <div
              key={`${src}-${idx}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 10,
                background: "var(--surface)",
              }}
            >
              <img
                src={src}
                alt={`bill-${idx + 1}`}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  height: "auto",
                  maxHeight: 360,
                  objectFit: "contain",
                  background: "var(--surface-2)",
                }}
              />
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>Bill #{idx + 1}</span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={downloadingAllBills || downloadingBillIndex !== null}
                  onClick={() => void handleDownloadSingleBill(idx)}
                >
                  <Icons.Download size={12} /> {downloadingBillIndex === idx ? "Đang tải..." : "Tải ảnh"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Album gallery từ drawer — tick chọn ảnh, tải đã chọn hoặc tải tất cả */}
      {albumOpen && drawerTxn && (() => {
        const bills = getBillsForTxn(drawerTxn);
        const allSelected = albumSelected.size === bills.length && bills.length > 0;
        const downloadOne = (b: BillImage) => void fallbackDirectImageDownload(b.src, b.name);
        const downloadSelected = () => {
          bills.filter((_, i) => albumSelected.has(i)).forEach(downloadOne);
          setAlbumOpen(false);
        };
        const downloadAll = () => {
          bills.forEach(downloadOne);
          setAlbumOpen(false);
        };
        const toggleSelect = (i: number) => {
          setAlbumSelected((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i); else next.add(i);
            return next;
          });
        };
        return (
          <div className="gmv-prototype-modal-scrim" onClick={() => setAlbumOpen(false)}>
            <div
              className="modal"
              style={{ width: "min(880px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <h3 style={{ color: "var(--text)" }}>Album ảnh bill</h3>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                    {bills.length} ảnh · Tick để chọn từng ảnh, hoặc "Tải tất cả"
                  </div>
                </div>
                <button className="drawer-close" onClick={() => setAlbumOpen(false)}>
                  <Icons.Close size={16} />
                </button>
              </div>
              <div
                className="modal-body"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: 12,
                  overflowY: "auto",
                  padding: "14px 18px",
                }}
              >
                {bills.map((b, i) => {
                  const checked = albumSelected.has(i);
                  return (
                    <div
                      key={b.id}
                      onClick={() => toggleSelect(i)}
                      style={{
                        position: "relative",
                        border: checked ? "2px solid var(--primary)" : "1px solid var(--border)",
                        borderRadius: 10,
                        overflow: "hidden",
                        cursor: "pointer",
                        background: "var(--surface-2)",
                        aspectRatio: "1 / 1",
                      }}
                    >
                      <img
                        src={b.src}
                        alt={b.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                      <div
                        style={{
                          position: "absolute", top: 8, left: 8,
                          width: 22, height: 22, borderRadius: "50%",
                          background: checked ? "var(--primary)" : "rgba(255,255,255,.85)",
                          border: checked ? "2px solid #fff" : "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "0 2px 6px rgba(0,0,0,.18)",
                        }}
                      >
                        {checked && <Icons.Check size={13} stroke="#fff" strokeWidth={3} />}
                      </div>
                      <div
                        style={{
                          position: "absolute", bottom: 0, left: 0, right: 0,
                          background: "linear-gradient(to top, rgba(0,0,0,.65), transparent)",
                          color: "#fff", padding: "16px 10px 8px", fontSize: 11.5, fontWeight: 600,
                        }}
                      >
                        Ảnh #{i + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="modal-foot" style={{ justifyContent: "space-between" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    if (allSelected) setAlbumSelected(new Set());
                    else setAlbumSelected(new Set(bills.map((_, i) => i)));
                  }}
                >
                  {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={albumSelected.size === 0}
                    onClick={downloadSelected}
                  >
                    <Icons.Download size={13} /> Tải đã chọn ({albumSelected.size})
                  </button>
                  <button type="button" className="btn btn-primary" onClick={downloadAll}>
                    <Icons.Download size={13} /> Tải tất cả ({bills.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {pendingReject && (
        <RejectReasonModal
          txnLabel={pendingReject.label}
          onConfirm={confirmReject}
          onCancel={() => setPendingReject(null)}
        />
      )}
    </div>
  );
}
