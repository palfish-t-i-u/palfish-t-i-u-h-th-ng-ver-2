import { forwardRef, type HTMLAttributes, type TableHTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function TableWrap({ children, className }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-gmv-md border border-gmv-border bg-gmv-canvas shadow-gmv-1",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Tab 2 — scroll ngang + dọc trong vùng bảng, mini scrollbar. */
export function TableScrollWrap({ children, className }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "gmv-table-scroll w-full max-h-[min(70vh,calc(100svh-14rem))] overflow-auto rounded-gmv-md border border-gmv-border bg-gmv-canvas shadow-gmv-1 [scrollbar-gutter:stable]",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Freeze cột trái/phải + header khi scroll (Tab 2). */
export const stickyTableHead =
  "sticky z-30 bg-gmv-table-head shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]";
export const stickyTableHeadTop = "top-0";
/** BC02 two-row header — dùng sticky trên `<thead>`, không set top riêng row 2. */
export const stickyTableHeadSecondRow = "bg-gmv-table-head";
/** Sticky thead block (BC02) — cả 2 hàng header dính nhau khi scroll dọc. */
export const stickyThead = "sticky top-0 z-30 bg-gmv-table-head shadow-[0_1px_0_0] shadow-gmv-border";
export const stickyTableHeadCorner = "z-40";
export const stickyTableCell =
  "sticky z-20 bg-gmv-canvas shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]";
export const stickyTableHeadRight =
  "sticky z-30 bg-gmv-table-head shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]";
export const stickyTableCellRight =
  "sticky z-20 bg-gmv-canvas shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]";
export function Table({ children, className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full min-w-[800px] border-collapse text-sm", className)} {...rest}>
      {children}
    </table>
  );
}

export function Th({ children, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-gmv-border bg-gmv-table-head px-2.5 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gmv-muted",
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-gmv-border px-2.5 py-2 text-center align-middle text-gmv-text-strong",
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export const Tr = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  function Tr({ children, className, ...rest }, ref) {
    return (
      <tr ref={ref} className={cn("group hover:[&>td]:bg-gmv-row-hover", className)} {...rest}>
        {children}
      </tr>
    );
  }
);
