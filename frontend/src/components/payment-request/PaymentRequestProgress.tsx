import type { PaymentRequest } from "../../types/paymentRequest";
import { progressFillClass, progressPercent, vnd } from "./paymentRequestUtils";

const num = (value: number) => Math.round(value).toLocaleString("vi-VN");

export default function PaymentRequestProgress({ request }: { request: PaymentRequest }) {
  const pct = progressPercent(request);
  const cls = progressFillClass(request);

  return (
    <div className="prog">
      <span className="prog-amounts" title={`Đã thu ${vnd(request.received)} / dự thu ${vnd(request.target)}`}>
        <strong>{num(request.received)}</strong>
        <span> / {vnd(request.target)}</span>
      </span>
      <div className="prog-bottom">
        <div className="prog-bar">
          <div className={`prog-fill ${cls}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="prog-pct">{pct}%</span>
      </div>
    </div>
  );
}
