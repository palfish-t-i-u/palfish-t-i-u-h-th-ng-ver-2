import { useEffect, useMemo, useState } from "react";
import { usePaymentFlow } from "../contexts/PaymentFlowContext";
import type { ActiveRequest } from "../types/paymentRequest";
import type { ActiveRequestStatus } from "../types/paymentRequest";
import {
  AR_STATUS_META,
  enrichActiveRequest,
  flatCourses,
  vnd,
} from "./payment-flow/paymentFlowUtils";
import DateRangeFilter, { EMPTY_RANGE, type DateRange, inDateRange } from "./payment-request/DateRangeFilter";
import { Icons } from "./payment-request/Icons";
import "../styles/prototype-payments.css";

function ARStatusBadge({ status }: { status: ActiveRequestStatus }) {
  const meta = AR_STATUS_META[status as keyof typeof AR_STATUS_META] || AR_STATUS_META.pending_order;
  return (
    <span className={`badge ${meta.cls}`}>
      <span className="dot" />
      {meta.text}
    </span>
  );
}

function ActivationDetailDrawer({
  ar,
  pr,
  open,
  onClose,
  onSaveOrderId,
  onNavigateInvoice,
}: {
  ar: ActiveRequest | null;
  pr: ReturnType<typeof usePaymentFlow>["requests"][0] | null;
  open: boolean;
  onClose: () => void;
  onSaveOrderId: (courseCode: string, orderId: string) => void;
  onNavigateInvoice: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ar) return;
    const next: Record<string, string> = {};
    flatCourses(ar).forEach((c) => {
      next[c.courseCode] = c.orderId || "";
    });
    setDrafts(next);
  }, [ar?.id, open]);

  if (!ar) {
    return (
      <>
        <div className={`scrim ${open ? "open" : ""}`} onClick={onClose} style={{ pointerEvents: open ? "auto" : "none" }} />
        <aside className={`drawer ${open ? "open" : ""}`} />
      </>
    );
  }

  const enriched = enrichActiveRequest(ar);
  const courses = flatCourses(ar);
  const orderedCount = courses.filter((c) => c.orderId?.trim()).length;

  return (
    <>
      <div className={`scrim ${open ? "open" : ""}`} onClick={onClose} style={{ pointerEvents: open ? "auto" : "none" }} />
      <aside className={`drawer ${open ? "open" : ""}`} style={{ width: "min(820px, 96vw)" }}>
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="ar-id-pill">{ar.id}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{ar.customerName}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                {ar.prId ? (
                  <>
                    PR <strong style={{ color: "var(--primary-700)" }}>{ar.prId}</strong> ·
                  </>
                ) : (
                  "Standalone · "
                )}{" "}
                {orderedCount}/{courses.length} Order ID · {vnd(enriched.total)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ARStatusBadge status={enriched.status} />
            <button type="button" className="drawer-close" onClick={onClose}>
              <Icons.Close size={16} />
            </button>
          </div>
        </div>

        <div className="drawer-body ar-drawer-body">
          {pr && (
            <div className="summary-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div className="summary">
                <div className="summary-label">PR dự kiến</div>
                <div className="summary-value">{vnd(pr.target)}</div>
              </div>
              <div className="summary">
                <div className="summary-label">Đã thu (PR)</div>
                <div className="summary-value" style={{ color: "var(--success-text)" }}>
                  {vnd(pr.received)}
                </div>
              </div>
              <div className="summary">
                <div className="summary-label">Tổng gói AR</div>
                <div className="summary-value" style={{ color: "var(--money)" }}>
                  {vnd(enriched.total)}
                </div>
              </div>
            </div>
          )}

          {ar.uids.map((uidObj, uidIdx) => (
            <div key={uidIdx} className="uid-group">
              <div className="uid-group-head">
                <span className="uid-mono">UID {uidObj.uid || "—"}</span>
                <span className="num-pill">{uidObj.courses.length} gói</span>
              </div>
              <div className="course-row-head">
                <span>#</span>
                <span>Gói học</span>
                <span style={{ textAlign: "right" }}>Số tiền</span>
                <span>Course Code</span>
                <span>Order ID CRM</span>
                <span>HĐ</span>
                <span />
              </div>
              {uidObj.courses.map((course, courseIdx) => (
                <div key={course.courseCode} className="course-row">
                  <div className="idx-bubble">{courseIdx + 1}</div>
                  <div className="pkg-name">
                    <span>{course.packageName || "—"}</span>
                  </div>
                  <input className="amt-input" readOnly value={vnd(course.amount)} />
                  <span className="code-chip cc">
                    <Icons.Sparkle size={11} /> {course.courseCode}
                  </span>
                  <input
                    className={`order-input ${drafts[course.courseCode]?.trim() ? "has" : ""}`}
                    placeholder="Nhập Order ID…"
                    value={drafts[course.courseCode] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [course.courseCode]: e.target.value }))
                    }
                    onBlur={() => {
                      const val = (drafts[course.courseCode] ?? "").trim();
                      if (val !== (course.orderId || "")) onSaveOrderId(course.courseCode, val);
                    }}
                  />
                  <div className="invoice-cell">
                    {course.invoiced ? (
                      <span className="invoice-chip">
                        <Icons.Doc size={11} /> {course.invoiceId}
                      </span>
                    ) : course.orderId?.trim() ? (
                      <span className="badge is-over">
                        <span className="dot" />
                        Chờ xuất
                      </span>
                    ) : (
                      <span className="code-chip empty">Chưa Order</span>
                    )}
                  </div>
                  <span />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="drawer-foot">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
          {enriched.status === "ready_invoice" && (
            <button type="button" className="btn btn-primary" onClick={onNavigateInvoice}>
              <Icons.Doc size={14} /> Sang xuất hoá đơn (B4)
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

export default function ActivationTab() {
  const { activeRequests, requests, patchCourseOrderId, navigate, nav, setNav, apiNote } =
    usePaymentFlow();
  const [openArId, setOpenArId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "ready" | "all">("pending");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);

  useEffect(() => {
    if (nav.openArId) {
      setOpenArId(nav.openArId);
      setNav({});
    }
  }, [nav.openArId, setNav]);

  const rows = useMemo(() => activeRequests.map(enrichActiveRequest), [activeRequests]);

  const counts = useMemo(
    () => ({
      pending: rows.filter((a) => a.status === "pending_order" || a.status === "partial_order").length,
      ready: rows.filter((a) => a.status === "ready_invoice").length,
      all: rows.length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((a) => {
      if (tab === "pending" && a.status !== "pending_order" && a.status !== "partial_order") return false;
      if (tab === "ready" && a.status !== "ready_invoice") return false;
      if (!inDateRange(a.createdAt, dateRange)) return false;
      if (!q) return true;
      return [a.id, a.prId || "", a.customerName, a.uids[0]?.uid || ""].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [rows, tab, search, dateRange]);

  const openAr = openArId ? activeRequests.find((a) => a.id === openArId) ?? null : null;
  const openPr = openAr?.prId ? requests.find((p) => p.id === openAr.prId) ?? null : null;

  return (
    <div className="gmv-prototype">
      <div className="page">
        <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 720, lineHeight: 1.55, marginBottom: 4 }}>
          Sau khi PR đủ tiền, tạo <strong style={{ color: "var(--text-2)" }}>Active Request</strong> và điền{" "}
          <strong style={{ color: "var(--text-2)" }}>Order ID CRM</strong> cho từng Course Code. Khi đủ Order ID →
          sang B4 xuất hoá đơn.
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
            <div className="kpi-label">Chờ Order ID</div>
            <div className="kpi-value">{counts.pending}</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>
              <Icons.CheckCircle size={16} />
            </div>
            <div className="kpi-label">Sẵn sàng xuất HĐ</div>
            <div className="kpi-value">{counts.ready}</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon">
              <Icons.Sparkle size={16} />
            </div>
            <div className="kpi-label">Tổng Active Request</div>
            <div className="kpi-value">{counts.all}</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <Icons.Search size={15} stroke="var(--text-3)" />
            <input
              placeholder="Tìm theo AR-ID, PR-ID, tên khách, UID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ marginLeft: "auto" }}>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        <div className="table-card has-tabs">
          <div className="table-head with-tabs">
            <div className="tabs">
              {(
                [
                  { id: "pending" as const, label: "Chờ Order ID", icon: "Clock" as const, count: counts.pending },
                  { id: "ready" as const, label: "Sẵn sàng HĐ", icon: "CheckCircle" as const, count: counts.ready },
                  { id: "all" as const, label: "Tất cả", icon: "Database" as const, count: counts.all },
                ] as const
              ).map((tc) => {
                const Ico = Icons[tc.icon];
                return (
                  <div key={tc.id} className={`tab ${tab === tc.id ? "active" : ""}`} onClick={() => setTab(tc.id)}>
                    <Ico size={14} /> {tc.label}
                    <span className={`tab-count ${tc.id === "pending" && tc.count > 0 && tab !== "pending" ? "is-attention" : ""}`}>
                      {tc.count}
                    </span>
                  </div>
                );
              })}
            </div>
            <span className="right-meta">{filtered.length} kết quả</span>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>AR-ID</th>
                  <th>PR-ID</th>
                  <th>Khách hàng</th>
                  <th style={{ textAlign: "center" }}>UID</th>
                  <th style={{ textAlign: "right" }}>Tổng tiền</th>
                  <th style={{ textAlign: "center" }}>Order ID</th>
                  <th>Trạng thái</th>
                  <th>Tạo lúc</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty">
                        <Icons.Sparkle size={20} />
                        <div>Chưa có Active Request nào khớp với điều kiện lọc.</div>
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className={openArId === a.id ? "selected" : ""}
                    onClick={() => setOpenArId(a.id)}
                  >
                    <td>
                      <span className="ar-id-pill">{a.id}</span>
                    </td>
                    <td>
                      {a.prId ? (
                        <span className="pr-id-pill" style={{ fontSize: 11.5 }}>
                          {a.prId}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)", fontSize: 12 }}>— Standalone —</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-name">{a.customerName}</div>
                      <div className="cell-sub">UID: {a.uids[0]?.uid || "—"}</div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="qr-count">
                        <span className="num-done">{a.uids.length}</span>
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 700, color: "var(--money)" }}>{vnd(a.total)}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="qr-count">
                        <span
                          className="num-done"
                          style={{
                            color: a.orderedCount === a.totalCourses ? "var(--success-text)" : "var(--warning-text)",
                          }}
                        >
                          {a.orderedCount}
                        </span>
                        <span className="slash">/</span>
                        <span className="num-total">{a.totalCourses}</span>
                      </span>
                    </td>
                    <td>
                      <ARStatusBadge status={a.status} />
                    </td>
                    <td>
                      <div className="cell-time">{a.createdAt?.split(" ")[0].split("-").reverse().join("/")}</div>
                      <div className="time-relative">{a.createdAt?.split(" ")[1]}</div>
                    </td>
                    <td>
                      <span className="row-action">
                        <Icons.ChevronRight size={15} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ActivationDetailDrawer
        ar={openAr}
        pr={openPr}
        open={!!openArId}
        onClose={() => setOpenArId(null)}
        onSaveOrderId={(courseCode, orderId) => {
          if (openAr) void patchCourseOrderId(openAr.id, courseCode, orderId);
        }}
        onNavigateInvoice={() => navigate("module4")}
      />
    </div>
  );
}
