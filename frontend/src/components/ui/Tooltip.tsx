import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface Props {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  align?: "start" | "center" | "end";
}

const alignCls = {
  start: "left-0 translate-x-0",
  center: "left-1/2 -translate-x-1/2",
  end: "left-auto right-0 translate-x-0",
} as const;

/** Hover tooltip — desktop. */
export default function Tooltip({
  content,
  children,
  className,
  panelClassName,
  align = "center",
}: Props) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full z-50 mb-2 w-max max-w-sm",
          alignCls[align],
          "rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2.5 text-left text-xs leading-relaxed text-gmv-text shadow-gmv-2",
          "opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100",
          "invisible group-hover/tip:visible",
          panelClassName
        )}
      >
        {content}
      </span>
    </span>
  );
}
