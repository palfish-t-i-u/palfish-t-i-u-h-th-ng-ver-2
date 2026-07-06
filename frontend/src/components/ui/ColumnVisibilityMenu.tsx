import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import Button from "./Button";

export interface ColumnOption {
  key: string;
  label: string;
  hideable: boolean;
}

interface Props {
  columns: readonly ColumnOption[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  visibleCount: number;
}

export default function ColumnVisibilityMenu({
  columns,
  isVisible,
  onToggle,
  onShowAll,
  visibleCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const allVisible = visibleCount === columns.length;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Cột hiển thị
        <span className="rounded-full bg-gmv-primary-soft px-2 py-0.5 text-xs font-medium text-gmv-primary">
          {visibleCount}/{columns.length}
        </span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[220px] rounded-gmv-md border border-gmv-border bg-gmv-canvas py-2 shadow-gmv-1">
          <div className="flex items-center justify-between gap-3 border-b border-gmv-border px-3.5 pb-2">
            <span className="text-sm font-medium text-gmv-text-strong">Chọn cột hiển thị</span>
            <button
              type="button"
              className="text-xs text-gmv-primary disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onShowAll}
              disabled={allVisible}
            >
              Hiện tất cả
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto pt-1">
            {columns.map((c) => (
              <label
                key={c.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3.5 py-1.5 text-sm text-gmv-text hover:bg-gmv-bg",
                  !c.hideable && "cursor-not-allowed opacity-50"
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-gmv-primary"
                  checked={isVisible(c.key)}
                  disabled={!c.hideable}
                  onChange={() => {
                    // Guard tường minh — không dựa hoàn toàn vào `disabled` của
                    // input, vì synthetic click (vd. jsdom/fireEvent) vẫn có
                    // thể fire onChange trên checkbox disabled.
                    if (c.hideable) onToggle(c.key);
                  }}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
