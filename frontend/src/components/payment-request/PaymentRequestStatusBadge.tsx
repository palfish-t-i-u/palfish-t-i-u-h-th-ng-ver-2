import type { PaymentRequestStatus } from "../../types/paymentRequest";
import { STATUS_CLASS, STATUS_LABEL } from "./paymentRequestUtils";

export default function PaymentRequestStatusBadge({
  state,
  totalCount = 0,
  provisional = false,
}: {
  state: PaymentRequestStatus;
  totalCount?: number;
  /** True khi có lần card/installment đã trả nhưng chưa xác nhận số sau phí — hiện "(tạm)" cho done/over. */
  provisional?: boolean;
}) {
  const isWaiting = state === "pending" && totalCount > 0;
  const cls = isWaiting ? "is-waiting" : STATUS_CLASS[state];
  const isProvisional = provisional && (state === "done" || state === "over");
  const label = isWaiting
    ? "Chờ thanh toán"
    : isProvisional
    ? `${STATUS_LABEL[state]} (tạm)`
    : STATUS_LABEL[state];

  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {label}
    </span>
  );
}
