import { useEffect, useMemo, useState } from "react";
import { usePaymentFlow } from "../contexts/PaymentFlowContext";
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
import { formatPaymentDateFull, formatPaymentDateTime, fmtPhone } from "./payment-request/paymentRequestUtils";
import "../styles/prototype-payments.css";

type TabId = "awaiting" | "confirmed" | "cancelled" | "all";
type MethodFilter = "all" | "qr" | "cash" | "card" | "installment";

type BillImage = { id: number; src: string; name: string };

function getBillsForTxn(t: FlatTransaction): BillImage[] {
  if (!t.bill && !t.billImage) return [];
  if (t.billImage) {
    return [{ id: 0, src: t.billImage, name: `bill_${t.code}.png` }];
  }
  return [];
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

function BillLightbox({ bill, onClose }: { bill: BillImage; onClose: () => void }) {
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

function TxnStatusBadge({ status }: { status: TxnDisplayStatus }) {
  const meta = TXN_STATUS_META[status] || TXN_STATUS_META.unsent;
  return (
    <span className={`badge ${meta.cls}`}>
      <span className="dot" />
      {meta.text}
    </span>
  );
}

export default function ReconciliationTab() {
  const { requests, confirmTransaction, rejectTransaction, navigate, apiNote } = usePaymentFlow();
  const [tab, setTab] = useState<TabId>("awaiting");
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerTxn, setDrawerTxn] = useState<FlatTransaction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lightboxBill, setLightboxBill] = useState<BillImage | null>(null);

  const transactions = useMemo(() => flattenTransactions(requests), [requests]);

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

  const handleConfirm = async (t: FlatTransaction) => {
    await confirmTransaction(t.prId, t.id);
  };

  const handleReject = async (t: FlatTransaction) => {
    await rejectTransaction(t.prId, t.id);
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

          {selectedIds.size > 0 && (
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
                    selectedIds.forEach((key) => {
                      const t = transactions.find((x) => x.key === key);
                      if (t) void handleReject(t);
                    });
                    setSelectedIds(new Set());
                  }}
                >
                  <Icons.XCircle size={13} /> Từ chối đã chọn
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={() => {
                    selectedIds.forEach((key) => {
                      const t = transactions.find((x) => x.key === key);
                      if (t) void handleConfirm(t);
                    });
                    setSelectedIds(new Set());
                  }}
                >
                  <Icons.Check size={13} strokeWidth={2.5} /> Xác nhận đã chọn
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
                  const hasBill = !!(t.bill || t.billImage);
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
                          {t.method === "installment" && `${t.bank || "—"}`}
                          {t.method === "qr" && (t.bank || "—")}
                        </div>
                        {t.method === "installment" && (
                          <div className="cell-sub">{t.installmentMonths} tháng</div>
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
                            const bills = getBillsForTxn(t);
                            if (bills[0]) setLightboxBill(bills[0]);
                          }}
                          style={t.billImage ? { cursor: "pointer", padding: 0, overflow: "hidden" } : undefined}
                        >
                          {t.billImage ? (
                            <img src={t.billImage} alt="Biên lai" className="txn-bill-thumb" />
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
                        {status === "awaiting" ? (
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
                              onClick={() => void handleReject(t)}
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
                      <div className="bill-thumb-grid">
                        {billImages.map((b) => (
                          <div
                            key={b.id}
                            className="bill-thumb"
                            onClick={() => setLightboxBill(b)}
                            title="Click để phóng to"
                          >
                            <img src={b.src} alt={b.name} />
                            <div className="bill-thumb-overlay">
                              <Icons.Image size={12} /> #{b.id + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8, textAlign: "center" }}>
                        {billImages.length} ảnh đã upload · Click thumb để phóng to
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
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setLightboxBill(billImages[0])}>
                          <Icons.Image size={13} /> Phóng to
                        </button>
                        <a href={billImages[0].src} download={billImages[0].name} className="btn btn-outline btn-sm">
                          <Icons.Download size={13} /> Tải ảnh
                        </a>
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
                            `${drawerTxn.bank || "—"} · ${drawerTxn.installmentMonths || "—"} tháng`}
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
                          {drawerTxn.bill || drawerTxn.billImage ? (
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

              <div className="drawer-foot" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Xác nhận sẽ cập nhật trạng thái về{" "}
                  <strong style={{ color: "var(--success-text)" }}>Đã xác nhận</strong> trên Payment Request.
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {status === "awaiting" && (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ color: "var(--danger)" }}
                        onClick={() => void handleReject(drawerTxn)}
                      >
                        <Icons.XCircle size={14} /> Từ chối
                      </button>
                      <button type="button" className="btn btn-success" onClick={() => void handleConfirm(drawerTxn)}>
                        <Icons.Check size={14} strokeWidth={2.5} /> Xác nhận tiền về
                      </button>
                    </>
                  )}
                  {status === "rejected" && (
                    <button type="button" className="btn btn-outline" onClick={() => void handleConfirm(drawerTxn)}>
                      <Icons.Clock size={14} /> Mở lại — Xác nhận
                    </button>
                  )}
                  {status === "confirmed" && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ color: "var(--danger)" }}
                      onClick={() => void handleReject(drawerTxn)}
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
    </div>
  );
}
