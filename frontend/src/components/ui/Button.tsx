import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ok";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
}

const variantCls: Record<Variant, string> = {
  primary:
    "bg-gmv-primary text-white border border-gmv-primary hover:bg-gmv-primary-hover shadow-gmv-1 rounded-gmv-lg",
  secondary:
    "bg-gmv-canvas text-gmv-secondary border border-gmv-border hover:bg-gmv-bg rounded-gmv-md",
  ghost:
    "bg-transparent text-gmv-primary border border-gmv-primary hover:bg-gmv-primary-soft rounded-gmv-md",
  danger:
    "bg-gmv-canvas text-gmv-danger border border-gmv-danger/40 hover:bg-gmv-danger-soft rounded-gmv-md",
  ok: "bg-gmv-ok text-white border border-gmv-ok hover:opacity-90 rounded-gmv-md",
};

const sizeCls: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs min-h-[32px]",
  md: "px-4 py-2 text-sm min-h-[40px] font-semibold",
};

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed disabled:opacity-50",
        variantCls[variant],
        sizeCls[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
