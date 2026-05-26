import { cn } from "../../lib/cn";

type GmvDataBarCellProps = {
  value: number;
  /** Mẫu số chuẩn hóa thanh (vd. tổng team trong tháng). */
  columnMax: number;
  format: (n: number) => string;
  className?: string;
  barClassName?: string;
  /** false = chỉ hiển thị số (tổng team / tổng cộng). */
  showBar?: boolean;
};

/** Số trên, thanh ngang ngắn ngay bên dưới (% so với columnMax). */
export function GmvDataBarCell({
  value,
  columnMax,
  format,
  className,
  barClassName = "bg-teal-400/80",
  showBar = true,
}: GmvDataBarCellProps) {
  const pct =
    showBar && columnMax > 0 && value > 0
      ? Math.min(100, (value / columnMax) * 100)
      : 0;

  return (
    <div
      className={cn(
        "flex flex-col items-stretch gap-0.5 px-2 py-1.5 text-right leading-tight",
        className
      )}
    >
      <span className="tabular-nums">{format(value)}</span>
      {pct > 0 && (
        <div className="h-1.5 w-full min-w-[2.5rem] rounded-sm bg-teal-100/80" aria-hidden>
          <div
            className={cn("h-full rounded-sm", barClassName)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
