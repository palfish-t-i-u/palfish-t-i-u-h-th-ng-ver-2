import type { PaymentRequest } from "../../types/paymentRequest";
import { Button } from "../ui";
import PaymentRequestStatusBadge from "./PaymentRequestStatusBadge";
import { METHOD_LABEL, paymentAttemptLabel, vnd } from "./paymentRequestUtils";

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-gmv-md bg-gmv-bg p-3">
      <div className="text-xs text-gmv-muted">{label}</div>
      <div className="mt-1 font-bold text-gmv-text-strong">{value}</div>
    </div>
  );
}

export default function PaymentRequestDetailDrawer({
  request,
  onAddPayment,
  onCreateActiveRequest,
  onCancel,
}: {
  request: PaymentRequest | null;
  onAddPayment: () => void;
  onCreateActiveRequest: () => void;
  onCancel: () => void;
}) {
  if (!request) {
    return (
      <aside className="rounded-gmv-md border border-gmv-border bg-gmv-canvas p-4 shadow-gmv-1">
        <div className="py-8 text-center text-sm text-gmv-muted">Chọn một Payment Request để xem chi tiết.</div>
      </aside>
    );
  }

  const ready = request.state === "done" || request.state === "over";

  return (
    <aside className="rounded-gmv-md border border-gmv-border bg-gmv-canvas p-4 shadow-gmv-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-sm font-bold text-gmv-primary">{request.id}</div>
          <div className="mt-2 text-lg font-bold text-gmv-text-strong">{request.name}</div>
          <div className="mt-1 text-xs text-gmv-muted">{request.address || "—"}</div>
        </div>
        <PaymentRequestStatusBadge state={request.state} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <SummaryBox label="Cần thu" value={vnd(request.target)} />
        <SummaryBox label="Đã thu" value={vnd(request.received)} />
        <SummaryBox label="Chênh" value={request.delta === 0 ? "Đã đủ" : vnd(request.delta)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={onAddPayment} disabled={request.state === "cancelled"}>+ Thêm thanh toán</Button>
        <Button size="sm" variant="ok" onClick={onCreateActiveRequest} disabled={!ready}>✓ Yêu cầu tạo đơn hàng</Button>
        <Button size="sm" variant="danger" onClick={onCancel} disabled={request.state === "cancelled"}>Huỷ PR</Button>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gmv-secondary">LỊCH SỬ THANH TOÁN</div>
        <div className="flex flex-col gap-2">
          {request.payments.map((payment) => (
            <div key={payment.id} className="rounded-gmv-md border border-gmv-border bg-gmv-bg p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold">Lần #{payment.idx}</span>
                <span className="font-bold text-gmv-text-strong">{vnd(payment.amount)}</span>
                <span className="rounded-full bg-gmv-primary-soft px-2 py-0.5 text-xs font-semibold text-gmv-primary">{METHOD_LABEL[payment.method]}</span>
              </div>
              <div className="mt-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${payment.status === "paid" ? "bg-gmv-ok-soft text-gmv-ok" : "bg-gmv-warn-soft text-gmv-warn"}`}>
                  {paymentAttemptLabel(payment)}
                </span>
              </div>
              <div className="mt-2 text-xs text-gmv-secondary">
                {payment.code} · {payment.bank || payment.cashier || `${payment.installmentMonths || ""} tháng`} · {payment.paidAt || payment.createdAt}
              </div>
            </div>
          ))}
          {request.payments.length === 0 && (
            <div className="rounded-gmv-md border border-dashed border-gmv-border bg-gmv-bg p-4 text-center text-sm text-gmv-muted">
              Chưa có lần thanh toán.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

