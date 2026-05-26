import type { PaymentRequest } from "../../types/paymentRequest";
import { vnd } from "./paymentRequestUtils";

function KpiCard({ label, value, sub, icon, tone }: { label: string; value: string | number; sub: string; icon: string; tone: string }) {
  return (
    <div className="min-h-[108px] rounded-gmv-lg border border-gmv-border bg-gmv-canvas p-4 shadow-gmv-1">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-wide text-gmv-muted">{label}</div>
        <div className={`grid size-8 place-items-center rounded-gmv-md text-sm font-bold ${tone}`}>{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-bold text-gmv-text-strong">{value}</div>
      <div className="mt-2 text-xs text-gmv-muted">{sub}</div>
    </div>
  );
}

export default function PaymentRequestKpiCards({ requests }: { requests: PaymentRequest[] }) {
  const live = requests.filter((r) => r.state !== "cancelled");
  const done = live.filter((r) => r.state === "done" || r.state === "over").length;
  const short = live.filter((r) => r.state === "short").length;
  const received = live.reduce((sum, r) => sum + r.received, 0);
  const target = live.reduce((sum, r) => sum + r.target, 0);
  const remaining = live.reduce((sum, r) => sum + Math.max(0, r.target - r.received), 0);
  const ratio = target > 0 ? Math.round((received / target) * 100) : 0;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="TỔNG PR ĐANG THEO DÕI" value={live.length} sub={`${done} đủ · ${short} thiếu`} icon="▣" tone="bg-gmv-primary-soft text-gmv-primary" />
      <KpiCard label="ĐÃ THU" value={vnd(received)} sub={`${ratio}% / mục tiêu ${vnd(target)}`} icon="Σ" tone="bg-gmv-ok-soft text-gmv-ok" />
      <KpiCard label="CÒN THIẾU" value={vnd(remaining)} sub={`${short} PR cần đôn khách`} icon="!" tone="bg-gmv-danger-soft text-gmv-danger" />
      <KpiCard label="SẴN SÀNG KÍCH HOẠT" value={done} sub="PR đủ tiền chờ chuyển B3" icon="◷" tone="bg-gmv-warn-soft text-gmv-warn" />
    </div>
  );
}

