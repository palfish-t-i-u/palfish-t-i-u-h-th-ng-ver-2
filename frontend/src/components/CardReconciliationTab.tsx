import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Icons } from "./payment-request/Icons";
import { formatPaymentDateFull, formatPaymentDateTime, vnd } from "./payment-request/paymentRequestUtils";
import {
  isExtInstalled,
  type GatewaySource,
  type GatewayTxn,
  type MatchCandidate,
  type MatchStatus,
} from "./card-recon/mockGatewayTxns";
import { endpoints } from "../lib/api";
import "../styles/prototype-payments.css";

type StatusFilter = "all" | MatchStatus;

const STATUS_META: Record<MatchStatus, { cls: string; text: string }> = {
  pending: { cls: "is-over", text: "Chưa ghép" },
  matched: { cls: "is-done", text: "Đã ghép" },
  ignored: { cls: "is-cancelled", text: "Bỏ qua" },
};

const SOURCE_TABS: { id: GatewaySource; label: string }[] = [
  { id: "mpos", label: "mPOS" },
  { id: "payoo", label: "Payoo" },
];

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "pending", label: "Chưa ghép" },
  { id: "matched", label: "Đã ghép" },
  { id: "ignored", label: "Bỏ qua" },
];

function RefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <polyline points="21 3 21 8 16 8" />
    </svg>
  );
}

function StatusBadge({ s }: { s: MatchStatus }) {
  const m = STATUS_META[s];
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" />
      {m.text}
    </span>
  );
}

