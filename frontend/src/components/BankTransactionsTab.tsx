import { useCallback, useEffect, useMemo, useState } from "react";
import { Icons } from "./payment-request/Icons";
import { formatPaymentDateFull, vnd } from "./payment-request/paymentRequestUtils";
import { endpoints, type BankTransaction, type BankMatchCandidate } from "../lib/api";
import "../styles/prototype-payments.css";

type BankMatchStatus = BankTransaction["match_status"];
type StatusFilter = "all" | BankMatchStatus | "todo";

const STATUS_META: Record<BankMatchStatus, { cls: string; text: string }> = {
  pending: { cls: "is-over", text: "Chờ xử lý" },
  auto_matched: { cls: "is-done", text: "Tự động khớp" },
  manual_matched: { cls: "is-done", text: "Khớp tay" },
  needs_review: { cls: "is-warn", text: "Cần kiểm tra" },
  ignored: { cls: "is-cancelled", text: "Bỏ qua" },
};

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: "todo", label: "Cần xử lý" },
  { id: "pending", label: "Chờ xử lý" },
  { id: "needs_review", label: "Cần kiểm tra" },
  { id: "auto_matched", label: "Tự động khớp" },
  { id: "manual_matched", label: "Khớp tay" },
  { id: "ignored", label: "Bỏ qua" },
  { id: "all", label: "Tất cả" },
];

const GATEWAY_LABEL: Record<string, string> = {
  sepay_webhook: "SePay Webhook",
  sepay_poll: "SePay Poll",
  manual: "Nhập tay",
};

function StatusBadge({ s }: { s: BankMatchStatus }) {
  const m = STATUS_META[s] ?? STATUS_META.pending;
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" />
      {m.text}
    </span>
  );
}

