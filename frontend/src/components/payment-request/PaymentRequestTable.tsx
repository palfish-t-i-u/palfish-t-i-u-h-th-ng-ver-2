import type { ActiveRequest, PaymentRequest, PaymentRequestStatus } from "../../types/paymentRequest";
import { findCountry } from "./CountryCombo";
import { Icons } from "./Icons";
import PaymentRequestProgress from "./PaymentRequestProgress";
import PaymentRequestStatusBadge from "./PaymentRequestStatusBadge";
import {
  type RequestBucket,
  createdAtDate,
  ddmmyyyy,
  fmtPhone,
  formatPaymentDateShort,
  relativeFrom,
  vnd,
} from "./paymentRequestUtils";

function DeltaCell({ state, delta }: { state: PaymentRequestStatus; delta: number }) {
  if (state === "done") return <span className="delta is-done">Đã đủ</span>;
  if (state === "pending" || state === "cancelled")
    return <span style={{ color: "var(--text-3)" }}>—</span>;
  const abs = Math.abs(delta);
  return (
    <span className={`delta ${state === "over" ? "is-over" : "is-short"}`}>
      {state === "over" ? "+" : "−"}
      {vnd(abs)}
    </span>
  );
}

function QrCountCell({ done, total }: { done: number; total: number }) {
  return (
    <span className="qr-count">
      <span className="num-done">{done}</span>
      <span className="slash">/</span>
      <span className="num-total">{total || 1}</span>
      <span style={{ color: "var(--text-3)", fontWeight: 500, fontSize: 11.5, marginLeft: 4 }}>lần</span>
    </span>
  );
}

interface TabConfig {
  key: RequestBucket;
  label: string;
  icon: keyof typeof Icons;
  count: number;
}

