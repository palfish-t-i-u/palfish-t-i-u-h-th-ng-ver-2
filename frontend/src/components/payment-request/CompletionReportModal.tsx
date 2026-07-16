import { useState } from "react";
import type { PaymentRequest } from "../../types/paymentRequest";
import { Icons } from "./Icons";
import { formatPaymentDateTime, vnd } from "./paymentRequestUtils";

function extractErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail ? String(detail) : fallback;
}

/** Số dạng chấm phân cách nghìn, KHÔNG kèm đơn vị — khớp format tin DingTalk BE (`{n:,}`.replace(",", ".")). */
function fmtDot(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

/**
 * Soft-block khi báo đơn hoàn thành lần ≥2 (pattern theo CancelPrModal.tsx).
 * Copy banner/placeholder ĐÃ CHỐT với Minh/kế toán 16/7 — không tự chế lại.
 */
export default function CompletionReportModal({
  request,
  onClose,
  onConfirm,
}: {
  request: PaymentRequest;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const reports = request.completion_reports ?? [];
  const lastReport = reports[reports.length - 1];
  const seq = (lastReport?.seq ?? reports.length) + 1;
  const student = request.childName || request.name;

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(trimmedReason);
    } catch (err) {
      setError(extractErrorMessage(err, "Báo đơn hoàn thành thất bại. Vui lòng thử lại."));
    } finally {
      setSubmitting(false);
    }
  };

  const previewLines = [
    `✅ ĐƠN ĐÃ ĐỦ TIỀN — ${request.id} - Lần #${seq}`,
    `Học viên: ${student}`,
    `Tổng net đã thu: ${fmtDot(request.received)} / ${fmtDot(request.target)} VND`,
    `Lý do: ${trimmedReason}`,
  ];

  const bannerText = lastReport
    ? `Đơn này đã báo hoàn thành ở lần #${lastReport.seq} (${formatPaymentDateTime(lastReport.created_at).date.slice(0, 5)} · ${vnd(lastReport.total_net)}). Nhập lý do báo lại để kế toán theo dõi.`
    : "";

  return (
    <div className="gmv-prototype-modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(520px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 style={{ color: "var(--text)" }}>Báo đơn hoàn thành — lần #{seq}</h3>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              {request.id} · {student}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>
            <Icons.Close size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ gap: 14 }}>
          {lastReport && (
            <div
              style={{
                background: "var(--warning-bg, #fef3c7)",
                border: "1px solid var(--warning, #f59e0b)",
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                fontSize: 13,
                color: "var(--text)",
              }}
            >
              <Icons.AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{bannerText}</span>
            </div>
          )}

          <div className="field">
            <label>Lý do báo lại</label>
            <textarea
              placeholder="Vì sao đơn đủ tiền thêm lần nữa — VD: Khách mua thêm gói cho con / Khách đóng nốt phần bổ sung"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ minHeight: 70 }}
              autoFocus
            />
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
              Lý do sẽ hiện nguyên văn trong tin DingTalk gửi kế toán.
            </div>
          </div>

          <div className="field">
            <label>Xem trước tin DingTalk</label>
            <pre
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12.5,
                fontFamily: "JetBrains Mono, monospace",
                whiteSpace: "pre-wrap",
                color: "var(--text)",
                margin: 0,
              }}
            >
              {previewLines.join("\n")}
            </pre>
          </div>

          {error && <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Hủy
          </button>
          <button className="btn btn-success" disabled={!canSubmit} onClick={handleSubmit}>
            <Icons.CheckSquare size={14} /> {submitting ? "Đang gửi…" : "Xác nhận và báo đơn hoàn thành"}
          </button>
        </div>
      </div>
    </div>
  );
}
