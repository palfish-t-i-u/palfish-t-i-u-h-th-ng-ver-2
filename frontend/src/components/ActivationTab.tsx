import { useEffect, useMemo, useState } from "react";
import { COURSE_PACKAGES } from "../constants/coursePackages";
import { usePaymentFlow } from "../contexts/PaymentFlowContext";
import type { ActiveRequest, ActiveCourse, ActiveUidGroup } from "../types/paymentRequest";
import type { ActiveRequestStatus } from "../types/paymentRequest";
import {
  AR_STATUS_META,
  enrichActiveRequest,
  findInvoiceRowKey,
  flatCourses,
  nextCourseCode,
  vnd,
} from "./payment-flow/paymentFlowUtils";
import CountryCombo from "./payment-request/CountryCombo";
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
  onUpdate,
  onSaveOrderId,
  onNavigateInvoice,
  onOpenPr,
  onIssueInvoice,
}: {
  ar: ActiveRequest | null;
  pr: ReturnType<typeof usePaymentFlow>["requests"][0] | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (next: ActiveRequest) => void;
  onSaveOrderId: (courseCode: string, orderId: string) => void;
  onNavigateInvoice: () => void;
  onOpenPr?: () => void;
  onIssueInvoice: (courseCode: string) => void;
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
  const invoicedCount = courses.filter((c) => c.invoiced).length;
  const total = enriched.total;
  const receivedGap = pr ? total - pr.received : 0;

  const updateCourse = (uidIdx: number, courseIdx: number, patch: Partial<ActiveCourse>) => {
    const nextUids = ar.uids.map((u, i) => {
      if (i !== uidIdx) return u;
      return {
        ...u,
        courses: u.courses.map((c, j) => (j === courseIdx ? { ...c, ...patch } : c)),
      };
    });
    onUpdate({ ...ar, uids: nextUids });
  };

  const removeCourse = (uidIdx: number, courseIdx: number) => {
    const u = ar.uids[uidIdx];
    if (u.courses.length === 1 && ar.uids.length === 1) return;
    const nextUid: ActiveUidGroup = { ...u, courses: u.courses.filter((_, j) => j !== courseIdx) };
    const nextUids =
      nextUid.courses.length === 0
        ? ar.uids.filter((_, i) => i !== uidIdx)
        : ar.uids.map((u2, i) => (i === uidIdx ? nextUid : u2));
    onUpdate({ ...ar, uids: nextUids });
  };

  const addCourse = (uidIdx: number) => {
    const newCode = nextCourseCode(ar);
    const u = ar.uids[uidIdx];
    const remaining = pr ? Math.max(0, pr.target - total) : 0;
    const nextUid: ActiveUidGroup = {
      ...u,
      courses: [
        ...u.courses,
        { courseCode: newCode, packageName: "", amount: remaining || 0, orderId: "", invoiced: false },
      ],
    };
    onUpdate({ ...ar, uids: ar.uids.map((u2, i) => (i === uidIdx ? nextUid : u2)) });
  };

  const addUid = () => {
    const newCode = nextCourseCode(ar);
    const remaining = pr ? Math.max(0, pr.target - total) : 0;
    onUpdate({
      ...ar,
      uids: [
        ...ar.uids,
        {
          uid: "",
          phone: "",
          country: "VN",
          courses: [{ courseCode: newCode, packageName: "", amount: remaining || 0, orderId: "", invoiced: false }],
        },
      ],
    });
  };

  const updateUid = (uidIdx: number, patch: Partial<ActiveUidGroup>) => {
    onUpdate({
      ...ar,
      uids: ar.uids.map((u, i) => (i === uidIdx ? { ...u, ...patch } : u)),
    });
  };

  const copyArId = () => {
    void navigator.clipboard?.writeText(ar.id);
  };

  return (
    <>
      <div className={`scrim ${open ? "open" : ""}`} onClick={onClose} style={{ pointerEvents: open ? "auto" : "none" }} />
      <aside className={`drawer ${open ? "open" : ""}`} style={{ width: "min(1020px, 96vw)" }}>
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="ar-id-pill">{ar.id}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{ar.customerName}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                {pr ? (
                  <>
                    Liên kết <strong style={{ color: "var(--primary-700)" }}>{pr.id}</strong> ·{" "}
                  </>
                ) : (
                  <>Standalone · </>
                )}
                Tạo bởi <strong style={{ color: "var(--text-2)" }}>{ar.createdBy || "—"}</strong> · {ar.createdAt}
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
          <div className="summary-row" style={{ gridTemplateColumns: pr ? "repeat(5, 1fr)" : "repeat(4, 1fr)" }}>
            <div className="summary">
              <div className="summary-label">Tổng giá trị courses</div>
              <div className="summary-value" style={{ color: "var(--money)" }}>
                {vnd(total)}
              </div>
            </div>
            {pr && (
              <div
                className={`summary ${
                  receivedGap === 0 ? "is-delta-done" : receivedGap > 0 ? "is-delta-short" : "is-delta-over"
                }`}
              >
                <div className="summary-label">So với đã nhận</div>
                <div className="summary-value">
                  {receivedGap === 0
                    ? "✓ Khớp"
                    : receivedGap > 0
                      ? `Thiếu ${vnd(receivedGap)}`
                      : `Dư ${vnd(Math.abs(receivedGap))}`}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>
                  PR đã nhận {vnd(pr.received)}
                </div>
              </div>
            )}
            <div className="summary">
              <div className="summary-label">Số UID · Khoá học</div>
              <div className="summary-value">
                <span style={{ color: "var(--primary-700)" }}>{ar.uids.length}</span>
                <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>·</span>
                <span>{courses.length}</span>
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Order ID đã điền</div>
              <div className="summary-value">
                <span
                  style={{
                    color:
                      orderedCount === courses.length && courses.length > 0
                        ? "var(--success-text)"
                        : "var(--warning-text)",
                  }}
                >
                  {orderedCount}
                </span>
                <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>/</span>
                <span style={{ color: "var(--text-2)" }}>{courses.length}</span>
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Đã xuất hoá đơn</div>
              <div className="summary-value">
                <span style={{ color: "var(--success-text)" }}>{invoicedCount}</span>
                <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>/</span>
                <span style={{ color: "var(--text-2)" }}>{courses.length}</span>
              </div>
            </div>
          </div>

          {pr &&
            (receivedGap === 0 && pr.received > 0 ? (
              <div className="match-ok">
                <Icons.CheckCircle size={16} />
                <span>
                  Tổng courses (<strong>{vnd(total)}</strong>) khớp với <strong>{vnd(pr.received)}</strong> đã nhận từ
                  PR — sẵn sàng cho B4.
                </span>
              </div>
            ) : receivedGap > 0 ? (
              <div className="match-warning">
                <Icons.AlertCircle size={16} />
                <span>
                  Tổng courses (<strong>{vnd(total)}</strong>) đang <strong>nhiều hơn</strong> tiền đã nhận (
                  {vnd(pr.received)}) — thiếu <strong>{vnd(receivedGap)}</strong>.
                </span>
              </div>
            ) : (
              <div
                className="match-warning"
                style={{ background: "var(--info-bg)", borderColor: "#a8c5f0", color: "var(--info-text)" }}
              >
                <Icons.AlertCircle size={16} />
                <span>
                  Tổng courses (<strong>{vnd(total)}</strong>) <strong>ít hơn</strong> tiền đã nhận (
                  {vnd(pr.received)}) — phần dư <strong>{vnd(Math.abs(receivedGap))}</strong> giữ lại cấn trừ PR sau.
                </span>
              </div>
            ))}

          {pr ? (
            <div className="panel" style={{ padding: 14 }}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <h4>
                  <Icons.Wallet size={15} /> Payment Request liên kết
                </h4>
                {onOpenPr && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={onOpenPr}>
                    <Icons.ChevronRight size={13} /> Mở PR
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                <div className="info-cell">
                  <div className="info-label">PR-ID</div>
                  <div className="info-value mono">
                    <span className="pr-id-pill">{pr.id}</span>
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Tổng dự kiến</div>
                  <div className="info-value money">{vnd(pr.target)}</div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Đã nhận</div>
                  <div className="info-value money" style={{ color: "var(--success-text)" }}>
                    {vnd(pr.received)}
                  </div>
                </div>
                <div className="info-cell">
                  <div className="info-label">Số lần TT</div>
                  <div className="info-value">
                    {pr.doneCount}/{pr.totalCount}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: "var(--surface-3)",
                  color: "var(--text-3)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icons.AlertCircle size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Active Request standalone</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                  AR không gắn Payment Request — admin nhập từ kênh khác.
                </div>
              </div>
            </div>
          )}

          {ar.uids.map((uidObj, uidIdx) => (
            <div key={uidIdx} className="uid-group">
              <div className="uid-group-head">
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                  }}
                >
                  UID #{uidIdx + 1}
                </div>
                <input
                  className="uid-mono"
                  value={uidObj.uid}
                  onChange={(e) => updateUid(uidIdx, { uid: e.target.value })}
                  placeholder="Nhập UID học viên…"
                  style={{ width: 180 }}
                />
                <span style={{ width: 1, height: 22, background: "var(--border-strong)" }} />
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--text-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontWeight: 600,
                  }}
                >
                  SĐT
                </span>
                <CountryCombo
                  value={uidObj.country || "VN"}
                  onChange={(v) => updateUid(uidIdx, { country: v })}
                />
                <input
                  value={uidObj.phone || ""}
                  onChange={(e) => updateUid(uidIdx, { phone: e.target.value.replace(/\D/g, "") })}
                  placeholder="9xx xxx xxx"
                  style={{
                    width: 140,
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 12.5,
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "7px 10px",
                    outline: "none",
                    background: "white",
                  }}
                />
                {uidIdx === 0 && pr && uidObj.uid === pr.uid && (
                  <span className="badge is-soft-primary" style={{ fontSize: 10 }}>
                    <Icons.Check size={10} strokeWidth={2.5} /> UID từ PR
                  </span>
                )}
                <span className="spacer" />
                <span className="num-pill">{uidObj.courses.length} khoá</span>
                {ar.uids.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ color: "var(--danger)" }}
                    onClick={() => onUpdate({ ...ar, uids: ar.uids.filter((_, i) => i !== uidIdx) })}
                  >
                    <Icons.XCircle size={13} /> Xoá UID
                  </button>
                )}
              </div>
              <div className="course-row-head">
                <span />
                <span>Gói học</span>
                <span style={{ textAlign: "right" }}>Số tiền</span>
                <span>Course Code</span>
                <span>Order ID</span>
                <span>Xuất HĐ</span>
                <span />
              </div>
              {uidObj.courses.map((course, courseIdx) => (
                <div key={course.courseCode} className="course-row">
                  <div className="idx-bubble">{courseIdx + 1}</div>
                  <div className="pkg-name">
                    <input
                      list={`packages-${ar.id}`}
                      value={course.packageName}
                      onChange={(e) => updateCourse(uidIdx, courseIdx, { packageName: e.target.value })}
                      placeholder="VD: 2/W- NEW 48 US-UK+2 HN"
                    />
                  </div>
                  <input
                    className="amt-input"
                    value={course.amount ? Number(course.amount).toLocaleString("vi-VN") : ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      updateCourse(uidIdx, courseIdx, { amount: v ? Number(v) : 0 });
                    }}
                    placeholder="0"
                  />
                  <span className="code-chip cc">
                    <Icons.Sparkle size={11} /> {course.courseCode}
                  </span>
                  <input
                    className={`order-input ${drafts[course.courseCode]?.trim() ? "has" : ""}`}
                    placeholder="ORD-XXXX-XXXXX"
                    value={drafts[course.courseCode] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [course.courseCode]: e.target.value }))
                    }
                    onBlur={() => {
                      const val = (drafts[course.courseCode] ?? "").trim();
                      if (val !== (course.orderId || "")) {
                        updateCourse(uidIdx, courseIdx, { orderId: val });
                        onSaveOrderId(course.courseCode, val);
                      }
                    }}
                  />
                  <div className="invoice-cell">
                    {course.invoiced ? (
                      <span
                        className="invoice-chip"
                        onClick={() => updateCourse(uidIdx, courseIdx, { invoiced: false, invoiceId: "" })}
                        title="Đã xuất HĐ (demo: click huỷ)"
                      >
                        <Icons.Doc size={11} /> {course.invoiceId}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn-invoice"
                        title="Chuyển sang tab Xuất hóa đơn (Chờ xuất) để phát hành"
                        onClick={() => onIssueInvoice(course.courseCode)}
                      >
                        <Icons.Doc size={12} /> Xuất HĐ
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removeCourse(uidIdx, courseIdx)}
                    title="Xoá khoá học"
                  >
                    <Icons.Close size={14} />
                  </button>
                </div>
              ))}
              <datalist id={`packages-${ar.id}`}>
                {COURSE_PACKAGES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <div className="uid-group-foot">
                <button type="button" className="uid-add-link" onClick={() => addCourse(uidIdx)}>
                  <Icons.Plus size={13} /> Thêm gói học cho UID này
                </button>
                <span style={{ color: "var(--text-3)" }}>
                  Tổng UID này:{" "}
                  <strong style={{ color: "var(--text)" }}>
                    {vnd(uidObj.courses.reduce((s, c) => s + (c.amount || 0), 0))}
                  </strong>
                </span>
              </div>
            </div>
          ))}

          <button type="button" className="add-uid-card" onClick={addUid}>
            <Icons.Plus size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Thêm UID khác (cho phép 1 PR mua nhiều khoá cho nhiều người)
          </button>
        </div>

        <div className="drawer-foot" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={copyArId}>
              <Icons.Copy size={13} /> Copy AR-ID
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Đóng
            </button>
            {enriched.status === "ready_invoice" && (
              <button type="button" className="btn btn-success" onClick={onNavigateInvoice}>
                <Icons.Doc size={14} /> Yêu cầu xuất hoá đơn (B4)
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default function ActivationTab() {
  const {
    activeRequests,
    requests,
    patchCourseOrderId,
    navigate,
    nav,
    setNav,
    apiNote,
    updateActiveRequest,
  } = usePaymentFlow();
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
        onUpdate={(next) => updateActiveRequest(next.id, () => next)}
        onSaveOrderId={(courseCode, orderId) => {
          if (openAr) void patchCourseOrderId(openAr.id, courseCode, orderId);
        }}
        onNavigateInvoice={() => navigate("module4", { invoiceTab: "pending" })}
        onOpenPr={
          openAr?.prId
            ? () => navigate("paymentRequests", { openPrId: openAr.prId })
            : undefined
        }
        onIssueInvoice={(courseCode) => {
          if (!openAr) return;
          const key = findInvoiceRowKey(openAr, courseCode);
          setOpenArId(null);
          navigate("module4", { invoiceTab: "pending", openInvoiceKey: key ?? undefined });
        }}
      />
    </div>
  );
}
