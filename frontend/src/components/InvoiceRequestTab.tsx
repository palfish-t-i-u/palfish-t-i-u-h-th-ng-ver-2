import { useMemo, useState } from "react";
import { usePaymentFlow } from "../contexts/PaymentFlowContext";
import {
  deriveInvoiceRows,
  formatAddress,
  type InvoiceRow,
  vnd,
} from "./payment-flow/paymentFlowUtils";
import DateRangeFilter, { EMPTY_RANGE, type DateRange, inDateRange } from "./payment-request/DateRangeFilter";
import { findCountry } from "./payment-request/CountryCombo";
import { Icons } from "./payment-request/Icons";
import { fmtPhone } from "./payment-request/paymentRequestUtils";
import "../styles/prototype-payments.css";

const CUSTOMER_TYPE_META = {
  individual: { label: "Cá nhân", cls: "is-active" },
  business: { label: "Doanh nghiệp", cls: "is-soft-primary" },
};

function defaultsFor(row: InvoiceRow | null) {
  if (!row) return null;
  const { ar, pr, uidObj: u, course: c } = row;
  return {
    customerType: (c.customerType as "individual" | "business") || "individual",
    name: c.name ?? ar.customerName,
    email: c.email || "",
    country: c.country || u.country || pr?.country || "VN",
    phone: c.phone ?? (u.phone || pr?.phone || ""),
    address: c.address ?? (pr?.address || ""),
    ward: c.ward ?? (pr?.ward || ""),
    province: c.province ?? (pr?.province || ""),
    taxCode: c.taxCode || "",
    companyName: c.companyName || "",
    note: c.note || "",
  };
}

function CustomerTypeBadge({ type }: { type: string }) {
  const meta = CUSTOMER_TYPE_META[type as keyof typeof CUSTOMER_TYPE_META] || CUSTOMER_TYPE_META.individual;
  return (
    <span className={`badge ${meta.cls}`}>
      <span className="dot" />
      {meta.label}
    </span>
  );
}

function isRowComplete(row: InvoiceRow) {
  const d = defaultsFor(row);
  if (!d) return false;
  return Boolean(d.name?.trim() && d.phone?.trim() && (d.address || d.ward || d.province));
}

