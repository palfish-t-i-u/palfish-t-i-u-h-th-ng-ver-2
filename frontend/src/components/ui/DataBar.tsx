import { cn } from "../../lib/cn";

type GmvDataBarCellProps = {
  value: number;
  /** Max trong cùng cột tháng — chuẩn hóa độ dài thanh. */
  columnMax: number;
  format: (n: number) => string;
  className?: string;
  barClassName?: string;
};

/** Số trên, thanh ngang ngắn ngay bên dưới (data bar theo cột tháng). */
export function GmvDataBarCell({
  value,
  columnMax,
  format,
  className,
  barClassName = "bg-teal-400/80",
}: GmvDataBarCellProps) {
  const pct =
    columnMax > 0 && value > 0 ? Math.min(100, (value / columnMax) * 100) : 0;

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
