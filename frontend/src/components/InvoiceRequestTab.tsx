import { useEffect, useMemo, useState } from "react";
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
import {
  fmtPhone,
  formatPaymentDateTime,
  fromApiActiveRequest,
} from "./payment-request/paymentRequestUtils";
import { downloadTaxInvoiceZip } from "../utils/taxInvoiceXlsxExport";
import { endpoints } from "../lib/api";
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
    email: c.email || row.pr?.email || "",
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
              <div>
                <div className="info-label">Email</div>
                <div className="info-value">{d.email || "—"}</div>
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
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpenAr(row.ar.id)}>
              Mở Active Request
            </button>
            {isIssued && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                title="Tải ZIP 3 file Excel kê khai thuế (don_hang, khach_hang, san_pham)"
                onClick={() => void downloadTaxInvoiceZip([row])}
              >
                <Icons.Download size={13} /> Tải file thuế
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!isIssued && (
              <button type="button" className="btn btn-primary" onClick={onIssue} disabled={!isRowComplete(row)}>
                <Icons.Doc size={14} /> Xuất hoá đơn
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default function InvoiceRequestTab() {
  const { activeRequests, requests, issueInvoiceForCourse, navigate, nav, setNav, apiNote, loadData } =
    usePaymentFlow();
  const [tab, setTab] = useState<"pending" | "issued">("pending");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkExporting, setBulkExporting] = useState(false);
  const [confirmBulkIssue, setConfirmBulkIssue] = useState(false);
  const [bulkError, setBulkError] = useState("");

  useEffect(() => {
    const tabHint = nav.openInvoiceTab ?? nav.invoiceTab;
    if (tabHint) setTab(tabHint);
    if (nav.openInvoiceKey) {
      setOpenKey(nav.openInvoiceKey);
    } else if (nav.openInvoiceCourseCode) {
      const code = nav.openInvoiceCourseCode;
      const match = deriveInvoiceRows(activeRequests, requests).find((r) => r.course.courseCode === code);
      if (match) setOpenKey(match.key);
    }
    if (tabHint || nav.openInvoiceKey || nav.openInvoiceCourseCode) {
      setNav({});
    }
  }, [
    nav.openInvoiceTab,
    nav.invoiceTab,
    nav.openInvoiceKey,
    nav.openInvoiceCourseCode,
    activeRequests,
    requests,
    setNav,
  ]);

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

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedKeys.has(r.key)),
    [rows, selectedKeys]
  );
  const selectedPendingSum = selectedRows.reduce((s, r) => s + r.course.amount, 0);

  const handleBulkIssueAndExport = async () => {
    setConfirmBulkIssue(false);
    setBulkExporting(true);
    setBulkError("");
    const toIssue = selectedRows.filter((r) => !r.course.invoiced && isRowComplete(r));
    const issuedForExport: InvoiceRow[] = [];
    let failCount = 0;

    for (const row of toIssue) {
      try {
        const res = await endpoints.activeRequests.issueInvoice(row.ar.id, row.course.courseCode);
        const ar = fromApiActiveRequest(res.data.active_request);
        let updatedCourse = row.course;
        for (const u of ar.uids) {
          const c = u.courses.find((x) => x.courseCode === row.course.courseCode);
          if (c) {
            updatedCourse = c;
            break;
          }
        }
        issuedForExport.push({ ...row, ar, course: updatedCourse });
      } catch {
        failCount += 1;
      }
    }

    if (issuedForExport.length > 0) {
      await downloadTaxInvoiceZip(issuedForExport);
      await loadData({ silent: true });
      setTab("issued");
    }
    if (failCount > 0) {
      setBulkError(`${failCount}/${toIssue.length} hóa đơn xuất thất bại — kiểm tra Order ID và thông tin KH.`);
    }
    setSelectedKeys(new Set());
    setBulkExporting(false);
  };

  const handleBulkDownloadTax = async () => {
    const toDownload = selectedRows.filter((r) => r.course.invoiced);
    if (toDownload.length === 0) return;
    setBulkExporting(true);
    try {
      await downloadTaxInvoiceZip(toDownload);
    } finally {
      setBulkExporting(false);
    }
  };

  return (
    <div className="gmv-prototype">
      <div className="page">
        <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 720, lineHeight: 1.55, marginBottom: 4 }}>
          Mỗi <strong style={{ color: "var(--text-2)" }}>Course Code</strong> có Order ID → một hoá đơn (INV). Sau xuất, tải{" "}
          <strong style={{ color: "var(--text-2)" }}>ZIP 3 file Excel</strong> kê khai thuế (don_hang, khach_hang, san_pham).
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

        {bulkError && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--danger-border, #f5c2c7)",
              background: "var(--danger-bg, #fff5f5)",
              color: "var(--danger-text, #c0392b)",
              fontSize: 12.5,
              marginBottom: 8,
            }}
          >
            {bulkError}
          </div>
        )}

        {confirmBulkIssue && (
          <div
            className="panel"
            style={{
              marginBottom: 12,
              borderColor: "var(--primary-200)",
              background: "var(--primary-50)",
            }}
          >
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
              Xác nhận xuất {selectedKeys.size} hóa đơn?
            </p>
            <p style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 10, lineHeight: 1.5 }}>
              Hệ thống sẽ phát hành INV cho <strong>{selectedKeys.size}</strong> course, tổng{" "}
              <strong>{vnd(selectedPendingSum)}</strong>, rồi tải ZIP <strong>3 file Excel</strong> kê khai thuế
              (don_hang, khach_hang, san_pham).
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-success btn-sm" onClick={() => void handleBulkIssueAndExport()}>
                Xác nhận — Xuất &amp; tải file thuế
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmBulkIssue(false)}>
                Hủy
              </button>
            </div>
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
          {tab === "issued" && issued.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={bulkExporting}
              onClick={() => void downloadTaxInvoiceZip(filtered.filter((r) => r.course.invoiced))}
              title="Tải ZIP 3 file Excel cho tất cả hóa đơn đang lọc"
            >
              <Icons.Download size={14} /> Tải file thuế ({filtered.length})
            </button>
          )}
          <div style={{ marginLeft: tab === "issued" && issued.length > 0 ? 8 : "auto" }}>
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
                <span className="count">{selectedKeys.size}</span> hoá đơn đã chọn · Tổng {vnd(selectedPendingSum)}
              </span>
              <div className="spacer" />
              <div className="bulk-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedKeys(new Set())}>
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={bulkExporting}
                  onClick={() => setConfirmBulkIssue(true)}
                >
                  <Icons.Doc size={13} /> {bulkExporting ? "Đang xuất…" : "Xuất hóa đơn hàng loạt"}
                </button>
              </div>
            </div>
          )}

          {tab === "issued" && selectedKeys.size > 0 && (
            <div className="bulk-bar">
              <Icons.CheckCircle size={16} />
              <span>
                <span className="count">{selectedKeys.size}</span> hóa đơn đã chọn
              </span>
              <div className="spacer" />
              <div className="bulk-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedKeys(new Set())}>
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={bulkExporting}
                  onClick={() => void handleBulkDownloadTax()}
                >
                  <Icons.Download size={13} /> {bulkExporting ? "Đang tải…" : "Tải file thuế hàng loạt"}
                </button>
              </div>
            </div>
          )}

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {(tab === "pending" || tab === "issued") && (
                    <th className="check-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={
                          filtered.length > 0 &&
                          filtered
                            .filter((r) => tab === "pending" ? isRowComplete(r) : r.course.invoiced)
                            .every((r) => selectedKeys.has(r.key))
                        }
                        onChange={() => {
                          const sel = filtered.filter((r) =>
                            tab === "pending" ? isRowComplete(r) : r.course.invoiced
                          );
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
                    <td colSpan={tab === "pending" || tab === "issued" ? 10 : 9}>
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
                      {tab === "issued" && (
                        <td className="check-col" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
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
                        {(() => {
                          const ts = formatPaymentDateTime(
                            r.course.invoiced ? r.course.invoicedAt || "" : r.ar.createdAt
                          );
                          return (
                            <>
                              <div className="cell-time">{ts.date}</div>
                              {ts.time ? <div className="time-relative">{ts.time}</div> : null}
                            </>
                          );
                        })()}
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