function InvoiceDetailDrawer({
  row,
  open,
  onClose,
  onIssue,
  onOpenAr,
}: {
  row: InvoiceRow | null;
  open: boolean;
  onClose: () => void;
  onIssue: () => void;
  onOpenAr: (arId: string) => void;
}) {
  if (!row) {
    return (
      <>
        <div className={`scrim ${open ? "open" : ""}`} onClick={onClose} style={{ pointerEvents: open ? "auto" : "none" }} />
        <aside className={`drawer ${open ? "open" : ""}`} />
      </>
    );
  }

  const d = defaultsFor(row)!;
  const country = findCountry(d.country);
  const isIssued = !!row.course.invoiced;

  return (
    <>
      <div className={`scrim ${open ? "open" : ""}`} onClick={onClose} style={{ pointerEvents: open ? "auto" : "none" }} />
      <aside className={`drawer ${open ? "open" : ""}`} style={{ width: "min(720px, 96vw)" }}>
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {isIssued ? (
              <span className="invoice-chip" style={{ fontSize: 13, padding: "5px 11px" }}>
                <Icons.Doc size={13} /> {row.course.invoiceId}
              </span>
            ) : (
              <span className="code-chip cc" style={{ fontSize: 13, padding: "5px 11px" }}>
                <Icons.Sparkle size={13} /> {row.course.courseCode}
              </span>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{d.name || row.ar.customerName}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                Order ID <strong style={{ color: "var(--text-2)" }}>{row.course.orderId}</strong> · {row.ar.id}
              </div>
            </div>
          </div>
          <button type="button" className="drawer-close" onClick={onClose}>
            <Icons.Close size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="summary-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="summary">
              <div className="summary-label">Số tiền xuất</div>
              <div className="summary-value" style={{ color: "var(--money)" }}>
                {vnd(row.course.amount)}
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Course Code</div>
              <div className="summary-value" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}>
                {row.course.courseCode}
              </div>
            </div>
            <div className="summary">
              <div className="summary-label">Loại KH</div>
              <div className="summary-value">
                <CustomerTypeBadge type={d.customerType} />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h4>
                <Icons.User size={15} /> Thông tin xuất hoá đơn
              </h4>
            </div>
            <div className="info-grid">
              <div>
                <div className="info-label">Tên</div>
                <div className="info-value">{d.name || "—"}</div>
              </div>
              <div>
                <div className="info-label">SĐT</div>
                <div className="info-value">
                  {country.flag} {country.dial} {fmtPhone(d.phone)}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="info-label">Địa chỉ</div>
                <div className="info-value">{formatAddress(row.pr, row)}</div>
              </div>
              {d.customerType === "business" && (
                <>
                  <div>
                    <div className="info-label">MST</div>
                    <div className="info-value">{d.taxCode || "—"}</div>
                  </div>
                  <div>
                    <div className="info-label">Tên DN</div>
                    <div className="info-value">{d.companyName || "—"}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="drawer-foot">
          <button type="button" className="btn btn-outline" onClick={() => onOpenAr(row.ar.id)}>
            Mở Active Request
          </button>
          {!isIssued && (
            <button type="button" className="btn btn-primary" onClick={onIssue} disabled={!isRowComplete(row)}>
              <Icons.Doc size={14} /> Xuất hoá đơn
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

export default function InvoiceRequestTab() {
  const { activeRequests, requests, issueInvoiceForCourse, navigate, apiNote } = usePaymentFlow();
  const [tab, setTab] = useState<"pending" | "issued">("pending");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const rows = useMemo(() => deriveInvoiceRows(activeRequests, requests), [activeRequests, requests]);
  const pending = useMemo(() => rows.filter((r) => !r.course.invoiced), [rows]);
  const issued = useMemo(() => rows.filter((r) => r.course.invoiced), [rows]);
  const list = tab === "pending" ? pending : issued;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      const d = defaultsFor(r);
      if (!inDateRange(r.ar.createdAt, dateRange)) return false;
      if (!q) return true;
      return [
        r.course.courseCode,
        r.course.orderId,
        r.course.invoiceId || "",
        r.ar.id,
        r.ar.prId || "",
        d?.name || "",
        r.uidObj.uid,
      ].some((v) => v.toLowerCase().includes(q));
    });
  }, [list, search, dateRange]);

  const openRow = openKey ? rows.find((r) => r.key === openKey) ?? null : null;
  const sumPending = pending.reduce((s, r) => s + r.course.amount, 0);
  const sumIssued = issued.reduce((s, r) => s + r.course.amount, 0);

  return (
    <div className="gmv-prototype">
      <div className="page">
        <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 720, lineHeight: 1.55, marginBottom: 4 }}>
          Mỗi <strong style={{ color: "var(--text-2)" }}>Course Code</strong> có Order ID → một hoá đơn (INV). Dữ liệu
          khách lấy từ PR + AR; BE B4 sẽ thay mock phát hành sau.
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
            <div className="kpi-label">Chờ xuất</div>
            <div className="kpi-value">{pending.length}</div>
            <div className="kpi-sub">{vnd(sumPending)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>
              <Icons.CheckCircle size={16} />
            </div>
            <div className="kpi-label">Đã xuất</div>
            <div className="kpi-value">{issued.length}</div>
            <div className="kpi-sub">{vnd(sumIssued)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon" style={{ background: "var(--primary-50)", color: "var(--primary-700)" }}>
              <Icons.Sigma size={16} />
            </div>
            <div className="kpi-label">Tỉ lệ đã xuất</div>
            <div className="kpi-value">{rows.length > 0 ? Math.round((issued.length / rows.length) * 100) : 0}%</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <Icons.Search size={15} stroke="var(--text-3)" />
            <input
              placeholder="Tìm theo INV, Course Code, Order ID, AR-ID, PR-ID…"
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
              <div className={`tab ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>
                <Icons.Clock size={14} /> Chờ xuất
                <span className={`tab-count ${pending.length > 0 && tab !== "pending" ? "is-attention" : ""}`}>
                  {pending.length}
                </span>
              </div>
              <div className={`tab ${tab === "issued" ? "active" : ""}`} onClick={() => setTab("issued")}>
                <Icons.CheckCircle size={14} /> Đã xuất
                <span className="tab-count">{issued.length}</span>
              </div>
            </div>
            <span className="right-meta">{filtered.length} kết quả</span>
          </div>

          {tab === "pending" && selectedKeys.size > 0 && (
            <div className="bulk-bar">
              <Icons.CheckCircle size={16} />
              <span>
                <span className="count">{selectedKeys.size}</span> hoá đơn đã chọn
              </span>
              <div className="spacer" />
              <div className="bulk-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedKeys(new Set())}>
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={() => {
                    selectedKeys.forEach((key) => {
                      const row = rows.find((r) => r.key === key);
                      if (row && isRowComplete(row)) issueInvoiceForCourse(row.ar.id, row.course.courseCode);
                    });
                    setSelectedKeys(new Set());
                  }}
                >
                  <Icons.Doc size={13} /> Xuất hàng loạt
                </button>
              </div>
            </div>
          )}

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {tab === "pending" && (
                    <th className="check-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={
                          filtered.filter(isRowComplete).length > 0 &&
                          filtered.filter(isRowComplete).every((r) => selectedKeys.has(r.key))
                        }
                        onChange={() => {
                          const sel = filtered.filter(isRowComplete);
                          const all = sel.length > 0 && sel.every((r) => selectedKeys.has(r.key));
                          setSelectedKeys(all ? new Set() : new Set(sel.map((r) => r.key)));
                        }}
                      />
                    </th>
                  )}
                  <th>Tên khách</th>
                  <th>SĐT</th>
                  <th>UID</th>
                  <th>Địa chỉ</th>
                  <th style={{ textAlign: "right" }}>Số tiền</th>
                  <th>{tab === "issued" ? "Mã INV" : "Course Code"}</th>
                  <th>Thời gian</th>
                  <th style={{ textAlign: "center" }}>Loại KH</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={tab === "pending" ? 10 : 9}>
                      <div className="empty">
                        <Icons.Doc size={20} />
                        <div>
                          {tab === "pending"
                            ? "Không có hoá đơn nào đang chờ xuất."
                            : "Chưa có hoá đơn nào được phát hành."}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map((r) => {
                  const d = defaultsFor(r)!;
                  const country = findCountry(d.country);
                  const complete = isRowComplete(r);
                  return (
                    <tr
                      key={r.key}
                      className={openKey === r.key ? "selected" : ""}
                      onClick={() => setOpenKey(r.key)}
                    >
                      {tab === "pending" && (
                        <td className="check-col" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            disabled={!complete}
                            checked={selectedKeys.has(r.key)}
                            onChange={() => {
                              setSelectedKeys((prev) => {
                                const next = new Set(prev);
                                if (next.has(r.key)) next.delete(r.key);
                                else next.add(r.key);
                                return next;
                              });
                            }}
                          />
                        </td>
                      )}
                      <td>
                        <div className="cell-name">{d.name}</div>
                      </td>
                      <td>
                        <span className="cell-phone">
                          {country.flag} {country.dial} {fmtPhone(d.phone)}
                        </span>
                      </td>
                      <td>
                        <span className="cell-mono">{r.uidObj.uid}</span>
                      </td>
                      <td>
                        <div className="cell-sub" title={formatAddress(r.pr, r)}>
                          {formatAddress(r.pr, r)}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 700, color: "var(--money)" }}>{vnd(r.course.amount)}</span>
                      </td>
                      <td>
                        {r.course.invoiced ? (
                          <span className="invoice-chip">
                            <Icons.Doc size={11} /> {r.course.invoiceId}
                          </span>
                        ) : (
                          <span className="code-chip cc">
                            <Icons.Sparkle size={11} /> {r.course.courseCode}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="cell-time">
                          {(r.course.invoiced ? r.course.invoicedAt : r.ar.createdAt)
                            ?.split(" ")[0]
                            .split("-")
                            .reverse()
                            .join("/")}
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <CustomerTypeBadge type={d.customerType} />
                      </td>
                      <td>
                        <span className="row-action">
                          <Icons.ChevronRight size={15} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <InvoiceDetailDrawer
        row={openRow}
        open={!!openKey}
        onClose={() => setOpenKey(null)}
        onIssue={() => {
          if (openRow) {
            issueInvoiceForCourse(openRow.ar.id, openRow.course.courseCode);
            setOpenKey(null);
          }
        }}
        onOpenAr={(arId) => navigate("module3", { openArId: arId })}
      />
    </div>
  );
}
