import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function TableWrap({ children, className }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-gmv-md border border-gmv-border bg-gmv-canvas shadow-gmv-1", className)}>
      {children}
    </div>
  );
}

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

export function Tr({ children, className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("hover:[&>td]:bg-gmv-row-hover", className)} {...rest}>
      {children}
    </tr>
  );
}
