import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [toDelete, setToDelete] = useState<LeadFeedback | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

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

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteErr(null);
    try {
      await endpoints.leadFeedback.remove(toDelete.id);
      setItems((prev) => prev.filter((x) => x.id !== toDelete.id));
      setDetail((cur) => (cur && cur.id === toDelete.id ? null : cur));
      setToDelete(null);
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setDeleteErr(msg || "Không xoá được feedback. Thử lại.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="gmv-prototype">
      <div className="page page--fit">
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
                  <th style={{ width: 120 }} />
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
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setDetail(it)}
                            >
                              <Icons.Eye size={13} /> Xem
                            </button>
                            {it.can_delete && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                title="Xoá feedback"
                                aria-label="Xoá feedback"
                                onClick={() => setToDelete(it)}
                                style={{ color: "var(--danger)", padding: "5px 8px" }}
                              >
                                <Icons.Trash size={13} />
                              </button>
                            )}
                          </div>
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
      {toDelete &&
        createPortal(
          <div className="gmv-prototype-modal-scrim" onClick={() => !deleting && setToDelete(null)}>
            <div
              className="modal"
              style={{ width: "min(440px, 100%)" }}
              role="dialog"
              aria-modal="true"
              aria-label="Xác nhận xoá feedback"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <h3>Xoá feedback?</h3>
                <button className="drawer-close" onClick={() => setToDelete(null)} disabled={deleting} aria-label="Đóng">
                  <Icons.Close size={16} />
                </button>
              </div>
              <div className="modal-body">
                <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.5 }}>
                  Xoá feedback của <strong>{toDelete.customer_name || toDelete.phone || "khách này"}</strong> (người điền:{" "}
                  {toDelete.sale_name || toDelete.sale_email})? Ảnh đính kèm cũng bị xoá và{" "}
                  <strong>không khôi phục được</strong>.
                </div>
                {deleteErr && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--danger-text)",
                      background: "var(--danger-bg)",
                      border: "1px solid var(--danger)",
                      borderRadius: 8,
                      padding: "8px 12px",
                    }}
                  >
                    {deleteErr}
                  </div>
                )}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-outline" onClick={() => setToDelete(null)} disabled={deleting}>
                  Huỷ
                </button>
                <button type="button" className="btn btn-danger" onClick={() => void confirmDelete()} disabled={deleting}>
                  {deleting ? "Đang xoá…" : "Xoá"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
