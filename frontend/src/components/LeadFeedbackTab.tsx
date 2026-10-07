import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/prototype-payments.css";
import { endpoints } from "../lib/api";
import type { LeadFeedback } from "../types/leadFeedback";
import { Icons } from "./payment-request/Icons";
import DateRangeFilter, { EMPTY_RANGE, type DateRange } from "./payment-request/DateRangeFilter";
import { findSourceByKey } from "../constants/leadSource";
import CreateFeedbackModal from "./lead-feedback/CreateFeedbackModal";
import FeedbackDetailModal from "./lead-feedback/FeedbackDetailModal";

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function LeadFeedbackTab() {
  const [items, setItems] = useState<LeadFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [canReview, setCanReview] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"" | "wait" | "done">("");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<LeadFeedback | null>(null);

  // Debounce ô tìm kiếm.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const reqIdRef = useRef(0);
  const load = useCallback(async () => {
    const myId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await endpoints.leadFeedback.list({
        q: debouncedSearch || undefined,
        status: status || undefined,
        date_from: dateRange.from || undefined,
        date_to: dateRange.to || undefined,
      });
      if (myId !== reqIdRef.current) return; // bỏ response cũ
      setItems(data.items);
      setCanCreate(data.can_create);
      setCanReview(data.can_review);
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Không tải được danh sách feedback.");
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, [debouncedSearch, status, dateRange.from, dateRange.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const onUpdated = (next: LeadFeedback) => {
    setItems((prev) => prev.map((it) => (it.id === next.id ? next : it)));
    setDetail((cur) => (cur && cur.id === next.id ? next : cur));
  };

  return (
    <div className="gmv-prototype">
      <div className="page page--fit">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 640, lineHeight: 1.55 }}>
            Sale gửi bằng chứng và ghi chú về chất lượng lead đã nhận; team Marketing xem và nhận xét lại.
          </div>
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Icons.Plus size={15} strokeWidth={2.3} /> Tạo Feedback
            </button>
          )}
        </div>

        <div className="toolbar">
          <div className="search" style={{ maxWidth: 340 }}>
            <Icons.Search size={15} stroke="var(--text-3)" />
            <input
              placeholder="Tìm SĐT, tên khách hoặc sale…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input input-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | "wait" | "done")}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 9,
              padding: "8px 11px",
              fontSize: 13,
              background: "white",
              color: "var(--text)",
            }}
          >
            <option value="">Trạng thái: Tất cả</option>
            <option value="wait">Chờ MKT feedback</option>
            <option value="done">MKT đã feedback</option>
          </select>
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>

        <div className="table-card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Ngày tạo</th>
                  <th>Người điền (sale)</th>
                  <th>Khách</th>
                  <th>SĐT</th>
                  <th>Nguồn</th>
                  <th style={{ width: 170 }}>Trạng thái</th>
                  <th style={{ width: 70 }} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">Đang tải…</div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty" style={{ color: "var(--danger-text)" }}>{error}</div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">Chưa có feedback nào.</div>
                    </td>
                  </tr>
                ) : (
                  items.map((it) => {
                    const src = findSourceByKey(it.lead_source);
                    return (
                      <tr key={it.id} onClick={() => setDetail(it)}>
                        <td>
                          <div className="cell-time">{fmtDateTime(it.created_at)}</div>
                        </td>
                        <td>
                          <div className="cell-name">{it.sale_name || it.sale_email}</div>
                        </td>
                        <td>{it.customer_name || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{it.phone || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                        <td>{src?.label || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                        <td>
                          {it.status === "done" ? (
                            <span className="badge is-done">
                              <span className="dot" /> MKT đã feedback
                            </span>
                          ) : (
                            <span className="badge is-waiting">
                              <span className="dot" /> Chờ MKT feedback
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetail(it);
                            }}
                          >
                            <Icons.Eye size={13} /> Xem
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-outline btn-sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Đang tải…" : "Tải lại dữ liệu"}
          </button>
        </div>
      </div>

      {createOpen && (
        <CreateFeedbackModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => void load()}
        />
      )}
      {detail && (
        <FeedbackDetailModal
          item={detail}
          canReview={canReview}
          onClose={() => setDetail(null)}
          onUpdated={onUpdated}
        />
      )}
    </div>
  );
}
