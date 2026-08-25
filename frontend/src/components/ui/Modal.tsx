import type { ReactNode } from "react";
import { useEffect } from "react";
import { cn } from "../../lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Nội dung phụ đặt góc trên-phải header (vd. HdsdLink) — không ảnh hưởng layout title khi bỏ trống. */
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  wide?: boolean;
  extraWide?: boolean;
}

export default function Modal({ open, onClose, title, headerExtra, children, className, overlayClassName, wide, extraWide }: Props) {
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
      className={cn("fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 max-md:items-end max-md:p-0", overlayClassName)}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "relative max-h-[90vh] w-full overflow-y-auto rounded-gmv-lg bg-gmv-canvas p-6 shadow-gmv-2",
          "max-md:max-h-[92vh] max-md:max-w-none max-md:rounded-b-none max-md:p-4",
          extraWide ? "max-w-5xl" : wide ? "max-w-3xl" : "max-w-lg",
          className
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "gmv-modal-title" : undefined}
      >
        {headerExtra && <div className="absolute right-4 top-4">{headerExtra}</div>}
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
