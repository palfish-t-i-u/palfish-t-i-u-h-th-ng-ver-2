import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-gmv-lg border border-gmv-border bg-gmv-canvas shadow-gmv-1",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  soft = true,
  className,
}: {
  children: ReactNode;
  soft?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-b border-gmv-border px-6 py-4 text-center text-lg font-semibold text-gmv-text-strong",
        soft ? "bg-gmv-primary-soft" : "bg-gmv-primary text-white",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-6 md:p-8", className)}>{children}</div>;
}
