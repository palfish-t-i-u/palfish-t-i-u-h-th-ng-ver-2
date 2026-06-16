import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Icons } from "./payment-request/Icons";
import { formatPaymentDateFull, formatPaymentDateTime, vnd } from "./payment-request/paymentRequestUtils";
import {
  type GatewaySource,
  type GatewayTxn,
  type MatchCandidate,
  type MatchStatus,
  LAST_SYNC_AT,
  MOCK_GATEWAY_TXNS,
  MOCK_MATCH_CANDIDATES,
  isExtInstalled,
  suggestCandidates,
} from "./card-recon/mockGatewayTxns";
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

function candidateLabel(c: MatchCandidate) {
  return `${c.pr_id} · ${c.pr_name} · lần TT ${c.attempt_idx}`;
}

export default function CardReconciliationTab({
  lockedSource,
  onGoToSync,
}: {
  lockedSource?: GatewaySource;
  onGoToSync?: () => void;
}) {
  const [txns, setTxns] = useState<GatewayTxn[]>(MOCK_GATEWAY_TXNS);
  const [source, setSource] = useState<GatewaySource>(lockedSource ?? "mpos");
  const [installed, setInstalled] = useState(isExtInstalled());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [candSearch, setCandSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(LAST_SYNC_AT);

  // Khi nhúng làm tab con (khoá 1 kênh), đồng bộ source theo prop + đóng drawer khi đổi kênh.
  useEffect(() => {
    if (lockedSource) {
      setSource(lockedSource);
      setDrawerOpen(false);
    }
  }, [lockedSource]);

  // Cập nhật trạng thái tiện ích khi quay lại tab / đổi ở tab Đồng bộ.
  useEffect(() => {
    const refresh = () => setInstalled(isExtInstalled());
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

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

  const candidates = useMemo(() => {
    if (!drawerTxn) return [];
    const list = suggestCandidates(drawerTxn, MOCK_MATCH_CANDIDATES);
    const q = candSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      [c.pr_id, c.pr_name, c.uid].some((v) => v.toLowerCase().includes(q)),
    );
  }, [drawerTxn, candSearch]);

  const openDrawer = (t: GatewayTxn) => {
    setDrawerId(t.id);
    setPicked(t.payment_line_id);
    setCandSearch("");
    setDrawerOpen(true);
  };

  const updateTxn = (id: string, patch: Partial<GatewayTxn>) =>
    setTxns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const handleMatch = () => {
    if (!drawerTxn || !picked) return;
    const c = MOCK_MATCH_CANDIDATES.find((x) => x.payment_line_id === picked);
    updateTxn(drawerTxn.id, {
      match_status: "matched",
      payment_line_id: picked,
      matched_label: c ? candidateLabel(c) : drawerTxn.matched_label,
    });
    setDrawerOpen(false);
  };

  const handleIgnore = (id: string) => {
    updateTxn(id, { match_status: "ignored", payment_line_id: null, matched_label: null });
    setDrawerOpen(false);
  };

  const handleUnmatch = (id: string) => {
    updateTxn(id, { match_status: "pending", payment_line_id: null, matched_label: null });
  };

  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);
    window.setTimeout(() => {
      setSyncing(false);
      setLastSync(formatPaymentDateFull(new Date().toISOString()));
    }, 1200);
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
          {installed ? (
            <>
              <span style={{ color: "var(--text-2)" }}>
                Đồng bộ gần nhất: <strong>{lastSync}</strong>
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
                Chưa cài tiện ích đồng bộ — dữ liệu dưới đây là <strong>dữ liệu mẫu</strong>.
              </span>
              <div style={{ marginLeft: "auto" }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => onGoToSync?.()}>
                  <Icons.Download size={13} /> Cài tiện ích
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
            <div className="kpi-value">{counts.total}</div>
            <div className="kpi-sub">{SOURCE_TABS.find((s) => s.id === source)?.label}</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--warning-bg)", color: "var(--warning-text)" }}>
              <Icons.Clock size={16} />
            </div>
            <div className="kpi-label">Chưa ghép</div>
            <div className="kpi-value">{counts.pending}</div>
            <div className="kpi-sub">Chờ kế toán đối chiếu</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>
              <Icons.CheckCircle size={16} />
            </div>
            <div className="kpi-label">Đã ghép</div>
            <div className="kpi-value">{counts.matched}</div>
            <div className="kpi-sub">Khớp lần thanh toán</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon">
              <Icons.Wallet size={16} />
            </div>
            <div className="kpi-label">Tổng tiền</div>
            <div className="kpi-value" style={{ fontSize: 18 }}>{vnd(counts.sum)}</div>
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
                  <span className="tab-count">{bySource.length}</span>
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
                      <span className="tab-count">{n}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <span className="right-meta">{filtered.length} kết quả</span>
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
                        <div>Không có giao dịch nào khớp điều kiện lọc.</div>
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
      <aside className={`drawer ${drawerOpen ? "open" : ""}`} style={{ width: "min(680px, 92vw)" }}>
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

                  <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14 }}>
                    <div>
                      <div className="search" style={{ marginBottom: 8 }}>
                        <Icons.Search size={14} stroke="var(--text-3)" />
                        <input
                          placeholder="Tìm PR / tên / UID…"
                          value={candSearch}
                          onChange={(e) => setCandSearch(e.target.value)}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                        {candidates.length === 0 && (
                          <div style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 0" }}>
                            Không có lần thanh toán phù hợp. Thử tìm theo PR-ID.
                          </div>
                        )}
                        {candidates.map((c) => {
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
                        const pc = MOCK_MATCH_CANDIDATES.find((c) => c.payment_line_id === picked);
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
