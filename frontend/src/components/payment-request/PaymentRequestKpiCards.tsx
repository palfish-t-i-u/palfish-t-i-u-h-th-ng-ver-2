import type { PaymentRequest } from "../../types/paymentRequest";
import { Icons } from "./Icons";
import { vnd } from "./paymentRequestUtils";

export default function PaymentRequestKpiCards({ requests }: { requests: PaymentRequest[] }) {
  const live = requests.filter((r) => r.state !== "cancelled");
  const total = live.length;
  const done = live.filter((r) => r.state === "done").length;
  const over = live.filter((r) => r.state === "over").length;
  const short = live.filter((r) => r.state === "short" || r.state === "pending").length;
  const received = live.reduce((sum, r) => sum + r.received, 0);
  const target = live.reduce((sum, r) => sum + r.target, 0);
  const remaining = Math.max(0, target - received);
  const ratio = target > 0 ? Math.round((received / target) * 100) : 0;
  const ready = done + over;

  return (
    <div className="kpi-row">
      <div className="kpi">
        <div className="kpi-icon">
          <Icons.Wallet size={16} />
        </div>
        <div className="kpi-label">Tổng PR đang theo dõi</div>
        <div className="kpi-value">{total}</div>
        <div className="kpi-sub">
          {done} đã đủ tiền · {short} đang thiếu
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-icon" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>
          <Icons.Sigma size={16} />
        </div>
        <div className="kpi-label">Đã thu</div>
        <div className="kpi-value">{vnd(received)}</div>
        <div className="kpi-sub">
          {ratio}% / dự kiến {vnd(target)}
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-icon" style={{ background: "var(--danger-bg)", color: "var(--danger-text)" }}>
          <Icons.AlertCircle size={16} />
        </div>
        <div className="kpi-label">Còn thiếu</div>
        <div className="kpi-value">{vnd(remaining)}</div>
        <div className="kpi-sub">{short} PR cần đôn khách</div>
      </div>
      <div className="kpi">
        <div className="kpi-icon" style={{ background: "var(--warning-bg)", color: "var(--warning-text)" }}>
          <Icons.Clock size={16} />
        </div>
        <div className="kpi-label">Sẵn sàng kích hoạt</div>
        <div className="kpi-value">{ready}</div>
        <div className="kpi-sub">PR đủ tiền chờ chuyển B3</div>
      </div>
    </div>
  );
}
