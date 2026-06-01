import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

interface Props {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  align?: "start" | "center" | "end";
}

/** Hover tooltip — renders via portal to escape overflow/stacking contexts. */
export default function Tooltip({
  content,
  children,
  className,
  panelClassName,
  align = "center",
}: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function handleMouseEnter() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    let left: number;
    if (align === "start") left = r.left;
    else if (align === "end") left = r.right;
    else left = r.left + r.width / 2;
    setPos({ top: r.top + window.scrollY, left: left + window.scrollX });
  }

  function handleMouseLeave() {
    setPos(null);
  }

  return (
    <span
      ref={triggerRef}
      className={cn("inline-flex", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "absolute",
              top: pos.top - 8,
              left: pos.left,
              transform: align === "center"
                ? "translate(-50%, -100%)"
                : align === "end"
                ? "translate(-100%, -100%)"
                : "translateY(-100%)",
              zIndex: 9999,
              pointerEvents: "none",
              marginBottom: 8,
            }}
            className={cn(
              "w-max max-w-sm",
              "rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-2.5 text-left text-xs leading-relaxed text-gmv-text shadow-gmv-2",
              panelClassName
            )}
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  );
}