export default function PaymentRequestTable({
  requests,
  totalForBucket,
  selectedId,
  tab,
  onTabChange,
  tabs,
  onSelect,
  onCancelClick,
  onRestoreClick,
  arByPrId,
}: {
  requests: PaymentRequest[];
  totalForBucket: number;
  selectedId: string | null;
  tab: RequestBucket;
  onTabChange: (next: RequestBucket) => void;
  tabs: TabConfig[];
  onSelect: (request: PaymentRequest) => void;
  onCancelClick: (request: PaymentRequest) => void;
  onRestoreClick: (request: PaymentRequest) => void;
  arByPrId: Record<string, ActiveRequest>;
}) {
  const copyPrId = async (id: string) => {
    // In-app browsers may block navigator.clipboard; fallback to execCommand copy.
    const fallbackCopy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = id;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    };

    let ok: boolean;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
        ok = true;
      } else {
        ok = fallbackCopy();
      }
    } catch {
      ok = fallbackCopy();
    }

    if (!ok) {
      window.prompt("Không thể tự copy trong trình duyệt này. Copy PR-ID thủ công:", id);
    }
  };

  return (
    <div className="table-card has-tabs">
      <div className="table-head with-tabs">
        <div className="tabs">
          {tabs.map((t) => {
            const IconComp = Icons[t.icon];
            return (
              <div
                key={t.key}
                className={`tab ${tab === t.key ? "active" : ""}`}
                onClick={() => onTabChange(t.key)}
              >
                <IconComp size={15} />
                {t.label}
                <span className="tab-count">{t.count}</span>
              </div>
            );
          })}
        </div>
        <span className="right-meta">{requests.length} kết quả</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Tạo lúc</th>
              <th style={{ width: 120 }}>PR-ID</th>
              <th style={{ minWidth: 180 }}>Tên khách hàng</th>
              <th style={{ width: 200 }}>UID / SĐT</th>
              <th style={{ textAlign: "center", width: 90 }}>Số lần TT</th>
              <th style={{ width: 200 }}>Tiến trình thanh toán</th>
              <th style={{ width: 130 }}>Trạng thái</th>
              <th style={{ width: 140 }}>Chênh lệch</th>
              <th style={{ width: 130, textAlign: "center" }}>TT Gói học</th>
              <th style={{ width: 70, textAlign: "center" }}>
                {tab === "cancelled" ? "Khôi phục" : "Huỷ"}
              </th>
            </tr>
          </thead>
          <tbody>
            {requests.map((p) => {
              const canCancel = p.state !== "cancelled" && p.doneCount === 0;
              const country = findCountry(p.country);
              const created = createdAtDate(p.createdAt);
              const addrSub = [p.ward, p.province].filter(Boolean).join(", ");
              return (
                <tr
                  key={p.id}
                  className={`${selectedId === p.id ? "selected" : ""} ${p.state === "cancelled" ? "is-cancelled" : ""}`}
                  onClick={() => onSelect(p)}
                >
                  <td>
                    <div className="cell-time">{ddmmyyyy(p.createdAt)}</div>
                    <div className="cell-time" style={{ marginTop: 2 }}>
                      <span className="time-relative" title={relativeFrom(p.createdAt)}>
                        {created.time}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="cell-pr">
                      {p.id}
                      <button
                        type="button"
                        className="icon-btn-copy"
                        title="Copy PR-ID"
                        aria-label={`Copy ${p.id}`}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await copyPrId(p.id);
                        }}
                      >
                        <Icons.Copy className="copy" size={13} />
                      </button>
                    </span>
                  </td>
                  <td>
                    <div className="cell-name">
                      {p.name}
                      {p.isTest && (
                        <span style={{
                          marginLeft: 6,
                          padding: "1px 5px",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          borderRadius: 4,
                          background: "var(--warn-100, #fef3c7)",
                          color: "var(--warn-700, #b45309)",
                          verticalAlign: "middle",
                        }}>
                          TEST
                        </span>
                      )}
                    </div>
                    <div className="cell-sub" title={`${p.address}, ${p.ward || ""}, ${p.province || ""}`}>
                      {addrSub.slice(0, 38) || "—"}
                    </div>
                  </td>
                  <td>
                    <div className="uid-phone">
                      <div className="uid-line">{p.uid}</div>
                      <div className="phone-line">
                        <span style={{ fontSize: 12 }}>{country.flag}</span>
                        {country.dial} {fmtPhone(p.phone)}
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <QrCountCell done={p.doneCount} total={p.totalCount} />
                  </td>
                  <td>
                    {p.state === "cancelled" ? (
                      <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                        Huỷ {formatPaymentDateShort(p.cancelledAt || "")}
                      </span>
                    ) : (
                      <PaymentRequestProgress request={p} />
                    )}
                  </td>
                  <td>
                    <PaymentRequestStatusBadge state={p.state} />
                  </td>
                  <td>
                    <DeltaCell state={p.state} delta={p.delta} />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {arByPrId[p.id] ? (
                      arByPrId[p.id].uids.some((u) => u.courses.some((c) => !!c.orderId)) ? (
                        <span className="badge is-done" title={`Active Request: ${arByPrId[p.id].id}`}>
                          <Icons.Check size={11} strokeWidth={2.5} /> Đã tạo
                        </span>
                      ) : (
                        <span className="badge is-over" title={`Active Request: ${arByPrId[p.id].id} — chờ Order ID`}>
                          <Icons.Clock size={11} /> Đang tạo
                        </span>
                      )
                    ) : (
                      <span className="badge is-pending">— Chưa tạo</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                    {tab === "cancelled" ? (
                      <button
                        className="btn-cancel-row"
                        title="Khôi phục"
                        style={{ color: "var(--success)" }}
                        onClick={() => onRestoreClick(p)}
                      >
                        <Icons.CheckCircle size={16} />
                      </button>
                    ) : (
                      <button
                        className="btn-cancel-row"
                        disabled={!canCancel}
                        title={canCancel ? "Huỷ Payment Request" : "Đã có lần TT thành công — không thể huỷ"}
                        onClick={() => canCancel && onCancelClick(p)}
                      >
                        <Icons.XCircle size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={10}>
                  <div className="empty">
                    <Icons.Search size={20} />
                    <div>Không có Payment Request nào khớp với điều kiện lọc.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pagi">
        <span>
          Hiển thị 1–{requests.length} trong {totalForBucket} kết quả
        </span>
        <div className="pagi-btns">
          <button className="pagi-btn">
            <Icons.ChevronLeft size={13} />
          </button>
          <button className="pagi-btn active">1</button>
          <button className="pagi-btn">2</button>
          <button className="pagi-btn">3</button>
          <button className="pagi-btn">
            <Icons.ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
