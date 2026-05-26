import type { PaymentRequest } from "../../types/paymentRequest";
import { progressFillClass, progressPercent, vnd } from "./paymentRequestUtils";

export default function PaymentRequestProgress({ request }: { request: PaymentRequest }) {
  const pct = progressPercent(request);
  const cls = progressFillClass(request);

  return (
    <div className="prog">
      <div className="prog-bar">
        <div className={`prog-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="prog-meta">
        <span>
          <strong>{vnd(request.received)}</strong>
        </span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}
