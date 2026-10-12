import { useState } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../payment-request/Icons";
import DateRangeFilter, { EMPTY_RANGE, type DateRange } from "../payment-request/DateRangeFilter";
import { endpoints } from "../../lib/api";
import { downloadFeedbackCsv } from "./feedbackCsv";

/**
 * Modal "Xuất CSV" cho Feedback lead. Chọn khoảng thời gian + trạng thái rồi
 * tải dữ liệu thô về. Gọi lại endpoint list (RBAC đã áp ở BE) với bộ lọc riêng
 * của modal — KHÔNG ảnh hưởng bộ lọc/trang của bảng chính.
 */
export default function ExportFeedbackModal({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const [status, setStatus] = useState<"" | "wait" | "done">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const onExport = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const { data } = await endpoints.leadFeedback.list({
        status: status || undefined,
        date_from: range.from || undefined,
        date_to: range.to || undefined,
      });
      const items = data.items;
      if (items.length === 0) {
        setErr("Không có feedback nào khớp bộ lọc đã chọn.");
        return;
      }
      const part = range.from || range.to ? `${range.from || "dau"}_den_${range.to || "nay"}` : "tat_ca";
      downloadFeedbackCsv(items, `feedback_lead_${part}.csv`);
      setMsg(
        `Đã xuất ${items.length} dòng.` +
          (items.length >= 500
            ? " ⚠️ Đạt giới hạn 500 dòng/lần — có thể còn dòng chưa xuất, hãy thu hẹp khoảng thời gian."
            : ""),
      );
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(detail || "Không xuất được dữ liệu. Thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="gmv-prototype-modal-scrim" onClick={() => !busy && onClose()}>
      <div
        className="modal"
        // overflow:visible để popup lịch (.date-pop absolute) không bị .modal
        // (overflow:hidden mặc định) cắt. Nội dung modal ngắn nên không cần cuộn.
        style={{ width: "min(480px, 100%)", overflow: "visible" }}
        role="dialog"
        aria-modal="true"
        aria-label="Xuất CSV feedback"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>Xuất CSV dữ liệu thô</h3>
          </div>
          <button className="drawer-close" onClick={onClose} disabled={busy} aria-label="Đóng">
            <Icons.Close size={16} />
          </button>
        </div>

        {/* class gmv-prototype: DateRangeFilter dùng style scope .gmv-prototype
            (.date-pop/.quick/.info-label...); modal portal ra ngoài .gmv-prototype
            nên phải thêm scope ở đây, nếu không popup lịch mất style (bung inline). */}
        <div
          className="modal-body gmv-prototype"
          style={{ overflow: "visible", display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div>
            <div className="info-label" style={{ marginBottom: 6 }}>
              Khoảng thời gian
            </div>
            <DateRangeFilter value={range} onChange={setRange} />
          </div>

          <div>
            <div className="info-label" style={{ marginBottom: 6 }}>
              Loại dữ liệu (theo trạng thái)
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
                width: "100%",
              }}
            >
              <option value="">Tất cả</option>
              <option value="wait">Chờ MKT feedback</option>
              <option value="done">MKT đã feedback</option>
            </select>
          </div>

          {err && (
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
              {err}
            </div>
          )}
          {msg && (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--text-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 12px",
                lineHeight: 1.5,
              }}
            >
              {msg}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Đóng
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void onExport()} disabled={busy}>
            {busy ? "Đang xuất…" : (
              <>
                <Icons.Download size={14} /> Tải CSV về
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
