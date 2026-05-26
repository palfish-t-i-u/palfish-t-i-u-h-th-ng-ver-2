import { cn } from "../../lib/cn";
import type { PaymentRequest } from "../../types/paymentRequest";
import { progressPercent, vnd } from "./paymentRequestUtils";

export default function PaymentRequestProgress({ request }: { request: PaymentRequest }) {
  const pct = progressPercent(request);
  const fill =
    request.state === "over" ? "bg-gmv-primary" : request.state === "done" ? "bg-gmv-ok" : pct >= 60 ? "bg-gmv-warn" : "bg-gmv-danger";

  return (
    <div className="min-w-[190px]">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gmv-bg">
          <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span className="font-semibold text-gmv-text-strong">{vnd(request.received)}</span>
        <span className="text-gmv-muted">{pct}%</span>
      </div>
    </div>
  );
}

