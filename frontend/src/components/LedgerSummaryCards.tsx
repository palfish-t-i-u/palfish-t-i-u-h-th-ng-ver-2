import { formatVndNumber } from "../lib/vndFormat";
import { formatSourceLabel } from "../lib/ledgerSource";
import type { LedgerSummaryResponse } from "../types/revenue";
import { cn } from "../lib/cn";

function StatCard({
  label,
  value,
  sub,
  className,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-gmv-lg border border-gmv-border bg-gmv-canvas px-4 py-3 shadow-gmv-1",
        muted && "opacity-60",
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gmv-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gmv-text-strong">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gmv-muted">{sub}</p>}
    </div>
  );
}

function filterLabel(from: string, to: string): string {
  if (!from && !to) return "Tất cả ngày";
  if (from && to && from === to) return `Ngày ${from.split("-").reverse().join("/")}`;
  if (from && to) return `${from.split("-").reverse().join("/")} – ${to.split("-").reverse().join("/")}`;
  if (from) return `Từ ${from.split("-").reverse().join("/")}`;
  if (to) return `Đến ${to.split("-").reverse().join("/")}`;
  return "Tất cả ngày";
}

export default function LedgerSummaryCards({
  summary,
  from,
  to,
  loading,
}: {
  summary: LedgerSummaryResponse | null;
  from: string;
  to: string;
  loading: boolean;
}) {
  const period = filterLabel(from, to);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gmv-muted">
        Tổng hợp theo bộ lọc: <span className="font-medium text-gmv-text">{period}</span>
        {loading && " · đang tải…"}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Tổng GMV"
          value={`${formatVndNumber(summary?.totalGmvVnd ?? 0) || "0"} ₫`}
        />
        <StatCard label="Số đơn" value={String(summary?.orderCount ?? 0)} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {(summary?.bySource ?? []).map(({ source, gmvVnd, count }) => (
          <StatCard
            key={source}
            label={formatSourceLabel(source)}
            value={`${formatVndNumber(gmvVnd) || "0"} ₫`}
            sub={`${count} đơn`}
            className="py-2.5"
            muted={count === 0}
          />
        ))}
      </div>
    </div>
  );
}
