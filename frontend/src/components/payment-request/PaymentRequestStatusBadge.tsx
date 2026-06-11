import type { PaymentRequestStatus } from "../../types/paymentRequest";
import { STATUS_CLASS, STATUS_LABEL } from "./paymentRequestUtils";

export default function PaymentRequestStatusBadge({
  state,
  totalCount = 0,
}: {
  state: PaymentRequestStatus;
  totalCount?: number;
}) {
  const isWaiting = state === "pending" && totalCount > 0;
  const cls = isWaiting ? "is-waiting" : STATUS_CLASS[state];
  const label = isWaiting ? "Chờ thanh toán" : STATUS_LABEL[state];

  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {label}
    </span>
  );
}
