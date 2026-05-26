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
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
  muted?: boolean;
  title?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-gmv-lg border border-gmv-border bg-gmv-canvas px-3 py-3 shadow-gmv-1 sm:px-4",
        muted && "opacity-60",
        className
      )}
    >
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gmv-muted">{label}</p>
      <p
        className="mt-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold leading-snug tabular-nums text-gmv-text-strong sm:text-base lg:text-lg"
        title={title ?? value}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-gmv-muted">{sub}</p>}
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

function vndDisplay(n: number): { short: string; full: string } {
  const num = formatVndNumber(n) || "0";
  const full = `${num}\u00A0₫`;
  return { short: full, full };
}

export default function LedgerSummaryCards({
  summary,
  from,
  to,
  team,
  loading,
}: {
  summary: LedgerSummaryResponse | null;
  from: string;
  to: string;
  team?: string;
  loading: boolean;
}) {
  const period = filterLabel(from, to);
  const total = vndDisplay(summary?.totalGmvVnd ?? 0);
  const teamLabel = team?.trim() || "Tất cả teams";

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-xs text-gmv-muted">
        Tổng hợp theo bộ lọc: <span className="font-medium text-gmv-text">{period}</span>
        {" · "}
        Team: <span className="font-medium text-gmv-text">{teamLabel}</span>
        {team === "Inhouse 1" && (
          <span> — khớp tab GMV «In-house» trên All File Thu Hiền</span>
        )}
        {loading && " · đang tải…"}
      </p>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <StatCard label="Tổng GMV" value={total.short} title={total.full} />
        <StatCard label="Số đơn" value={(summary?.orderCount ?? 0).toLocaleString("vi-VN")} />
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {(summary?.bySource ?? []).map(({ source, gmvVnd, count }) => {
          const vnd = vndDisplay(gmvVnd);
          return (
            <StatCard
              key={source}
              label={formatSourceLabel(source)}
              value={vnd.short}
              title={vnd.full}
              sub={`${count.toLocaleString("vi-VN")} đơn`}
              className="py-2.5"
              muted={count === 0}
            />
          );
        })}
      </div>
    </div>
  );
}
