import type { PaymentRequestStatus } from "../../types/paymentRequest";
import { STATUS_CLASS, STATUS_LABEL } from "./paymentRequestUtils";

export default function PaymentRequestStatusBadge({ state }: { state: PaymentRequestStatus }) {
  return (
    <span className={`badge ${STATUS_CLASS[state]}`}>
      <span className="dot" />
      {STATUS_LABEL[state]}
    </span>
  );
}
