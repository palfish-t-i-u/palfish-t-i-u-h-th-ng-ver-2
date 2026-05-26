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
import "../styles/prototype-payments.css";

type TabId = "awaiting" | "confirmed" | "cancelled" | "all";
type MethodFilter = "all" | "qr" | "cash" | "card" | "installment";

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

  const openLinkedPaymentRequest = () => {
    if (!drawerTxn?.prId) return;
    const prId = drawerTxn.prId;
    setDrawerOpen(false);
    setDrawerTxn(null);
    navigate("paymentRequests", { openPrId: prId });
  };

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
      } else if (st === "cancelled") c.cancelled++;
      else if (st === "unsent") c.unsent++;
    }
    return { ...c, sums };
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      const st = txnDisplayStatus(t);
      if (tab === "awaiting" && st !== "awaiting") return false;
      if (tab === "confirmed" && st !== "confirmed") return false;
      if (tab === "cancelled" && st !== "cancelled") return false;
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
                      className={`tab-count ${tc.attention && (counts[tc.id as "awaiting" | "confirmed" | "cancelled" | "all"] ?? 0) > 0 && !isActive ? "is-attention" : ""}`}
                    >
                      {counts[tc.id as "awaiting" | "confirmed" | "cancelled" | "all"]}
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
                        <div className="cell-time">{t.createdAt?.split(" ")[0].split("-").reverse().join("/")}</div>
                        <div className="time-relative">{t.createdAt?.split(" ")[1]}</div>
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
                      <td style={{ textAlign: "center" }}>
                        <span
                          className={`txn-bill-preview ${t.billImage || t.bill ? "has" : ""}`}
                          title={t.billImage || t.bill ? "Có biên lai" : "Chưa có biên lai"}
                        >
                          {t.billImage || t.bill ? <Icons.Receipt /> : <Icons.Image />}
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
      <aside className={`drawer ${drawerOpen ? "open" : ""}`} style={{ width: "min(560px, 92vw)" }}>
        {drawerTxn && (
          <>
            <div className="drawer-head">
              <div>
                <span className="pr-id-pill" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {drawerTxn.code}
                </span>
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6 }}>{vnd(drawerTxn.amount)}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {drawerTxn.prName} · {drawerTxn.prId}
                </div>
              </div>
              <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)}>
                <Icons.Close size={16} />
              </button>
            </div>
            <div className="drawer-body">
              <TxnStatusBadge status={txnDisplayStatus(drawerTxn)} />
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="info-grid">
                  <div>
                    <div className="info-label">Phương thức</div>
                    <div className="info-value">{METHOD_META[drawerTxn.method].label}</div>
                  </div>
                  <div>
                    <div className="info-label">Ngân hàng</div>
                    <div className="info-value">{drawerTxn.bank || "—"}</div>
                  </div>
                  <div>
                    <div className="info-label">Thời gian tạo</div>
                    <div className="info-value">{drawerTxn.createdAt}</div>
                  </div>
                  <div>
                    <div className="info-label">Biên lai</div>
                    <div className="info-value">{drawerTxn.billImage || drawerTxn.bill ? "Đã có" : "Chưa có"}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="drawer-foot">
              <button
                type="button"
                className="btn btn-outline"
                onClick={openLinkedPaymentRequest}
              >
                Mở Payment Request
              </button>
              {txnDisplayStatus(drawerTxn) === "awaiting" && (
                <>
                  <button type="button" className="btn btn-outline" onClick={() => void handleReject(drawerTxn)}>
                    Từ chối
                  </button>
                  <button type="button" className="btn btn-success" onClick={() => void handleConfirm(drawerTxn)}>
                    Xác nhận tiền về
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
