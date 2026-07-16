import { useState } from "react";
import type { PaymentRequest } from "../../types/paymentRequest";
import { Icons } from "./Icons";
import { findPaidLinesWithoutBill } from "./billGuardUtils";
import { extractErrorMessage, formatPaymentDateTime, vnd } from "./paymentRequestUtils";
import CompletionReportModal from "./CompletionReportModal";

/**
 * B3 (16/7) — Báo đơn hoàn thành. Thay trigger DingTalk pr_fully_paid tự động
 * bằng nút bấm tay: người quyết định "đủ tiền thật", không phải công thức.
 * Gate mở nút: PR done/over VÀ mọi lần đã trả đều có bill (khớp guard AR).
 * Lần 1: bấm gửi thẳng. Lần ≥2: mở modal soft-block bắt nhập lý do.
 */
export default function CompletionReportBlock({
  request,
  onReportComplete,
  readOnly,
}: {
  request: PaymentRequest;
  onReportComplete: (reason?: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");

  const reports = request.completion_reports ?? [];
  const missingBillLines = findPaidLinesWithoutBill(request.payments ?? []);
  const isPaidEnough = request.state === "done" || request.state === "over";
  const ready = isPaidEnough && missingBillLines.length === 0;

  const hint = !isPaidEnough
    ? "Cần thu đủ 100% số tiền trước khi báo đơn hoàn thành."
    : missingBillLines.length > 0
    ? `Còn ${missingBillLines.length} lần thanh toán thiếu ảnh bill.`
    : "";

  const handleClick = async () => {
    if (!ready || submitting || readOnly) return;
    if (reports.length === 0) {
      setSubmitting(true);
      setError("");
      try {
        await onReportComplete();
      } catch (err) {
        setError(extractErrorMessage(err, "Báo đơn hoàn thành thất bại. Vui lòng thử lại."));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setModalOpen(true);
  };

  const handleModalConfirm = async (reason: string) => {
    setSubmitting(true);
    try {
      await onReportComplete(reason);
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h4>
          <Icons.Bell size={15} /> Báo đơn hoàn thành
          {reports.length > 0 && (
            <span className="badge is-done" style={{ marginLeft: 2 }}>
              Đã báo {reports.length} lần
            </span>
          )}
        </h4>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text)", marginBottom: 4, fontWeight: 500 }}>
        Nhắn DingTalk cho kế toán — bắt buộc trước khi tạo Active Request.
      </div>
      <div style={{ fontSize: 12, color: "var(--warning-text, #92400e)", background: "var(--warning-bg, #fef3c7)", borderRadius: 6, padding: "6px 10px", marginBottom: 12, lineHeight: 1.5 }}>
        ⚠ Lưu ý: Sales hãy đảm bảo rằng PR đã gom đủ tiền dự kiến trước khi Báo đơn hoàn thành (DingTalk).
      </div>

      {reports.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {reports.map((r) => {
            const { date, time } = formatPaymentDateTime(r.created_at);
            return (
              <div key={r.id} style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                Lần #{r.seq} · {time} {date} · {vnd(r.total_net)} ·{" "}
                {r.reported_by === "system-backfill" ? "hệ thống (backfill)" : r.reported_by}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{error}</div>
      )}

      <button
        type="button"
        className={`btn ${ready ? "btn-success" : "btn-outline"}`}
        disabled={!ready || submitting || readOnly}
        title={hint || undefined}
        onClick={handleClick}
      >
        <Icons.CheckSquare size={14} /> {submitting ? "Đang gửi…" : "Báo đơn hoàn thành"}
      </button>
      {!ready && hint && (
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>{hint}</div>
      )}

      {modalOpen && (
        <CompletionReportModal
          request={request}
          onClose={() => !submitting && setModalOpen(false)}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  );
}
