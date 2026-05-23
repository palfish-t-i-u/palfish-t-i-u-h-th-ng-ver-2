import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type Tone = "primary" | "neutral" | "ok" | "warn" | "danger";

interface Props {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

const toneCls: Record<Tone, string> = {
  primary: "bg-gmv-primary-soft text-gmv-primary",
  neutral: "bg-gmv-bg text-gmv-muted",
  ok: "bg-gmv-ok-soft text-gmv-ok",
  warn: "bg-gmv-warn-soft text-gmv-warn",
  danger: "bg-gmv-danger-soft text-gmv-danger",
};

export default function Badge({ children, tone = "neutral", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "neutral" && "uppercase tracking-wide",
        toneCls[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
