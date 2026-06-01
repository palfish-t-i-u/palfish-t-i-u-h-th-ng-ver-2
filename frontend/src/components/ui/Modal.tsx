import type { ReactNode } from "react";
import { useEffect } from "react";
import { cn } from "../../lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, className, overlayClassName, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn("fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4", overlayClassName)}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-gmv-lg bg-gmv-canvas p-6 shadow-gmv-2",
          wide ? "max-w-3xl" : "max-w-lg",
          className
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "gmv-modal-title" : undefined}
      >
        {title && (
          <h2 id="gmv-modal-title" className="mb-4 text-center text-lg font-semibold text-gmv-primary">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