export default function CardReconciliationTab({
  lockedSource,
  onGoToSync,
}: {
  lockedSource?: GatewaySource;
  onGoToSync?: () => void;
}) {
  const [txns, setTxns] = useState<GatewayTxn[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<GatewaySource>(lockedSource ?? "mpos");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [candSearch, setCandSearch] = useState("");
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [amountLoaded, setAmountLoaded] = useState(false);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualSearchError, setManualSearchError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(() => isExtInstalled());

  const loadTxns = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await endpoints.cardRecon.list({ source });
      setTxns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[card-recon] load txns failed", err);
      setTxns([]);
    } finally {
      setLoading(false);
    }
  }, [source]);

  const loadSyncStatus = useCallback(async () => {
    try {
      const { data } = await endpoints.cardRecon.syncStatus();
      setLastSync(data.last_sync_at ? formatPaymentDateFull(data.last_sync_at) : null);
      setConnected(Boolean(data.ext_connected) || isExtInstalled());
    } catch (err) {
      console.error("[card-recon] sync status failed", err);
      setConnected(isExtInstalled());
    }
  }, []);

  // Khi nhúng làm tab con (khoá 1 kênh), đồng bộ source theo prop + đóng drawer khi đổi kênh.
  useEffect(() => {
    if (lockedSource) {
      setSource(lockedSource);
      setDrawerOpen(false);
    }
  }, [lockedSource]);

  useEffect(() => {
    loadTxns();
  }, [loadTxns]);

  useEffect(() => {
    loadSyncStatus();
  }, [loadSyncStatus]);

  const drawerTxn = useMemo(() => txns.find((t) => t.id === drawerId) ?? null, [txns, drawerId]);

  const bySource = useMemo(() => txns.filter((t) => t.source === source), [txns, source]);

  const counts = useMemo(() => {
    let matched = 0;
    let pending = 0;
    let sum = 0;
    for (const t of bySource) {
      sum += t.amount;
      if (t.match_status === "matched") matched++;
      else if (t.match_status === "pending") pending++;
    }
    return { total: bySource.length, matched, pending, sum };
  }, [bySource]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bySource.filter((t) => {
      if (statusFilter !== "all" && t.match_status !== statusFilter) return false;
      if (!q) return true;
      return [t.cardholder_name, t.txn_code, t.settlement_code ?? "", t.card_masked, t.matched_label ?? ""]
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [bySource, statusFilter, search]);

  // Tải ứng viên ghép từ API mỗi khi mở drawer (BE đã xếp theo tiền + độ gần ngày).
  useEffect(() => {
    if (!drawerOpen || !drawerId) return;
    const txn = txns.find((t) => t.id === drawerId);
    if (!txn || txn.match_status === "matched") {
      setCandidates([]);
      setAmountLoaded(false);
      return;
    }
    let alive = true;
    setAmountLoaded(false);
    endpoints.cardRecon
      .matchCandidates(drawerId)
      .then(({ data }) => {
        if (!alive) return;
        setCandidates(Array.isArray(data) ? data : []);
        setAmountLoaded(true);
      })
      .catch((err) => {
        console.error("[card-recon] candidates failed", err);
        if (alive) {
          setCandidates([]);
          setAmountLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [drawerOpen, drawerId, txns]);

  // Fallback: khi không có ứng viên cùng số tiền → cho tìm thủ công qua BE (T2.5).
  const isManualMode = amountLoaded && candidates.length === 0;

  useEffect(() => {
    if (!isManualMode || !drawerId) return;
    const q = candSearch.trim();
    if (q.length < 2) {
      setCandidates([]);
      return;
    }
    let alive = true;
    setManualSearching(true);
    setManualSearchError("");
    const timer = setTimeout(() => {
      endpoints.cardRecon
        .matchCandidates(drawerId, { search: q })
        .then(({ data }) => {
          if (alive) setCandidates(Array.isArray(data) ? data : []);
        })
        .catch((err) => {
          console.error("[card-recon] manual search failed", err);
          if (alive) {
            setCandidates([]);
            const ax = err as {
              response?: { data?: { detail?: unknown }; status?: number };
              message?: string;
              code?: string;
            };
            const detail = ax?.response?.data?.detail;
            const status = ax?.response?.status;
            let msg: string;
            if (typeof detail === "string") {
              msg = detail;
            } else if (status) {
              msg = `Lỗi máy chủ (HTTP ${status})`;
            } else {
              msg = `Lỗi mạng: ${ax?.code || ax?.message || "không rõ"}`;
            }
            setManualSearchError(msg);
          }
        })
        .finally(() => {
          if (alive) setManualSearching(false);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [isManualMode, candSearch, drawerId]);

  const filteredCandidates = useMemo(() => {
    if (isManualMode) return candidates;
    const q = candSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.pr_id, c.pr_name, c.uid].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [candidates, candSearch, isManualMode]);

  const openDrawer = (t: GatewayTxn) => {
    setDrawerId(t.id);
    setPicked(t.payment_line_id);
    setCandSearch("");
    setDrawerOpen(true);
  };

  const updateTxn = (id: string, patch: Partial<GatewayTxn>) =>
    setTxns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const handleMatch = async () => {
    if (!drawerTxn || !picked) return;
    try {
      const { data } = await endpoints.cardRecon.match(drawerTxn.id, picked);
      updateTxn(drawerTxn.id, data);
    } catch (err) {
      console.error("[card-recon] match failed", err);
      return;
    }
    setDrawerOpen(false);
  };

  const handleIgnore = async (id: string) => {
    try {
      const { data } = await endpoints.cardRecon.patchStatus(id, "ignored");
      updateTxn(id, data);
    } catch (err) {
      console.error("[card-recon] ignore failed", err);
      return;
    }
    setDrawerOpen(false);
  };

  const handleUnmatch = async (id: string) => {
    try {
      const { data } = await endpoints.cardRecon.patchStatus(id, "pending");
      updateTxn(id, data);
    } catch (err) {
      console.error("[card-recon] unmatch failed", err);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    // TODO: cầu nối message → extension chạy sync ngay. Hiện tại tải lại data + trạng thái từ backend.
    await Promise.all([loadTxns(), loadSyncStatus()]);
    setSyncing(false);
  };

  const groupCol = source === "mpos" ? "Phiếu chi" : "Kênh / Mã đơn";

  return (
    <div className="gmv-prototype">
      <div className="page">
        <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 760, lineHeight: 1.55, marginBottom: 4 }}>
          Giao dịch quẹt thẻ <strong style={{ color: "var(--text-2)" }}>mPOS</strong> &{" "}
          <strong style={{ color: "var(--text-2)" }}>Payoo</strong> được đồng bộ tự động về đây. Kế toán đối chiếu từng
          giao dịch với ảnh bill sales gửi rồi <strong style={{ color: "var(--text-2)" }}>ghép vào đúng lần thanh toán</strong>{" "}
          của Payment Request.
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 14px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            fontSize: 12.5,
            marginBottom: 8,
          }}
        >
          <Icons.Database size={15} stroke="var(--text-3)" />
          {connected ? (
            <>
              <span style={{ color: "var(--text-2)" }}>
                Đồng bộ gần nhất: <strong>{lastSync ?? "chưa có"}</strong>
              </span>
              <span style={{ color: "var(--text-3)" }}>· Tự động tải định kỳ qua tiện ích trình duyệt</span>
              <div style={{ marginLeft: "auto" }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={handleSync} disabled={syncing}>
                  <RefreshIcon /> {syncing ? "Đang đồng bộ…" : "Đồng bộ ngay"}
                </button>
              </div>
            </>
          ) : (
            <>
              <span style={{ color: "var(--warning-text)" }}>
                {isExtInstalled()
                  ? "Tiện ích đã cài nhưng chưa có giao dịch nào đồng bộ về. Bạn vào tab Đồng bộ mPOS/Payoo và bấm Đồng bộ ngay."
                  : "Tiện ích chưa được cài. Bạn vào tab Đồng bộ mPOS/Payoo để cài tiện ích → tiện ích tự kéo giao dịch về app."}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={handleSync} disabled={syncing}>
                  <RefreshIcon /> {syncing ? "Đang tải…" : "Tải lại"}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => onGoToSync?.()}>
                  <Icons.Download size={13} /> {isExtInstalled() ? "Đi tới tab Đồng bộ" : "Cài tiện ích"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-icon">
              <Icons.Database size={16} />
            </div>
            <div className="kpi-label">Tổng giao dịch</div>
            <div className="kpi-value">{loading ? "…" : counts.total}</div>
            <div className="kpi-sub">{SOURCE_TABS.find((s) => s.id === source)?.label}</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--warning-bg)", color: "var(--warning-text)" }}>
              <Icons.Clock size={16} />
            </div>
            <div className="kpi-label">Chưa ghép</div>
            <div className="kpi-value">{loading ? "…" : counts.pending}</div>
            <div className="kpi-sub">Chờ kế toán đối chiếu</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>
              <Icons.CheckCircle size={16} />
            </div>
            <div className="kpi-label">Đã ghép</div>
            <div className="kpi-value">{loading ? "…" : counts.matched}</div>
            <div className="kpi-sub">Khớp lần thanh toán</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon">
              <Icons.Wallet size={16} />
            </div>
            <div className="kpi-label">Tổng tiền</div>
            <div className="kpi-value" style={{ fontSize: 18 }}>{loading ? "…" : vnd(counts.sum)}</div>
            <div className="kpi-sub">Toàn bộ {SOURCE_TABS.find((s) => s.id === source)?.label}</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <Icons.Search size={15} stroke="var(--text-3)" />
            <input
              placeholder="Tìm theo tên chủ thẻ, mã giao dịch, phiếu chi…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {STATUS_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`filter-chip ${statusFilter === c.id ? "active" : ""}`}
              onClick={() => setStatusFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="table-card has-tabs">
          <div className="table-head with-tabs">
            {lockedSource ? (
              <div className="tabs">
                <div className="tab active">
                  {source === "mpos" ? "mPOS" : "Payoo"}
                  <span className="tab-count">{loading ? "…" : bySource.length}</span>
                </div>
              </div>
            ) : (
              <div className="tabs">
                {SOURCE_TABS.map((s) => {
                  const isActive = source === s.id;
                  const n = txns.filter((t) => t.source === s.id).length;
                  return (
                    <div key={s.id} className={`tab ${isActive ? "active" : ""}`} onClick={() => setSource(s.id)}>
                      {s.label}
                      <span className="tab-count">{loading ? "…" : n}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <span className="right-meta">{loading ? "Đang tải…" : `${filtered.length} kết quả`}</span>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Thời gian</th>
                  <th style={{ minWidth: 200 }}>Chủ thẻ / Thẻ</th>
                  <th style={{ width: 150, textAlign: "right" }}>Số tiền</th>
                  <th style={{ width: 170 }}>{groupCol}</th>
                  <th style={{ width: 120 }}>Trạng thái</th>
                  <th style={{ width: 110, textAlign: "center" }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty">
                        <Icons.Database size={20} />
                        <div>{loading ? "Đang tải…" : "Không có giao dịch nào khớp điều kiện lọc."}</div>
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map((t) => {
                  const dt = formatPaymentDateTime(t.paid_at);
                  return (
                    <tr
                      key={t.id}
                      className={drawerOpen && drawerId === t.id ? "selected" : ""}
                      onClick={() => openDrawer(t)}
                    >
                      <td>
                        <div className="cell-time">{dt.date}</div>
                        <div className="time-relative">{dt.time}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>{t.cardholder_name}</div>
                        <div className="cell-sub">
                          {t.card_type} · {t.card_masked}
                          {t.installment_term ? ` · trả góp ${t.installment_term} kỳ` : ""}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="txn-amount" style={{ color: "var(--money)" }}>{vnd(t.amount)}</span>
                        <div className="cell-sub">TN {vnd(t.net_amount)}</div>
                      </td>
                      <td>
                        {t.source === "mpos" ? (
                          <>
                            <span className="cell-mono">{t.settlement_code}</span>
                            {t.collector_region && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 11,
                                  padding: "1px 7px",
                                  borderRadius: 6,
                                  background: "var(--surface-3)",
                                  color: "var(--text-2)",
                                }}
                              >
                                {t.collector_region}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{t.category}</div>
                            <div className="cell-sub cell-mono">…{t.txn_code.slice(-4)}</div>
                          </>
                        )}
                      </td>
                      <td>
                        <StatusBadge s={t.match_status} />
                        {t.match_status === "matched" && t.matched_label && (
                          <div className="cell-sub" style={{ marginTop: 2 }}>{t.matched_label}</div>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        {t.match_status === "pending" ? (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => openDrawer(t)}>
                            <Icons.Wallet size={13} /> Ghép
                          </button>
                        ) : (
                          <button type="button" className="row-action" title="Xem chi tiết" onClick={() => openDrawer(t)}>
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
      <aside className={`drawer ${drawerOpen ? "open" : ""}`} style={{ width: "min(960px, 95vw)" }}>
        {drawerTxn && (
          <>
            <div className="drawer-head">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                  className="pr-id-pill"
                  style={{ background: "var(--surface-3)", color: "var(--text-2)", fontFamily: "JetBrains Mono, monospace" }}
                >
                  {drawerTxn.source === "mpos" ? "mPOS" : "Payoo"}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{vnd(drawerTxn.amount)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                    {drawerTxn.cardholder_name} · {drawerTxn.card_masked}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusBadge s={drawerTxn.match_status} />
                <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)}>
                  <Icons.Close size={16} />
                </button>
              </div>
            </div>

            <div className="drawer-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="panel" style={{ padding: 16 }}>
                <div className="panel-head" style={{ marginBottom: 10 }}>
                  <h4>Thông tin giao dịch</h4>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="info-cell">
                    <div className="info-label">Loại</div>
                    <div className="info-value">{drawerTxn.category}</div>
                  </div>
                  <div className="info-cell">
                    <div className="info-label">Thẻ</div>
                    <div className="info-value">{drawerTxn.card_type} · {drawerTxn.card_masked}</div>
                  </div>
                  <div className="info-cell">
                    <div className="info-label">Số tiền</div>
                    <div className="info-value money">{vnd(drawerTxn.amount)}</div>
                  </div>
                  <div className="info-cell">
                    <div className="info-label">Thực nhận (sau phí)</div>
                    <div className="info-value">{vnd(drawerTxn.net_amount)}</div>
                  </div>
                  <div className="info-cell">
                    <div className="info-label">Thời gian</div>
                    <div className="info-value">{formatPaymentDateFull(drawerTxn.paid_at)}</div>
                  </div>
                  <div className="info-cell">
                    <div className="info-label">{drawerTxn.source === "mpos" ? "Mã phiếu chi" : "Mã chuẩn chi"}</div>
                    <div className="info-value mono">{drawerTxn.settlement_code || "—"}</div>
                  </div>
                  <div className="info-cell">
                    <div className="info-label">Mã giao dịch</div>
                    <div className="info-value mono">{drawerTxn.txn_code}</div>
                  </div>
                  <div className="info-cell">
                    <div className="info-label">{drawerTxn.source === "mpos" ? "Chi nhánh" : "Ngân hàng"}</div>
                    <div className="info-value">{drawerTxn.collector_region || drawerTxn.bank || "—"}</div>
                  </div>
                </div>
              </div>

              {drawerTxn.match_status === "matched" ? (
                <div className="panel" style={{ padding: 16 }}>
                  <div className="panel-head" style={{ marginBottom: 10 }}>
                    <h4>Đã ghép</h4>
                  </div>
                  <div
                    style={{
                      background: "var(--success-bg)",
                      color: "var(--success-text)",
                      borderRadius: 10,
                      padding: "12px 14px",
                      fontSize: 13.5,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Icons.CheckCircle size={16} /> {drawerTxn.matched_label}
                  </div>
                </div>
              ) : (
                <div className="panel" style={{ padding: 16 }}>
                  <div className="panel-head" style={{ marginBottom: 4 }}>
                    <h4>Ghép với lần thanh toán</h4>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 10 }}>
                    Gợi ý theo số tiền + ngày gần. Đối chiếu ảnh bill sales gửi trước khi ghép.
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
                    <div>
                      <div className="search" style={{ marginBottom: 8 }}>
                        <Icons.Search size={14} stroke="var(--text-3)" />
                        <input
                          placeholder={isManualMode ? "Tìm theo PR-ID, tên, UID, SĐT (gõ ≥ 2 ký tự)…" : "Tìm PR / tên / UID…"}
                          value={candSearch}
                          onChange={(e) => setCandSearch(e.target.value)}
                        />
                      </div>
                      {isManualMode && (
                        <div style={{
                          fontSize: 11.5,
                          color: "var(--caution-text, #92400e)",
                          background: "var(--caution-bg, #fef9c3)",
                          border: "1px solid var(--caution, #eab308)",
                          padding: "6px 10px",
                          borderRadius: 6,
                          marginBottom: 8,
                        }}>
                          Không có lần thanh toán nào cùng số tiền. Gõ PR-ID, tên KH, UID hoặc SĐT để tìm thủ công.
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                        {manualSearching && (
                          <div style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 0" }}>Đang tìm…</div>
                        )}
                        {!manualSearching && manualSearchError && (
                          <div style={{ fontSize: 12, color: "var(--danger)", padding: "8px 10px", background: "var(--danger-bg, #fee2e2)", borderRadius: 6 }}>
                            {manualSearchError}
                          </div>
                        )}
                        {!manualSearching && !manualSearchError && filteredCandidates.length === 0 && (
                          <div style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 0" }}>
                            {isManualMode
                              ? (candSearch.trim().length < 2 ? "Gõ ít nhất 2 ký tự để tìm." : "Không tìm thấy PR phù hợp.")
                              : "Không có lần thanh toán phù hợp. Thử tìm theo PR-ID."}
                          </div>
                        )}
                        {filteredCandidates.map((c) => {
                          const isPick = picked === c.payment_line_id;
                          const exact = c.amount === drawerTxn.amount;
                          return (
                            <label
                              key={c.payment_line_id}
                              style={{
                                display: "block",
                                border: isPick ? "2px solid var(--primary)" : "1px solid var(--border)",
                                borderRadius: 10,
                                padding: "9px 11px",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input
                                  type="radio"
                                  name="cand"
                                  checked={isPick}
                                  onChange={() => setPicked(c.payment_line_id)}
                                />
                                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.pr_id}</span>
                                {exact && (
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      padding: "1px 6px",
                                      borderRadius: 6,
                                      background: "var(--success-bg)",
                                      color: "var(--success-text)",
                                    }}
                                  >
                                    trùng tiền
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 24 }}>
                                {c.pr_name} · lần TT {c.attempt_idx}
                              </div>
                              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginLeft: 24 }}>
                                {vnd(c.amount)} · {c.created_at}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="info-label" style={{ marginBottom: 6 }}>Ảnh bill lần thanh toán</div>
                      {(() => {
                        const pc = candidates.find((c) => c.payment_line_id === picked);
                        const box: CSSProperties = {
                          borderRadius: 10, height: 150, display: "flex", flexDirection: "column",
                          gap: 6, fontSize: 12, padding: 12,
                        };
                        if (!pc)
                          return (
                            <div style={{ ...box, border: "1.5px dashed var(--border)", color: "var(--text-3)", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                              <Icons.Image size={22} />
                              <span>Chọn 1 lần thanh toán bên trái để xem ảnh bill</span>
                            </div>
                          );
                        if (!pc.has_bill)
                          return (
                            <div style={{ ...box, border: "1.5px dashed var(--warning-text)", background: "var(--warning-bg)", color: "var(--warning-text)", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                              <Icons.AlertCircle size={20} />
                              <span>{pc.pr_id} chưa có ảnh bill — nhắc sales upload trước khi ghép</span>
                            </div>
                          );
                        return (
                          <div style={{ ...box, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 10.5, letterSpacing: "0.05em", color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>
                                Biên lai · {pc.pr_id}
                              </span>
                              <Icons.Receipt size={15} />
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                              {pc.pr_name} · lần TT {pc.attempt_idx}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--money)", marginTop: "auto" }}>{vnd(pc.amount)}</div>
                            <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{pc.created_at}</div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="drawer-foot" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              {drawerTxn.match_status === "matched" ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ color: "var(--danger)" }}
                  onClick={() => handleUnmatch(drawerTxn.id)}
                >
                  <Icons.XCircle size={14} /> Gỡ ghép
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-outline" onClick={() => handleIgnore(drawerTxn.id)}>
                    Bỏ qua (không liên quan)
                  </button>
                  <button type="button" className="btn btn-success" disabled={!picked} onClick={handleMatch}>
                    <Icons.Check size={14} strokeWidth={2.5} /> Ghép giao dịch này
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
