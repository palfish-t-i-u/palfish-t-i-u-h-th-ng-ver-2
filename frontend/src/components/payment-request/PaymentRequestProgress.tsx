import type { PaymentRequest } from "../../types/paymentRequest";
import { displayReceived, hasUnverifiedInstallment, progressFillClass, progressPercent, vnd } from "./paymentRequestUtils";

const num = (value: number) => Math.round(value).toLocaleString("vi-VN");

export default function PaymentRequestProgress({ request }: { request: PaymentRequest }) {
  const pct = progressPercent(request);
  const cls = progressFillClass(request);
  const shown = displayReceived(request);
  const unverified = hasUnverifiedInstallment(request);

  return (
    <div className="prog">
      <span className="prog-amounts" title={`Đã thu ${vnd(shown)} / dự thu ${vnd(request.target)}`}>
        <strong>{num(shown)}</strong>
        <span> / {vnd(request.target)}</span>
        {unverified && <span style={{ marginLeft: 4, fontSize: 11, color: "var(--text-3)" }}>(chưa trừ phí)</span>}
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
