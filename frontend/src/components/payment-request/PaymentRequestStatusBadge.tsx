import { cn } from "../../lib/cn";
import type { PaymentRequestStatus } from "../../types/paymentRequest";
import { STATUS_LABEL } from "./paymentRequestUtils";

const cls: Record<PaymentRequestStatus, string> = {
  pending: "bg-gmv-bg text-gmv-muted",
  short: "bg-gmv-danger-soft text-gmv-danger",
  done: "bg-gmv-ok-soft text-gmv-ok",
  over: "bg-gmv-warn-soft text-gmv-warn",
  cancelled: "bg-gmv-bg text-gmv-muted",
};

const dot: Record<PaymentRequestStatus, string> = {
  pending: "bg-gmv-muted",
  short: "bg-gmv-danger",
  done: "bg-gmv-ok",
  over: "bg-gmv-warn",
  cancelled: "bg-gmv-muted",
};

export default function PaymentRequestStatusBadge({ state }: { state: PaymentRequestStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold", cls[state])}>
      <span className={cn("size-1.5 rounded-full", dot[state])} />
      {STATUS_LABEL[state]}
    </span>
  );
}