export default function BankTransactionsTab() {
  const [txns, setTxns] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todo");
  const [search, setSearch] = useState("");

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [candidates, setCandidates] = useState<BankMatchCandidate[]>([]);
  const [candLoading, setCandLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);

  const loadTxns = useCallback(async () => {
    setLoading(true);
    try {
      // "todo" + "all" load tất cả; status thật mới đẩy lên BE
      const isPureStatus =
        statusFilter !== "all" && statusFilter !== "todo";
      const { data } = await endpoints.bankTxns.list(
        isPureStatus ? { status: statusFilter } : undefined,
      );
      setTxns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[bank-txns] load failed", err);
      setTxns([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadTxns(); }, [loadTxns]);

  const filtered = useMemo(() => {
    let list = txns;
    // "Cần xử lý" = pending + needs_review (cái kế toán phải đụng tay)
    if (statusFilter === "todo") {
      list = list.filter(
        (t) => t.match_status === "pending" || t.match_status === "needs_review",
      );
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (t) =>
        (t.transfer_content ?? "").toLowerCase().includes(q) ||
        (t.content ?? "").toLowerCase().includes(q) ||
        String(t.amount).includes(q) ||
        (t.account_number ?? "").toLowerCase().includes(q),
    );
  }, [txns, search, statusFilter]);

  const counts = useMemo(() => {
    const c = { total: txns.length, pending: 0, matched: 0, needs_review: 0 };
    for (const t of txns) {
      if (t.match_status === "pending") c.pending++;
      else if (t.match_status === "auto_matched" || t.match_status === "manual_matched") c.matched++;
      else if (t.match_status === "needs_review") c.needs_review++;
    }
    return c;
  }, [txns]);

  const openDrawer = async (txnId: string) => {
    setDrawerId(txnId);
    setDrawerOpen(true);
    setPicked(null);
    setCandLoading(true);
    try {
      const { data } = await endpoints.bankTxns.matchCandidates(txnId);
      setCandidates(Array.isArray(data) ? data : []);
    } catch {
      setCandidates([]);
    } finally {
      setCandLoading(false);
    }
  };

  const doMatch = async () => {
    if (!drawerId || !picked) return;
    setMatching(true);
    try {
      await endpoints.bankTxns.match(drawerId, picked);
      setDrawerOpen(false);
      setDrawerId(null);
      loadTxns();
    } catch (err) {
      console.error("[bank-txns] match failed", err);
      alert("Khớp thất bại — kiểm tra lại giao dịch");
    } finally {
      setMatching(false);
    }
  };

  const drawerTxn = drawerId ? txns.find((t) => t.txn_id === drawerId) : null;

  return (
    <div className="card-recon-tab">
      <div style={{
        padding: "10px 14px", borderRadius: 8, background: "var(--surface-3, #f1f5f9)",
        fontSize: 12, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.5,
      }}>
        <strong>Tiền vào TK công ty</strong> được PayOS + SePay ghi nhận song song.
        Giao dịch có mã thanh toán app tạo (QR app) → <strong>PayOS tự khớp</strong> với lần thanh toán,
        SePay chỉ lưu để đối chiếu. Giao dịch không có mã (khách CK ngoài) → kế toán <strong>ghép tay</strong> tại đây.
        Mặc định chỉ hiện <strong>giao dịch cần xử lý</strong>.
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Tổng giao dịch" value={counts.total} icon={<Icons.Doc size={14} />} />
        <SummaryCard label="Chờ xử lý" value={counts.pending} icon={<Icons.Clock size={14} />} accent="var(--warning)" />
        <SummaryCard label="Cần kiểm tra" value={counts.needs_review} icon={<Icons.AlertCircle size={14} />} accent="var(--danger, #e53e3e)" />
        <SummaryCard label="Đã khớp" value={counts.matched} icon={<Icons.CheckCircle size={14} />} accent="var(--success)" />
      </div>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
          <Icons.Search size={14} />
          <input
            placeholder="Tìm nội dung CK, số tiền, tài khoản..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {STATUS_CHIPS.map((c) => (
            <button
              key={c.id}
              className={`chip ${statusFilter === c.id ? "active" : ""}`}
              onClick={() => setStatusFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadTxns} disabled={loading}>
          <RefreshIcon /> Tải lại
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="empty-state"><Icons.Clock size={20} /> Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Icons.CheckCircle size={20} />
          {statusFilter === "todo" ? (
            <>
              <div>Không có giao dịch nào chờ xử lý.</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Mọi tiền vào đã được PayOS tự khớp hoặc kế toán đã ghép tay. Bấm "Tất cả" để xem toàn bộ.
              </div>
            </>
          ) : (
            <>
              <div>Chưa có giao dịch ngân hàng nào{statusFilter !== "all" ? ` (${STATUS_CHIPS.find((c) => c.id === statusFilter)?.label})` : ""}.</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Giao dịch sẽ xuất hiện khi SePay webhook nhận biến động số dư từ ngân hàng.
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="recon-table-wrap" style={{ overflowX: "auto" }}>
          <table className="data-table recon-table">
            <thead>
              <tr>
                <th style={{ minWidth: 130 }}>Thời gian</th>
                <th style={{ textAlign: "right", minWidth: 110 }}>Số tiền</th>
                <th style={{ minWidth: 200 }}>Nội dung CK</th>
                <th style={{ minWidth: 100 }}>Tài khoản</th>
                <th style={{ minWidth: 90 }}>Nguồn</th>
                <th style={{ minWidth: 100 }}>Trạng thái</th>
                <th style={{ minWidth: 80 }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const canMatch = t.match_status === "pending" || t.match_status === "needs_review";
                return (
                  <tr key={t.txn_id}>
                    <td>{t.transaction_date ? formatPaymentDateFull(t.transaction_date) : t.created_at ? formatPaymentDateFull(t.created_at) : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {vnd(t.amount)}
                    </td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.transfer_content || t.content || "—"}
                    </td>
                    <td>{t.account_number || "—"}</td>
                    <td style={{ fontSize: 11 }}>{GATEWAY_LABEL[t.gateway] ?? t.gateway}</td>
                    <td><StatusBadge s={t.match_status} /></td>
                    <td>
                      {canMatch ? (
                        <button className="btn btn-primary btn-xs" onClick={() => openDrawer(t.txn_id)}>
                          Ghép
                        </button>
                      ) : t.match_status === "auto_matched" || t.match_status === "manual_matched" ? (
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>Đã ghép</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 0", fontSize: 11, color: "var(--text-3)" }}>
            Hiện {filtered.length} / {txns.length} giao dịch
          </div>
        </div>
      )}

      {/* Match drawer */}
      {drawerOpen && drawerTxn && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <h3>Ghép giao dịch → Lần thanh toán</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            {/* Transaction info */}
            <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>Giao dịch ngân hàng</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                <div><strong>Số tiền:</strong> {vnd(drawerTxn.amount)}</div>
                <div><strong>Ngày:</strong> {drawerTxn.transaction_date ? formatPaymentDateFull(drawerTxn.transaction_date) : "—"}</div>
                <div style={{ gridColumn: "1/-1" }}>
                  <strong>Nội dung:</strong> {drawerTxn.transfer_content || drawerTxn.content || "—"}
                </div>
                <div><strong>TK:</strong> {drawerTxn.account_number || "—"}</div>
                <div><strong>Nguồn:</strong> {GATEWAY_LABEL[drawerTxn.gateway] ?? drawerTxn.gateway}</div>
              </div>
            </div>

            {/* Candidates */}
            <div style={{ padding: 16, flex: 1, overflow: "auto" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>
                Chọn lần thanh toán để ghép (sắp xếp theo số tiền gần nhất):
              </div>
              {candLoading ? (
                <div style={{ textAlign: "center", padding: 20, color: "var(--text-3)" }}>Đang tải...</div>
              ) : candidates.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "var(--text-3)" }}>
                  Không tìm thấy lần thanh toán phù hợp.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {candidates.map((c) => {
                    const amountMatch = Math.abs(c.amount - drawerTxn.amount) < 1;
                    const selected = picked === c.payment_line_id;
                    return (
                      <div
                        key={c.payment_line_id}
                        onClick={() => setPicked(c.payment_line_id)}
                        style={{
                          padding: "10px 12px",
                          border: `2px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                          borderRadius: 8,
                          cursor: "pointer",
                          background: selected ? "var(--primary-bg, rgba(99,102,241,0.06))" : "var(--surface-1)",
                          transition: "border-color 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 600 }}>{c.pr_name || c.pr_id}</span>
                          <span style={{
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                            color: amountMatch ? "var(--success)" : "var(--text-2)",
                          }}>
                            {vnd(c.amount)}
                            {amountMatch && " ✓"}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                          {c.method} · {c.status} · mã: {c.transfer_code || "—"}
                          {c.created_at ? ` · ${formatPaymentDateFull(c.created_at)}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDrawerOpen(false)}>Hủy</button>
              <button
                className="btn btn-primary btn-sm"
                disabled={!picked || matching}
                onClick={doMatch}
              >
                {matching ? "Đang ghép..." : "Xác nhận ghép"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="panel" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: accent }}>{value}</span>
        <span style={{ color: accent ?? "var(--text-3)" }}>{icon}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <polyline points="21 3 21 8 16 8" />
    </svg>
  );
}
