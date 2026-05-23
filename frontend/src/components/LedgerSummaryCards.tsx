import { useMemo } from "react";
import { formatVndNumber } from "../lib/vndFormat";
import type { RevenueLedgerRow } from "../types/revenue";
import { cn } from "../lib/cn";

export interface LedgerSummary {
  totalGmvVnd: number;
  orderCount: number;
  byLoai: { loai: string; gmvVnd: number; count: number }[];
}

export function computeLedgerSummary(rows: RevenueLedgerRow[]): LedgerSummary {
  let totalGmvVnd = 0;
  const loaiMap = new Map<string, { gmvVnd: number; count: number }>();

  for (const row of rows) {
    totalGmvVnd += row.soTienVnd || 0;
    const key = (row.loai || "").trim() || "(Chưa phân loại)";
    const cur = loaiMap.get(key) ?? { gmvVnd: 0, count: 0 };
    cur.gmvVnd += row.soTienVnd || 0;
    cur.count += 1;
    loaiMap.set(key, cur);
  }

  const byLoai = [...loaiMap.entries()]
    .map(([loai, v]) => ({ loai, ...v }))
    .sort((a, b) => b.gmvVnd - a.gmvVnd);

  return { totalGmvVnd, orderCount: rows.length, byLoai };
}

function StatCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-gmv-lg border border-gmv-border bg-gmv-canvas px-4 py-3 shadow-gmv-1",
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
  if (from && to && from === to) return `Ngày ${from.split("-").reverse().join("/")}`;
  if (from && to) return `${from.split("-").reverse().join("/")} – ${to.split("-").reverse().join("/")}`;
  if (from) return `Từ ${from.split("-").reverse().join("/")}`;
  if (to) return `Đến ${to.split("-").reverse().join("/")}`;
  return "Tất cả ngày";
}

export default function LedgerSummaryCards({
  rows,
  from,
  to,
  loading,
}: {
  rows: RevenueLedgerRow[];
  from: string;
  to: string;
  loading: boolean;
}) {
  const summary = useMemo(() => computeLedgerSummary(rows), [rows]);
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
          value={`${formatVndNumber(summary.totalGmvVnd) || "0"} ₫`}
          sub={`${summary.orderCount} đơn`}
        />
        <StatCard
          label="Số đơn"
          value={String(summary.orderCount)}
          sub={summary.orderCount > 0 ? `${summary.byLoai.length} loại doanh thu` : undefined}
        />
      </div>

      {summary.byLoai.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {summary.byLoai.map(({ loai, gmvVnd, count }) => (
            <StatCard
              key={loai}
              label={loai}
              value={`${formatVndNumber(gmvVnd) || "0"} ₫`}
              sub={`${count} đơn`}
              className="py-2.5"
            />
          ))}
        </div>
      )}
    </div>
  );
}
